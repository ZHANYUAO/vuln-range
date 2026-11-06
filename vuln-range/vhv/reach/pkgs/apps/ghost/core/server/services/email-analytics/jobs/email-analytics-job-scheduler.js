"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailAnalyticsJobScheduler = void 0;
const email_analytics_gift_fetch_latest_job_1 = __importDefault(require("./email-analytics-gift-fetch-latest-job"));
const email_analytics_automation_fetch_latest_job_1 = __importDefault(require("./email-analytics-automation-fetch-latest-job"));
const email_analytics_fetch_latest_job_1 = __importDefault(require("./email-analytics-fetch-latest-job"));
const moment_1 = __importDefault(require("moment"));
const cron_1 = require("../../jobs-service/cron");
const logging = require('@tryghost/logging');
function thirtyDaysAgo() {
    return moment_1.default.utc().subtract(30, 'days').toDate();
}
class EmailAnalyticsJobScheduler {
    #scheduledJobTypes = new Set();
    #models;
    #config;
    #jobsService;
    constructor({ models, config, jobsService, }) {
        this.#models = models;
        this.#config = config;
        this.#jobsService = jobsService;
    }
    #isConfigured() {
        return Boolean(this.#config.get('emailAnalytics:enabled') &&
            this.#config.get('backgroundJobs:emailAnalytics'));
    }
    async scheduleRecurringNewslettersJob(skipNewsletterEmailCheck = false) {
        // Don't register email analytics job if we have no emails,
        // processor usage from many sites spinning up threads can be high.
        // Mega service will re-run this scheduling task when an email is sent
        await this.#scheduleOnce(email_analytics_fetch_latest_job_1.default, skipNewsletterEmailCheck, async () => Number(await this.#models.Email.where('created_at', '>', thirtyDaysAgo())
            .where('status', '<>', 'failed')
            .count()) > 0);
    }
    async scheduleRecurringAutomationsJob(skipAutomationEmailCheck = false) {
        await this.#scheduleOnce(email_analytics_automation_fetch_latest_job_1.default, skipAutomationEmailCheck, async () => Boolean(await this.#models.AutomatedEmailRecipient.query()
            .where('created_at', '>', thirtyDaysAgo())
            .whereNotNull('mailgun_message_id')
            .first('id')));
    }
    async scheduleRecurringGiftDeliveriesJob(skipGiftDeliveryCheck = false) {
        await this.#scheduleOnce(email_analytics_gift_fetch_latest_job_1.default, skipGiftDeliveryCheck, async () => Boolean(await this.#models.GiftDelivery.query()
            .where('email_sent_at', '>', thirtyDaysAgo())
            .whereNotNull('email_provider_message_id')
            .first('id')));
    }
    async #scheduleOnce(JobClass, skipRecentSendsCheck, hasRecentSends) {
        if (this.#scheduledJobTypes.has(JobClass.type) || !this.#isConfigured()) {
            return;
        }
        const shouldSchedule = skipRecentSendsCheck || (await hasRecentSends());
        if (!shouldSchedule || this.#scheduledJobTypes.has(JobClass.type)) {
            return;
        }
        // Marked before registering so a caller arriving while the registration
        // is in flight returns above instead of registering a second schedule
        // with a different cron. Unmarked on rejection so the next caller can
        // retry.
        this.#scheduledJobTypes.add(JobClass.type);
        const at = (0, cron_1.randomFiveMinuteCron)();
        logging.info(`[Background Job] ${JobClass.type} scheduled at ${at}`);
        try {
            await this.#jobsService.scheduleRecurring(new JobClass(), { cron: at });
        }
        catch (error) {
            this.#scheduledJobTypes.delete(JobClass.type);
            throw error;
        }
    }
}
exports.EmailAnalyticsJobScheduler = EmailAnalyticsJobScheduler;
