"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logging_1 = __importDefault(require("@tryghost/logging"));
const define_service_1 = require("../../../kernel/define-service");
const check_signing_keys_job_1 = __importDefault(require("./check-signing-keys-job"));
const signing_key_service_1 = require("./signing-key-service");
let jobs;
let scheduled = false;
const extras = { scheduleCheckJob };
// Runs after settings init so the key rows exist; advances any rotation that's due before
// anything signs or publishes a key.
const signingKeys = (0, define_service_1.defineService)('Signing keys', async () => {
    const settingsCache = require('../../../shared/settings-cache');
    const models = require('../../models');
    const instance = new signing_key_service_1.SigningKeyService({
        settingsCache,
        Settings: models.Settings,
        transaction: (fn) => models.Base.transaction(fn),
        logging: logging_1.default,
        onRotationStarted: schedule,
    });
    await instance.check();
    return instance;
}, extras);
exports.default = signingKeys;
async function scheduleCheckJob(jobsService) {
    jobs = jobsService;
    // Nothing to advance until a key is rotated
    if (signingKeys.service.isRotating()) {
        await schedule();
    }
}
// Before background services start there's no jobs service yet; scheduleCheckJob covers boot
async function schedule() {
    if (scheduled || !jobs || process.env.NODE_ENV?.startsWith('test')) {
        return;
    }
    // Random minute so a fleet of sites doesn't check at once
    const cron = `${Math.floor(Math.random() * 60)} ${Math.floor(Math.random() * 60)} * * * *`;
    logging_1.default.info(`[Background Job] check-signing-keys scheduled at ${cron}`);
    await jobs.scheduleRecurring(new check_signing_keys_job_1.default(), { cron });
    scheduled = true;
}
