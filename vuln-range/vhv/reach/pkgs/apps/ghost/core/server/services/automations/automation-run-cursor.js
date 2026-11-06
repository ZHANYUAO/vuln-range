"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.memberSearchScopeSchema = exports.entryDateScopeSchema = void 0;
exports.memberSearchScope = memberSearchScope;
exports.matchesCursorScope = matchesCursorScope;
exports.encodeRunCursor = encodeRunCursor;
exports.decodeRunCursor = decodeRunCursor;
const node_crypto_1 = require("node:crypto");
const errors_1 = __importDefault(require("@tryghost/errors"));
const zod_1 = require("zod");
const messages = {
    invalidCursor: 'Automation run cursor is invalid.',
    mismatchedCursor: 'Automation run cursor does not match the requested query.',
};
exports.entryDateScopeSchema = zod_1.z.object({
    date_from: zod_1.z.iso.date().nullable(),
    date_to: zod_1.z.iso.date().nullable(),
    timezone: zod_1.z.string().min(1),
});
exports.memberSearchScopeSchema = zod_1.z.object({
    site: zod_1.z.string().min(1),
    version: zod_1.z.literal(1),
    matching: zod_1.z.literal('contains'),
    query: zod_1.z.string().regex(/^[a-f0-9]{64}$/),
});
function memberSearchScope(site, query) {
    return {
        site,
        version: 1,
        matching: 'contains',
        query: (0, node_crypto_1.createHash)('sha256').update(query).digest('hex'),
    };
}
const runScopeSchema = zod_1.z.strictObject({
    ...exports.entryDateScopeSchema.shape,
    automation_id: zod_1.z.string().min(1),
    status: zod_1.z.enum(['in_progress', 'completed', 'exited_early']).nullable(),
    direction: zod_1.z.enum(['asc', 'desc']),
});
const runCursorSchema = runScopeSchema.extend({
    created_at: zod_1.z.iso.datetime().transform((value) => new Date(value).toISOString()),
    id: zod_1.z.string().min(1),
});
const searchCursorSchema = runCursorSchema.extend({
    ...exports.memberSearchScopeSchema.shape,
    id: zod_1.z.string().regex(/^[a-f0-9]{24}$/),
});
// A default end date can advance at midnight; keep the original boundary.
// All other query fields must match, including search identity when present.
function matchesCursorScope(actual, expected, preserveEndDate = false) {
    const matchesEnd = actual.date_to === expected.date_to ||
        (preserveEndDate &&
            actual.date_from !== null &&
            actual.date_to !== null &&
            expected.date_to !== null &&
            actual.date_to > actual.date_from &&
            actual.date_to <= expected.date_to);
    const values = new Map(Object.entries(actual));
    return (matchesEnd &&
        Object.entries(expected).every(([key, value]) => key === 'date_to' || values.get(key) === value));
}
function encodeRunCursor(scope, position) {
    const cursor = { ...scope, id: position.id, created_at: position.created_at };
    return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}
function decodeRunCursor(cursor, scope, { preserveEndDate = false } = {}) {
    const schema = 'query' in scope ? searchCursorSchema : runCursorSchema;
    let parsed;
    if (typeof cursor === 'string' && cursor.length <= 2048 && /^[A-Za-z0-9_-]+$/.test(cursor)) {
        try {
            parsed = schema.safeParse(JSON.parse(Buffer.from(cursor, 'base64url').toString()));
        }
        catch {
            parsed = undefined;
        }
    }
    if (!parsed?.success) {
        throw new errors_1.default.ValidationError({ message: messages.invalidCursor });
    }
    if (!matchesCursorScope(parsed.data, scope, preserveEndDate)) {
        throw new errors_1.default.ValidationError({ message: messages.mismatchedCursor });
    }
    return {
        scope: { ...scope, date_to: parsed.data.date_to },
        position: { id: parsed.data.id, created_at: parsed.data.created_at },
    };
}
