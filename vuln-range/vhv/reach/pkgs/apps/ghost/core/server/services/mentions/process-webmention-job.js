"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const job_1 = require("../jobs-service/job");
class ProcessWebmentionJob extends job_1.Job {
    static type = 'process-webmention';
    source;
    target;
    constructor({ source, target }) {
        super();
        this.source = source;
        this.target = target;
    }
}
exports.default = ProcessWebmentionJob;
