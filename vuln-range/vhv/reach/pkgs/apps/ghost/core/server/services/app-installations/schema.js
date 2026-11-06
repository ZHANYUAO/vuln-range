"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DbAppInstallationManifest = exports.AppInstallationManifestSource = exports.StoredManifest = exports.DbAppInstallation = exports.AppInstallationStatus = void 0;
const zod_1 = require("zod");
const manifest_1 = require("@tryghost/app-contracts/manifest");
const boolean_1 = require("../../lib/db-types/boolean");
const date_1 = require("../../lib/db-types/date");
const json_1 = require("../../lib/db-types/json");
// Mirrors schema.js's `isIn` on the column, which is static config and cannot import this.
exports.AppInstallationStatus = zod_1.z.enum(['active', 'suspended', 'uninstalled']);
/** An installation as the table holds it. */
exports.DbAppInstallation = zod_1.z.object({
    id: zod_1.z.string(),
    app_id: zod_1.z.string(),
    current_app_id: zod_1.z.string().nullable(),
    status: exports.AppInstallationStatus,
    manifest_id: zod_1.z.string(),
    pending_manifest_id: zod_1.z.string().nullable(),
    revision: zod_1.z.number().int().nonnegative(),
    created_at: date_1.DbDate,
    updated_at: date_1.DbDate.nullable(),
});
exports.StoredManifest = (0, json_1.DbJson)(manifest_1.AppManifestSchema, {
    message: 'The stored manifest is not JSON.',
});
// Mirrors schema.js's `isIn` on the column, which is static config and cannot import this.
exports.AppInstallationManifestSource = zod_1.z.enum(['install', 'approval', 'update', 'resume']);
/** A manifest an installation has run or been asked to approve, as the table holds it. */
exports.DbAppInstallationManifest = zod_1.z.object({
    id: zod_1.z.string(),
    installation_id: zod_1.z.string(),
    manifest_url: zod_1.z.string(),
    manifest: exports.StoredManifest,
    digest: zod_1.z.string(),
    source: exports.AppInstallationManifestSource,
    requires_approval: boolean_1.DbBoolean,
    created_at: date_1.DbDate,
});
