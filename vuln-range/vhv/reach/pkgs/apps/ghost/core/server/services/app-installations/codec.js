"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InstallationRow = exports.ApprovedManifestFields = exports.InstallationFields = void 0;
const zod_1 = require("zod");
const schema_1 = require("./schema");
/** The installation's own columns that it's read with. */
exports.InstallationFields = schema_1.DbAppInstallation.pick({
    id: true,
    app_id: true,
    status: true,
    manifest_id: true,
    pending_manifest_id: true,
    revision: true,
    created_at: true,
    updated_at: true,
});
/** The approved manifest's columns that an installation is read with. */
exports.ApprovedManifestFields = schema_1.DbAppInstallationManifest.pick({
    manifest_url: true,
    manifest: true,
});
/**
 * An installation joined with its approved manifest, as the repository reads it. Decoding
 * converts the dates, the status and the manifest JSON.
 */
exports.InstallationRow = zod_1.z.object({
    ...exports.InstallationFields.shape,
    ...exports.ApprovedManifestFields.shape,
});
