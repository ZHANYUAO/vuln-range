"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const errors_1 = __importDefault(require("@tryghost/errors"));
const zod_1 = require("zod");
const support_requests_1 = __importDefault(require("../../services/support-requests"));
const SLUG = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const requiredText = (max) => zod_1.z.string().trim().min(1).max(max);
const optionalUrl = zod_1.z
    .url({ protocol: /^https?$/ })
    .max(2048)
    .nullable()
    .optional();
const SupportRequestContext = zod_1.z.record(zod_1.z.string().regex(SLUG), zod_1.z.string().trim().min(1));
const SupportRequestInput = zod_1.z
    .object({
    subject: requiredText(255),
    message: requiredText(10_000),
    source: zod_1.z.string().regex(SLUG).max(50).nullable().optional(),
    page_url: optionalUrl,
    context: SupportRequestContext.nullable().optional(),
})
    .strict();
const SupportRequestBody = zod_1.z.object({
    support_requests: zod_1.z.tuple([SupportRequestInput]),
});
function parseSupportRequest(frame) {
    const result = SupportRequestBody.safeParse(frame.data);
    if (!result.success) {
        const [issue] = result.error.issues;
        const field = issue.path.slice(2).join('.');
        throw new errors_1.default.ValidationError({
            message: field ? `Invalid ${field}: ${issue.message}` : 'Invalid support request',
        });
    }
    return result.data.support_requests[0];
}
function requester(frame) {
    const user = frame.user;
    if (user && typeof user === 'object' && 'get' in user && typeof user.get === 'function') {
        const id = user.get('id');
        const name = user.get('name');
        const email = user.get('email');
        if (typeof id === 'string' && typeof name === 'string' && typeof email === 'string') {
            return { id, name, email };
        }
    }
    throw new errors_1.default.NoPermissionError({
        message: 'Support requests can only be sent by a staff user',
    });
}
function toSupportRequest(input, requestedBy) {
    return {
        requestedBy,
        subject: input.subject,
        message: input.message,
        source: input.source ?? null,
        pageUrl: input.page_url ?? null,
        context: input.context ?? {},
    };
}
const controller = {
    docName: 'support_requests',
    add: {
        statusCode: 202,
        headers: {
            cacheInvalidate: false,
        },
        validation(frame) {
            parseSupportRequest(frame);
        },
        permissions: false,
        async query(frame) {
            await support_requests_1.default.service.send(toSupportRequest(parseSupportRequest(frame), requester(frame)));
        },
    },
};
exports.default = controller;
module.exports = controller;
