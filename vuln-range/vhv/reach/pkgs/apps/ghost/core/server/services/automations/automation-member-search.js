"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SEARCH_LIMITS = void 0;
exports.normalizeMemberSearch = normalizeMemberSearch;
exports.searchCursorScope = searchCursorScope;
exports.browseMemberSearch = browseMemberSearch;
const errors_1 = __importDefault(require("@tryghost/errors"));
const logging_1 = __importDefault(require("@tryghost/logging"));
const zod_1 = require("zod");
const automation_run_cursor_1 = require("./automation-run-cursor");
const tinybird_automation_stats_1 = require("./tinybird-automation-stats");
// Internal work limits are independent of the public fifty-result page size.
exports.SEARCH_LIMITS = {
    page: 50,
    candidates: 5000,
    batches: 4,
    softMs: 1500,
    httpMs: 3000,
    queryBytes: 4096,
};
function normalizeMemberSearch(value) {
    if (value === undefined) {
        return '';
    }
    if (typeof value !== 'string' || Buffer.byteLength(value) > exports.SEARCH_LIMITS.queryBytes) {
        throw new errors_1.default.ValidationError({
            message: 'Member search must be a string of at most 4096 UTF-8 bytes.',
        });
    }
    return value.trim();
}
function searchCursorScope(scope, site, query) {
    return { ...scope, ...(0, automation_run_cursor_1.memberSearchScope)(site, query) };
}
const candidateSchema = zod_1.z.union([
    tinybird_automation_stats_1.automationRunRowSchema,
    zod_1.z.object({
        ...tinybird_automation_stats_1.automationRunRowSchema.shape,
        status: zod_1.z.literal('invalid'),
        failed: zod_1.z.literal(false),
    }),
]);
function requireValidRun(row) {
    if (row.status === 'invalid') {
        throw new errors_1.default.InternalServerError({
            message: 'Could not load automation member search.',
            code: 'AUTOMATION_MEMBER_SEARCH_UNAVAILABLE',
        });
    }
    return row;
}
async function fetchCandidates(client, scope, limit, after, ids) {
    const rows = await client.fetch('api_automation_run_search', {
        version: '',
        automationId: scope.automation_id,
        sortDirection: scope.direction,
        limit,
        ...(after ? { afterCreatedAt: after.created_at, afterId: after.id } : {}),
        ...(ids ? { runIds: ids.join(',') } : {}),
    }, { method: 'POST', timeoutMs: exports.SEARCH_LIMITS.httpMs });
    const parsed = zod_1.z.array(candidateSchema).max(limit).safeParse(rows);
    const allowed = ids ? new Set(ids) : null;
    if (!parsed.success ||
        !(0, tinybird_automation_stats_1.isValidRunPage)(parsed.data, {
            direction: scope.direction,
            after,
        }) ||
        parsed.data.some((row) => !/^[a-f0-9]{24}$/.test(row.id) || (allowed && !allowed.has(row.id)))) {
        throw new errors_1.default.InternalServerError({
            message: 'Could not load automation member search.',
            code: 'AUTOMATION_MEMBER_SEARCH_UNAVAILABLE',
        });
    }
    return parsed.data;
}
async function browseMemberSearch(repository, client, scope, query, after) {
    const started = performance.now();
    const result = (runs, position, state) => ({
        data: runs,
        meta: {
            search: { version: 1, query, matching: 'contains' },
            order: `created_at ${scope.direction}`,
            pagination: {
                limit: exports.SEARCH_LIMITS.page,
                next_cursor: position ? (0, automation_run_cursor_1.encodeRunCursor)(scope, position) : null,
                state,
            },
        },
    });
    const probe = await repository.probeMemberSearch(scope.automation_id, query);
    if (probe !== null) {
        logging_1.default.info({
            system: {
                event: 'automations.member_search.complete_id_set',
                automation_id: scope.automation_id,
                matching_run_count: probe.length,
            },
        }, 'Automation member search: using complete ID set');
        if (probe.length === 0) {
            return result([], undefined, 'exhausted');
        }
        const rows = (await fetchCandidates(client, scope, exports.SEARCH_LIMITS.page + 1, after, probe)).map(requireValidRun);
        const page = rows.slice(0, exports.SEARCH_LIMITS.page);
        const members = await repository.getRunMembers(scope.automation_id, page.map((row) => row.id));
        const more = rows.length > exports.SEARCH_LIMITS.page;
        return result(page.map((row) => ({ ...row, member: members.get(row.id) ?? null })), more ? page.at(-1) : undefined, more ? 'more' : 'exhausted');
    }
    logging_1.default.info({
        system: {
            event: 'automations.member_search.candidate_scan',
            automation_id: scope.automation_id,
        },
    }, 'Automation member search: scanning Tinybird candidates');
    const runs = [];
    let position = after;
    for (let batch = 0; batch < exports.SEARCH_LIMITS.batches; batch++) {
        const rows = await fetchCandidates(client, scope, exports.SEARCH_LIMITS.candidates, position);
        const members = await repository.getRunMembers(scope.automation_id, rows.map((row) => row.id), query);
        for (const row of rows) {
            const member = members.get(row.id);
            if (!member) {
                continue;
            }
            const validRun = requireValidRun(row);
            // Re-read the suffix next time; never advance over an unreturned match.
            if (runs.length === exports.SEARCH_LIMITS.page) {
                return result(runs, runs.at(-1), 'more');
            }
            runs.push({ ...validRun, member });
        }
        if (rows.length < exports.SEARCH_LIMITS.candidates) {
            return result(runs, undefined, 'exhausted');
        }
        position = rows.at(-1);
        if (runs.length === exports.SEARCH_LIMITS.page || performance.now() - started >= exports.SEARCH_LIMITS.softMs) {
            break;
        }
    }
    return result(runs, position, 'scanning');
}
