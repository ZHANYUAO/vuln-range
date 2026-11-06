"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_installations_1 = __importDefault(require("../../services/app-installations"));
const controller = {
    docName: 'app_sessions',
    // Admin starts a session when it opens an app page. There's no body: the re-check only
    // fetches the approved manifest URL, never one from the request. So this needs the same
    // permission as reading the installation, unlike previewing, which fetches a URL from the
    // request and needs `add`. Anyone with `read` can trigger a re-check, which can suspend
    // the app or apply silent changes.
    start: {
        headers: { cacheInvalidate: false },
        options: ['id'],
        validation: { options: { id: { required: true } } },
        permissions: { docName: 'app_installations', method: 'read' },
        query(frame) {
            return app_installations_1.default.service.startSession(frame.options.id);
        },
    },
};
module.exports = controller;
