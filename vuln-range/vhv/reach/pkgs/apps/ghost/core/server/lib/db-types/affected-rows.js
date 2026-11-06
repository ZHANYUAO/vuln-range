"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAffectedRows = getAffectedRows;
const zod_1 = require("zod");
const count_1 = require("./count");
const rawUpdateResult = zod_1.z.union([
    zod_1.z.tuple([zod_1.z.object({ affectedRows: count_1.DbCount })]).rest(zod_1.z.unknown()),
    zod_1.z.object({ changes: count_1.DbCount }),
]);
/** Normalize Knex raw UPDATE results from MySQL tuples and SQLite run results. */
function getAffectedRows(result) {
    const parsed = rawUpdateResult.parse(result);
    return Array.isArray(parsed) ? parsed[0].affectedRows : parsed.changes;
}
