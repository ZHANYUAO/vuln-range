"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DbConfigTier = exports.DbSection = exports.CONFIG_TIERS_TABLE = exports.DbConfigParts = exports.DbStripeCheckoutConfig = exports.CONFIG_SLUG = exports.CONFIG_TABLE = void 0;
const zod_1 = require("zod");
const date_1 = require("../../lib/db-types/date");
const models_1 = require("./models");
exports.CONFIG_TABLE = 'stripe_checkout_config';
/** The slug of the config's single row. Saving inserts the row with this slug, or updates it. */
exports.CONFIG_SLUG = 'default';
/** A `stripe_checkout_config` row. */
exports.DbStripeCheckoutConfig = zod_1.z.object({
    id: zod_1.z.string(),
    slug: zod_1.z.string(),
    design: zod_1.z.string().nullable(),
    shipping: zod_1.z.string().nullable(),
    phone: zod_1.z.string().nullable(),
    tax_number: zod_1.z.string().nullable(),
    created_at: date_1.DbDate,
    updated_at: date_1.DbDate.nullable(),
});
/** The columns holding the parts of the config, each JSON or null while that part is off. */
exports.DbConfigParts = exports.DbStripeCheckoutConfig.pick({
    design: true,
    shipping: true,
    phone: true,
    tax_number: true,
});
exports.CONFIG_TIERS_TABLE = 'stripe_checkout_config_tiers';
/** A collected part as the tiers table names it, read as its name in code. */
exports.DbSection = zod_1.z.codec(zod_1.z.enum(models_1.SECTION_NAMES), zod_1.z.enum(models_1.COLLECTED_SECTIONS), {
    decode: (name) => models_1.SECTION_OF[name],
    encode: (section) => models_1.SECTION_NAMES[section],
});
/** A `stripe_checkout_config_tiers` row: one of the tiers a collected part is limited to. */
exports.DbConfigTier = zod_1.z.object({
    section: exports.DbSection,
    product_id: zod_1.z.string(),
});
