"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toMetafieldsResponse = void 0;
exports.namespaceRoute = namespaceRoute;
exports.fieldRoute = fieldRoute;
const zod_1 = require("zod");
const identity_1 = require("@tryghost/metafield-types/identity");
const case_keys_1 = require("../../lib/case-keys");
const parse_request_1 = require("../../lib/parse-request");
const models_1 = require("./models");
const NamespaceRoute = zod_1.z.object({ namespace: identity_1.NamespaceSchema });
/**
 * The namespace a route names. A segment that breaks the rule every segment follows is
 * refused before anything looks it up, the way a malformed id is.
 */
function namespaceRoute(options) {
    return (0, parse_request_1.parseRequest)(NamespaceRoute, options, 'namespace');
}
/** The field a route names: the identity its namespace and key make, checked the same way. */
function fieldRoute(options) {
    return (0, parse_request_1.parseRequest)(identity_1.IdentitySchema, options, 'key');
}
const MetafieldResource = zod_1.z.object({
    namespace: zod_1.z.string(),
    key: zod_1.z.string(),
    name: zod_1.z.string(),
    type: zod_1.z.string(),
    status: zod_1.z.string(),
    access: zod_1.z.object({ member: zod_1.z.string() }),
    created_at: zod_1.z.date(),
    updated_at: zod_1.z.date().nullable(),
});
const MetafieldsResponse = zod_1.z.object({ members_metafields: zod_1.z.array(MetafieldResource) });
exports.toMetafieldsResponse = zod_1.z
    .array(models_1.Metafield)
    .transform((fields) => ({
    members_metafields: fields.map((field) => (0, case_keys_1.snakeKeys)(field)),
}))
    .pipe(MetafieldsResponse);
