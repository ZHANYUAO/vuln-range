"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CheckoutBrandingService = void 0;
const errors_1 = __importDefault(require("@tryghost/errors"));
const zod_1 = require("zod");
const case_keys_1 = require("../../lib/case-keys");
const codec_1 = require("./codec");
/**
 * The business name in the `branding_settings` Stripe reports on a new session. The design is
 * read on its own, so one Ghost can't show doesn't lose the name.
 */
const ResolvedIdentity = zod_1.z.object({
    display_name: zod_1.z.string(),
});
/**
 * Reads the checkout branding from Stripe. Nothing is cached, so a change in the Stripe
 * dashboard shows the next time it is read.
 */
class CheckoutBrandingService {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    async read() {
        if (!this.deps.stripeConnected()) {
            throw new errors_1.default.ValidationError({
                message: 'Connect Stripe to read its checkout branding.',
            });
        }
        const branding = await this.deps.readBranding();
        const identity = ResolvedIdentity.safeParse(branding);
        if (!identity.success) {
            throw new errors_1.default.InternalServerError({
                message: 'Stripe reported checkout branding Ghost cannot show.',
                context: identity.error.message,
            });
        }
        const design = codec_1.SnakeDesign.safeParse(branding);
        if (!design.success) {
            this.deps.logging.warn({ event: { name: 'stripe_checkout.branding.design_unreadable' }, err: design.error }, 'Ignoring a Stripe Checkout design Ghost cannot show');
        }
        return {
            displayName: identity.data.display_name,
            design: design.success ? (0, case_keys_1.camelKeys)(design.data) : null,
        };
    }
}
exports.CheckoutBrandingService = CheckoutBrandingService;
