"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetafieldValuesService = void 0;
const bson_objectid_1 = __importDefault(require("bson-objectid"));
const errors_1 = __importDefault(require("@tryghost/errors"));
const logging_1 = __importDefault(require("@tryghost/logging"));
const zod_1 = require("zod");
const metafield_types_1 = require("@tryghost/metafield-types");
const identity_1 = require("@tryghost/metafield-types/identity");
const schema_1 = require("./schema");
const date_1 = require("../../lib/db-types/date");
const queries_1 = require("./queries");
const access_1 = require("./access");
const storage_1 = require("./storage");
const VALUES_TABLE = 'members_metafield_values';
const CHANGE_EVENTS_TABLE = 'members_metafield_change_events';
const MEMBERS_TABLE = 'members';
/**
 * From the canonical schema, the same source definitions-service reads, so no key a site
 * could hold is refused and this cannot drift from the `members_metafields.key` column.
 */
const MAX_KEY_LENGTH = require('../../data/schema').tables[queries_1.FIELDS_TABLE].key.maxlength;
/**
 * Rows per insert statement, bounded by knex rather than by either database. SQLite takes
 * a multi-row `VALUES` perfectly well; knex's SQLite dialect emits that form only for a
 * single row and compiles anything longer into `INSERT ... SELECT ? UNION ALL SELECT ?`,
 * which SQLite refuses past 500 terms.
 *
 * Open as knex#721 since 2015, with an approved but unmerged fix in knex#5780. This can
 * go when that lands; until then the alternative is hand-written upsert SQL per engine.
 */
const UPSERT_CHUNK = 400;
/**
 * The columns a value row is keyed by, from the canonical schema, so a write's conflict target
 * cannot fall behind the table's primary key. Only SQLite would notice if it did: MySQL ignores
 * a conflict target, and SQLite refuses one that names no key.
 */
const VALUE_KEY = zod_1.z
    .array(schema_1.DbMetafieldValue.keyof())
    .parse(require('../../data/schema').tables[VALUES_TABLE]['@@PRIMARY_KEY@@']);
const MAX_IDENTITY_LENGTH = MAX_KEY_LENGTH * 2 + 1;
const ValuesInput = zod_1.z.record(zod_1.z.string().max(MAX_IDENTITY_LENGTH), zod_1.z.unknown());
const wireProperty = (identity) => [identity_1.QUALIFIER, identity].join(identity_1.SEPARATOR);
/**
 * Every refusal in one error.
 *
 * The API renders a single error, so the first still fills `message` and `property` and
 * a client that reads only those sees exactly what it saw before. The whole set rides in
 * `errorDetails`, which the renderer already passes through as `details`, so a client
 * that wants to mark every refused input can have them all from one attempt.
 */
function refusalError(refusals) {
    const [first, ...rest] = refusals;
    return new errors_1.default.ValidationError({
        message: first.message,
        property: first.property,
        // Omitted when there is nothing more to say, so the common single refusal keeps the
        // shape it has always had rather than growing a one-element list.
        ...(rest.length > 0 ? { errorDetails: refusals } : {}),
    });
}
/** What a write needs of a field, decoded so its namespace and key arrive checked. */
const WritableField = schema_1.DbMetafield.pick({
    id: true,
    name: true,
    type: true,
    member_access: true,
}).extend({ namespace: identity_1.NamespaceSchema, key: identity_1.KeySchema });
/**
 * What a member holds for each defined field. Separate from the definitions service
 * because a value belongs to the member and a definition belongs to the site's settings,
 * which are different aggregates rather than different layers.
 */
class MetafieldValuesService {
    knex;
    fields;
    /** A getter, not a number: the ceiling is an operator setting that changes between requests. */
    getMaxDefinitions;
    constructor({ knex, fields, getMaxDefinitions, }) {
        this.knex = knex;
        this.fields = fields;
        this.getMaxDefinitions = getMaxDefinitions;
    }
    // The query is scoped to the audience, so a field they may not see is absent from
    // the map and the caller reports it as unknown. Looking up unscoped and rejecting
    // afterwards would let a member tell a hidden field from an undefined one by the
    // reply they got.
    async allowedFieldsByIdentity(identities, audience) {
        // A write names whole fields, so an identity naming a part is one no field answers to.
        const keysByNamespace = new Map();
        for (const text of identities) {
            const identity = zod_1.z.safeDecode(identity_1.IdentityTextSchema, text);
            if (identity.success && identity.data.parts.length === 0) {
                const { namespace, key } = identity.data;
                keysByNamespace.set(namespace, [...(keysByNamespace.get(namespace) ?? []), key]);
            }
        }
        if (keysByNamespace.size === 0) {
            return new Map();
        }
        const rows = await this.fields
            .definitions(this.knex, { audience, status: queries_1.ACTIVE_ONLY })
            .where((query) => {
            for (const [namespace, keys] of keysByNamespace) {
                query.orWhere((inNamespace) => inNamespace.where('namespace', namespace).whereIn('key', keys));
            }
        })
            .select('id', 'namespace', 'key', 'name', 'type', 'member_access');
        const allowed = new Map();
        for (const row of rows) {
            // Skipped rather than thrown, the way an unreadable value is: the write then reports
            // this one field as unknown instead of failing every other value it carries.
            const field = WritableField.safeParse(row);
            if (!field.success) {
                logging_1.default.warn({
                    event: { name: 'members.metafields.field_unreadable' },
                    err: field.error,
                    metafieldNamespace: row.namespace,
                    metafieldKey: row.key,
                }, 'Skipping an unreadable metafield');
                continue;
            }
            allowed.set(zod_1.z.encode(identity_1.IdentityTextSchema, {
                namespace: field.data.namespace,
                key: field.data.key,
                parts: [],
            }), {
                id: field.data.id,
                namespace: field.data.namespace,
                key: field.data.key,
                name: field.data.name,
                type: field.data.type,
                memberAccess: field.data.member_access,
            });
        }
        return allowed;
    }
    /**
     * The member's metafields, or undefined if they have none. Given an executor, reads
     * inside that transaction.
     */
    async getValuesForMember(memberId, audience, executor = this.knex) {
        return (await this.getValuesForMembers([memberId], audience, executor)).get(memberId);
    }
    /**
     * Metafields for each member, keyed by member id. Only active fields the audience can
     * read are included. Members with no metafields have no entry. Given an executor, reads
     * inside that transaction.
     */
    async getValuesForMembers(memberIds, audience, executor = this.knex) {
        if (memberIds.length === 0) {
            return new Map();
        }
        // Not ordered by field: these rows become an object keyed by field, and an object
        // cannot carry an order. `path` is ordered so composite parts assemble the same
        // way every time.
        const rows = await (0, queries_1.readableBy)(executor(VALUES_TABLE).join(this.fields.table(executor), (0, queries_1.onField)(queries_1.FIELDS_TABLE, VALUES_TABLE)), audience)
            .whereIn(`${VALUES_TABLE}.member_id`, memberIds)
            .where(`${queries_1.FIELDS_TABLE}.status`, schema_1.FIELD_STATUS.active)
            .orderBy(`${VALUES_TABLE}.path`, 'asc')
            .select(`${VALUES_TABLE}.member_id`, `${queries_1.FIELDS_TABLE}.namespace`, `${queries_1.FIELDS_TABLE}.key`, `${queries_1.FIELDS_TABLE}.type`, `${VALUES_TABLE}.path`, `${VALUES_TABLE}.value_text`);
        const stored = [];
        for (const row of rows) {
            try {
                stored.push(schema_1.DbStoredValueRow.parse(row));
            }
            catch (err) {
                logging_1.default.warn({
                    event: { name: 'members.metafields.value_unreadable' },
                    err,
                    metafieldNamespace: row.namespace,
                    metafieldKey: row.key,
                    path: row.path,
                }, 'Skipping an unreadable metafield value');
            }
        }
        return (0, storage_1.valuesFromRows)(stored);
    }
    parseValues(input) {
        const parsed = ValuesInput.safeParse(input);
        if (!parsed.success) {
            throw new errors_1.default.ValidationError({
                message: 'Custom field values must be an object keyed by field identity.',
                property: identity_1.QUALIFIER,
            });
        }
        return parsed.data;
    }
    unwrapWire(input) {
        if (input === undefined) {
            return undefined;
        }
        if (typeof input !== 'object' || input === null || Array.isArray(input)) {
            throw new errors_1.default.ValidationError({
                message: 'Metafields must be an object keyed by namespace.',
                property: identity_1.QUALIFIER,
            });
        }
        const identified = {};
        for (const [namespace, values] of Object.entries(input)) {
            if (typeof values !== 'object' || values === null || Array.isArray(values)) {
                throw new errors_1.default.ValidationError({
                    message: 'Metafield values must be an object keyed by field key.',
                    property: [identity_1.QUALIFIER, namespace].join(identity_1.SEPARATOR),
                });
            }
            for (const [key, raw] of Object.entries(values)) {
                // Joined as text, not written by the codec: these segments are unchecked, and a write
                // naming a field that cannot exist is refused under the name it gave.
                identified[[namespace, key].join(identity_1.SEPARATOR)] = raw;
            }
        }
        return identified;
    }
    /**
     * Resolve input into the writes it implies, writing nothing. Returned so a caller can
     * validate before opening a transaction it would otherwise have to unwind, then apply
     * the same plan without re-resolving it.
     */
    async planWrite(input, audience) {
        const values = this.parseValues(input);
        const identities = Object.keys(values);
        // Bounded by the definitions ceiling, which also holds the lookup below inside
        // the driver's bound-parameter limit.
        const maxKeys = this.getMaxDefinitions();
        if (identities.length > maxKeys) {
            throw new errors_1.default.ValidationError({
                message: `Custom field values are limited to ${maxKeys} fields per request.`,
                property: identity_1.QUALIFIER,
            });
        }
        const byIdentity = await this.allowedFieldsByIdentity(identities, audience);
        const writes = [];
        // Gathered rather than thrown as they are found. A write names several values, and
        // a composite is several again, so refusing at the first leaves someone correcting
        // one part per round trip to learn what was wrong with the rest.
        const refusals = [];
        for (const [identity, raw] of Object.entries(values)) {
            const field = byIdentity.get(identity);
            if (!field) {
                refusals.push({
                    message: `Unknown custom field: ${identity}`,
                    property: wireProperty(identity),
                });
                continue;
            }
            // A different refusal from the unknown-field one above: this audience can
            // already see the field, so naming it discloses nothing.
            if (!(0, access_1.canWrite)(audience, field)) {
                refusals.push({
                    message: `Cannot set custom field: ${identity}`,
                    property: wireProperty(identity),
                });
                continue;
            }
            // `null` clears any field, and `''` clears one with no parts. For a value
            // with parts `''` names nothing, so it is left to fail validation rather than
            // being read as a silent delete.
            if (raw === null || (raw === '' && (0, metafield_types_1.partsOf)(field.type) === null)) {
                writes.push({ field });
                continue;
            }
            // Message only, no `context`: the API error handler moves a message into
            // `context` when `context` is empty and prepends it when it is not, so
            // anything added here reaches the client glued to the front of the reason.
            // Which field failed rides in `property`.
            const value = metafield_types_1.FIELD_TYPES[field.type].value.safeParse(raw);
            if (!value.success) {
                // Every issue, not the first: a value with parts fails once per part, and each
                // names the part it belongs to, which is what lets a client mark them all.
                for (const issue of value.error.issues) {
                    refusals.push({
                        message: issue.message,
                        property: [wireProperty(identity), ...issue.path].join(identity_1.SEPARATOR),
                    });
                }
                continue;
            }
            writes.push({ field, value: value.data });
        }
        if (refusals.length > 0) {
            throw refusalError(refusals);
        }
        return writes;
    }
    /**
     * Apply a plan from `planWrite`.
     *
     * A write touches the paths it names and nothing else, at every level: naming a path
     * with an empty value clears that part, naming the field with `null` clears all of
     * them, and saying nothing about a path leaves it alone. There is no whole-value
     * replace, so a caller that does not know about a field cannot erase it.
     *
     * `writtenBy` and `source` are required and have no default: every writer has to name
     * itself and where it wrote, so a new one cannot quietly inherit the identity of
     * whichever was written first.
     *
     * Always transactional. Given an executor it joins that transaction, so the importer's
     * failed value write takes its member with it; given none it opens its own.
     *
     * Every write also puts an entry on the member's activity feed, naming the fields it
     * touched and who wrote them where, in the same transaction, so the feed cannot name a
     * change that was not stored or miss one that was. A value has more than one author,
     * and the feed is where a publisher finds out which of them changed it.
     */
    async applyWrite(memberId, writes, { writtenBy, source, executor = this.knex }) {
        if (writes.length === 0) {
            return;
        }
        const apply = async (trx) => {
            // Built first, then sent as whole statements: a handful per member rather
            // than one per part, under one timestamp, because a write happened once
            // however many rows record it.
            const now = new Date();
            const clearedFields = [];
            const clearedPaths = [];
            const rows = [];
            for (const { field, value } of writes) {
                if (value === undefined) {
                    clearedFields.push(field);
                    continue;
                }
                const { set, cleared } = (0, storage_1.valueRowsToWrite)(value);
                if (cleared.length > 0) {
                    clearedPaths.push({ field, paths: cleared });
                }
                rows.push(...set.map((row) => ({
                    ...(0, queries_1.fieldReference)(field),
                    member_id: memberId,
                    path: row.path,
                    value_text: row.value_text,
                    written_by_type: writtenBy.type,
                    written_by_id: writtenBy.id,
                    created_at: now,
                    updated_at: now,
                })));
            }
            // One statement with a group per field, rather than a statement per field.
            if (clearedFields.length > 0) {
                await trx(VALUES_TABLE)
                    .where('member_id', memberId)
                    .where((builder) => {
                    for (const field of clearedFields) {
                        builder.orWhere((rowsOf) => rowsOf.where((0, queries_1.fieldReference)(field)));
                    }
                })
                    .del();
            }
            if (clearedPaths.length > 0) {
                await trx(VALUES_TABLE)
                    .where('member_id', memberId)
                    .where((builder) => {
                    for (const { field, paths } of clearedPaths) {
                        builder.orWhere((rowsOf) => rowsOf.where((0, queries_1.fieldReference)(field)).whereIn('path', paths));
                    }
                })
                    .del();
            }
            for (let from = 0; from < rows.length; from += UPSERT_CHUNK) {
                // Typed as the plain row because `merge` takes its columns as `keyof` the
                // builder's record, which for a composite table registration is the scope
                // names rather than the columns.
                await trx(VALUES_TABLE)
                    .insert(rows.slice(from, from + UPSERT_CHUNK))
                    // Naming the columns rather than giving values takes each from the row
                    // that lost the conflict, so every part updates to its own value.
                    .onConflict(VALUE_KEY)
                    // The writer is merged with the value, so a row names who wrote what
                    // it currently holds rather than who wrote its first value.
                    .merge(['value_text', 'written_by_type', 'written_by_id', 'updated_at']);
            }
            const fields = writes.map(({ field }) => ({
                namespace: field.namespace,
                key: field.key,
                name: field.name,
            }));
            await trx(CHANGE_EVENTS_TABLE).insert({
                id: new bson_objectid_1.default().toHexString(),
                member_id: memberId,
                written_by_type: writtenBy.type,
                written_by_id: writtenBy.id,
                source,
                metafields: schema_1.StoredFieldList.encode(fields),
                // A string rather than the Date the value rows take: SQLite stores a bound Date
                // as a number, which sorts before every string the feed pages through time with.
                created_at: (0, date_1.toDatabaseDate)(now),
            });
        };
        // knex's marker for a transactor: join it rather than nesting a savepoint under it.
        if (executor.isTransaction) {
            await apply(executor);
        }
        else {
            await executor.transaction(apply);
        }
    }
    /**
     * Entries from members' activity feeds, newest first, each with its member, as one page
     * of the members events endpoint reads them.
     *
     * `filter` is a parsed NQL filter over this table's own columns: mapping the feed's
     * names onto them is the feed's business, and applying them is this table's.
     */
    async browseChangeEvents({ limit, filter, }) {
        const filtered = () => {
            const query = this.knex(CHANGE_EVENTS_TABLE);
            return filter ? (0, queries_1.knexify)(query, filter, { tableName: CHANGE_EVENTS_TABLE }) : query;
        };
        // Joined rather than looked up afterwards: an entry cannot outlive its member, whose
        // delete cascades to it, so every entry has one to join.
        const newestFirst = filtered()
            .join(MEMBERS_TABLE, `${MEMBERS_TABLE}.id`, `${CHANGE_EVENTS_TABLE}.member_id`)
            .orderBy([
            { column: `${CHANGE_EVENTS_TABLE}.created_at`, order: 'desc' },
            { column: `${CHANGE_EVENTS_TABLE}.id`, order: 'desc' },
        ]);
        const page = limit === undefined ? newestFirst : newestFirst.limit(limit);
        const [rows, counted] = await Promise.all([
            page.select(`${CHANGE_EVENTS_TABLE}.id`, `${CHANGE_EVENTS_TABLE}.member_id`, `${CHANGE_EVENTS_TABLE}.written_by_type`, `${CHANGE_EVENTS_TABLE}.written_by_id`, `${CHANGE_EVENTS_TABLE}.source`, `${CHANGE_EVENTS_TABLE}.metafields`, `${CHANGE_EVENTS_TABLE}.created_at`, { member_uuid: `${MEMBERS_TABLE}.uuid` }, { member_name: `${MEMBERS_TABLE}.name` }, { member_email: `${MEMBERS_TABLE}.email` }),
            filtered().count({ total: '*' }).first(),
        ]);
        // What to do with an entry whose field list can't be read is decided here, not in the
        // parser: it is still shown, naming no fields. The feed pages through time a page per
        // event type, so dropping an entry would push a valid one off the end of its page for
        // good. Anything else a row can't be read for, the table's constraints rule out, so it
        // throws rather than being hidden.
        const events = rows.map(({ member_uuid: uuid, member_name: name, member_email: email, ...event }) => {
            const fields = schema_1.StoredFieldList.safeParse(event.metafields);
            if (!fields.success) {
                logging_1.default.warn({
                    event: { name: 'members.metafields.change_event_unreadable' },
                    err: fields.error,
                    changeEventId: event.id,
                }, 'Reading an unreadable metafield change entry as naming no fields');
            }
            return schema_1.DbMetafieldChangeEventWithMember.parse({
                event: fields.success ? event : { ...event, metafields: schema_1.StoredFieldList.encode([]) },
                member: { id: event.member_id, uuid, name, email },
            });
        });
        return { events, total: Number(counted?.total ?? 0) };
    }
}
exports.MetafieldValuesService = MetafieldValuesService;
