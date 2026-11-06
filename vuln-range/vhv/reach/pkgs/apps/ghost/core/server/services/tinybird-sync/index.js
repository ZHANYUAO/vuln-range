"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sync = exports.scheduleJob = void 0;
const bson_objectid_1 = __importDefault(require("bson-objectid"));
const logging_1 = __importDefault(require("@tryghost/logging"));
const config_1 = __importDefault(require("../../../shared/config"));
const settings_cache_1 = __importDefault(require("../../../shared/settings-cache"));
const db_1 = require("../../data/db");
const tinybird_sync_service_1 = require("./tinybird-sync-service");
const service = (0, tinybird_sync_service_1.createTinybirdSyncService)({
    config: config_1.default,
    settingsCache: settings_cache_1.default,
    knex: db_1.knex,
    logging: logging_1.default,
    random: Math.random,
    now: () => new Date(),
    fetch: globalThis.fetch,
    createId: () => (0, bson_objectid_1.default)().toHexString(),
});
exports.scheduleJob = service.scheduleJob;
exports.sync = service.sync;
