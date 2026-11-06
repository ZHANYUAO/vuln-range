"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DepositAddressStore = exports.STRIPE_MACHINE_PAYMENTS_API_VERSION = void 0;
exports.createStripeDepositAddressClient = createStripeDepositAddressClient;
const errors_1 = __importDefault(require("@tryghost/errors"));
const stripe_1 = require("stripe");
const stripe_client_options_1 = require("./stripe-client-options");
// Preview API required for crypto deposit addresses / machine payments.
exports.STRIPE_MACHINE_PAYMENTS_API_VERSION = '2026-05-27.preview';
const DEPOSIT_ADDRESS_SETTING = 'machine_payments_deposit_address';
const settingsHelpers = require('../../settings-helpers');
const settingsCache = require('../../../../shared/settings-cache');
/**
 * Build a client that can mint crypto deposit addresses on stripe@8, which
 * lacks the typed `crypto.depositAddresses` namespace.
 */
function createStripeDepositAddressClient(secretKey) {
    const stripe = new stripe_1.Stripe(secretKey, {
        // Preview crypto APIs are not yet in the published Stripe types.
        ...(0, stripe_client_options_1.getMachinePaymentsStripeOptions)(exports.STRIPE_MACHINE_PAYMENTS_API_VERSION),
    });
    const DepositAddresses = stripe_1.Stripe.StripeResource.extend({
        path: 'crypto/deposit_addresses',
        includeBasic: ['create'],
    });
    const depositAddresses = new DepositAddresses(stripe);
    return {
        crypto: stripe.crypto,
        createCryptoDepositAddress: (params) => depositAddresses.create(params),
    };
}
/**
 * Durable per-network deposit-address store.
 * Persists a JSON map of network → address in settings so per-network deposit
 * addresses cannot share a single chain address.
 *
 * Stripe's machine-payments docs recommend minting deposit addresses off the
 * request path via POST /v1/crypto/deposit_addresses — never by confirming a
 * PaymentIntent from an anonymous GET.
 */
class DepositAddressStore {
    stripeFactory;
    settingsHelpers;
    settingsCache;
    _settingsModel;
    stripe;
    stripeSecretKey;
    #addresses = {};
    #inflight = new Map();
    constructor({ stripeFactory = createStripeDepositAddressClient, settingsHelpersFacade = settingsHelpers, settingsCacheFacade = settingsCache, settingsModel, } = {}) {
        this.stripeFactory = stripeFactory;
        this.settingsHelpers = settingsHelpersFacade;
        this.settingsCache = settingsCacheFacade;
        this._settingsModel = settingsModel;
        this.stripe = null;
        this.stripeSecretKey = null;
    }
    get settingsModel() {
        if (!this._settingsModel) {
            this._settingsModel = require('../../../models').Settings;
        }
        return this._settingsModel;
    }
    async getOrCreateAddress({ network = 'tempo' } = {}) {
        const cached = this.#addresses[network] || this.#readMap()[network];
        if (cached) {
            this.#addresses[network] = cached;
            return cached;
        }
        const inflight = this.#inflight.get(network);
        if (inflight) {
            return await inflight;
        }
        const pending = this.#createAndPersist({ network }).finally(() => {
            this.#inflight.delete(network);
        });
        this.#inflight.set(network, pending);
        return await pending;
    }
    async #createAndPersist({ network }) {
        const stripe = this.#getStripe();
        let depositAddress;
        if (typeof stripe.crypto?.depositAddresses?.create === 'function') {
            depositAddress = await stripe.crypto.depositAddresses.create({ network });
        }
        else if (typeof stripe.createCryptoDepositAddress === 'function') {
            depositAddress = await stripe.createCryptoDepositAddress({ network });
        }
        else {
            throw new errors_1.default.InternalServerError({
                message: 'Stripe crypto deposit address API is unavailable',
            });
        }
        const address = depositAddress?.address;
        if (!address) {
            throw new errors_1.default.InternalServerError({
                message: 'Stripe did not return a crypto deposit address',
            });
        }
        await this.#persist(network, address);
        return address;
    }
    #readMap() {
        const raw = this.settingsCache.get(DEPOSIT_ADDRESS_SETTING);
        if (!raw) {
            return {};
        }
        if (typeof raw === 'object' && !Array.isArray(raw)) {
            return raw;
        }
        if (typeof raw === 'string') {
            try {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    return parsed;
                }
            }
            catch {
                // Legacy single-address string — treat as Tempo-only.
            }
            return { tempo: raw };
        }
        return {};
    }
    async #persist(network, address) {
        this.#addresses[network] = address;
        const map = {
            ...this.#readMap(),
            ...this.#addresses,
            [network]: address,
        };
        await this.settingsModel.edit([
            {
                key: DEPOSIT_ADDRESS_SETTING,
                value: JSON.stringify(map),
            },
        ], { context: { internal: true } });
    }
    #getStripe() {
        const keys = this.settingsHelpers.getActiveStripeKeys();
        const secretKey = keys?.secretKey;
        if (!secretKey) {
            throw new errors_1.default.IncorrectUsageError({
                message: 'Stripe secret key is required for machine payments',
            });
        }
        if (this.stripe && this.stripeSecretKey === secretKey) {
            return this.stripe;
        }
        this.stripeSecretKey = secretKey;
        this.stripe = this.stripeFactory(secretKey);
        return this.stripe;
    }
}
exports.DepositAddressStore = DepositAddressStore;
