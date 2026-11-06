"use strict";
/**
 * Protocol-agnostic machine payments orchestrator.
 *
 * Adapters implement canHandle / challenge / fulfill. Membership and content
 * gating stay outside this service — we only authorize emitting markdown bytes.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MachinePaymentsService = exports.PAID_MARKDOWN_CACHE_CONTROL = void 0;
exports.getDefaultTiersCurrency = getDefaultTiersCurrency;
const logging_1 = __importDefault(require("@tryghost/logging"));
const pricing_1 = require("./pricing");
const eligibility_1 = require("./eligibility");
const content_loader_1 = require("./content-loader");
exports.PAID_MARKDOWN_CACHE_CONTROL = 'private, no-store';
const settingsCache = require('../../../shared/settings-cache');
const labs = require('../../../shared/labs');
class MachinePaymentsService {
    settingsCache;
    labs;
    pricing;
    contentLoader;
    adapters;
    eventRepository;
    paymentRecorder;
    isStripeConnected;
    defaultCurrencyProvider;
    constructor({ settingsCache: settings = settingsCache, labsService = labs, pricing, contentLoader = new content_loader_1.ContentLoader(), adapters = [], eventRepository = null, paymentRecorder = null, isStripeConnected = () => false, defaultCurrencyProvider = getDefaultTiersCurrency, } = {}) {
        this.settingsCache = settings;
        this.labs = labsService;
        this.pricing = pricing || new pricing_1.Pricing({ settingsCache: settings, defaultCurrencyProvider });
        this.contentLoader = contentLoader;
        this.adapters = adapters;
        this.eventRepository = eventRepository;
        this.paymentRecorder = paymentRecorder;
        this.isStripeConnected = isStripeConnected;
        this.defaultCurrencyProvider = defaultCurrencyProvider;
    }
    isEnabled() {
        return (0, eligibility_1.isMachinePaymentsEnabled)({
            labs: this.labs,
            settingsCache: this.settingsCache,
            isStripeConnected: this.isStripeConnected,
        });
    }
    isPurchasable(entry) {
        return this.isEnabled() && (0, eligibility_1.isPurchasableEntry)(entry);
    }
    async getTerms({ url, description, method = 'GET', mimeType = 'text/markdown', }) {
        const { amount, currency } = await this.pricing.getTerms();
        return {
            amount,
            currency,
            description: description || safePathname(url),
            method,
            mimeType,
            url,
        };
    }
    /**
     * Challenge or fulfill a paid markdown request.
     * Does not load full HTML until payment fulfills successfully.
     */
    async challengeOrFulfill(request, options) {
        if (!this.isEnabled()) {
            return this.#problemResponse({
                type: 'https://paymentauth.org/problems/payment-unavailable',
                title: 'Machine payments unavailable',
                status: 404,
                detail: 'Machine payments are not enabled.',
            });
        }
        if (!this.adapters.length) {
            return this.#problemResponse({
                type: 'https://paymentauth.org/problems/payment-unavailable',
                title: 'Machine payment challenges unavailable',
                status: 503,
                detail: 'Machine payment challenges are temporarily unavailable.',
            });
        }
        // Check raw model eligibility before challenging or charging. Content API
        // serialization strips free tiers, which would otherwise 402 a mixed post
        // and 403 after settlement.
        if (typeof this.contentLoader.isPurchasable === 'function') {
            const purchasable = await this.contentLoader.isPurchasable(options.resourceType, options.entryId);
            if (!purchasable) {
                return this.#problemResponse({
                    type: 'https://paymentauth.org/problems/payment-forbidden',
                    title: 'Content unavailable',
                    status: 403,
                    detail: 'This content is not available for machine payment.',
                });
            }
        }
        const terms = await this.getTerms({
            url: request.url,
            description: options.description,
        });
        const credentialed = this.adapters.find((adapter) => adapter.canHandle(request));
        if (credentialed) {
            return await this.#handleFulfill(credentialed, request, terms, options);
        }
        return await this.#paymentRequiredResponse(request, terms, options);
    }
    async #handleFulfill(adapter, request, terms, options) {
        // Confirm we can deliver before settling. Charging first then failing the
        // load burns the agent’s money and (with a ledger write) their credential.
        const entry = await this.contentLoader.loadFullEntry(options.resourceType, options.entryId);
        if (!entry) {
            return this.#problemResponse({
                type: 'https://paymentauth.org/problems/payment-forbidden',
                title: 'Content unavailable',
                status: 403,
                detail: 'This content is not available for machine payment.',
            });
        }
        let fulfillment;
        try {
            fulfillment = await adapter.fulfill(request, terms);
        }
        catch (err) {
            return this.#paymentCredentialErrorResponse(err);
        }
        // Ledger next: Stripe idempotency keys can expire (~24h), so a durable
        // protocol+reference check must gate PaymentIntent creation on replay.
        if (this.eventRepository) {
            let saved;
            try {
                saved = await this.eventRepository.save({
                    postId: options.entryId,
                    amount: fulfillment.amount ?? terms.amount,
                    currency: fulfillment.currency ?? terms.currency,
                    protocol: fulfillment.protocol || 'mpp',
                    method: fulfillment.method,
                    stripePaymentIntentId: fulfillment.stripePaymentIntentId || null,
                    reference: fulfillment.reference,
                });
            }
            catch (err) {
                logging_1.default.warn(err);
                return this.#problemResponse({
                    type: 'https://paymentauth.org/problems/payment-unavailable',
                    title: 'Machine payment temporarily unavailable',
                    status: 503,
                    detail: 'Machine payment verification is temporarily unavailable.',
                });
            }
            if (saved && saved.created === false) {
                return this.#problemResponse({
                    type: 'https://paymentauth.org/problems/payment-forbidden',
                    title: 'Payment credential already used',
                    status: 403,
                    detail: 'This machine payment credential has already been used.',
                });
            }
        }
        if (this.paymentRecorder) {
            try {
                const stripePaymentIntentId = await this.paymentRecorder.record({
                    ...fulfillment,
                    postId: options.entryId,
                    amount: terms.amount,
                    currency: terms.currency,
                });
                if (stripePaymentIntentId) {
                    fulfillment.stripePaymentIntentId = stripePaymentIntentId;
                }
            }
            catch (err) {
                logging_1.default.warn(err);
            }
        }
        const body = options.renderMarkdown(entry);
        const headers = new Headers({
            'Content-Type': 'text/markdown; charset=utf-8',
            'Cache-Control': exports.PAID_MARKDOWN_CACHE_CONTROL,
            'Content-Location': options.contentLocation,
        });
        if (fulfillment.receiptHeaders) {
            Object.entries(fulfillment.receiptHeaders).forEach(([key, value]) => {
                headers.set(key, value);
            });
        }
        return new Response(body, { status: 200, headers });
    }
    async #paymentRequiredResponse(request, terms, options) {
        const results = await Promise.allSettled(this.adapters.map((adapter) => adapter.challenge(request, terms)));
        const challenges = results
            .filter((result) => result.status === 'fulfilled' && Boolean(result.value))
            .map((result) => result.value);
        if (!challenges.length) {
            return this.#problemResponse({
                type: 'https://paymentauth.org/problems/payment-unavailable',
                title: 'Machine payment challenges unavailable',
                status: 503,
                detail: 'Machine payment challenges are temporarily unavailable.',
            });
        }
        const previewBody = options.renderPreviewMarkdown?.(terms) || null;
        const headers = new Headers({
            'Cache-Control': 'no-store',
            'Content-Type': previewBody ? 'text/markdown; charset=utf-8' : 'application/problem+json',
        });
        if (previewBody && options.contentLocation) {
            headers.set('Content-Location', options.contentLocation);
        }
        for (const challenge of challenges) {
            if (challenge.headers) {
                challenge.headers.forEach((value, key) => {
                    // Preserve every WWW-Authenticate (mpp compose can emit several)
                    // and keep distinct payment challenge headers. Do not let adapter
                    // Content-Type overwrite the preview body type.
                    if (key.toLowerCase() === 'www-authenticate') {
                        headers.append(key, value);
                    }
                    else if (key.toLowerCase() === 'content-type') {
                        // Keep our chosen body content type.
                    }
                    else if (!headers.has(key)) {
                        headers.set(key, value);
                    }
                });
            }
        }
        const body = previewBody ||
            JSON.stringify({
                type: 'https://paymentauth.org/problems/payment-required',
                title: 'Payment Required',
                status: 402,
                detail: 'Payment is required to access this markdown content.',
            });
        return new Response(body, {
            status: 402,
            headers,
        });
    }
    #paymentCredentialErrorResponse(err) {
        if (err?.statusCode === 403) {
            return this.#problemResponse({
                type: 'https://paymentauth.org/problems/payment-forbidden',
                title: 'Payment credential rejected',
                status: 403,
                detail: 'The supplied machine payment credential could not be validated.',
            });
        }
        logging_1.default.warn(err);
        return this.#problemResponse({
            type: 'https://paymentauth.org/problems/payment-unavailable',
            title: 'Machine payment temporarily unavailable',
            status: 503,
            detail: 'Machine payment verification is temporarily unavailable.',
        });
    }
    #problemResponse({ type, title, status, detail }) {
        return new Response(JSON.stringify({ type, title, status, detail }), {
            status,
            headers: {
                'Cache-Control': 'no-store',
                'Content-Type': 'application/problem+json',
            },
        });
    }
}
exports.MachinePaymentsService = MachinePaymentsService;
async function getDefaultTiersCurrency() {
    const models = require('../../models');
    const page = await models.Product.findPage({
        filter: 'type:paid+active:true',
        limit: 1,
        order: 'monthly_price asc',
    });
    const tier = page.data?.[0]?.toJSON?.() || page.data?.[0];
    return tier?.currency || null;
}
function safePathname(url) {
    try {
        return new URL(url).pathname;
    }
    catch {
        return url;
    }
}
