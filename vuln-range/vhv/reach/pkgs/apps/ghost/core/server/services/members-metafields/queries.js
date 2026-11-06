"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ANY_STATUS = exports.ACTIVE_ONLY = exports.knexify = exports.nql = exports.FIELDS_TABLE = void 0;
exports.readableBy = readableBy;
exports.fieldSource = fieldSource;
exports.fieldReference = fieldReference;
exports.onField = onField;
exports.inFieldOrder = inFieldOrder;
const access_1 = require("./access");
const schema_1 = require("./schema");
/** The fields table's name, which is also the name a `FieldSource` reads it under by default. */
exports.FIELDS_TABLE = 'members_metafields';
/**
 * The columns a field is read with, besides its status, which reads as its namespace allows.
 * Every column of the row is named, so a column added to it doesn't compile until it is added
 * here too.
 */
const COLUMNS_BESIDE_STATUS = Object.keys({
    id: true,
    namespace: true,
    key: true,
    name: true,
    type: true,
    member_access: true,
    sort_order: true,
    created_at: true,
    updated_at: true,
});
// The same NQL -> knex bridge Bookshelf's filter plugin uses, applied directly to our
// raw-knex queries: nql parses a `filter` string to a Mongo query, mongo-knex turns that
// into parametrised WHERE clauses. Neither needs a Bookshelf model. Typed once here, since
// neither package ships types.
exports.nql = require('@tryghost/nql');
exports.knexify = require('@tryghost/mongo-knex');
// Nothing in the database keeps an archived or hidden field out of a read: no
// constraint stops a value row referencing one. Both filters are therefore applied in
// code, and a query that forgets either is a silent bug.
function readableBy(query, audience) {
    query.whereIn(`${exports.FIELDS_TABLE}.member_access`, (0, access_1.readableLevels)(audience));
    return query;
}
/**
 * Whether a read includes definitions the publisher has archived.
 *
 * A member is never offered an archived field. Staff managing the list are always
 * shown one, since an archived field is still theirs to rename, restore or delete.
 */
exports.ACTIVE_ONLY = 'active-only';
exports.ANY_STATUS = 'any-status';
// Typed with the row itself rather than the table registration: a read goes on to read from
// the fields as the source reads them, a subquery the registration doesn't describe.
function metafieldsTable(db) {
    return db(exports.FIELDS_TABLE);
}
/**
 * The fields as a site reads them: as stored, except that a field in a namespace that isn't
 * available reads as archived. Which namespaces aren't is asked on every read, as it can change
 * while Ghost runs.
 */
function fieldSource(namespaces) {
    const asRead = (db, rows) => {
        const unavailable = namespaces.unavailable();
        return rows.select(...COLUMNS_BESIDE_STATUS, 
        // An empty list makes no valid `IN`, and with nothing unavailable every status reads as
        // stored anyway.
        unavailable.length === 0
            ? 'status'
            : db.raw('CASE WHEN ?? IN (?) THEN ? ELSE ?? END AS ??', [
                'namespace',
                unavailable,
                schema_1.FIELD_STATUS.archived,
                'status',
                'status',
            ]));
    };
    const source = {
        table(db, alias = exports.FIELDS_TABLE) {
            return asRead(db, db(exports.FIELDS_TABLE)).as(alias);
        },
        definitions(db, scope) {
            let query = metafieldsTable(db);
            // Applied while the query still reads the table by its name, then pointed at the fields as
            // the source reads them, under the same name: the NQL bridge qualifies every column with
            // whatever the query reads from, and a subquery is no name to qualify one with.
            if (scope.filter) {
                query = (0, exports.knexify)(query, scope.filter, { tableName: exports.FIELDS_TABLE });
            }
            query = query.from(source.table(db));
            if (scope.namespace !== undefined) {
                query = query.where(`${exports.FIELDS_TABLE}.namespace`, scope.namespace);
            }
            if (scope.field !== undefined) {
                query = query
                    .where(`${exports.FIELDS_TABLE}.namespace`, scope.field.namespace)
                    .where(`${exports.FIELDS_TABLE}.key`, scope.field.key);
            }
            if (scope.status === exports.ACTIVE_ONLY) {
                query = query.where(`${exports.FIELDS_TABLE}.status`, schema_1.FIELD_STATUS.active);
            }
            if (scope.limit !== undefined) {
                query = query.limit(scope.limit);
            }
            return readableBy(query, scope.audience);
        },
        locked(trx, namespace, keys) {
            // Locked inside, as MySQL takes no lock on the rows behind a derived table for a lock asked
            // of the query around it.
            const rows = trx(exports.FIELDS_TABLE).where('namespace', namespace).whereIn('key', keys).forShare();
            return trx.from(asRead(trx, rows).as(exports.FIELDS_TABLE));
        },
    };
    return source;
}
/** The columns a row that points at a field holds it in: namespace and key together. */
function fieldReference(field) {
    return { metafield_namespace: field.namespace, metafield_key: field.key };
}
/**
 * Joins a row that points at a field to that field. On namespace and key together, since
 * a key alone names a field in every namespace that has one.
 */
function onField(fieldsTable, pointingTable) {
    return function () {
        this.on(`${fieldsTable}.namespace`, `${pointingTable}.metafield_namespace`).andOn(`${fieldsTable}.key`, `${pointingTable}.metafield_key`);
    };
}
/**
 * The publisher's order, applied to every read of the list. Here for the same reason the
 * status filter is: a read that forgets it comes back in whatever order the engine chose.
 *
 * Each namespace is its own list with its own ranks, so a read across several keeps each
 * one together. `created_at` orders a site that has never reordered, where every row still
 * holds the default rank; `id` settles the rest so the order is total.
 */
function inFieldOrder(query) {
    query
        .orderBy(`${exports.FIELDS_TABLE}.namespace`, 'asc')
        .orderBy(`${exports.FIELDS_TABLE}.sort_order`, 'asc')
        .orderBy(`${exports.FIELDS_TABLE}.created_at`, 'asc')
        .orderBy(`${exports.FIELDS_TABLE}.id`, 'asc');
    return query;
}
