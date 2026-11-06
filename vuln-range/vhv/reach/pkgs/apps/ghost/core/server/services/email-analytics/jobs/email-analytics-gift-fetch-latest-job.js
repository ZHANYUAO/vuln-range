"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const job_1 = require("../../jobs-service/job");
class EmailAnalyticsGiftFetchLatestJob extends job_1.Job {
    static type = 'email-analytics-gift-fetch-latest';
}
exports.default = EmailAnalyticsGiftFetchLatestJob;
