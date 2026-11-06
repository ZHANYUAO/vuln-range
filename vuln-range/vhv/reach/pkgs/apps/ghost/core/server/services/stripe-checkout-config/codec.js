"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TierScope = exports.SnakeDesign = void 0;
exports.configRow = configRow;
const zod_1 = require("zod");
const case_keys_1 = require("../../lib/case-keys");
const json_1 = require("../../lib/db-types/json");
const checkout_1 = require("@tryghost/checkout");
const models_1 = require("./models");
/** The design's fields in snake_case, as used by the database, the Admin API and Stripe. */
exports.SnakeDesign = zod_1.z.object((0, case_keys_1.snakeKeys)(models_1.StripeCheckoutDesign.shape));
/**
 * Whether a part of the config covers every paid tier, including ones added later, or only
 * the tiers listed for it. Stored as a choice rather than read off an empty list, so a part
 * limited to some tiers never quietly widens to all of them.
 */
exports.TierScope = zod_1.z.enum(['all_paid', 'selected_paid']);
/**
 * A part of the config that can no longer be read, such as a design using a font Stripe has
 * dropped, reads as off and is logged. Checkouts then go without it until the publisher saves
 * it again, and the other parts are unaffected.
 */
function offWhenUnreadable(logging, part, message) {
    return ({ error }) => {
        logging.warn({ event: { name: `stripe_checkout.${part}.unreadable` }, err: new zod_1.z.ZodError(error.issues) }, message);
        return null;
    };
}
/**
 * The parts of a `stripe_checkout_config` row, each JSON or null while that part is off. They
 * are validated when read as well as when saved, so a stored value that is no longer allowed
 * never reaches Stripe. Which tiers a collected part is limited to is in the tiers table, and
 * which custom fields its answers land in are the bindings for their ports.
 */
function configRow(logging) {
    return zod_1.z.object({
        design: (0, json_1.DbJson)(zod_1.z.codec(exports.SnakeDesign, models_1.StripeCheckoutDesign, { decode: case_keys_1.camelKeys, encode: case_keys_1.snakeKeys }), { message: 'The stored Stripe Checkout design is not JSON.' })
            .nullable()
            .catch(offWhenUnreadable(logging, 'design', 'Ignoring a Stripe Checkout design that is no longer valid')),
        shipping: (0, json_1.DbJson)(zod_1.z.object({
            tier_scope: exports.TierScope,
            // A stored empty list, or a country Stripe no longer ships to, would make Stripe refuse
            // every checkout, so either reads as invalid.
            allowed_countries: zod_1.z
                .array(zod_1.z.string().refine((code) => (0, checkout_1.isStripeAllowedCountry)(code)))
                .min(1)
                .nullable(),
        }), { message: 'The stored shipping settings are not JSON.' })
            .nullable()
            .catch(offWhenUnreadable(logging, 'shipping', 'Ignoring Stripe Checkout shipping settings that are no longer valid')),
        phone: (0, json_1.DbJson)(zod_1.z.object({ tier_scope: exports.TierScope }), {
            message: 'The stored phone number settings are not JSON.',
        })
            .nullable()
            .catch(offWhenUnreadable(logging, 'phone', 'Ignoring Stripe Checkout phone number settings that are no longer valid')),
        tax_number: (0, json_1.DbJson)(zod_1.z.object({ tier_scope: exports.TierScope }), {
            message: 'The stored tax ID settings are not JSON.',
        })
            .nullable()
            .catch(offWhenUnreadable(logging, 'tax_number', 'Ignoring Stripe Checkout tax ID settings that are no longer valid')),
    });
}
