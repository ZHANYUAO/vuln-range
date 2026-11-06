"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkoutSessionParts = checkoutSessionParts;
exports.taxSessionParams = taxSessionParams;
const checkout_1 = require("@tryghost/checkout");
const case_keys_1 = require("../../lib/case-keys");
const models_1 = require("../stripe-checkout-config/models");
/** The Checkout session parameters that ask for each collected part a checkout asks for. */
const STRIPE_PARAMS = {
    shipping: ({ allowedCountries }) => ({
        shipping_address_collection: {
            // Stripe has no way to say everywhere, and a checkout without countries collects no
            // address, so everywhere is every country Stripe accepts.
            allowed_countries: allowedCountries ?? [...checkout_1.STRIPE_ALLOWED_COUNTRIES],
        },
    }),
    phone: () => ({ phone_number_collection: { enabled: true } }),
    // Automatic tax already lets a business buyer give a tax ID, in the tax parameters every
    // session that takes payment sends.
    taxNumber: (_asking, session) => session.automatic_tax?.enabled
        ? {}
        : {
            tax_id_collection: { enabled: true },
            // Stripe refuses to take an existing customer's tax ID unless it may save the business
            // name on them, and refuses to update a customer on a checkout that has none.
            ...(session.customer ? { customer_update: { name: 'auto' } } : {}),
        },
};
/**
 * The Checkout session parameters a checkout adds to a session, by the part that adds them: its
 * design as `branding_settings`, and what it asks the buyer for. Without a checkout there are
 * none, so Stripe uses the merchant's own settings.
 */
function checkoutSessionParts(checkout, session) {
    if (!checkout) {
        return {};
    }
    const parts = checkout.design
        ? { design: { branding_settings: (0, case_keys_1.snakeKeys)(checkout.design) } }
        : {};
    const ask = (section) => {
        const asking = checkout.asks[section];
        if (asking) {
            parts[section] = STRIPE_PARAMS[section](asking, session);
        }
    };
    models_1.COLLECTED_SECTIONS.forEach(ask);
    return parts;
}
/**
 * The tax parameters of a Checkout session that takes payment. With automatic tax, Stripe
 * works out the tax from the buyer's address and lets a business buyer give a tax ID.
 */
function taxSessionParams({ automaticTax, hasCustomer }) {
    if (!automaticTax) {
        return { automatic_tax: { enabled: false } };
    }
    return {
        automatic_tax: { enabled: true },
        tax_id_collection: { enabled: true },
        // For an existing customer, Stripe works out the tax from the address saved on them, and
        // refuses to take a tax ID unless it may save the business name on them, so both are saved
        // from the checkout. Stripe refuses this without a customer.
        ...(hasCustomer ? { customer_update: { address: 'auto', name: 'auto' } } : {}),
    };
}
