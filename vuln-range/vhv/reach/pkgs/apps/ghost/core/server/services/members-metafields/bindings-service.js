"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetafieldBindingsService = void 0;
const bson_objectid_1 = __importDefault(require("bson-objectid"));
const logging_1 = __importDefault(require("@tryghost/logging"));
const zod_1 = require("zod");
const identity_1 = require("@tryghost/metafield-types/identity");
const access_1 = require("./access");
const queries_1 = require("./queries");
const schema_1 = require("./schema");
const BINDINGS_TABLE = 'members_metafield_bindings';
/**
 * Where a source sends what it collected: a `port` is the name that source uses for a
 * thing, and the binding resolves it to one of the publisher's fields.
 */
class MetafieldBindingsService {
    knex;
    fields;
    values;
    constructor({ knex, fields, values, }) {
        this.knex = knex;
        this.fields = fields;
        this.values = values;
    }
    async bind(db, port, field, now) {
        const existing = await db(BINDINGS_TABLE).where({ port }).first();
        if (existing?.metafield_namespace === field.namespace && existing.metafield_key === field.key) {
            await db(BINDINGS_TABLE).where('id', existing.id).update({ updated_at: now });
            return existing.id;
        }
        if (existing) {
            await db(BINDINGS_TABLE).where('id', existing.id).del();
        }
        const bindingId = new bson_objectid_1.default().toHexString();
        await db(BINDINGS_TABLE).insert({
            id: bindingId,
            port,
            ...(0, queries_1.fieldReference)(field),
            created_at: now,
            updated_at: now,
        });
        return bindingId;
    }
    /** Stops the writing. Whatever hangs off the binding cascades with it. */
    async remove(db, port) {
        await db(BINDINGS_TABLE).where({ port }).del();
    }
    /**
     * Plans the values a processor collected on Ghost's behalf and sent back.
     *
     * Nobody supplied these in a sense the site can name — a payment page asked, and a
     * machine reported the answers — so what is recorded against them is the binding that
     * routed each one. That resolves back to what it was collected as and the field it
     * landed in, which is everything worth knowing about how the value arrived.
     */
    async planCollected(collected) {
        return this.planThrough(collected, (binding) => ({
            writtenBy: { type: 'binding', id: binding.bindingId },
            source: 'checkout',
        }));
    }
    /**
     * Plans values a member supplied about themselves, through the same ports a checkout uses.
     *
     * A member typing their own address into a form is answerable for it in a way no
     * routing is, and a record saying a binding wrote it would be wrong. The member is the
     * one whose record this is, so there is nobody else it could be.
     */
    async planSuppliedByMember(memberId, supplied) {
        return this.planThrough(supplied, () => ({
            writtenBy: { type: 'member', id: memberId },
            source: 'checkout',
        }));
    }
    /**
     * Plans come back in the order values arrive, which is the order to apply them: where
     * two land in one field, the last of them is what the field holds.
     *
     * Every value is attempted, and the first failure is returned alongside the plans for
     * the rest. Attempting them all is this method's business: one refused answer must not
     * cost a publisher the address a courier needs, and the values have nothing to do with
     * each other beyond arriving together. Whether the failure is worth acting on is the
     * caller's — a checkout webhook has already taken the money and must never fail, while
     * a member filling in a form is owed the news.
     */
    async planThrough(values, attribute) {
        const plans = [];
        let failure;
        for (const { port, value } of values) {
            try {
                // Inside, because working out where a value goes can fail the same way checking
                // it can, and a value nobody could place is no more reason to abandon the rest
                // than one the catalog refused.
                const destination = await this.resolve(port);
                if (!destination) {
                    continue;
                }
                // Internal: what may be set is bounded by the binding rather than by who is
                // looking. A port exists because a publisher pointed it at a field, and that
                // decision is what admits the value, whoever supplied it.
                const writes = await this.values.planWrite({
                    [zod_1.z.encode(identity_1.IdentityTextSchema, {
                        namespace: destination.namespace,
                        key: destination.key,
                        parts: [],
                    })]: value,
                }, access_1.INTERNAL);
                plans.push({ writes, origin: attribute(destination) });
            }
            catch (err) {
                failure = failure ?? err;
            }
        }
        return { plans, failure };
    }
    async resolve(port) {
        const row = await this.knex(BINDINGS_TABLE)
            .join(this.fields.table(this.knex), (0, queries_1.onField)(queries_1.FIELDS_TABLE, BINDINGS_TABLE))
            .where(`${BINDINGS_TABLE}.port`, port)
            // An archived destination is still where this goes, and still not somewhere a value
            // can land, so the write drops rather than waiting.
            .where(`${queries_1.FIELDS_TABLE}.status`, schema_1.FIELD_STATUS.active)
            .select(`${BINDINGS_TABLE}.id as binding_id`, `${queries_1.FIELDS_TABLE}.namespace`, `${queries_1.FIELDS_TABLE}.key`, `${queries_1.FIELDS_TABLE}.type`)
            .first();
        if (!row) {
            return null;
        }
        // Decoded rather than trusted: a join is a read boundary, and `type` is what decides
        // how the collected value is read. Unreadable counts as unresolved rather than
        // throwing, so one bad row skips its value the way an unbound port does instead of
        // failing everything else the same checkout collected.
        const bound = schema_1.DbBoundField.safeParse(row);
        if (!bound.success) {
            logging_1.default.warn({
                event: { name: 'members.metafields.binding_unreadable' },
                err: bound.error,
                port,
            }, 'A binding could not be read');
            return null;
        }
        return {
            bindingId: bound.data.binding_id,
            namespace: bound.data.namespace,
            key: bound.data.key,
            type: bound.data.type,
        };
    }
}
exports.MetafieldBindingsService = MetafieldBindingsService;
