"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobsOutbox = exports.OutboxEnvelope = void 0;
const zod_1 = require("zod");
const json_1 = require("../../lib/db-types/json");
const TABLE = 'jobs_outbox';
// knex's generated name for the schema's ['available_at'] index on this table.
const AVAILABLE_AT_INDEX = 'jobs_outbox_available_at_index';
exports.OutboxEnvelope = (0, json_1.DbJson)(zod_1.z.object({
    version: zod_1.z.literal(1),
    payload: zod_1.z.object({
        job: zod_1.z.object({ type: zod_1.z.string(), payload: zod_1.z.string() }),
        routing: zod_1.z.object({ queue: zod_1.z.string().optional() }).optional(),
    }),
}), { message: 'The stored jobs outbox envelope is not JSON.' });
// The row as the claim query returns it, validated before anything trusts it.
const ClaimedRow = zod_1.z.object({ id: zod_1.z.string(), envelope: zod_1.z.string() });
// MySQL rounds a fractional DATETIME on insert, which can round available_at up
// and leave a freshly inserted row briefly ineligible.
function floorToSecond(date) {
    return new Date(Math.floor(date.getTime() / 1000) * 1000);
}
class JobsOutbox {
    #knex;
    constructor({ knex }) {
        this.#knex = knex;
    }
    async insert({ id, envelope }, { transacting } = {}) {
        const now = floorToSecond(new Date());
        const row = {
            id,
            envelope: zod_1.z.encode(exports.OutboxEnvelope, envelope),
            created_at: now,
            available_at: now,
        };
        const query = this.#knex(TABLE).insert(row);
        await (transacting ? query.transacting(transacting) : query);
    }
    async processNext(submit, { retryDelayMs }) {
        return this.#knex.transaction(async (trx) => {
            // InnoDB locks every row a locking read examines, not just the row it
            // returns. Left to the optimizer, a small table (or stale statistics
            // after a truncate) gets a table scan plus filesort, which reads and
            // locks every eligible row before the LIMIT applies, so one relay
            // holding a row starves the others and blocks inserts. Forcing the
            // available_at index makes the scan stop at the first unlocked row.
            const raw = await trx
                .select('id', 'envelope')
                .from(trx.raw('?? force index (??)', [TABLE, AVAILABLE_AT_INDEX]))
                .where('available_at', '<=', new Date())
                .orderBy([{ column: 'available_at' }, { column: 'id' }])
                .forUpdate()
                .skipLocked()
                .first();
            if (!raw) {
                return { status: 'idle' };
            }
            // A row that does not match the schema means drift that will hit every
            // row, so it throws out of the claim rather than taking the per-row
            // retry path, which needs a trusted id.
            const { id, envelope: stored } = ClaimedRow.parse(raw);
            // Decoding is inside the try so a row that cannot be read takes the same
            // retry path as a rejected submission, instead of throwing out of the
            // transaction and being re-claimed first on every poll.
            try {
                const envelope = zod_1.z.decode(exports.OutboxEnvelope, stored);
                await submit(id, envelope);
            }
            catch (error) {
                await trx(TABLE)
                    .where('id', id)
                    .update({ available_at: new Date(Date.now() + retryDelayMs) });
                return { status: 'failed', id, error };
            }
            await trx(TABLE).where('id', id).delete();
            return { status: 'delivered', id };
        });
    }
}
exports.JobsOutbox = JobsOutbox;
