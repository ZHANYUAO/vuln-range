"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.X402Adapter = exports.BoundedRouteCache = void 0;
exports.parseX402Config = parseX402Config;
exports.formatPrice = formatPrice;
exports.settlementReference = settlementReference;
const node_crypto_1 = __importDefault(require("node:crypto"));
const errors_1 = __importDefault(require("@tryghost/errors"));
const logging_1 = __importDefault(require("@tryghost/logging"));
const zod_1 = require("zod");
const config_1 = __importDefault(require("../../../../shared/config"));
const X402_ROUTE_CACHE_LIMIT = 128;
const BASE_MAINNET = 'eip155:8453';
const BASE_SEPOLIA = 'eip155:84532';
const X402_ORG_FACILITATOR = 'https://x402.org/facilitator';
const DEFAULT_FACILITATOR_URL = 'https://facilitator.xpay.sh';
function normalizeFacilitatorUrl(urlString) {
    const parsed = new URL(urlString);
    const origin = parsed.origin.toLowerCase();
    const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    return `${origin}${pathname}`;
}
const x402ConfigSchema = zod_1.z
    .object({
    // Per-rail override: x402 rides along whenever machine payments is on.
    // Set to false to keep the x402 rail off while leaving mpp enabled.
    enabled: zod_1.z.boolean().optional().default(true),
    network: zod_1.z.string().regex(/^eip155:\d+$/, {
        message: 'machinePayments.x402.network must be a CAIP-2 EVM network (eip155:<chainId>)',
    }),
    stripeNetwork: zod_1.z.enum(['base'], {
        message: 'machinePayments.x402.stripeNetwork must be "base"',
    }),
    facilitatorUrl: zod_1.z.url({
        message: 'machinePayments.x402.facilitatorUrl must be a valid URL',
    }),
})
    .superRefine((value, ctx) => {
    if (![BASE_MAINNET, BASE_SEPOLIA].includes(value.network)) {
        ctx.addIssue({
            code: 'custom',
            message: `machinePayments.x402.network must be ${BASE_MAINNET} or ${BASE_SEPOLIA}`,
        });
    }
    let parsedFacilitatorUrl;
    try {
        parsedFacilitatorUrl = new URL(value.facilitatorUrl);
    }
    catch {
        return;
    }
    if (parsedFacilitatorUrl.protocol !== 'https:') {
        ctx.addIssue({
            code: 'custom',
            message: 'machinePayments.x402.facilitatorUrl must use HTTPS',
        });
        return;
    }
    if (value.network === BASE_MAINNET &&
        normalizeFacilitatorUrl(value.facilitatorUrl) === X402_ORG_FACILITATOR) {
        ctx.addIssue({
            code: 'custom',
            message: 'machinePayments.x402.facilitatorUrl cannot be the x402.org testnet facilitator on Base mainnet',
        });
    }
});
const settlementResponseSchema = zod_1.z.object({
    transaction: zod_1.z.string().optional(),
    txHash: zod_1.z.string().optional(),
    hash: zod_1.z.string().optional(),
    settlement: zod_1.z
        .object({
        transaction: zod_1.z.string().optional(),
    })
        .optional(),
});
/**
 * Bounded LRU cache for per-route Hono apps. Prevents unbounded growth when many
 * paid markdown URLs are challenged over the lifetime of the process.
 */
class BoundedRouteCache {
    #maxSize;
    #entries = new Map();
    constructor(maxSize) {
        this.#maxSize = Math.max(1, maxSize);
    }
    get size() {
        return this.#entries.size;
    }
    get(key) {
        const value = this.#entries.get(key);
        if (value === undefined) {
            return undefined;
        }
        this.#entries.delete(key);
        this.#entries.set(key, value);
        return value;
    }
    set(key, value) {
        if (this.#entries.has(key)) {
            this.#entries.delete(key);
        }
        else if (this.#entries.size >= this.#maxSize) {
            const oldest = this.#entries.keys().next().value;
            if (oldest !== undefined) {
                this.#entries.delete(oldest);
            }
        }
        this.#entries.set(key, value);
    }
}
exports.BoundedRouteCache = BoundedRouteCache;
function parseX402Config(raw) {
    const parsed = x402ConfigSchema.safeParse({
        enabled: raw.enabled ?? true,
        network: raw.network ?? BASE_MAINNET,
        stripeNetwork: raw.stripeNetwork ?? 'base',
        facilitatorUrl: raw.facilitatorUrl ?? DEFAULT_FACILITATOR_URL,
    });
    if (!parsed.success) {
        logging_1.default.warn(`Invalid machinePayments.x402 config: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`);
        return null;
    }
    return parsed.data;
}
/**
 * x402 adapter (Base USDC). Second rail behind the same canHandle/challenge/fulfill boundary.
 * Reuses facilitator and ExactEvmScheme; caches per-route Hono apps keyed by payTo + price.
 */
class X402Adapter {
    depositAddressStore;
    facilitatorClient;
    name;
    #config = null;
    #facilitator = null;
    #scheme = null;
    #runtime = null;
    #apps;
    #runtimeFactory;
    #configProvider;
    #ready = false;
    #initAttempted = false;
    constructor({ depositAddressStore, facilitatorClient, maxCachedApps = X402_ROUTE_CACHE_LIMIT, runtimeFactory, configProvider, }) {
        this.depositAddressStore = depositAddressStore;
        this.facilitatorClient = facilitatorClient;
        this.#apps = new BoundedRouteCache(maxCachedApps);
        this.#runtimeFactory = runtimeFactory;
        this.#configProvider = configProvider;
        this.name = 'x402';
    }
    get isReady() {
        return this.#ready;
    }
    /**
     * Boot-owned initialization: validate config only. Runtime modules load
     * lazily on the first challenge (see #ensureRuntime).
     */
    async init() {
        if (this.#initAttempted) {
            return this.#ready;
        }
        this.#initAttempted = true;
        const rawConfig = this.#configProvider
            ? this.#configProvider()
            : {
                enabled: config_1.default.get('machinePayments:x402:enabled'),
                network: config_1.default.get('machinePayments:x402:network'),
                stripeNetwork: config_1.default.get('machinePayments:x402:stripeNetwork'),
                facilitatorUrl: config_1.default.get('machinePayments:x402:facilitatorUrl'),
            };
        const parsedConfig = parseX402Config(rawConfig);
        if (!parsedConfig?.enabled) {
            return false;
        }
        this.#config = parsedConfig;
        this.#ready = true;
        return true;
    }
    /**
     * Lazily load the x402 runtime modules and build the shared facilitator/scheme
     * on first use. Idempotent; throws if the modules fail to load so the caller
     * can fall back (challenge swallows it, returning null).
     */
    #ensureRuntime() {
        if (this.#runtime) {
            return;
        }
        if (!this.#config) {
            throw new errors_1.default.InternalServerError({
                message: 'x402 adapter used before boot initialization',
            });
        }
        const runtime = this.#loadRuntimeModules();
        const { HTTPFacilitatorClient, ExactEvmScheme } = runtime;
        this.#runtime = runtime;
        this.#facilitator =
            this.facilitatorClient || new HTTPFacilitatorClient({ url: this.#config.facilitatorUrl });
        this.#scheme = new ExactEvmScheme();
    }
    canHandle(request) {
        return Boolean(request.headers.get('x-payment') || request.headers.get('payment-signature'));
    }
    async challenge(request, terms) {
        if (!this.#ready) {
            return null;
        }
        try {
            const response = await this.#dispatch(request, terms, { body: '' });
            if (response.status === 402) {
                return response;
            }
            logging_1.default.warn(`x402 challenge unavailable for ${terms.url}: HTTP ${response.status}`);
            return null;
        }
        catch (err) {
            logging_1.default.warn(err);
            return null;
        }
    }
    async fulfill(request, terms) {
        if (!this.#ready || !this.#config) {
            throw new errors_1.default.NoPermissionError({
                message: 'x402 payment credential rejected',
            });
        }
        const response = await this.#dispatch(request, terms, { body: 'ok' });
        if (response.status === 402) {
            throw new errors_1.default.NoPermissionError({
                message: 'Payment required',
            });
        }
        if (response.status < 200 || response.status >= 300) {
            throw new errors_1.default.NoPermissionError({
                message: 'x402 payment credential rejected',
            });
        }
        const paymentResponse = response.headers.get('payment-response') || response.headers.get('X-PAYMENT-RESPONSE');
        if (!paymentResponse) {
            throw new errors_1.default.InternalServerError({
                message: 'x402 payment succeeded without a stable settlement reference',
            });
        }
        return {
            protocol: 'x402',
            method: this.#config.stripeNetwork,
            reference: settlementReference(paymentResponse),
            amount: terms.amount,
            currency: terms.currency,
            stripePaymentIntentId: null,
            receiptHeaders: { 'payment-response': paymentResponse },
        };
    }
    async #dispatch(request, terms, responseData) {
        this.#ensureRuntime();
        if (!this.#config || !this.#runtime || !this.#facilitator || !this.#scheme) {
            throw new errors_1.default.InternalServerError({
                message: 'x402 adapter used before boot initialization',
            });
        }
        const { network, stripeNetwork } = this.#config;
        const method = (terms.method || 'GET').toUpperCase();
        const route = `${method} ${new URL(terms.url).pathname}`;
        const payTo = await this.depositAddressStore.getOrCreateAddress({ network: stripeNetwork });
        const price = formatPrice(terms);
        const cacheKey = `${route}:${payTo}:${price}:${network}:${responseData.body ? 'fulfill' : 'challenge'}`;
        let cached = this.#apps.get(cacheKey);
        if (!cached) {
            cached = this.#createApp({
                route,
                method,
                network,
                payTo,
                price,
                terms,
                responseData,
            });
            this.#apps.set(cacheKey, cached);
        }
        return await cached.fetch(request);
    }
    #loadRuntimeModules() {
        if (this.#runtimeFactory) {
            return this.#runtimeFactory();
        }
        const { paymentMiddlewareFromConfig } = require('@x402/hono');
        const { HTTPFacilitatorClient } = require('@x402/core/server');
        const { ExactEvmScheme } = require('@x402/evm/exact/server');
        const { Hono } = require('hono');
        return { paymentMiddlewareFromConfig, HTTPFacilitatorClient, ExactEvmScheme, Hono };
    }
    #createApp({ route, method, network, payTo, price, terms, responseData, }) {
        if (!this.#runtime || !this.#facilitator || !this.#scheme) {
            throw new errors_1.default.InternalServerError({
                message: 'x402 adapter used before boot initialization',
            });
        }
        const { paymentMiddlewareFromConfig, Hono } = this.#runtime;
        const app = new Hono();
        app.use(paymentMiddlewareFromConfig({
            [route]: {
                accepts: [
                    {
                        scheme: 'exact',
                        price,
                        network,
                        payTo,
                    },
                ],
                description: terms.description,
                mimeType: terms.mimeType,
            },
        }, this.#facilitator, [
            {
                network,
                server: this.#scheme,
            },
        ]));
        const handler = () => new Response(responseData.body, {
            status: 200,
            headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
        });
        if (method === 'GET') {
            app.get('*', handler);
        }
        else if (method === 'HEAD') {
            app.on('HEAD', '*', handler);
        }
        else {
            app.on(method, '*', handler);
        }
        return { fetch: (request) => app.fetch(request) };
    }
}
exports.X402Adapter = X402Adapter;
function formatPrice(terms) {
    if (terms.currency.toUpperCase() !== 'USD') {
        throw new errors_1.default.ValidationError({
            message: 'x402 machine payments currently support USD only',
        });
    }
    return `$${(terms.amount / 100).toFixed(2)}`;
}
/**
 * Stable ledger reference from an x402 PAYMENT-RESPONSE header.
 * The raw header is base64 JSON and overflows varchar(255); prefer the
 * settlement transaction hash, and hash the header if that is missing.
 */
function settlementReference(paymentResponse) {
    const decoded = decodeJsonHeader(paymentResponse);
    const parsed = settlementResponseSchema.safeParse(decoded);
    const reference = parsed.success
        ? parsed.data.transaction ||
            parsed.data.txHash ||
            parsed.data.hash ||
            parsed.data.settlement?.transaction
        : undefined;
    if (typeof reference === 'string' && reference.length > 0 && reference.length <= 255) {
        return reference;
    }
    if (decoded !== null && !parsed.success) {
        return node_crypto_1.default.createHash('sha256').update(String(paymentResponse)).digest('hex');
    }
    if (typeof paymentResponse === 'string' && paymentResponse.length <= 255) {
        return paymentResponse;
    }
    return node_crypto_1.default.createHash('sha256').update(String(paymentResponse)).digest('hex');
}
function decodeJsonHeader(header) {
    if (!header) {
        return null;
    }
    for (const encoding of ['base64url', 'base64']) {
        try {
            return JSON.parse(Buffer.from(header, encoding).toString('utf8'));
        }
        catch {
            // try the next encoding
        }
    }
    try {
        return JSON.parse(header);
    }
    catch {
        return null;
    }
}
