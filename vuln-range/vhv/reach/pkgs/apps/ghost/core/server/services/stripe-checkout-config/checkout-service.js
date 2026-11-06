"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CheckoutService = exports.NOTHING_COLLECTED = void 0;
const models_1 = require("./models");
/** The private flag the config is behind. The collected parts are behind their own flag too. */
const DESIGN_FLAG = 'stripeCheckoutDesign';
/** Every collected part asking for nothing. */
exports.NOTHING_COLLECTED = Object.freeze({
    shipping: null,
    phone: null,
    taxNumber: null,
});
/** How a checkout asks for each collected part: as set, without the tiers it covers. */
const ASKING = {
    shipping: ({ allowedCountries }) => ({ allowedCountries }),
    phone: () => ({}),
    taxNumber: () => ({}),
};
/**
 * The checkout the config makes for a subscription to this paid tier: its design, asking for
 * each collected part that covers the tier and has somewhere to keep the answer.
 */
function checkoutForTier(config, tierId) {
    const ask = (section, part) => part !== null && asksOn(part, tierId) ? ASKING[section](part) : null;
    return {
        design: config.design,
        asks: {
            shipping: ask('shipping', config.shipping),
            phone: ask('phone', config.phone),
            taxNumber: ask('taxNumber', config.taxNumber),
        },
    };
}
/** Whether a checkout for this paid tier asks for what a collected part collects. */
function asksOn(part, tierId) {
    return part.collectable && (part.tierIds === null || part.tierIds.includes(tierId));
}
/**
 * Decides the Stripe Checkout pages Ghost opens from the site's config: the checkout a buyer
 * gets, and previews of settings not saved yet. Nothing from the config applies while its
 * flags are off, and a checkout Ghost has no settings for is null, so Stripe uses the
 * merchant's own.
 */
class CheckoutService {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    /** The checkout for a subscription to this paid tier. */
    async readForTier(tierId) {
        const config = await this.readConfig();
        return config && checkoutForTier(config, tierId);
    }
    /** The checkout for a donation, a gift or a card update, which aren't for a tier: the design only. */
    async read() {
        const config = await this.readConfig();
        return config && { design: config.design, asks: exports.NOTHING_COLLECTED };
    }
    /**
     * The checkout a preview opens for this paid tier: in the given design, asking for the
     * collected parts it gives as checkouts would once they were saved, and for the rest as saved.
     * Refuses parts that saving would refuse.
     */
    async preview(tierId, { design, ...unsaved }) {
        const collection = this.collecting()
            ? await this.deps.config.readForCheckout(unsaved)
            : exports.NOTHING_COLLECTED;
        return checkoutForTier({ ...collection, design }, tierId);
    }
    /**
     * The config as checkouts use it, without the collected parts while their flag is off. Null
     * while the design flag is off or the config can't be read.
     */
    async readConfig() {
        // The collected parts only release after the design, so nothing is read while it's off.
        if (!this.deps.labs.isSet(DESIGN_FLAG)) {
            return null;
        }
        const config = await this.readSaved();
        if (!config) {
            return null;
        }
        return this.collecting() ? config : { design: config.design, ...exports.NOTHING_COLLECTED };
    }
    collecting() {
        return this.deps.labs.isSet(models_1.COLLECTION_FLAG);
    }
    /**
     * The config as saved, or null when it can't be read. This never throws: a checkout without
     * Ghost's settings still takes payment, while a failed one doesn't.
     */
    async readSaved() {
        try {
            return await this.deps.config.readForCheckout();
        }
        catch (err) {
            this.deps.logging.error({ event: { name: 'stripe_checkout.config.read_failed' }, err }, 'Failed to read the Stripe Checkout config');
            return null;
        }
    }
}
exports.CheckoutService = CheckoutService;
