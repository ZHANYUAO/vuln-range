"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const errors_1 = __importDefault(require("@tryghost/errors"));
const zod_1 = require("zod");
const app_installations_1 = __importDefault(require("../../services/app-installations"));
/**
 * What a publisher confirms: the manifest URL they reviewed and the digest of what they
 * were shown. The manifest itself never comes from the browser.
 */
const ReviewedManifest = zod_1.z.object({ manifest_url: zod_1.z.string(), digest: zod_1.z.string() });
/** What approving confirms on top: the revision of the installation the review was shown against. */
const ReviewedRevision = zod_1.z.object({ revision: zod_1.z.number().int().nonnegative() });
function reviewed(frame) {
    const parsed = ReviewedManifest.safeParse(frame.data.app_installations[0]);
    if (!parsed.success) {
        throw new errors_1.default.ValidationError({
            message: 'Expected the manifest_url and digest of the reviewed manifest.',
        });
    }
    return { manifestUrl: parsed.data.manifest_url, digest: parsed.data.digest };
}
function reviewedChange(frame) {
    const parsed = ReviewedRevision.safeParse(frame.data.app_installations[0]);
    if (!parsed.success) {
        throw new errors_1.default.ValidationError({
            message: 'Expected the revision of the installation that was reviewed.',
        });
    }
    return { ...reviewed(frame), revision: parsed.data.revision };
}
const noCacheInvalidation = { cacheInvalidate: false };
const controller = {
    docName: 'app_installations',
    browse: {
        headers: noCacheInvalidation,
        permissions: true,
        async query() {
            return app_installations_1.default.service.browse();
        },
    },
    read: {
        headers: noCacheInvalidation,
        options: ['id', 'include'],
        validation: { options: { id: { required: true }, include: { values: ['history'] } } },
        permissions: true,
        query(frame) {
            return app_installations_1.default.service.read(frame.options.id, {
                withHistory: frame.options.withRelated?.includes('history') ?? false,
            });
        },
    },
    add: {
        statusCode: 201,
        headers: noCacheInvalidation,
        permissions: true,
        query(frame) {
            return app_installations_1.default.service.create(app_installations_1.default.extras.actingContext(frame.options.context), reviewed(frame));
        },
    },
    // Approves changes to an installation, including the app moving somewhere new. Approving
    // is a decision of the same weight as installing, so it takes the same permission.
    edit: {
        headers: noCacheInvalidation,
        options: ['id'],
        validation: { options: { id: { required: true } } },
        permissions: { method: 'add' },
        query(frame) {
            return app_installations_1.default.service.approve(app_installations_1.default.extras.actingContext(frame.options.context), frame.options.id, reviewedChange(frame));
        },
    },
    destroy: {
        statusCode: 204,
        headers: noCacheInvalidation,
        options: ['id'],
        validation: { options: { id: { required: true } } },
        permissions: true,
        query(frame) {
            return app_installations_1.default.service.uninstall(app_installations_1.default.extras.actingContext(frame.options.context), frame.options.id);
        },
    },
};
module.exports = controller;
