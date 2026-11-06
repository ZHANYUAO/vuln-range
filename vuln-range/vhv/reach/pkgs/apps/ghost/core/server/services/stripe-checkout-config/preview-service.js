"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CheckoutPreviewService = void 0;
const errors_1 = __importDefault(require("@tryghost/errors"));
const parse_request_1 = require("../../lib/parse-request");
const serializers_1 = require("./serializers");
// Stripe refuses a checkout that expires sooner than 30 minutes after it's created. The extra
// minute keeps a server clock running a little behind Stripe's from going under that.
const PREVIEW_LIFETIME_SECONDS = 31 * 60;
/**
 * Opens real Stripe Checkout pages for previewing settings before they are saved, checked as
 * saving them would be. A preview is an ordinary checkout for the tier, so it saves nothing in
 * Ghost, but it can only be paid for as long as Stripe allows the shortest checkout to last.
 */
class CheckoutPreviewService {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    /** Opens a checkout for an active paid tier from the settings given, and returns its page. */
    async add(input) {
        const { tierId, cadence, ...settings } = (0, parse_request_1.parseRequest)(serializers_1.CheckoutPreviewInput, input, 'checkout_preview');
        if (!this.deps.stripeConnected()) {
            throw new errors_1.default.ValidationError({ message: 'Connect Stripe to preview checkout.' });
        }
        const tier = await this.deps.readTier(tierId);
        if (!tier || tier.type !== 'paid' || tier.status !== 'active') {
            throw new errors_1.default.ValidationError({
                message: 'Choose an active paid tier to preview checkout for.',
                property: 'tier_id',
            });
        }
        const checkout = await this.deps.checkouts.preview(tierId, settings);
        const url = await this.deps.createPreviewLink({
            tier,
            cadence,
            checkout,
            returnUrl: this.deps.siteUrl(),
            expiresInSeconds: PREVIEW_LIFETIME_SECONDS,
        });
        if (!url) {
            throw new errors_1.default.InternalServerError({
                message: 'Stripe returned no checkout page to preview.',
            });
        }
        return { url };
    }
}
exports.CheckoutPreviewService = CheckoutPreviewService;
