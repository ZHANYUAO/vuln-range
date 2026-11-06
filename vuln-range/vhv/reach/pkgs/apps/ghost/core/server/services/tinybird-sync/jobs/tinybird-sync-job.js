"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const job_1 = require("../../jobs-service/job");
class TinybirdSyncJob extends job_1.Job {
    static type = 'tinybird-sync';
}
exports.default = TinybirdSyncJob;
