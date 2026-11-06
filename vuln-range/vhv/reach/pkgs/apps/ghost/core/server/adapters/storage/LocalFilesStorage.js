"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// # Local File System Storage module
// The (default) module for storing media, using the local file system
const path_1 = __importDefault(require("path"));
const zod_1 = require("zod");
const config_1 = __importDefault(require("../../../shared/config"));
const settings_cache_1 = __importDefault(require("../../../shared/settings-cache"));
const url_utils_1 = __importDefault(require("../../../shared/url-utils"));
const file_types_1 = require("../../lib/file-types");
const LocalStorageBase_1 = __importDefault(require("./LocalStorageBase"));
const messages = {
    notFound: 'File not found',
    notFoundWithRef: 'File not found: {file}',
    cannotRead: 'Could not read File: {file}',
};
const assetUrlSchema = zod_1.z.string().min(1);
const trustedAssets = {
    '.js': { setting: 'pintura_js_url', configKey: 'url', contentType: 'text/javascript' },
    '.css': { setting: 'pintura_css_url', configKey: 'styles', contentType: 'text/css' },
};
// Frontend apps whose script and stylesheet URLs can be pointed at a
// self-hosted copy through config, e.g. `portal:url` or `sodoSearch:styles`.
const frontendApps = [
    'portal',
    'sodoSearch',
    'comments',
    'announcementBar',
    'signupForm',
    'adminToolbar',
];
class LocalFilesStorage extends LocalStorageBase_1.default {
    constructor() {
        super({
            storagePath: config_1.default.getContentPath('files'),
            siteUrl: config_1.default.getSiteUrl(),
            staticFileURLPrefix: url_utils_1.default.STATIC_FILES_URL_PREFIX,
            errorMessages: messages,
        });
    }
    /**
     * The files upload endpoint resolves an inert content type for each file
     * (e.g. .html -> text/plain, .svg -> application/octet-stream), which S3
     * stores alongside the object. Local storage has nowhere to keep it, so
     * resolve it again here instead of letting express.static derive a
     * browser-executable type from the extension.
     *
     * Scripts and stylesheets the site itself points at are the exception:
     * the Pintura files an admin uploaded in Settings, and self-hosted
     * frontend apps (Portal, Search, Comments, ...) configured in config.
     * Browsers refuse to load those with an inert type.
     */
    setServeHeaders(res, filePath) {
        super.setServeHeaders(res, filePath);
        res.setHeader('Content-Type', this.getTrustedAssetContentType(filePath) ?? (0, file_types_1.getStorageContentType)(filePath));
    }
    getTrustedAssetContentType(filePath) {
        const extension = path_1.default.extname(filePath).toLowerCase();
        if (extension !== '.js' && extension !== '.css') {
            return null;
        }
        const asset = trustedAssets[extension];
        const assetUrls = [
            settings_cache_1.default.get(asset.setting),
            ...frontendApps.map((app) => {
                const url = config_1.default.get(`${app}:${asset.configKey}`);
                const version = config_1.default.get(`${app}:version`);
                return typeof url === 'string' && typeof version === 'string'
                    ? url.replace('{version}', version)
                    : url;
            }),
        ];
        const resolvedPath = path_1.default.resolve(filePath);
        return assetUrls.some((url) => this.getStoragePath(url) === resolvedPath)
            ? asset.contentType
            : null;
    }
    getStoragePath(url) {
        const parsed = assetUrlSchema.safeParse(url);
        if (!parsed.success) {
            return null;
        }
        try {
            const storageUrl = new URL(this.staticFileUrl);
            const assetUrl = new URL(parsed.data, this.siteUrl);
            const prefix = `${storageUrl.pathname}/`;
            if (assetUrl.origin !== storageUrl.origin || !assetUrl.pathname.startsWith(prefix)) {
                return null;
            }
            // URL paths are encoded; serve-static passes a decoded filesystem path.
            // Strip query strings/fragments and validate containment before comparing.
            const relativePath = decodeURIComponent(assetUrl.pathname.slice(prefix.length));
            return this._resolveAndValidateStoragePath(relativePath);
        }
        catch {
            // Invalid, external, or out-of-storage URLs retain the inert type.
            return null;
        }
    }
}
exports.default = LocalFilesStorage;
