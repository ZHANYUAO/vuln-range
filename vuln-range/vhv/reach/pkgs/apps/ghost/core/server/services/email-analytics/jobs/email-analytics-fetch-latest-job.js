"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const job_1 = require("../../jobs-service/job");
class EmailAnalyticsFetchLatestJob extends job_1.Job {
    static type = 'email-analytics-fetch-latest';
}
exports.default = EmailAnalyticsFetchLatestJob;
