"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const moment_1 = __importDefault(require("moment"));
const logging_1 = __importDefault(require("@tryghost/logging"));
const build_signed_job_1 = require("../../adapters/scheduling/build-signed-job");
const get_scheduler_idempotency_key_1 = require("../../adapters/scheduling/get-scheduler-idempotency-key");
// CJS-only modules — typed loosely below. models is the Bookshelf registry
// without TS declarations; the rest are JS modules without types.
const models = require('../../models');
const events = require('../../lib/common/events');
// Pages live in the posts table with type:'page', so both types are
// queried through models.Post and discriminated via the type filter.
const SCHEDULED_RESOURCES = ['post', 'page'];
class PostScheduling {
    #apiUrl;
    #adapter;
    #internalKeys;
    constructor({ apiUrl, adapter, internalKeys }) {
        this.#apiUrl = apiUrl;
        this.#adapter = adapter;
        this.#internalKeys = internalKeys;
        SCHEDULED_RESOURCES.forEach((resource) => {
            events.on(`${resource}.scheduled`, async (model) => {
                try {
                    const key = await internalKeys.get('ghost-scheduler');
                    this.#adapter.schedule(this.#normalize({ model, key, resourceType: resource }));
                }
                catch (err) {
                    logging_1.default.error({
                        event: { name: 'post-scheduling.schedule.error' },
                        err,
                        resource,
                        id: model.get('id'),
                    }, 'Failed to schedule resource');
                }
            });
            // Reschedule = matched unschedule + fresh schedule, because tokens
            // are signed against the published_at timestamp.
            events.on(`${resource}.rescheduled`, async (model) => {
                try {
                    const key = await internalKeys.get('ghost-scheduler');
                    this.#adapter.unschedule(this.#normalize({ model, key, resourceType: resource }, 'unscheduled'));
                    this.#adapter.schedule(this.#normalize({ model, key, resourceType: resource }));
                }
                catch (err) {
                    logging_1.default.error({
                        event: { name: 'post-scheduling.reschedule.error' },
                        err,
                        resource,
                        id: model.get('id'),
                    }, 'Failed to reschedule resource');
                }
            });
            events.on(`${resource}.unscheduled`, async (model) => {
                try {
                    const key = await internalKeys.get('ghost-scheduler');
                    this.#adapter.unschedule(this.#normalize({ model, key, resourceType: resource }, 'unscheduled'));
                }
                catch (err) {
                    logging_1.default.error({
                        event: { name: 'post-scheduling.unschedule.error' },
                        err,
                        resource,
                        id: model.get('id'),
                    }, 'Failed to unschedule resource');
                }
            });
        });
        this.#adapter.register(this);
    }
    /**
     * Registers every scheduled post and page with the scheduler again.
     *
     * This runs in two situations:
     *
     * 1. On boot (no `previousKey`). Each job is identical to the one the
     *    scheduler may already hold: same URL, same idempotency key.
     *
     *    - If the adapter sets `dedupesByIdempotencyKey`, we only schedule.
     *      The adapter spots the matching key and keeps the job it has.
     *    - Otherwise we unschedule first, then schedule. Without the
     *      unschedule, a queue that outlives the process would collect one
     *      more copy of each job on every boot. We pass `bootstrap: true` so
     *      Ghost's built-in adapter, whose queue is in memory, doesn't cancel
     *      the job we're about to add.
     *
     *    Skipping the unschedule is the safer path when the adapter supports
     *    it. The two calls aren't awaited, so they can arrive out of order. If
     *    the unschedule lands after the schedule, it removes the new job and
     *    the post never publishes.
     *
     * 2. After the scheduler key is rotated (`previousKey` is set). Jobs
     *    signed with the old key have different URLs, so we always unschedule
     *    those and schedule new ones signed with the current key.
     */
    async rescheduleAll({ previousKey } = {}) {
        const scheduledResources = await this.#loadScheduledResources();
        const currentKey = await this.#internalKeys.get('ghost-scheduler');
        const unscheduleKey = previousKey ?? currentKey;
        const bootstrap = !previousKey;
        const skipUnschedule = bootstrap && this.#adapter.dedupesByIdempotencyKey === true;
        for (const resourceType of Object.keys(scheduledResources)) {
            for (const model of scheduledResources[resourceType]) {
                if (!skipUnschedule) {
                    this.#adapter.unschedule(this.#normalize({ model, key: unscheduleKey, resourceType }), {
                        bootstrap,
                    });
                }
                this.#adapter.schedule(this.#normalize({ model, key: currentKey, resourceType }));
            }
        }
    }
    async #loadScheduledResources() {
        const entries = await Promise.all(SCHEDULED_RESOURCES.map(async (resourceType) => {
            const found = await models.Post.findAll({
                filter: `status:scheduled+type:${resourceType}`,
                columns: ['id', 'published_at', 'created_at', 'type'],
            });
            return [resourceType, found];
        }));
        return Object.fromEntries(entries);
    }
    #normalize({ model, resourceType, key, }, event = '') {
        const resource = `${resourceType}s`;
        const publishedAt = event === 'unscheduled' ? model.previous('published_at') : model.get('published_at');
        const previousPublishedAt = model.previous('published_at');
        const time = (0, moment_1.default)(publishedAt).valueOf();
        return (0, build_signed_job_1.buildSignedJob)({
            apiUrl: this.#apiUrl,
            path: ['schedules', resource, `${model.get('id')}/`],
            time,
            key,
            extra: {
                oldTime: previousPublishedAt ? (0, moment_1.default)(previousPublishedAt).valueOf() : null,
            },
            // The key identifies one job: the URL already carries the resource
            // and a token signed for this fire time under the current signing key,
            // so re-registering the same job (e.g. a boot rebuild) yields the same
            // key, while a reschedule or key rotation yields a new one.
            getIdempotencyKey: (url) => (0, get_scheduler_idempotency_key_1.getSchedulerIdempotencyKey)({ namespace: 'post-scheduling', date: new Date(time), url }),
        });
    }
}
exports.default = PostScheduling;
