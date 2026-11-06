"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.init = init;
exports.getInstance = getInstance;
exports.shutdown = shutdown;
const errors_1 = __importDefault(require("@tryghost/errors"));
const jobs_service_1 = require("./jobs-service");
const jobs_outbox_1 = require("./jobs-outbox");
const outbox_relay_1 = require("./outbox-relay");
const outbox_config_1 = require("./outbox-config");
const in_development_1 = require("../../data/schema/in-development");
const DatabaseInfo = require('@tryghost/database-info');
let instance;
function init({ knex, config }) {
    // The instance lives for the whole process: the didInit-guarded mentions
    // service captures it in MentionController and MentionSendingService, so
    // an in-process restart (test harness) must revive the same object rather
    // than strand those references on a stopped queue.
    if (instance) {
        instance.clearHandlers();
        return instance;
    }
    const adapterManager = require('../adapter-manager').default;
    const logging = require('@tryghost/logging');
    const sentry = require('../../../shared/sentry');
    const backend = adapterManager.getAdapter('jobs');
    const outboxConfig = (0, outbox_config_1.getOutboxConfig)(config);
    // The relay claims rows with FOR UPDATE SKIP LOCKED, which SQLite does not have.
    const isMySQL = DatabaseInfo.isMySQL(knex);
    // jobs_outbox is still in development, so until its migration lands it only
    // exists where in-development tables are created. Enabling the flag elsewhere
    // must not make every dispatch fail on a missing table.
    const tableAvailable = !(0, in_development_1.isInDevelopmentTable)('jobs_outbox') || (0, in_development_1.shouldCreateInDevelopmentTables)();
    const active = outboxConfig.enabled && isMySQL && tableAvailable;
    let outbox;
    if (active) {
        const store = new jobs_outbox_1.JobsOutbox({ knex });
        const relay = new outbox_relay_1.OutboxRelay({
            outbox: store,
            backend,
            logging,
            sentry,
            pollIntervalMs: outboxConfig.pollIntervalMs,
            submissionTimeoutMs: outboxConfig.submissionTimeoutMs,
            retryDelayMs: outboxConfig.retryDelayMs,
        });
        outbox = { store, relay };
    }
    instance = new jobs_service_1.JobsService({
        backend,
        logging,
        sentry,
        outbox,
        logOutboxUnavailable: outboxConfig.enabled && !active,
    });
    return instance;
}
function getInstance() {
    if (!instance) {
        throw new errors_1.default.IncorrectUsageError({
            message: 'Jobs service used before init(). Call init() from boot first.',
        });
    }
    return instance;
}
function shutdown(options) {
    if (!instance) {
        return Promise.resolve();
    }
    return instance.shutdown(options);
}
