"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.columnsOf = columnsOf;
const zod_1 = require("zod");
/**
 * A table's columns as schema.js declares them, each read through `column`, without the `@@`
 * entries that describe the table rather than a column. Throws on a column `column` cannot
 * read, naming it.
 */
function columnsOf(tableSpec, column) {
    return zod_1.z
        .record(zod_1.z.string(), column)
        .parse(Object.fromEntries(Object.entries(tableSpec).filter(([name]) => !name.startsWith('@@'))));
}
