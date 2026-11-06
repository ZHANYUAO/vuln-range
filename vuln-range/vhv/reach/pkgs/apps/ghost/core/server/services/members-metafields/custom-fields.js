"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.customFields = customFields;
const errors_1 = __importDefault(require("@tryghost/errors"));
const identity_1 = require("@tryghost/metafield-types/identity");
/**
 * Custom fields: the publisher's own namespace, and the policy its fields follow. Staff with
 * the custom fields permission manage them. A host can switch them off, and an operational
 * ceiling caps how many a site can hold.
 */
function customFields({ limitService, getMaxDefinitions, }) {
    return {
        namespace: identity_1.CUSTOM_NAMESPACE,
        owner: { staff: 'member_custom_field' },
        limits: [hostSwitch(limitService, 'limitCustomFields'), operationalCeiling(getMaxDefinitions)],
    };
}
/**
 * A host limit that switches a feature off. The limit service is asked each time, as a host's
 * limits can change while Ghost runs, and its error carries the host's own words.
 */
function hostSwitch(limitService, name) {
    return {
        kind: 'availability',
        isAvailable: () => limitService.isDisabled(name) !== true,
        refuse: () => limitService.errorIfWouldGoOverLimit(name),
    };
}
/**
 * A safeguard against the database load unbounded fields would create, not a pricing or
 * packaging limit, so it applies wherever custom fields are available. It counts the
 * publisher's fields alone, as each namespace states its own limits.
 *
 * Both active and archived fields count: an archived field still occupies a row and still
 * carries its members' values, so archiving alone frees no space. Deleting an archived field
 * is what releases a slot.
 */
function operationalCeiling(getMax) {
    return {
        kind: 'count',
        async assertRoom(held, adding) {
            const max = getMax();
            if (held + adding <= max) {
                return;
            }
            // Two different situations reach here and they need different advice. At or over the
            // ceiling there is nothing to do but free a slot. With slots still free the request was
            // simply too big, and telling that operator to delete something is wrong: they have
            // room, just not this much.
            const remaining = max - held;
            const advice = remaining > 0
                ? `You can add ${remaining} more.`
                : 'Delete a field you no longer need to make room.';
            throw new errors_1.default.HostLimitError({
                message: `Custom fields are limited to ${max} per site. ${advice}`,
                code: 'CUSTOM_FIELDS_LIMIT_REACHED',
                // `requested` is carried alongside the limit-service shape so a batch rejection is
                // self-describing: without it a client sees free slots and a refusal, and has to
                // re-derive its own payload size to explain why.
                errorDetails: { limit: max, total: held, requested: adding },
            });
        },
    };
}
