"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getReadyAtForAction = void 0;
const errors_1 = __importDefault(require("@tryghost/errors"));
const HOUR_MS = 3600000;
const getReadyAtForAction = (action, now, fakeWaitHoursMultiplier) => {
    switch (action.type) {
        case 'send_email':
            return now;
        case 'wait': {
            const waitMs = action.wait_hours * (fakeWaitHoursMultiplier || HOUR_MS);
            return new Date(now.getTime() + waitMs);
        }
        /* v8 ignore start -- @preserve */
        default: {
            const _exhaustive = action;
            throw new errors_1.default.IncorrectUsageError({
                message: `Unexpected action ${String(_exhaustive)}`,
            });
        }
        /* v8 ignore stop -- @preserve */
    }
};
exports.getReadyAtForAction = getReadyAtForAction;
