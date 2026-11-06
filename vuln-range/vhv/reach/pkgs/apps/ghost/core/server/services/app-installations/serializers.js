"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toAppSessionsResponse = exports.toAppInstallationsResponse = void 0;
const zod_1 = require("zod");
const schema_1 = require("./schema");
const AppInstallationResource = zod_1.z.object({
    id: zod_1.z.string(),
    app_id: zod_1.z.string(),
    status: schema_1.AppInstallationStatus,
    revision: zod_1.z.number(),
    manifest_url: zod_1.z.string(),
    // It was checked when it was read, and parsing it again could rewrite its URLs.
    manifest: zod_1.z.custom(),
    created_at: zod_1.z.date(),
    updated_at: zod_1.z.date().nullable(),
    history: zod_1.z.array(zod_1.z.custom()).optional(),
});
const AppInstallationsResponse = zod_1.z.object({
    app_installations: zod_1.z.array(AppInstallationResource),
});
const AppSessionsResponse = zod_1.z.object({
    app_sessions: zod_1.z.tuple([zod_1.z.object({ installation: AppInstallationResource })]),
});
exports.toAppInstallationsResponse = zod_1.z
    .array(zod_1.z.custom())
    .transform((installations) => ({
    app_installations: installations,
}))
    .pipe(AppInstallationsResponse);
exports.toAppSessionsResponse = zod_1.z
    .custom()
    .transform((session) => ({ app_sessions: [session] }))
    .pipe(AppSessionsResponse);
