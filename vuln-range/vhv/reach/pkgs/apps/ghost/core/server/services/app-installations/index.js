"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const zod_1 = require("zod");
const logging_1 = __importDefault(require("@tryghost/logging"));
const define_service_1 = require("../../../kernel/define-service");
const config_1 = __importDefault(require("../../../shared/config"));
const url_utils_1 = __importDefault(require("../../../shared/url-utils"));
const actions_1 = require("./actions");
const fetch_from_app_1 = require("./fetch-from-app");
const load_manifest_1 = require("./load-manifest");
const service_1 = require("./service");
/**
 * The apps slice of config, parsed here as the config guide asks of a feature's keys.
 * `localhostAlias` is set when Ghost runs in a container in development, where `localhost`
 * is the container rather than the developer's machine. Ignored anywhere else.
 */
const AppsConfig = zod_1.z.object({ localhostAlias: zod_1.z.string().min(1).nullable().default(null) });
// Localhost manifest URLs, and the alias they are fetched through, are for development only.
const isDevelopment = () => config_1.default.get('env') === 'development';
function localhostAlias() {
    if (!isDevelopment()) {
        return null;
    }
    return AppsConfig.parse(config_1.default.get('apps') ?? {}).localhostAlias;
}
const extras = { actingContext: actions_1.actingContext };
// Constructed by init() at boot, not at import: knex is only available once the DB has connected.
exports.default = (0, define_service_1.defineService)('App Installations', () => {
    const { knex } = require('../../data/db');
    const models = require('../../models');
    const externalRequest = require('../../lib/request-external');
    const recordAction = (input) => (0, actions_1.recordAppInstallationAction)({ Action: models.Action, logging: logging_1.default, ...input });
    const fetchFromApp = (0, fetch_from_app_1.createAppFetcher)({
        request: externalRequest,
        getLocalhostAlias: localhostAlias,
    });
    return new service_1.AppInstallationsService({
        knex,
        recordAction,
        loadManifest: (0, load_manifest_1.createManifestLoader)({
            fetchFromApp,
            logging: logging_1.default,
            // Read per load, not once at boot: it's config, which tests change.
            getManifestRules: () => ({
                ghostUrls: [url_utils_1.default.urlFor('home', true), url_utils_1.default.urlFor('admin', true)],
                allowLocalhost: isDevelopment(),
            }),
        }),
    });
}, extras);
