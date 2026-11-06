"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildHistory = buildHistory;
exports.approvalManifestIds = approvalManifestIds;
const manifest_1 = require("@tryghost/app-contracts/manifest");
const zod_1 = require("zod");
const ApprovalContext = zod_1.z.object({
    from_manifest_id: zod_1.z.string(),
    to_manifest_id: zod_1.z.string(),
});
/**
 * `manifestContents` holds the manifests before and after each approval, by id.
 * They're only used to tell whether an approval moved the app.
 */
function buildHistory(manifests, actions, manifestContents) {
    const approvals = approvalsIn(actions);
    const urls = new Map(manifests.map((manifest) => [manifest.id, manifest.manifest_url]));
    return newestFirst([
        ...installOf(manifests, actions),
        ...updatesSuspensionsAndResumesOf(manifests),
        ...approvals.map((approval) => approvalEntry(approval, urls, manifestContents)),
        ...uninstallsIn(actions),
    ]);
}
/** The ids of the manifests before and after each approval. */
function approvalManifestIds(actions) {
    return [...new Set(approvalsIn(actions).flatMap(({ from, to }) => [from, to]))];
}
function installOf(manifests, actions) {
    const installed = manifests.find(({ source }) => source === 'install');
    if (!installed) {
        return [];
    }
    const recorded = actions.find(withEvent('installed'));
    return [
        {
            id: recorded?.id ?? installed.id,
            event: 'installed',
            actor: recorded?.actor ?? null,
            created_at: installed.created_at,
        },
    ];
}
/**
 * Entries for changes the re-check made, one per manifest row: applied a newer manifest
 * (`updated`), suspended the app for approval (`suspended`), or lifted a suspension
 * (`resumed`).
 */
function updatesSuspensionsAndResumesOf(manifests) {
    return manifests
        .filter(({ source }) => source === 'update' || source === 'resume')
        .map((manifest) => ({
        id: manifest.id,
        event: manifest.source === 'resume'
            ? 'resumed'
            : manifest.requires_approval
                ? 'suspended'
                : 'updated',
        actor: null,
        created_at: manifest.created_at,
    }));
}
function approvalEntry({ action, from, to }, urls, contents) {
    const before = servedManifest(from, urls, contents);
    const after = servedManifest(to, urls, contents);
    const move = before && after ? (0, manifest_1.movedBetween)(before, after) : null;
    return {
        id: action.id,
        event: 'changes_approved',
        actor: action.actor,
        created_at: action.created_at,
        ...(move ? { moved_to: move.to } : {}),
    };
}
function servedManifest(id, urls, contents) {
    const manifestUrl = urls.get(id);
    const manifest = contents.get(id);
    return manifestUrl && manifest ? { manifestUrl, manifest } : undefined;
}
function uninstallsIn(actions) {
    return actions.filter(withEvent('uninstalled')).map((action) => ({
        id: action.id,
        event: 'uninstalled',
        actor: action.actor,
        created_at: action.created_at,
    }));
}
function approvalsIn(actions) {
    return actions.filter(withEvent('changes_approved')).map((action) => {
        const context = ApprovalContext.parse(JSON.parse(action.context ?? 'null'));
        return {
            action,
            from: context.from_manifest_id,
            to: context.to_manifest_id,
        };
    });
}
/**
 * Timestamps only go down to the second, so ties are broken by id.
 * ObjectIds increase over time, so a higher id is newer.
 */
function newestFirst(entries) {
    return entries.sort((a, b) => b.created_at.getTime() - a.created_at.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}
const withEvent = (event) => (action) => action.event === event;
