"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateOptionsData = generateOptionsData;
exports.generateAuthData = generateAuthData;
function generateOptionsData(frame, options) {
    return options.reduce((memo, option) => {
        let value = frame.options?.[option];
        if (['include', 'fields', 'formats'].includes(option) && typeof value === 'string') {
            value = value.split(',').sort();
        }
        if (option === 'page') {
            value = value || 1;
        }
        return {
            ...memo,
            [option]: value,
        };
    }, {});
}
function generateAuthData(frame) {
    const member = frame.options?.context?.member;
    if (member) {
        return {
            // Transistor embeds contain the individual member UUID. Use null for
            // UUID-less shims so they also avoid old entitlement-only cache entries.
            uuid: member.uuid ?? null,
            free: member.status === 'free',
            tiers: member.products?.map((product) => product.slug).sort(),
        };
    }
}
