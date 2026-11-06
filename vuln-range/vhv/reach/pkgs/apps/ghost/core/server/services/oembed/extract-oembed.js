"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractOembed = extractOembed;
const oembed_extractor_1 = require("@extractus/oembed-extractor");
const errors_1 = __importDefault(require("@tryghost/errors"));
const oembed_schema_1 = require("./oembed-schema");
const user_agent_1 = require("./user-agent");
/**
 * Fetches oEmbed data for a URL from its allowlisted provider endpoint
 *
 * `fetch` should be `externalRequest.fetch` so requests get SSRF protection
 */
async function extractOembed(url, { fetch, signal }) {
    const fetcher = (requestUrl) => fetch(requestUrl, { headers: { 'user-agent': user_agent_1.USER_AGENT }, signal });
    const result = oembed_schema_1.OembedData.safeParse(await (0, oembed_extractor_1.extract)(url, {}, fetcher));
    if (!result.success) {
        throw new errors_1.default.ValidationError({
            message: 'Provider returned an invalid oEmbed response',
            context: url,
            err: result.error,
        });
    }
    // extractor tags results with its lookup method; keep card payloads unchanged
    delete result.data.method;
    return result.data;
}
