"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const stripe_checkout_config_1 = __importDefault(require("../../services/stripe-checkout-config"));
/**
 * The checkout branding in the Stripe dashboard, for Admin's sketch of the checkout. Uses tier
 * permissions like the checkout config.
 */
const controller = {
    docName: 'checkout_branding',
    read: {
        headers: { cacheInvalidate: false },
        permissions: { docName: 'products', method: 'read' },
        query() {
            return stripe_checkout_config_1.default.service.branding.read();
        },
    },
};
// module.exports (not export): the API framework loads controllers via require().
module.exports = controller;
