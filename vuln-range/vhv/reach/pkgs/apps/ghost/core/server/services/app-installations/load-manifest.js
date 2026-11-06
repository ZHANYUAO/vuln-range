"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createManifestLoader = createManifestLoader;
const node_crypto_1 = require("node:crypto");
const errors_1 = __importDefault(require("@tryghost/errors"));
const zod_1 = require("zod");
const manifest_1 = require("@tryghost/app-contracts/manifest");
const fetch_manifest_1 = require("./fetch-manifest");
const schema_1 = require("./schema");
/**
 * The digest includes the manifest URL because two URLs can serve identical manifests
 * once every URL in them is absolute. Without it, reviewing one URL would also confirm the
 * other, and that other URL would then be used for every future re-check.
 *
 * Encoding writes keys in the schema's order, so the same manifest always serialises the
 * same way. The newline separator can't appear in either part: the URL parser strips
 * newlines, and the encoded JSON has none.
 */
function digestOf(manifestUrl, serialisedManifest) {
    return (0, node_crypto_1.createHash)('sha256').update(`${manifestUrl}\n${serialisedManifest}`).digest('hex');
}
/**
 * Checks a manifest URL, fetches the manifest through `fetchFromApp`, and parses it against
 * the final URL. Redirects are only checked for staying on the same host (or upgrading
 * HTTP to HTTPS); the manifest rules apply to the final URL when it's parsed.
 *
 * Every problem is thrown as a Ghost error with an `APP_MANIFEST_*` code, which Admin
 * explains to the publisher. `getManifestRules` is called on every load because it reads
 * config.
 */
function createManifestLoader({ fetchFromApp, logging, getManifestRules, }) {
    const fetchManifest = (0, fetch_manifest_1.createManifestFetcher)({ fetchFromApp, logging });
    return async function loadManifest(input) {
        const rules = getManifestRules();
        const address = (0, manifest_1.parseManifestUrl)(input, rules.allowLocalhost);
        if (!address.success) {
            throw new errors_1.default.ValidationError({
                message: 'The app manifest URL is not valid.',
                code: 'APP_MANIFEST_URL_INVALID',
                context: address.error,
            });
        }
        const { manifestUrl } = address;
        const fetched = await fetchManifest(manifestUrl);
        const parsed = (0, manifest_1.parseManifest)(fetched.body, { ...rules, manifestUrl: fetched.url });
        if (!parsed.success) {
            throw new errors_1.default.ValidationError({
                message: 'The app manifest is not valid.',
                code: 'APP_MANIFEST_INVALID',
                context: parsed.errors
                    .map(({ path, message }) => (path ? `${path}: ${message}` : message))
                    .join('; '),
                // Each problem separately, so Admin can list them for the app's developer.
                errorDetails: parsed.errors,
            });
        }
        const serialised = zod_1.z.encode(schema_1.StoredManifest, parsed.manifest);
        return {
            manifestUrl,
            manifest: parsed.manifest,
            serialised,
            digest: digestOf(manifestUrl, serialised),
        };
    };
}
