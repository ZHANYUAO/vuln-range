"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DbJson = DbJson;
const zod_1 = require("zod");
/**
 * A column holding JSON text, read against the schema of the value it encodes.
 *
 * A codec rather than a parse on the way out, so the write stores what the read accepts.
 * Zod validates JSON-compatible values (`z.json()`) but has no built-in for parsing JSON
 * text, so decoding the text is this codec's job: text that is not JSON fails with one
 * `invalid_format` issue for the `json` format, and text that is JSON is then checked
 * against `schema`.
 *
 * `schema` must take JSON as input, so a write can never store what a read rejects: a
 * `z.date()` would encode as a string it cannot decode, and a `z.bigint()` cannot encode at
 * all. It must also be bidirectional: derive values with `z.codec`, not `.transform()`,
 * which decodes but throws on every encode.
 *
 * `message` names the column's value in that issue, as in "The stored manifest is not JSON."
 */
function DbJson(schema, { message = 'The stored value is not JSON.' } = {}) {
    return zod_1.z.codec(zod_1.z.string(), schema, {
        decode: (text, ctx) => {
            try {
                return JSON.parse(text);
            }
            catch {
                ctx.issues.push({ code: 'invalid_format', format: 'json', message, input: text });
                return zod_1.z.NEVER;
            }
        },
        encode: (value) => JSON.stringify(value),
    });
}
