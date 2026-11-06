"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const errors_1 = __importDefault(require("@tryghost/errors"));
const zod_1 = require("zod");
const app_installations_1 = __importDefault(require("../../services/app-installations"));
const PreviewRequest = zod_1.z.object({ manifest_url: zod_1.z.string() });
const controller = {
    docName: 'app_installation_previews',
    // Fetches and checks an app's manifest so the publisher can review it before installing
    // or approving it. Nothing is stored. It fetches a URL from the request, so it needs the
    // permission to install.
    add: {
        headers: { cacheInvalidate: false },
        permissions: { docName: 'app_installations', method: 'add' },
        query(frame) {
            const parsed = PreviewRequest.safeParse(frame.data.app_installation_previews[0]);
            if (!parsed.success) {
                throw new errors_1.default.ValidationError({ message: 'Expected the manifest_url to preview.' });
            }
            return app_installations_1.default.service.preview(parsed.data.manifest_url);
        },
    },
};
module.exports = controller;
