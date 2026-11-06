"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const job_1 = require("../jobs-service/job");
class SendWebmentionsJob extends job_1.Job {
    static type = 'send-webmentions';
    sourceUrl;
    links;
    constructor({ sourceUrl, links }) {
        super();
        this.sourceUrl = sourceUrl;
        this.links = links;
    }
}
exports.default = SendWebmentionsJob;
