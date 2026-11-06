"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const stripe_checkout_config_1 = __importDefault(require("../../services/stripe-checkout-config"));
const models_1 = require("../../services/stripe-checkout-config/models");
const serializers_1 = require("../../services/stripe-checkout-config/serializers");
const labs = require('../../../shared/labs');
/**
 * A real Stripe Checkout page for a paid tier, from checkout settings that need not be saved,
 * for Admin to open in a new tab: Stripe refuses to run Checkout inside another page. Takes
 * and refuses settings as saving them does, and uses tier permissions like the checkout config.
 */
const controller = {
    docName: 'checkout_preview',
    add: {
        headers: { cacheInvalidate: false },
        permissions: { docName: 'products', method: 'edit' },
        query(frame) {
            const [input] = frame.data.checkout_preview;
            (0, serializers_1.refuseCollectionWhileOff)(input, labs.isSet(models_1.COLLECTION_FLAG));
            return stripe_checkout_config_1.default.service.previews.add(input);
        },
    },
};
// module.exports (not export): the API framework loads controllers via require().
module.exports = controller;
