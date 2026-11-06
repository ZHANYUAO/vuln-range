"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const job_1 = require("../jobs-service/job");
class CheckSigningKeysJob extends job_1.Job {
    static type = 'check-signing-keys';
}
exports.default = CheckSigningKeysJob;
