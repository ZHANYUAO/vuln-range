"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.lockAutomationLimit = lockAutomationLimit;
const errors_1 = __importDefault(require("@tryghost/errors"));
const limits_1 = require("../limits");
/**
 * There can be a limit to the number of enabled automations.
 *
 * We lock a stable value to avoid race conditions where too many automations
 * can get enabled.
 */
async function lockAutomationLimit(trx, status) {
    switch (status) {
        case 'active':
        case 'legacy':
            break;
        case 'inactive':
        case 'archived':
            return;
        default: {
            const _exhaustive = status;
            throw new errors_1.default.InternalServerError({
                message: `Unknown automation status: ${_exhaustive}`,
            });
        }
    }
    if (!limits_1.limitService.isLimited('limitAutomations')) {
        return;
    }
    const site = await trx('settings').select('id').where('key', 'site_uuid').forUpdate().first();
    if (!site) {
        throw new errors_1.default.InternalServerError({ message: 'Cannot lock the automation plan limit.' });
    }
}
