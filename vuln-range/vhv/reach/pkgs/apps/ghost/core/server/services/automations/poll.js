"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.poll = void 0;
const mailgun_message_id_1 = require("../../lib/mailgun/mailgun-message-id");
const mailgun_error_1 = require("../../lib/mailgun/mailgun-error");
const logging_1 = __importDefault(require("@tryghost/logging"));
const errors_1 = __importDefault(require("@tryghost/errors"));
const constants_1 = require("../member-welcome-emails/constants");
const constants_2 = require("./constants");
// @ts-expect-error Models currently lack type definitions.
const models_1 = require("../../models");
const settingsCache = require('../../../shared/settings-cache');
const MEMBER_STATUS_BY_TRIGGER_TIER_SCOPE = new Map([
    ['free', 'free'],
    ['all_paid', 'paid'],
    ['selected_paid', 'paid'],
]);
const hasUpdatesAndAnnouncementsEnabled = (member) => {
    const preference = member.get('enable_updates_and_announcements');
    if (preference !== null) {
        return preference;
    }
    const isSubscribedToAnyNewsletters = member.related('newsletters').models.length > 0;
    return isSubscribedToAnyNewsletters;
};
const markMaxAttemptsExceeded = async (automationsApi, step) => {
    await automationsApi.markStepTerminal(step, 'failed');
    logging_1.default.warn({
        system: {
            event: 'automations.poll.max_attempts',
            step_id: step.id,
        },
    }, `[AUTOMATIONS] Step ${step.id} exceeded max attempts`);
};
const handleStepExecutionFailure = async ({ automationsApi, err, step, }) => {
    logging_1.default.error({
        err: (0, mailgun_error_1.getMailgunError)(err),
        system: {
            event: 'automations.poll.step_execution_failed',
            step_id: step.id,
        },
    }, `[AUTOMATIONS] Failed to execute automation step ${step.id}`);
    if (step.step_attempts < constants_2.MAX_ATTEMPTS) {
        const retryAt = new Date(Date.now() + constants_2.RETRY_DELAY_MS);
        const didRetry = await automationsApi.retryStep(step, retryAt);
        if (didRetry) {
            return retryAt;
        }
    }
    else {
        await markMaxAttemptsExceeded(automationsApi, step);
    }
    return null;
};
const processStep = async ({ automationsApi, memberWelcomeEmailService, scheduleAutomationEmailAnalyticsJob, step, }) => {
    if (step.automation_status !== 'active') {
        await automationsApi.markStepTerminal(step, 'automation disabled');
        return null;
    }
    if (step.step_attempts > constants_2.MAX_ATTEMPTS) {
        await markMaxAttemptsExceeded(automationsApi, step);
        return null;
    }
    // NOTE: This will change once we support additional automation triggers.
    const triggerTierScope = step.automation_trigger_tier_scope;
    if (!triggerTierScope) {
        logging_1.default.error({
            system: {
                event: 'automations.poll.missing_trigger_tier_scope',
                step_id: step.id,
            },
        }, `[AUTOMATIONS] Trigger tier scope is missing for step ${step.id}. Currently, this is unexpected`);
        await automationsApi.markStepTerminal(step, 'failed');
        return null;
    }
    const memberStatus = MEMBER_STATUS_BY_TRIGGER_TIER_SCOPE.get(triggerTierScope);
    if (!memberStatus) {
        logging_1.default.error({
            system: {
                event: 'automations.poll.unsupported_trigger_tier_scope',
                trigger_tier_scope: triggerTierScope,
                step_id: step.id,
            },
        }, `[AUTOMATIONS] Unsupported trigger tier scope for step ${step.id}: ${triggerTierScope}`);
        await automationsApi.markStepTerminal(step, 'failed');
        return null;
    }
    if (!step.member_id) {
        await automationsApi.markStepTerminal(step, 'member unsubscribed');
        return null;
    }
    const memberRelationsToLoad = ['newsletters'];
    if (triggerTierScope === 'selected_paid') {
        memberRelationsToLoad.push('products');
    }
    const member = (await models_1.Member.findOne({ id: step.member_id }, { withRelated: memberRelationsToLoad }));
    if (!member) {
        // It's possible that the member was deleted between the time the step was fetched and now, though it's
        // unlikely. That's why we log a warning, not an error.
        logging_1.default.warn({
            system: {
                event: 'automations.poll.member_missing',
                member_id: step.member_id,
                step_id: step.id,
            },
        }, `[AUTOMATIONS] Member ${step.member_id} for step ${step.id} doesn't exist`);
        await automationsApi.markStepTerminal(step, 'member unsubscribed');
        return null;
    }
    const eligibleStatuses = constants_1.MEMBER_WELCOME_EMAIL_ELIGIBLE_STATUSES[memberStatus];
    const doesMemberStatusStillMatchAutomation = eligibleStatuses.includes(member.get('status') ?? '') &&
        (triggerTierScope !== 'selected_paid' ||
            member
                .related('products')
                .models.some((tier) => step.automation_trigger_tier_ids.includes(tier.id)));
    if (!doesMemberStatusStillMatchAutomation) {
        await automationsApi.markStepTerminal(step, 'member changed status');
        return null;
    }
    let nextReadyAt = null;
    try {
        switch (step.type) {
            case 'wait':
                break;
            case 'send_email': {
                if (!hasUpdatesAndAnnouncementsEnabled(member)) {
                    await automationsApi.markStepTerminal(step, 'member unsubscribed');
                    return null;
                }
                memberWelcomeEmailService.init();
                const trackClicks = Boolean(settingsCache.get('email_track_clicks'));
                const trackOpens = Boolean(settingsCache.get('email_track_opens'));
                const sendResult = await memberWelcomeEmailService.api.sendAutomationEmail({
                    email: {
                        designSettingId: step.email_design_setting_id,
                        lexical: step.email_lexical,
                        subject: step.email_subject,
                    },
                    member: {
                        // Note that we don't use `automation_run.member_email` here. That's only for the historical record, not for functionality.
                        email: member.get('email'),
                        name: member.get('name'),
                        uuid: member.get('uuid'),
                    },
                    memberStatus,
                    trackOpens,
                    trackClicks,
                    automationActionRevisionId: step.automation_action_revision_id,
                    automationRunStepId: step.id,
                });
                const mailgunMessageId = (0, mailgun_message_id_1.getMailgunMessageId)(sendResult);
                // Only Mailgun sends can produce open events for automation emails
                const trackOpensForRecipient = trackOpens && Boolean(mailgunMessageId);
                try {
                    await automationsApi.recordEmailSent({
                        automationActionRevisionId: step.automation_action_revision_id,
                        automationRunStepId: step.id,
                        ...(mailgunMessageId ? { mailgunMessageId } : {}),
                        memberEmail: member.get('email'),
                        memberId: step.member_id,
                        memberName: member.get('name'),
                        memberUuid: member.get('uuid'),
                        trackClicks,
                        trackOpens: trackOpensForRecipient,
                    });
                }
                catch (err) {
                    logging_1.default.error({
                        err,
                        system: {
                            event: 'automations.poll.recipient_persistence_failed',
                            member_id: step.member_id,
                            step_id: step.id,
                        },
                    }, `[AUTOMATIONS] Failed to record automated email recipient for step ${step.id}`);
                }
                if (mailgunMessageId) {
                    try {
                        await scheduleAutomationEmailAnalyticsJob();
                    }
                    catch (err) {
                        logging_1.default.error({
                            err,
                            system: {
                                event: 'automations.poll.analytics_scheduling_failed',
                                member_id: step.member_id,
                                step_id: step.id,
                            },
                        }, `[AUTOMATIONS] Failed to schedule email analytics job for step ${step.id}`);
                    }
                }
                break;
            }
            default: {
                const _exhaustive = step;
                throw new errors_1.default.InternalServerError({
                    message: `Unexpected automation step type ${_exhaustive}`,
                });
            }
        }
        nextReadyAt = await automationsApi.finishStepAndEnqueueNext(step);
    }
    catch (err) {
        return await handleStepExecutionFailure({
            automationsApi,
            err,
            step,
        });
    }
    return nextReadyAt;
};
const dateMin = (a, b) => {
    if (!a) {
        return b;
    }
    if (!b) {
        return a;
    }
    return a < b ? a : b;
};
const poll = async ({ automationsApi, enqueueAnotherPollAt, scheduleAutomationEmailAnalyticsJob, memberWelcomeEmailService, }) => {
    const { steps, nextStepReadyAt } = await automationsApi.fetchAndLockSteps(constants_2.MAX_STEPS_PER_BATCH);
    let nextPollAt = nextStepReadyAt;
    // tl;dr: this may enqueue 1 unnecessary poll. That's worth it.
    //
    // If the batch is full, that means one of two things:
    //
    // 1. The number of remaining steps after this batch is positive. In other
    //    words, this batch doesn't cover everything.
    // 2. The number of remaining steps after this batch is 0. In other words,
    //    this is the last batch (for now).
    //
    // With the current design, we can't tell the difference! That is suboptimal.
    //
    // We *could* fix this by doing another query. But we don't because:
    //
    // - for most batches, we'd be doing an unnecessary query
    // - unnecessary polls do not impact correctness. At worst, they are a waste
    // - it would add complexity
    if (steps.length >= constants_2.MAX_STEPS_PER_BATCH) {
        nextPollAt = dateMin(nextPollAt, new Date());
    }
    await Promise.all(steps.map(async (step) => {
        try {
            const stepNextPollAt = await processStep({
                automationsApi,
                memberWelcomeEmailService,
                scheduleAutomationEmailAnalyticsJob,
                step,
            });
            nextPollAt = dateMin(nextPollAt, stepNextPollAt);
        }
        catch (err) {
            logging_1.default.error({
                err,
                system: {
                    event: 'automations.poll.step_failed',
                    step_id: step.id,
                },
            }, `[AUTOMATIONS] Failed to process automation step ${step.id}`);
            return;
        }
    }));
    if (nextPollAt) {
        enqueueAnotherPollAt(nextPollAt);
    }
};
exports.poll = poll;
