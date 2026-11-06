"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.automationRunRowSchema = exports.EMPTY_AUTOMATION_STATS = void 0;
exports.fetchAutomationStats = fetchAutomationStats;
exports.fetchAutomationPerformanceStats = fetchAutomationPerformanceStats;
exports.compareRuns = compareRuns;
exports.isValidRunPage = isValidRunPage;
exports.fetchAutomationRuns = fetchAutomationRuns;
const logging_1 = __importDefault(require("@tryghost/logging"));
const zod_1 = require("zod");
exports.EMPTY_AUTOMATION_STATS = {
    last_run_created_at: null,
    total_run_count: 0,
    in_progress_run_count: 0,
};
const runCountSchema = zod_1.z
    .union([zod_1.z.number(), zod_1.z.string().regex(/^\d+$/)])
    .pipe(zod_1.z.coerce.number().int().nonnegative());
const statsRowSchema = zod_1.z.object({
    automation_id: zod_1.z.string(),
    last_run_created_at: zod_1.z.iso
        .datetime()
        .transform((value) => new Date(value))
        .nullable(),
    total_run_count: runCountSchema,
    in_progress_run_count: runCountSchema,
});
async function fetchAutomationStats(client) {
    let rows;
    try {
        // Override the traffic analytics version: this pipe has no version suffix.
        rows = await client.fetch('api_automation_browse_stats', {
            version: '',
        });
    }
    catch (error) {
        logging_1.default.error('Error fetching Tinybird automation stats:', error);
        return null;
    }
    if (rows === null) {
        return null;
    }
    const parsed = zod_1.z.array(statsRowSchema).safeParse(rows);
    if (!parsed.success) {
        logging_1.default.error({
            system: { event: 'automations.stats.invalid_tinybird_response' },
            issues: parsed.error.issues,
        }, 'Unexpected response from the Tinybird automation stats pipe');
        return null;
    }
    return new Map(parsed.data.map((row) => [
        row.automation_id,
        {
            last_run_created_at: row.last_run_created_at,
            total_run_count: row.total_run_count,
            in_progress_run_count: row.in_progress_run_count,
        },
    ]));
}
const performanceRowSchema = zod_1.z.object({
    date: zod_1.z.union([zod_1.z.iso.date(), zod_1.z.iso.datetime()]),
    in_progress_run_count: runCountSchema,
    completed_run_count: runCountSchema,
    exited_early_run_count: runCountSchema,
    invalid_run_count: runCountSchema.refine((count) => count === 0, {
        message: 'Automation runs contain an unexpected step status.',
    }),
});
async function fetchAutomationPerformanceStats(client, automationId, options = {}) {
    try {
        const rows = await client.fetch('api_automation_performance_stats', {
            version: '',
            automationId,
            timezone: 'UTC',
            ...options,
        });
        const parsed = zod_1.z.array(performanceRowSchema).min(1).safeParse(rows);
        if (!parsed.success ||
            new Set(parsed.data.map((row) => row.date)).size !== parsed.data.length) {
            logging_1.default.error('Unexpected response from the Tinybird automation performance stats pipe');
            return null;
        }
        const stats = {
            total_run_count: 0,
            in_progress_run_count: 0,
            completed_run_count: 0,
            exited_early_run_count: 0,
            entries: [],
        };
        for (const row of parsed.data) {
            const count = row.in_progress_run_count + row.completed_run_count + row.exited_early_run_count;
            stats.total_run_count += count;
            stats.in_progress_run_count += row.in_progress_run_count;
            stats.completed_run_count += row.completed_run_count;
            stats.exited_early_run_count += row.exited_early_run_count;
            stats.entries.push({ date: row.date, count });
        }
        if (!Number.isSafeInteger(stats.total_run_count)) {
            logging_1.default.error('Automation entry total exceeds the supported integer range');
            return null;
        }
        stats.entries.sort((a, b) => a.date.localeCompare(b.date));
        return stats;
    }
    catch (error) {
        logging_1.default.error('Error fetching Tinybird automation performance stats:', error);
        return null;
    }
}
// Entry time then run ID; both sides must hold normalised ISO timestamps.
function compareRuns(a, b) {
    if (a.created_at !== b.created_at) {
        return a.created_at < b.created_at ? -1 : 1;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
exports.automationRunRowSchema = zod_1.z
    .object({
    id: zod_1.z.string().min(1),
    created_at: zod_1.z.iso.datetime().transform((value) => new Date(value).toISOString()),
    status: zod_1.z.enum(['in_progress', 'completed', 'exited_early']),
    failed: zod_1.z.boolean(),
})
    .refine((run) => !run.failed || run.status === 'exited_early');
function isValidRunPage(rows, options) {
    const expectedSign = options.direction === 'asc' ? -1 : 1;
    const uniqueIds = new Set(rows.map((row) => row.id)).size === rows.length;
    const matchesFilter = !options.status || rows.every((row) => row.status === options.status);
    const continuesCursor = !options.after || rows.length === 0 || compareRuns(options.after, rows[0]) === expectedSign;
    const inOrder = rows.every((row, index) => index === 0 || compareRuns(rows[index - 1], row) === expectedSign);
    return uniqueIds && matchesFilter && continuesCursor && inOrder;
}
async function fetchAutomationRuns(client, automationId, options = { direction: 'desc', limit: 50 }) {
    const { status, direction, limit, after, ...dates } = options;
    try {
        const rows = await client.fetch('api_automation_runs', {
            version: '',
            automationId,
            runStatus: status,
            ...dates,
            sortDirection: direction,
            limit,
            ...(after ? { afterCreatedAt: after.created_at, afterId: after.id } : {}),
        });
        const parsed = zod_1.z.array(exports.automationRunRowSchema).max(limit).safeParse(rows);
        if (!parsed.success || !isValidRunPage(parsed.data, { status, direction, after })) {
            logging_1.default.error('Unexpected response from the Tinybird automation runs pipe');
            return null;
        }
        return parsed.data;
    }
    catch (error) {
        logging_1.default.error('Error fetching Tinybird automation runs:', error);
        return null;
    }
}
