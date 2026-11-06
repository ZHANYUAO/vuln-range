"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOutboxConfig = getOutboxConfig;
const zod_1 = require("zod");
const schema = zod_1.z.object({
    enabled: zod_1.z.boolean().default(false),
    pollIntervalMs: zod_1.z.number().int().positive().default(1000),
    submissionTimeoutMs: zod_1.z.number().int().positive().default(10000),
    retryDelayMs: zod_1.z.number().int().positive().default(30000),
});
function getOutboxConfig(config) {
    return schema.parse(config.get('services:jobs:outbox') ?? {});
}
