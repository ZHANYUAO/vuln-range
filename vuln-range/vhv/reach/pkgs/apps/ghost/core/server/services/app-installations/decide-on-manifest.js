"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.changesFrom = changesFrom;
exports.decideOnManifest = decideOnManifest;
const manifest_1 = require("@tryghost/app-contracts/manifest");
/**
 * Lists what differs between the approved manifest and a loaded one. The preview shows
 * this list and decisions are made from it, so a review always matches what happens.
 */
function changesFrom(approved, loaded) {
    return compare(approved, loaded).changes;
}
function compare(approved, loaded) {
    const { changes, requiresApproval } = (0, manifest_1.compareManifests)({ manifestUrl: approved.manifest_url, manifest: approved.manifest }, { manifestUrl: loaded.manifestUrl, manifest: loaded.manifest });
    return {
        changes: changes.map(({ path, requiresApproval: requires }) => ({
            path,
            requires_approval: requires,
        })),
        requiresApproval,
    };
}
/**
 * Decides what to do with a loaded manifest, given the approved manifest and the pending
 * one, if any:
 *
 * - `unchanged`: it's the approved manifest and nothing is pending. Nothing to do.
 * - `use_pending`: it's the pending manifest.
 * - `apply`: it differs from the approved manifest only in silent changes, and nothing is
 *   pending. It becomes the approved manifest.
 * - `resume`: it's the approved manifest, with or without silent changes, while something
 *   is pending, meaning the app reverted the pending changes. It becomes the approved
 *   manifest and clears the pending one, which lifts the suspension.
 * - `suspend`: it has changes that need approval, so it replaces any pending manifest.
 *
 * These are the outcomes for the re-check. An approval applies a `suspend` decision
 * instead of leaving it pending.
 */
function decideOnManifest({ current, pending, loaded, }) {
    const { changes, requiresApproval } = compare(current, loaded);
    if (pending && pending.digest === loaded.digest) {
        return { kind: 'use_pending', changes };
    }
    if (requiresApproval) {
        return { kind: 'suspend', changes };
    }
    if (pending) {
        return { kind: 'resume', changes };
    }
    return { kind: changes.length === 0 ? 'unchanged' : 'apply', changes };
}
