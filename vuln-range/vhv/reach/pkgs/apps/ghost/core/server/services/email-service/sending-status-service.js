"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SendingStatusService = void 0;
const case_keys_1 = require("../../lib/case-keys");
const sending_status_schema_1 = require("./sending-status-schema");
const sending_status_1 = require("./sending-status");
class SendingStatusService {
    #knex;
    constructor({ knex }) {
        this.#knex = knex;
    }
    async statusFor(emailId) {
        const row = await this.#knex('emails')
            .select('id', 'status', 'email_count', 'preflight_email_count', 'updated_at')
            .where('id', emailId)
            .first();
        if (!row) {
            return null;
        }
        const email = sending_status_schema_1.DbEmailSendingRow.parse(row);
        // Completion persists the verified submitted count. Emails with null
        // preflight_email_count, or batches submitted before submission counts were
        // recorded, retain their intended count. Neither needs aggregation once finished.
        const batches = email.status === 'submitted'
            ? []
            : await this.#batchesFor(emailId, email.preflight_email_count !== null);
        return {
            id: email.id,
            sending: (0, sending_status_1.buildSendingStatus)({
                status: email.status,
                recipientCount: email.email_count,
                // The sending job saves the email when it takes its status lock, so updated_at
                // stands in for the attempt start that Ghost does not record.
                attemptStartedAt: email.updated_at,
            }, batches),
        };
    }
    /** The retry decision statusFor reports, without the recipient counts its progress needs. */
    async retryEligibilityFor(emailId) {
        const email = await this.#knex('emails').select('status').where('id', emailId).first();
        if (!email) {
            return 'not-failed';
        }
        if (sending_status_schema_1.StoredSendingStatus.parse(email.status) !== 'failed') {
            return 'not-failed';
        }
        const batches = await this.#knex('email_batches').distinct('status').where('email_id', emailId);
        const statuses = batches.map((batch) => sending_status_schema_1.StoredSendingStatus.parse(batch.status));
        return (0, sending_status_1.isRetryable)(statuses) ? 'retryable' : 'unknown-outcome';
    }
    async #batchesFor(emailId, recipientAccounting) {
        if (recipientAccounting) {
            const rows = await this.#knex('email_batches')
                // Retain unknown intent so progress can use the email's saved total as
                // a lower bound instead of silently treating missing recipients as zero.
                .select('status', 'created_at', 'updated_at', 'recipient_count')
                // Both missing counts identify preparation-only deployments. A partially
                // missing pair is invalid and earns no verified submission progress.
                .select(this.#knex.raw(`CASE
              WHEN submitted_count IS NULL AND submission_excluded_count IS NULL
              THEN COALESCE(recipient_count, 0)
              ELSE COALESCE(submitted_count + submission_excluded_count, 0)
            END AS accounted_recipient_count`))
                .where('email_id', emailId);
            return rows.map((batchRow) => (0, case_keys_1.camelKeys)(sending_status_schema_1.DbBatchSendingRow.parse(batchRow)));
        }
        // Correlated per-batch count stays on the batch_id index; grouping recipients by email_id scans every recipient row.
        const recipientCount = this.#knex('email_recipients as recipient')
            .count('*')
            .whereRaw('recipient.batch_id = batch.id');
        const rows = await this.#knex('email_batches as batch')
            .select('batch.status', 'batch.created_at', 'batch.updated_at')
            .select(recipientCount.as('recipient_count'))
            .where('batch.email_id', emailId);
        return rows.map((batchRow) => (0, case_keys_1.camelKeys)(sending_status_schema_1.DbBatchSendingRow.parse(batchRow)));
    }
}
exports.SendingStatusService = SendingStatusService;
