"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const errors_1 = __importDefault(require("@tryghost/errors"));
const snakecase_keys_1 = __importDefault(require("snakecase-keys"));
const zod_1 = require("zod");
const adapter_base_upgrade_1 = require("@tryghost/adapter-base-upgrade");
const upgrades_1 = __importDefault(require("../../services/upgrades"));
// Unknown keys are rejected, not stripped: a dropped execution control would otherwise go unnoticed.
const UpgradeRequestBody = zod_1.z
    .object({
    upgrades: zod_1.z.tuple([
        zod_1.z
            .object({
            component: adapter_base_upgrade_1.upgradeComponentSchema,
            to_version: adapter_base_upgrade_1.upgradeVersionSchema,
            idempotency_key: zod_1.z.uuid({ version: 'v4' }).lowercase(),
        })
            .strict(),
    ]),
})
    .strict();
const JobOptions = zod_1.z.object({ id: adapter_base_upgrade_1.upgradeJobIdSchema });
function parseRequest(frame) {
    const parsed = UpgradeRequestBody.safeParse(frame.data);
    if (!parsed.success) {
        throw new errors_1.default.ValidationError({
            message: 'Expected one update with component, to_version and idempotency_key.',
            help: 'Generate a lowercase UUID v4 idempotency_key once and reuse it when retrying.',
        });
    }
    return parsed.data.upgrades[0];
}
function parseJobId(frame) {
    const parsed = JobOptions.safeParse(frame.options);
    if (!parsed.success) {
        throw new errors_1.default.ValidationError({ message: 'Expected a job id from this host.' });
    }
    return parsed.data.id;
}
// The adapter contract is camelCase; the Admin API is snake_case.
const toApi = (resource) => (0, snakecase_keys_1.default)(resource, { deep: true });
const noCacheInvalidation = { cacheInvalidate: false };
const controller = {
    docName: 'upgrades',
    browse: {
        headers: noCacheInvalidation,
        permissions: true,
        async query() {
            return toApi(await upgrades_1.default.service.getStatus());
        },
    },
    add: {
        headers: { ...noCacheInvalidation, location: false },
        statusCode: 202,
        // A validation function replaces the framework's defaults, which expect resource bodies.
        validation(frame) {
            parseRequest(frame);
        },
        permissions: true,
        async query(frame) {
            const input = parseRequest(frame);
            const user = frame.options.context.user;
            if (!user) {
                throw new errors_1.default.NoPermissionError({ message: 'Only staff users can request updates.' });
            }
            const job = await upgrades_1.default.service.createRequest({
                component: input.component,
                toVersion: input.to_version,
                idempotencyKey: input.idempotency_key,
            }, user);
            return toApi(job);
        },
    },
    read: {
        headers: noCacheInvalidation,
        options: ['id'],
        // The framework's id validator only accepts ObjectIds; jobs use UUIDs.
        validation(frame) {
            parseJobId(frame);
        },
        permissions: true,
        async query(frame) {
            return toApi(await upgrades_1.default.service.getJob(parseJobId(frame)));
        },
    },
};
module.exports = controller;
