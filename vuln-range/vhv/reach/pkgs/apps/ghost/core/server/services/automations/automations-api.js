"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.trigger = exports.requestPoll = exports.getNumberOfAutomations = void 0;
exports.browse = browse;
exports.read = read;
exports.readPerformanceStats = readPerformanceStats;
exports.browseRuns = browseRuns;
exports.readRunHistory = readRunHistory;
exports.browseActionLinks = browseActionLinks;
exports.add = add;
exports.edit = edit;
exports.fetchAndLockSteps = fetchAndLockSteps;
exports.finishStepAndEnqueueNext = finishStepAndEnqueueNext;
exports.markStepTerminal = markStepTerminal;
exports.retryStep = retryStep;
exports.recordEmailSent = recordEmailSent;
exports.getAutomatedEmailRecipientsByMailgunIds = getAutomatedEmailRecipientsByMailgunIds;
exports.trackEmailDeliveredAndOpened = trackEmailDeliveredAndOpened;
exports.trackEmailClicked = trackEmailClicked;
// @ts-expect-error This module lacks type definitions.
const domain_events_1 = __importDefault(require("@tryghost/domain-events"));
const errors_1 = __importDefault(require("@tryghost/errors"));
const logging_1 = __importDefault(require("@tryghost/logging"));
const tpl_1 = __importDefault(require("@tryghost/tpl"));
const zod_1 = require("zod");
const config_1 = __importDefault(require("../../../shared/config"));
// @ts-expect-error This module lacks type definitions.
const labs_1 = __importDefault(require("../../../shared/labs"));
const settings_cache_1 = __importDefault(require("../../../shared/settings-cache"));
const db_1 = require("../../data/db");
// @ts-expect-error This module lacks type definitions.
const lexical_1 = __importDefault(require("../../lib/lexical"));
// @ts-expect-error This module lacks type definitions.
const request_external_1 = __importDefault(require("../../lib/request-external"));
// @ts-expect-error This module lacks type definitions.
const tinybird_1 = require("../stats/utils/tinybird");
// @ts-expect-error This module lacks type definitions.
const tinybird_2 = __importDefault(require("../tinybird"));
const automation_entry_stats_1 = require("./automation-entry-stats");
const automation_member_search_1 = require("./automation-member-search");
const automation_run_cursor_1 = require("./automation-run-cursor");
const automations_schemas_1 = require("./automations-schemas");
const database_automations_repository_1 = require("./database-automations-repository");
const fake_wait_hours_multiplier_1 = require("./fake-wait-hours-multiplier");
const tinybird_automation_stats_1 = require("./tinybird-automation-stats");
const database_automations_repository_2_1 = require("./database-automations-repository-2");
const automations_api_2_1 = require("./automations-api-2");
const build_invalid_automation_payload_message_1 = require("./util/build-invalid-automation-payload-message");
const RUN_PAGE_SIZE = 50;
const messages = {
    invalidRunOrder: 'Automation run order must be one of: created_at desc, created_at asc.',
    invalidRunStatus: 'Automation run status must be one of: in_progress, completed, exited_early.',
    tinybirdRunsFailed: 'Could not load Tinybird automation runs.',
    tinybirdEntriesOutsideRange: 'Tinybird returned entries outside the requested range.',
    tinybirdPerformanceStatsFailed: 'Could not load Tinybird automation performance stats.',
    automationNotFound: 'Automation not found.',
    runNotFound: 'Automation run not found.',
    automationActionNotFound: 'Automation action not found.',
    invalidAutomationCreationPayload: 'Invalid automation payload.',
    invalidAutomationEditPayload: 'Invalid automation edit payload.',
    invalidAutomationStatus: 'Automation status must be one of: active, inactive, archived.',
    invalidStatusOnlyEdit: 'Status-only automation edits can only set status to inactive or archived.',
    duplicateAutomationActionIdentity: 'Automation action identifiers must be unique.',
    invalidAutomationEdgeEndpoint: 'Automation edges must reference actions in the submitted graph.',
    duplicateAutomationEdge: 'Automation edges must be unique.',
    invalidAutomationEdge: 'Automation edges cannot connect an action to itself.',
    invalidAutomationGraphShape: 'Automation graph must be a single linear path without branches or cycles.',
    emptyActionsWhenActive: 'Active automations require at least one action.',
    emptyEmailSubjectWhenActive: 'Active automations require a subject line for every email.',
    emptyEmailBodyWhenActive: 'Active automations require a body for every email.',
    invalidEmailLexical: 'Email lexical must be a well-formed Lexical document.',
};
const fakeWaitHoursMultiplier = (0, fake_wait_hours_multiplier_1.parseFakeWaitHoursMultiplier)(config_1.default.get('automations:fakeWaitHoursMultiplier'));
const repository = (0, database_automations_repository_1.createDatabaseAutomationsRepository)({
    knex: db_1.knex,
    fakeWaitHoursMultiplier,
});
// NOTE: We are transitioning to this new API. This will be removed soon. See NY-1704.
const automationsApi2 = (0, automations_api_2_1.createAutomationsApi2)({
    domainEvents: domain_events_1.default,
    fakeWaitHoursMultiplier,
    labs: labs_1.default,
    repository: (0, database_automations_repository_2_1.createDatabaseAutomationsRepository2)({
        knex: db_1.knex,
    }),
});
function getTinybirdClient() {
    if (!config_1.default.get('tinybird:stats')) {
        return null;
    }
    try {
        const tinybirdService = tinybird_2.default.instance;
        if (!tinybirdService?.getToken()?.token) {
            return null;
        }
        return (0, tinybird_1.create)({
            config: config_1.default,
            request: request_external_1.default.extend({ retry: { limit: 0 } }),
            settingsCache: settings_cache_1.default,
            tinybirdService,
        });
    }
    catch (error) {
        logging_1.default.error('Error preparing Tinybird automation stats client:', error);
        return null;
    }
}
async function browse() {
    const tinybirdClient = getTinybirdClient();
    const [browseResult, stats] = await Promise.all([
        repository.browse(),
        tinybirdClient ? (0, tinybird_automation_stats_1.fetchAutomationStats)(tinybirdClient) : null,
    ]);
    if (stats === null) {
        return browseResult;
    }
    return {
        ...browseResult,
        data: browseResult.data.map((automation) => ({
            ...automation,
            stats: stats.get(automation.id) ?? { ...tinybird_automation_stats_1.EMPTY_AUTOMATION_STATS },
        })),
    };
}
exports.getNumberOfAutomations = automationsApi2.getNumberOfAutomations.bind(automationsApi2);
async function read(automationId) {
    const automation = await repository.getById(automationId);
    if (!automation) {
        throw new errors_1.default.NotFoundError({
            message: (0, tpl_1.default)(messages.automationNotFound),
        });
    }
    return automation;
}
async function readPerformanceStats(automationId, options = {}) {
    const exists = await repository.exists(automationId);
    if (!exists) {
        throw new errors_1.default.NotFoundError({ message: (0, tpl_1.default)(messages.automationNotFound) });
    }
    const client = getTinybirdClient();
    if (!client) {
        throw new errors_1.default.InternalServerError({
            message: (0, tpl_1.default)(messages.tinybirdPerformanceStatsFailed),
        });
    }
    const { timezone, window: requestedWindow } = (0, automation_entry_stats_1.parseEntryStatsOptions)(options);
    const stats = await (0, tinybird_automation_stats_1.fetchAutomationPerformanceStats)(client, automationId, {
        timezone,
        ...(requestedWindow
            ? { dateFrom: requestedWindow.date_from, dateTo: requestedWindow.date_to }
            : {}),
    });
    if (stats === null) {
        throw new errors_1.default.InternalServerError({
            message: (0, tpl_1.default)(messages.tinybirdPerformanceStatsFailed),
        });
    }
    const returnedWindow = (0, automation_entry_stats_1.getEntryStatsWindow)(stats.entries, timezone);
    const entryWindow = requestedWindow
        ? { ...requestedWindow, bucket: returnedWindow.bucket }
        : returnedWindow;
    if (stats.entries.some(({ date }) => {
        const day = (0, automation_entry_stats_1.entryDate)(date, timezone);
        return day < entryWindow.date_from || day >= entryWindow.date_to;
    })) {
        throw new errors_1.default.InternalServerError({ message: (0, tpl_1.default)(messages.tinybirdEntriesOutsideRange) });
    }
    return {
        automation_id: automationId,
        ...stats,
        entry_window: entryWindow,
    };
}
async function browseRuns(automationId, options = {}) {
    const { status, order, cursor } = options;
    const query = (0, automation_member_search_1.normalizeMemberSearch)(options.search);
    // Initial member search spans all time and statuses; browse filters stay independent.
    const { window: entryWindow, timezone } = (0, automation_entry_stats_1.parseEntryStatsOptions)(query ? {} : options);
    const parsedStatus = zod_1.z
        .enum(['in_progress', 'completed', 'exited_early'])
        .optional()
        .safeParse(query ? undefined : status);
    if (!parsedStatus.success) {
        throw new errors_1.default.ValidationError({
            message: (0, tpl_1.default)(messages.invalidRunStatus),
        });
    }
    const parsedOrder = zod_1.z.enum(['created_at desc', 'created_at asc']).optional().safeParse(order);
    if (!parsedOrder.success) {
        throw new errors_1.default.ValidationError({
            message: (0, tpl_1.default)(messages.invalidRunOrder),
        });
    }
    const requestedScope = {
        automation_id: automationId,
        date_from: entryWindow?.date_from ?? null,
        date_to: entryWindow?.date_to ?? null,
        timezone,
        status: parsedStatus.data ?? null,
        direction: parsedOrder.data === 'created_at asc' ? 'asc' : 'desc',
    };
    const searchScope = query
        ? (0, automation_member_search_1.searchCursorScope)(requestedScope, config_1.default.get('tinybird:stats:id') || settings_cache_1.default.get('site_uuid'), query)
        : undefined;
    const continuation = cursor === undefined
        ? undefined
        : (0, automation_run_cursor_1.decodeRunCursor)(cursor, searchScope ?? requestedScope, {
            preserveEndDate: !query && options.date_to === undefined,
        });
    const scope = continuation?.scope ?? requestedScope;
    const exists = await repository.exists(automationId);
    if (!exists) {
        throw new errors_1.default.NotFoundError({ message: (0, tpl_1.default)(messages.automationNotFound) });
    }
    const client = getTinybirdClient();
    if (!client) {
        throw new errors_1.default.InternalServerError({ message: (0, tpl_1.default)(messages.tinybirdRunsFailed) });
    }
    if (searchScope) {
        return (0, automation_member_search_1.browseMemberSearch)(repository, client, searchScope, query, continuation?.position);
    }
    // One extra row tells us whether a next page exists without a separate count.
    const rows = await (0, tinybird_automation_stats_1.fetchAutomationRuns)(client, automationId, {
        status: parsedStatus.data,
        direction: scope.direction,
        limit: RUN_PAGE_SIZE + 1,
        timezone,
        dateFrom: scope.date_from ?? undefined,
        dateTo: scope.date_to ?? undefined,
        after: continuation?.position,
    });
    if (rows === null) {
        throw new errors_1.default.InternalServerError({ message: (0, tpl_1.default)(messages.tinybirdRunsFailed) });
    }
    const runs = rows.slice(0, RUN_PAGE_SIZE);
    const nextCursor = rows.length > RUN_PAGE_SIZE ? (0, automation_run_cursor_1.encodeRunCursor)(scope, runs[runs.length - 1]) : null;
    // Keep member details in Core; a deleted member must not remove a run from this page.
    const members = await repository.getRunMembers(automationId, runs.map((run) => run.id));
    return {
        data: runs.map((run) => ({ ...run, member: members.get(run.id) ?? null })),
        meta: { pagination: { limit: RUN_PAGE_SIZE, next_cursor: nextCursor } },
    };
}
async function readRunHistory(automationId, runId) {
    const exists = await repository.exists(automationId);
    if (!exists) {
        throw new errors_1.default.NotFoundError({ message: (0, tpl_1.default)(messages.automationNotFound) });
    }
    const history = await repository.getRunHistory(automationId, runId);
    if (!history) {
        throw new errors_1.default.NotFoundError({ message: (0, tpl_1.default)(messages.runNotFound) });
    }
    return history;
}
async function browseActionLinks(automationId, actionId) {
    const links = await repository.getAutomationActionLinks(automationId, actionId);
    if (!links) {
        throw new errors_1.default.NotFoundError({
            message: (0, tpl_1.default)(messages.automationActionNotFound),
        });
    }
    return links;
}
async function add(data) {
    const result = automations_schemas_1.addAutomationDataSchema.safeParse(data);
    if (!result.success) {
        const issue = result.error.issues[0];
        throwValidationError((0, build_invalid_automation_payload_message_1.buildInvalidAutomationPayloadMessage)(result.error.issues, messages.invalidAutomationCreationPayload), String(issue.path[0] ?? 'automations'));
    }
    await validateAutomationData(result.data);
    return await repository.add(result.data);
}
async function edit(automationId, data) {
    const parsedData = await validateEditData(data);
    const automation = await repository.edit(automationId, parsedData);
    if (!automation) {
        throw new errors_1.default.NotFoundError({
            message: (0, tpl_1.default)(messages.automationNotFound),
        });
    }
    return automation;
}
async function validateEditData(data) {
    // We use two separate schemas to preserve field-level errors, which Zod loses
    // if we use its union types.
    const hasGraphField = typeof data === 'object' && data !== null && ('actions' in data || 'edges' in data);
    const schema = hasGraphField ? automations_schemas_1.editAutomationDataSchema : automations_schemas_1.editAutomationStatusOnlySchema;
    const result = schema.safeParse(data);
    if (!result.success) {
        if (result.error.issues.some((issue) => issue.path[0] === 'status')) {
            throwValidationError(hasGraphField ? messages.invalidAutomationStatus : messages.invalidStatusOnlyEdit, 'status');
        }
        throwValidationError((0, build_invalid_automation_payload_message_1.buildInvalidAutomationPayloadMessage)(result.error.issues, messages.invalidAutomationEditPayload));
    }
    const parsedData = result.data;
    if (parsedData.actions !== undefined) {
        await validateAutomationData(parsedData);
    }
    return parsedData;
}
async function validateAutomationData(data) {
    if (data.status === 'active' && data.actions.length === 0) {
        throwValidationError(messages.emptyActionsWhenActive, 'actions');
    }
    validateGraph(data.actions, data.edges);
    await validateEmailLexical(data.actions);
    validateActiveEmailSteps(data.status, data.actions);
}
async function validateEmailLexical(actions) {
    await Promise.all(actions.map(async (action) => {
        if (action.type !== 'send_email') {
            return;
        }
        const lexical = action.data.email_lexical;
        // Empty editor documents are valid draft state and are classified by
        // active-body validation below. Invalid JSON is not skipped here.
        if (isValidEmptyLexical(lexical)) {
            return;
        }
        if (isMalformedEmptyLexical(lexical)) {
            throwValidationError(messages.invalidEmailLexical, 'actions');
        }
        if (!(await lexical_1.default.validate(lexical))) {
            throwValidationError(messages.invalidEmailLexical, 'actions');
        }
    }));
}
// Drafts may persist empty email steps, but an active automation must have a
// complete subject and body for every email it sends — mirroring the editor's
// publish-time validation.
function validateActiveEmailSteps(status, actions) {
    if (status !== 'active') {
        return;
    }
    for (const action of actions) {
        if (action.type !== 'send_email') {
            continue;
        }
        if (!action.data.email_subject.trim()) {
            throwValidationError(messages.emptyEmailSubjectWhenActive, 'actions');
        }
        if (isEmptyLexical(action.data.email_lexical)) {
            throwValidationError(messages.emptyEmailBodyWhenActive, 'actions');
        }
    }
}
function isEmptyLexical(lexical) {
    try {
        const parsed = JSON.parse(lexical);
        return isEmptyParsedLexical(parsed);
    }
    catch {
        return true;
    }
}
function isValidEmptyLexical(lexical) {
    try {
        return isEmptyParsedLexical(JSON.parse(lexical));
    }
    catch {
        return false;
    }
}
function isMalformedEmptyLexical(lexical) {
    try {
        const children = JSON.parse(lexical)?.root?.children;
        if (!Array.isArray(children) || children.length !== 1 || children[0].type !== 'paragraph') {
            return false;
        }
        return !Array.isArray(children[0].children);
    }
    catch {
        return false;
    }
}
function isEmptyParsedLexical(parsed) {
    const children = parsed?.root?.children;
    if (!Array.isArray(children)) {
        return false;
    }
    if (children.length === 0) {
        return true;
    }
    if (children.length !== 1 || children[0].type !== 'paragraph') {
        return false;
    }
    return Array.isArray(children[0].children) && children[0].children.length === 0;
}
function validateGraph(actions, edges) {
    const actionIdentities = new Set();
    // Every action in the submitted graph must have a unique ObjectId so edges
    // can refer to a single, unambiguous node.
    for (const action of actions) {
        if (actionIdentities.has(action.id)) {
            throwValidationError(messages.duplicateAutomationActionIdentity, 'actions');
        }
        actionIdentities.add(action.id);
    }
    const edgeIdentities = new Set();
    const outgoing = new Map();
    const incoming = new Map();
    // Edges are stored without ids, so source/target pairs are their identity.
    // While collecting them, also track incoming/outgoing degree so we can
    // reject branches before checking the full path shape.
    for (const edge of edges) {
        if (!actionIdentities.has(edge.source_action_id) ||
            !actionIdentities.has(edge.target_action_id)) {
            throwValidationError(messages.invalidAutomationEdgeEndpoint, 'edges');
        }
        if (edge.source_action_id === edge.target_action_id) {
            throwValidationError(messages.invalidAutomationEdge, 'edges');
        }
        const edgeIdentity = `${edge.source_action_id}->${edge.target_action_id}`;
        if (edgeIdentities.has(edgeIdentity)) {
            throwValidationError(messages.duplicateAutomationEdge, 'edges');
        }
        edgeIdentities.add(edgeIdentity);
        if (outgoing.has(edge.source_action_id) || incoming.has(edge.target_action_id)) {
            throwValidationError(messages.invalidAutomationGraphShape, 'edges');
        }
        outgoing.set(edge.source_action_id, edge.target_action_id);
        incoming.set(edge.target_action_id, edge.source_action_id);
    }
    validateLinearGraph(actionIdentities, outgoing, incoming);
}
function validateLinearGraph(actionIdentities, outgoing, incoming) {
    // Automations with fewer than 2 actions should have no edges.
    if (actionIdentities.size <= 1) {
        if (outgoing.size !== 0 || incoming.size !== 0) {
            throwValidationError(messages.invalidAutomationGraphShape, 'edges');
        }
        return;
    }
    // A linear path with N actions must have exactly N - 1 edges.
    if (outgoing.size !== actionIdentities.size - 1) {
        throwValidationError(messages.invalidAutomationGraphShape, 'edges');
    }
    const heads = [...actionIdentities].filter((identity) => !incoming.has(identity));
    const tails = [...actionIdentities].filter((identity) => !outgoing.has(identity));
    // A valid path has one start node with no incoming edge and one end node
    // with no outgoing edge.
    if (heads.length !== 1 || tails.length !== 1) {
        throwValidationError(messages.invalidAutomationGraphShape, 'edges');
    }
    const visited = new Set();
    let cursor = heads[0];
    // Walk from the head through outgoing edges. Revisiting a node means a
    // cycle; visiting fewer nodes than submitted means the graph is disconnected.
    while (cursor) {
        if (visited.has(cursor)) {
            throwValidationError(messages.invalidAutomationGraphShape, 'edges');
        }
        visited.add(cursor);
        cursor = outgoing.get(cursor);
    }
    if (visited.size !== actionIdentities.size) {
        throwValidationError(messages.invalidAutomationGraphShape, 'edges');
    }
}
function throwValidationError(message, property) {
    throw new errors_1.default.ValidationError({
        message,
        property,
    });
}
exports.requestPoll = automationsApi2.requestPoll.bind(automationsApi2);
exports.trigger = automationsApi2.trigger.bind(automationsApi2);
async function fetchAndLockSteps(...args) {
    return await repository.fetchAndLockSteps(...args);
}
async function finishStepAndEnqueueNext(...args) {
    return await repository.finishStepAndEnqueueNext(...args);
}
async function markStepTerminal(...args) {
    return await repository.markStepTerminal(...args);
}
async function retryStep(...args) {
    return await repository.retryStep(...args);
}
async function recordEmailSent(...args) {
    return await repository.recordEmailSent(...args);
}
async function getAutomatedEmailRecipientsByMailgunIds(...args) {
    return await repository.getAutomatedEmailRecipientsByMailgunIds(...args);
}
async function trackEmailDeliveredAndOpened(...args) {
    return await repository.trackEmailDeliveredAndOpened(...args);
}
async function trackEmailClicked(...args) {
    await repository.trackEmailClicked(...args);
}
