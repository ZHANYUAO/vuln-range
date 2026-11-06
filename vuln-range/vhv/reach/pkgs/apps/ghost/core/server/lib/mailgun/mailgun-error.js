"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMailgunError = void 0;
/**
 * Mailgun clients reject with `{ error, messageData }`.
 *
 * If passed such an object, we return `error`. Otherwise, we return the input value.
 */
const getMailgunError = (err) => typeof err === 'object' && err !== null && 'error' in err && err.error instanceof Error
    ? err.error
    : err;
exports.getMailgunError = getMailgunError;
