"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const job_1 = require("../../jobs-service/job");
class EmailAnalyticsAutomationFetchLatestJob extends job_1.Job {
    static type = 'email-analytics-automation-fetch-latest';
}
exports.default = EmailAnalyticsAutomationFetchLatestJob;
