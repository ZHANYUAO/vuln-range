"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toCheckoutBrandingResponse = exports.toCheckoutPreviewResponse = exports.toCheckoutConfigResponse = exports.CheckoutPreviewInput = exports.CheckoutConfigInput = void 0;
exports.refuseCollectionWhileOff = refuseCollectionWhileOff;
const errors_1 = __importDefault(require("@tryghost/errors"));
const zod_1 = require("zod");
const checkout_1 = require("@tryghost/checkout");
const case_keys_1 = require("../../lib/case-keys");
const codec_1 = require("./codec");
const models_1 = require("./models");
/**
 * Refuses a request, to save or to preview, that names a collected part while their flag is
 * off, as the collected parts are still in development.
 */
function refuseCollectionWhileOff(input, collecting) {
    if (collecting || typeof input !== 'object' || input === null) {
        return;
    }
    const section = models_1.COLLECTED_SECTIONS.find((candidate) => models_1.SECTION_NAMES[candidate] in input);
    if (section) {
        const noun = models_1.COLLECTED_NOUNS[section];
        throw new errors_1.default.ValidationError({
            message: `${noun[0].toUpperCase()}${noun.slice(1)} collection is not available yet.`,
            property: models_1.SECTION_NAMES[section],
        });
    }
}
/**
 * The design in a request.
 *
 * `customize: false` means no design, so Stripe uses the dashboard design.
 * `customize: true` gives the design, and must include every field.
 */
const CustomizedDesign = zod_1.z.strictObject({ customize: zod_1.z.literal(true), ...codec_1.SnakeDesign.shape });
const DesignInput = zod_1.z
    .discriminatedUnion('customize', [
    zod_1.z.strictObject({ customize: zod_1.z.literal(false) }),
    CustomizedDesign,
])
    .transform((input) => (input.customize ? designOf(input) : null));
/** The design a customized request gives, without the switch that says it's customized. */
function designOf({ customize: _customize, ...design }) {
    return (0, case_keys_1.camelKeys)(design);
}
/** Each collected part in an edit request, as its settings in the model, or null for off. */
const CollectedInputs = {
    shipping: checkout_1.CHECKOUT_PART_SETTINGS.shipping
        .transform((input) => input.collect
        ? {
            tierIds: input.tier_ids ?? null,
            allowedCountries: input.allowed_countries ?? null,
            addressCustomFieldKey: input.address.custom_field_key,
            nameCustomFieldKey: input.name.custom_field_key,
        }
        : null)
        .optional(),
    phone: checkout_1.CHECKOUT_PART_SETTINGS.phone
        .transform((input) => input.collect
        ? { tierIds: input.tier_ids ?? null, customFieldKey: input.custom_field_key }
        : null)
        .optional(),
    tax_number: checkout_1.CHECKOUT_PART_SETTINGS.tax_number
        .transform((input) => input.collect ? { tierIds: input.tier_ids ?? null } : null)
        .optional(),
};
/** An edit request, keyed by each part's name in the model. Parts it leaves out are not changed. */
exports.CheckoutConfigInput = zod_1.z
    .strictObject({
    design: DesignInput.optional(),
    ...CollectedInputs,
})
    .transform((input) => (0, case_keys_1.camelKeys)(input));
/**
 * A preview request: the paid tier to open a checkout for, the design to show it in, and the
 * collected parts to ask for, each as an edit request gives it, though none need be saved.
 * Parts it leaves out are asked as saved.
 */
exports.CheckoutPreviewInput = zod_1.z
    .strictObject({
    tier_id: zod_1.z
        .string()
        .regex(/^[0-9a-f]{24}$/, { error: 'Choose a tier to preview checkout for.' }),
    cadence: zod_1.z.enum(['month', 'year']).default('month'),
    design: DesignInput,
    ...CollectedInputs,
})
    .transform((input) => (0, case_keys_1.camelKeys)(input));
/**
 * Each collected part as the Admin API returns it, in the shape a request saves, so a client can
 * save back what it read. Left out while its flag is off.
 */
const CollectedResources = {
    shipping: checkout_1.CHECKOUT_PART_SETTINGS.shipping.optional(),
    phone: checkout_1.CHECKOUT_PART_SETTINGS.phone.optional(),
    tax_number: checkout_1.CHECKOUT_PART_SETTINGS.tax_number.optional(),
};
const CheckoutConfigResource = zod_1.z.object({
    design: zod_1.z.discriminatedUnion('customize', [
        zod_1.z.object({ customize: zod_1.z.literal(false) }),
        codec_1.SnakeDesign.extend({ customize: zod_1.z.literal(true) }),
    ]),
    ...CollectedResources,
});
/** Shipping as the Admin API returns it, in the same shape a request gives it. */
function shippingResource(shipping) {
    if (!shipping) {
        return { collect: false };
    }
    return {
        collect: true,
        ...(shipping.tierIds ? { tier_ids: shipping.tierIds } : {}),
        ...(shipping.allowedCountries ? { allowed_countries: shipping.allowedCountries } : {}),
        address: { custom_field_key: shipping.addressCustomFieldKey },
        name: { custom_field_key: shipping.nameCustomFieldKey },
    };
}
/** The phone number as the Admin API returns it, in the same shape a request gives it. */
function phoneResource(phone) {
    if (!phone) {
        return { collect: false };
    }
    return {
        collect: true,
        ...(phone.tierIds ? { tier_ids: phone.tierIds } : {}),
        custom_field_key: phone.customFieldKey,
    };
}
/** The tax ID as the Admin API returns it, in the same shape a request gives it. */
function taxNumberResource(taxNumber) {
    if (!taxNumber) {
        return { collect: false };
    }
    return {
        collect: true,
        ...(taxNumber.tierIds ? { tier_ids: taxNumber.tierIds } : {}),
    };
}
/** The collected parts a response carries: the ones the config it is given includes. */
function collectedResources(settings) {
    return {
        shipping: settings.shipping === undefined ? undefined : shippingResource(settings.shipping),
        phone: settings.phone === undefined ? undefined : phoneResource(settings.phone),
        tax_number: settings.taxNumber === undefined ? undefined : taxNumberResource(settings.taxNumber),
    };
}
/** The collected parts, which a response leaves out while their flag is off. */
const COLLECTED_OPTIONAL = {
    shipping: true,
    phone: true,
    taxNumber: true,
};
const CheckoutConfigResponse = zod_1.z.object({
    checkout_config: zod_1.z.tuple([CheckoutConfigResource]),
});
/**
 * The config as the Admin API returns it. Every part says whether it is set, so a client can
 * save back exactly what it read. The collected parts are left out while their flag is off.
 */
exports.toCheckoutConfigResponse = models_1.StripeCheckoutConfig.partial(COLLECTED_OPTIONAL)
    .transform((settings) => ({
    checkout_config: [
        {
            design: settings.design
                ? { customize: true, ...(0, case_keys_1.snakeKeys)(settings.design) }
                : { customize: false },
            ...collectedResources(settings),
        },
    ],
}))
    .pipe(CheckoutConfigResponse);
const CheckoutPreviewResponse = zod_1.z.object({
    checkout_preview: zod_1.z.tuple([zod_1.z.object({ url: zod_1.z.url() })]),
});
/** A preview as the Admin API returns it: the Stripe Checkout page to open. */
exports.toCheckoutPreviewResponse = zod_1.z
    .object({ url: zod_1.z.string() })
    .transform(({ url }) => ({
    checkout_preview: [{ url }],
}))
    .pipe(CheckoutPreviewResponse);
const CheckoutBrandingResponse = zod_1.z.object({
    checkout_branding: zod_1.z.tuple([
        zod_1.z.object({
            display_name: zod_1.z.string(),
            design: codec_1.SnakeDesign.nullable(),
        }),
    ]),
});
/** The Stripe dashboard's checkout branding as the Admin API returns it. */
exports.toCheckoutBrandingResponse = models_1.StripeCheckoutBranding.transform((branding) => ({
    checkout_branding: [
        {
            display_name: branding.displayName,
            design: branding.design ? (0, case_keys_1.snakeKeys)(branding.design) : null,
        },
    ],
})).pipe(CheckoutBrandingResponse);
