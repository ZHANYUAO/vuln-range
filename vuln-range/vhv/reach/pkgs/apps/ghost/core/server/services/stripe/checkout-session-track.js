"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.trackCheckoutSession = trackCheckoutSession;
const logging_1 = __importDefault(require("@tryghost/logging"));
/**
 * Stripe refusing the publisher's design doesn't fail the checkout, which goes ahead in Stripe's
 * default design, so the refusal is only logged.
 */
const logRefusedDesign = (err) => logging_1.default.error({ event: { name: 'stripe_checkout.design.refused' }, err }, 'Stripe refused the Stripe Checkout design');
/**
 * `create` must call `onDesignRefused` when Stripe refuses the publisher's design and the
 * session is sent again without it.
 *
 * On a failure, `design` is `applied` when the request carrying the design failed for another
 * reason, and `refused` when a request sent again without the design failed.
 */
function trackCheckoutSession(tracer, parts, create) {
    return tracer.track('stripe_checkout.session', (span) => {
        span.setAttribute('design', parts.design ? 'applied' : 'none');
        return create((err) => {
            span.setAttribute('design', 'refused');
            logRefusedDesign(err);
        });
    });
}
