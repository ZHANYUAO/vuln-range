"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordGiftLinkAction = recordGiftLinkAction;
// The history UI only surfaces a verb-specific label (action_name) for 'edited' events; 'added' and
// 'deleted' render as the bare event. So 'reset' maps to 'edited' to read as "reset", while
// 'add'/'remove' read as plain "added"/"deleted".
const COMMANDS = {
    add: 'added',
    reset: 'edited',
    remove: 'deleted',
};
// Best-effort action-log write: a failed action must never fail the command that triggered it.
async function recordGiftLinkAction({ Action, logging, context, verb, subject, }) {
    if (!context.actor) {
        return;
    }
    const event = COMMANDS[verb];
    try {
        await Action.add({
            event,
            resource_type: 'gift_link',
            resource_id: subject,
            actor_type: context.actor.type,
            actor_id: context.actor.id,
            ...(event === 'edited' ? { context: { action_name: verb } } : {}),
        }, { autoRefresh: false });
    }
    catch (err) {
        logging.error(err);
    }
}
