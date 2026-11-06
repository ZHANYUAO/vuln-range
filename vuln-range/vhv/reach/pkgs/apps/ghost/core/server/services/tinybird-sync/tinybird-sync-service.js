"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTinybirdSyncService = createTinybirdSyncService;
const errors_1 = __importDefault(require("@tryghost/errors"));
const get_ingest_config_1 = require("./get-ingest-config");
const sync_table_to_tinybird_1 = require("./sync-table-to-tinybird");
const tinybird_sync_job_1 = __importDefault(require("./jobs/tinybird-sync-job"));
const cron_1 = require("../jobs-service/cron");
const BATCH_SIZE = 5000;
// This should be a little less than the maximum, because rows are chunked by
// JSON line, not bytes strictly.
const MAX_PAYLOAD_BYTES = 9 * 1024 * 1024;
const MAX_PAYLOAD_MESSAGES = 1000;
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
function createTinybirdSyncService({ config, settingsCache, knex, logging, random, now, fetch, createId, }) {
    let scheduled = false;
    const syncAll = async (ingest) => {
        const results = await Promise.allSettled(sync_table_to_tinybird_1.AUTOMATION_SYNC_TARGETS.map(async (target) => {
            const sent = await (0, sync_table_to_tinybird_1.syncTableToTinybird)(target, {
                knex,
                ...ingest,
                now,
                fetch,
                createId,
                batchSize: BATCH_SIZE,
                maxPayloadBytes: MAX_PAYLOAD_BYTES,
                maxPayloadMessages: MAX_PAYLOAD_MESSAGES,
                requestTimeoutMs: REQUEST_TIMEOUT_MS,
            });
            logging.info({ system: { event: 'tinybird.sync.completed', table: target.table, sent } }, `[Tinybird sync] ${target.table}: sent ${sent} rows`);
        }));
        for (const result of results) {
            if (result.status === 'rejected') {
                logging.error(result.reason, '[Tinybird sync] Failed to sync table');
            }
        }
    };
    const sync = async () => {
        const ingest = (0, get_ingest_config_1.getIngestConfig)({ config, settingsCache });
        if (!ingest) {
            return;
        }
        await syncAll(ingest);
    };
    const scheduleJob = async (jobsService) => {
        if (scheduled) {
            throw new errors_1.default.IncorrectUsageError({
                message: 'Tinybird sync is already scheduled.',
            });
        }
        if (!(0, get_ingest_config_1.getIngestConfig)({ config, settingsCache })) {
            logging.info('[Tinybird sync] Not started: Traffic Analytics service is not configured');
            return;
        }
        scheduled = true;
        logging.info({ system: { event: 'tinybird.sync.started' } }, '[Tinybird sync] Started');
        const at = (0, cron_1.randomFiveMinuteCron)(random);
        logging.info(`[Background Job] ${tinybird_sync_job_1.default.type} scheduled at ${at}`);
        try {
            await jobsService.scheduleRecurring(new tinybird_sync_job_1.default(), { cron: at });
        }
        catch (error) {
            // Unmarked so a later call can retry the registration.
            scheduled = false;
            throw error;
        }
    };
    return { scheduleJob, sync };
}
