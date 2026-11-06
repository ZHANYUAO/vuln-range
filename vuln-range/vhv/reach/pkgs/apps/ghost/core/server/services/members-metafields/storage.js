"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROOT_PATH = void 0;
exports.pathOf = pathOf;
exports.valueRowsOf = valueRowsOf;
exports.valueRowsToWrite = valueRowsToWrite;
exports.valueFromRows = valueFromRows;
exports.valuesFromRows = valuesFromRows;
const errors_1 = __importDefault(require("@tryghost/errors"));
const identity_1 = require("@tryghost/metafield-types/identity");
// A value is a tree; the database stores one row for each part it holds, under the path
// its parts make. A value with no parts is a single row at the root, a part is a row under
// its own name, and a part of a part is a row under both.
//
// Nothing here may consult a field type. Values arrive already parsed against their own,
// and rows are rebuilt as what they were written as rather than as what the type says
// today, so a type that changes shape does not rewrite what members already have.
/** Empty rather than null, because the path is part of a value row's primary key. */
exports.ROOT_PATH = '';
/** The path the value of these parts is stored under, written the way an identity writes them. */
function pathOf(parts) {
    return parts.join(identity_1.SEPARATOR);
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/**
 * Values are rebuilt into plain objects, so a segment naming something every object
 * already has would reach the prototype instead of the value — and a write through
 * `__proto__` reaches every object in the process. Paths come out of the database, so
 * this holds here rather than trusting whatever put them there.
 */
function isSafeSegment(segment) {
    return !(segment in Object.prototype);
}
/** A row for every part a value names, at any depth, including the ones it names as empty. */
function valueRowsOf(value, path = exports.ROOT_PATH) {
    if (typeof value === 'string') {
        return [{ path, value_text: value }];
    }
    // Thrown rather than stored: the read path rejects a non-string row, so writing one
    // loses the value with nothing to say it ever arrived.
    if (!isRecord(value)) {
        throw new errors_1.default.IncorrectUsageError({
            message: `A custom field value must be a string or a record of them, not ${value === null ? 'null' : typeof value}.`,
        });
    }
    // Undefined means the value does not name the part, which is not the same as naming
    // it empty: the first leaves what is stored alone, the second clears it.
    return Object.entries(value)
        .filter(([, part]) => part !== undefined)
        .flatMap(([key, part]) => valueRowsOf(part, path === exports.ROOT_PATH ? key : `${path}${identity_1.SEPARATOR}${key}`));
}
/** A value split into the rows it sets and the paths it clears. */
function valueRowsToWrite(value) {
    const named = valueRowsOf(value);
    return {
        set: named.filter((row) => row.value_text !== ''),
        cleared: named.filter((row) => row.value_text === '').map((row) => row.path),
    };
}
/** The value a set of rows adds up to, rebuilt to whatever depth their paths describe. */
function valueFromRows(rows) {
    const root = rows.find((row) => row.path === exports.ROOT_PATH);
    if (root) {
        return root.value_text;
    }
    const value = {};
    for (const row of rows) {
        const segments = row.path.split(identity_1.SEPARATOR);
        if (!segments.every(isSafeSegment)) {
            continue;
        }
        const last = segments.pop();
        // A segment already holding a string is replaced rather than descended into: this
        // runs over every member of a list response, so a contradictory pair of paths
        // should cost one odd value rather than the whole response.
        const parent = segments.reduce((target, segment) => {
            if (!isRecord(target[segment])) {
                target[segment] = {};
            }
            return target[segment];
        }, value);
        parent[last] = row.value_text;
    }
    return value;
}
/**
 * Every member's values, keyed by member, then namespace, then field key. A member with no
 * rows is absent, and so is a namespace they hold nothing in.
 */
function valuesFromRows(rows) {
    const byMember = new Map();
    for (const { member_id: memberId, namespace, key, path, value_text: valueText } of rows) {
        const namespaces = byMember.get(memberId) ?? new Map();
        const fields = namespaces.get(namespace) ?? new Map();
        const forField = fields.get(key) ?? [];
        forField.push({ path, value_text: valueText });
        fields.set(key, forField);
        namespaces.set(namespace, fields);
        byMember.set(memberId, namespaces);
    }
    return new Map([...byMember].map(([memberId, namespaces]) => [
        memberId,
        Object.fromEntries([...namespaces].map(([namespace, fields]) => [
            namespace,
            Object.fromEntries([...fields].map(([key, forField]) => [key, valueFromRows(forField)])),
        ])),
    ]));
}
