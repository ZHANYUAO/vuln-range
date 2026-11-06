"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.actingContext = actingContext;
exports.recordAppInstallationAction = recordAppInstallationAction;
/**
 * Who is acting, read off an API frame's context.
 *
 * Only a staff user counts, whether signed in or using their own staff token.
 * Integrations hold no permission to manage apps, so they never get this far.
 */
function actingContext(context) {
    const frame = (context ?? {});
    if (frame.user && !frame.integration) {
        return { actor: { id: frame.user, type: 'user' } };
    }
    return { actor: null };
}
/**
 * Staff history is where "who installed this, and when" lives; the installation itself
 * does not hold it. The write is best-effort: a failed action must never fail the install
 * or uninstall that triggered it.
 */
async function recordAppInstallationAction({ Action, logging, context, event, subject, details, }) {
    if (!context.actor) {
        return;
    }
    try {
        await Action.add({
            event,
            resource_type: 'app_installation',
            resource_id: subject,
            actor_type: context.actor.type,
            actor_id: context.actor.id,
            context: details,
        }, { autoRefresh: false });
    }
    catch (err) {
        logging.error(err);
    }
}
