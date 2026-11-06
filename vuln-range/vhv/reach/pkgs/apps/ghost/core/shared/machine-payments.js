"use strict";
/**
 * Shared eligibility for agent-purchasable paid content.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPurchasableEntry = isPurchasableEntry;
exports.isMachinePaymentsEnabled = isMachinePaymentsEnabled;
function isPurchasableEntry(entry) {
    if (!entry) {
        return false;
    }
    if (entry.visibility === 'paid') {
        return true;
    }
    if (entry.visibility !== 'tiers') {
        return false;
    }
    return (Array.isArray(entry.tiers) &&
        entry.tiers.length > 0 &&
        entry.tiers.every((tier) => tier.type === 'paid'));
}
/**
 * Shared enablement check for machine payments (labs + settings + Stripe).
 */
function isMachinePaymentsEnabled({ labs, settingsCache, isStripeConnected, }) {
    return (labs.isSet('machinePayments') &&
        settingsCache.get('machine_payments_enabled') === true &&
        settingsCache.get('llms_enabled') !== false &&
        isStripeConnected());
}
