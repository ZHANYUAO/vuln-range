"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RECIPIENT_VERIFICATION_CODE = void 0;
exports.isCount = isCount;
exports.countsDiffer = countsDiffer;
exports.missingRecipientFields = missingRecipientFields;
exports.recipientVerificationError = recipientVerificationError;
exports.excludedRecipientError = excludedRecipientError;
const errors_1 = require("@tryghost/errors");
const tpl_1 = __importDefault(require("@tryghost/tpl"));
const logging_1 = __importDefault(require("@tryghost/logging"));
// Only message is persisted to emails.error and displayed by the newsletter banner.
const messages = {
    preparationError: 'An error occurred while preparing your newsletter. Please try again.',
    verificationError: 'An error occurred while checking your newsletter’s recipients. Sending has stopped.',
};
exports.RECIPIENT_VERIFICATION_CODE = 'BULK_EMAIL_RECIPIENT_VERIFICATION_FAILED';
function isCount(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function countsDiffer(expected, actual) {
    return isCount(expected) && isCount(actual) && expected !== actual;
}
function missingRecipientFields(member) {
    return ['id', 'uuid', 'email'].filter((field) => !member[field]);
}
function recipientVerificationError(emailId, reason, details = {}, { canRebuild = false, countMismatch = false } = {}) {
    const confirmedCountMismatch = countMismatch && countsDiffer(details.expected, details.actual);
    // Read retryable on the raw error: GhostError wrapping drops false-valued properties.
    const error = Object.assign(new errors_1.EmailError({
        code: exports.RECIPIENT_VERIFICATION_CODE,
        message: (0, tpl_1.default)(canRebuild ? messages.preparationError : messages.verificationError),
        errorDetails: JSON.stringify({
            ...details,
            code: exports.RECIPIENT_VERIFICATION_CODE,
            email_id: emailId,
            reason,
            can_rebuild: canRebuild,
            count_mismatch: confirmedCountMismatch,
        }),
    }), { retryable: false });
    // The failed invariant determines the event; diagnostic count fields alone do
    // not turn an ownership or lifecycle failure into a count mismatch.
    logging_1.default.error({
        err: error,
        event: {
            name: confirmedCountMismatch
                ? 'email.recipient_count.mismatch'
                : 'email.verification.failed',
        },
        code: exports.RECIPIENT_VERIFICATION_CODE,
        email_id: emailId,
        reason,
        ...details,
    }, 'Newsletter recipient verification failed');
    return error;
}
function excludedRecipientError(emailId, eventName, reason, details) {
    const fields = { ...details, email_id: emailId, reason };
    const error = new errors_1.EmailError({
        code: 'BULK_EMAIL_INVALID_RECIPIENT',
        message: 'Member excluded from newsletter due to invalid recipient data',
        errorDetails: JSON.stringify(fields),
    });
    logging_1.default.error({ err: error, event: { name: eventName }, ...fields }, error.message);
    return error;
}
