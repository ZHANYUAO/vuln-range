"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAutomationsApi2 = void 0;
const errors_1 = __importDefault(require("@tryghost/errors"));
const logging_1 = __importDefault(require("@tryghost/logging"));
const bson_objectid_1 = __importDefault(require("bson-objectid"));
const start_automations_poll_event_1 = require("./events/start-automations-poll-event");
const get_ready_at_for_action_1 = require("./util/get-ready-at-for-action");
/**
 * A collection of various automations operations.
 *
 * Logic should primarily live here, not in repositories.
 *
 * NOTE: `createAutomationsApi2` will soon replace the existing automations API. See NY-1704.
 */
const createAutomationsApi2 = ({ domainEvents, fakeWaitHoursMultiplier, labs, repository, }) => {
    const requestPoll = () => {
        domainEvents.dispatch(start_automations_poll_event_1.StartAutomationsPollEvent.create());
    };
    return {
        getNumberOfAutomations: () => repository.withConnection(async (connection) => await repository.getNumberOfAutomations(connection)),
        requestPoll,
        trigger: async ({ event, memberEmail, memberId, memberStatus, memberTierIds, }) => {
            // TypeScript makes this impossible in theory, but in practice there are
            // untyped callers (and TypeScript doesn't have a sound type system
            // anyway). This check is defense-in-depth.
            if (event !== 'membership_started') {
                throw new errors_1.default.IncorrectUsageError({
                    message: 'Member signup is the only supported event right now. More may be added later',
                });
            }
            if (!labs.isSet('automations')) {
                return;
            }
            const didEnroll = await repository.withTransaction(async (trx) => {
                await repository.lockMember(trx, memberId);
                const firstActions = await repository.findFirstActionRevisions(trx, memberStatus, memberTierIds);
                const runsToInsert = [];
                const stepsToInsert = [];
                await Promise.all(firstActions.map(async (firstAction) => {
                    const automationId = firstAction.automation_id;
                    if (await repository.hasMemberEnteredAutomation(trx, automationId, memberId)) {
                        logging_1.default.info(`Skipping automation ${automationId} for member ${memberId} because they have already run it`);
                        return;
                    }
                    const now = new Date();
                    const readyAt = (0, get_ready_at_for_action_1.getReadyAtForAction)(firstAction, now, fakeWaitHoursMultiplier);
                    const run = {
                        id: (0, bson_objectid_1.default)().toHexString(),
                        created_at: now,
                        updated_at: now,
                        automation_id: automationId,
                        member_id: memberId,
                        member_email: memberEmail,
                    };
                    runsToInsert.push(run);
                    const step = {
                        id: (0, bson_objectid_1.default)().toHexString(),
                        automation_run_id: run.id,
                        automation_action_revision_id: firstAction.automation_action_revision_id,
                        created_at: now,
                        updated_at: now,
                        ready_at: readyAt,
                    };
                    stepsToInsert.push(step);
                }));
                await repository.insertRuns(trx, runsToInsert);
                await repository.insertRunSteps(trx, stepsToInsert);
                return runsToInsert.length > 0;
            });
            if (didEnroll) {
                requestPoll();
            }
        },
    };
};
exports.createAutomationsApi2 = createAutomationsApi2;
