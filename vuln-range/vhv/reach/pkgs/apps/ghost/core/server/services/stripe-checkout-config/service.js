"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StripeCheckoutConfigService = void 0;
const bson_objectid_1 = __importDefault(require("bson-objectid"));
const errors_1 = __importDefault(require("@tryghost/errors"));
const zod_1 = require("zod");
const checkout_1 = require("@tryghost/checkout");
const identity_1 = require("@tryghost/metafield-types/identity");
const case_keys_1 = require("../../lib/case-keys");
const date_1 = require("../../lib/db-types/date");
const codec_1 = require("./codec");
const models_1 = require("./models");
const schema_1 = require("./schema");
const parse_request_1 = require("../../lib/parse-request");
const serializers_1 = require("./serializers");
// A `custom_field_key` is a key in the publisher's `custom` namespace, so the config reads and
// checks only the bindings and fields there.
const BINDINGS_TABLE = 'members_metafield_bindings';
/** A custom field that can take a value: not archived. */
const ACTIVE = 'active';
/**
 * How each collected part is saved: what it keeps in its column, and for each port its answers
 * come back through, the custom field its settings name.
 */
const PARTS = {
    shipping: {
        stored: (shipping) => ({
            tier_scope: tierScopeOf(shipping),
            allowed_countries: shipping.allowedCountries,
        }),
        destinations: [
            {
                port: checkout_1.STRIPE_PORT.shippingAddress,
                customFieldKey: (shipping) => shipping.addressCustomFieldKey,
                property: 'shipping.address.custom_field_key',
                wrongType: 'Choose an address custom field for the shipping address.',
                holds: 'the shipping address',
                essential: true,
            },
            {
                port: checkout_1.STRIPE_PORT.shippingName,
                customFieldKey: (shipping) => shipping.nameCustomFieldKey,
                property: 'shipping.name.custom_field_key',
                wrongType: "Choose a short text custom field for the recipient's name.",
                holds: "the recipient's name",
                // Without the name, the address is still kept.
                essential: false,
            },
        ],
    },
    phone: {
        stored: (phone) => ({ tier_scope: tierScopeOf(phone) }),
        destinations: [
            {
                port: checkout_1.STRIPE_PORT.phone,
                customFieldKey: (phone) => phone.customFieldKey,
                property: 'phone.custom_field_key',
                wrongType: 'Choose a short text custom field for the phone number.',
                holds: 'the phone number',
                essential: true,
            },
        ],
    },
    taxNumber: {
        stored: (taxNumber) => ({ tier_scope: tierScopeOf(taxNumber) }),
        // Stripe keeps the tax ID on the customer, so Ghost saves nothing from it.
        destinations: [],
    },
};
/** The ports the collected parts bind to custom fields, each with what its field holds. */
const PORT_HOLDS = new Map(models_1.COLLECTED_SECTIONS.flatMap((section) => PARTS[section].destinations.map(({ port, holds }) => [port, holds])));
const COLLECTED_PORTS = [...PORT_HOLDS.keys()];
function tierScopeOf({ tierIds }) {
    return tierIds ? 'selected_paid' : 'all_paid';
}
/** What saving the parts in a request settles, for the parts it includes. */
function changesOf(requested) {
    return models_1.COLLECTED_SECTIONS.flatMap((section) => {
        const settings = requested[section];
        return settings === undefined ? [] : [changeOf(section, settings)];
    });
}
function changeOf(section, settings) {
    return {
        section,
        targets: settings && {
            tierIds: settings.tierIds,
            destinations: PARTS[section].destinations.map(({ port, customFieldKey, property, wrongType, holds }) => ({
                port,
                customFieldKey: customFieldKey(settings),
                property,
                wrongType,
                holds,
            })),
        },
    };
}
/** What the collected parts in a request keep in their columns, by part. */
function storedColumns(requested) {
    const columns = {};
    const store = (section) => {
        const settings = requested[section];
        if (settings !== undefined) {
            columns[section] = settings && PARTS[section].stored(settings);
        }
    };
    models_1.COLLECTED_SECTIONS.forEach(store);
    return columns;
}
/**
 * One row of the config read: the row's parts, one tier a collected part names and that tier
 * again only if it is paid (or nulls), and one port the collected parts bind with its field,
 * and that field again only while it is active (or nulls). A config whose parts name several
 * tiers or bind several ports comes back as a row for each pairing.
 */
const ReadRow = schema_1.DbConfigParts.extend({
    section: schema_1.DbSection.nullable(),
    paid_tier_id: zod_1.z.string().nullable(),
    port: zod_1.z.enum(checkout_1.STRIPE_PORTS).nullable(),
    bound_key: zod_1.z.nullable(identity_1.KeySchema),
    active_key: zod_1.z.string().nullable(),
    active_type: zod_1.z.string().nullable(),
});
/** The custom field each port is bound to, as the read found them. */
function boundFields(rows) {
    const bound = new Map();
    for (const row of rows) {
        if (row.port && row.bound_key) {
            bound.set(row.port, {
                customFieldKey: row.bound_key,
                // Ready while the field is active and still holds what the port supplies.
                ready: row.active_key !== null && row.active_type === checkout_1.PORT_FIELD[row.port].type,
            });
        }
    }
    return bound;
}
const LockedTier = zod_1.z.object({ id: zod_1.z.string(), type: zod_1.z.string() });
const LockedField = zod_1.z.object({ key: identity_1.KeySchema, type: zod_1.z.string(), status: zod_1.z.string() });
const LockedBinding = zod_1.z.object({ port: zod_1.z.enum(checkout_1.STRIPE_PORTS), metafield_key: identity_1.KeySchema });
/** Reads and saves the site-wide Stripe Checkout config. */
class StripeCheckoutConfigService {
    knex;
    recordAction;
    bindings;
    fields;
    configRow;
    constructor({ knex, recordAction, bindings, fields, logging, }) {
        this.knex = knex;
        this.recordAction = recordAction;
        this.bindings = bindings;
        this.fields = fields;
        this.configRow = (0, codec_1.configRow)(logging);
    }
    /**
     * Reads the config, without caching it, in one query over the row and what it points at.
     *
     * A collected part only counts the named tiers that are paid, and reads as off when it is
     * limited to tiers that have all been deleted, never widening to every tier. Any of its fields
     * being deleted takes its binding with it, which also reads as off.
     */
    async read() {
        const { config } = await this.readSaved();
        return config;
    }
    /**
     * Reads the config as checkouts use it: the design, and for each collected part the tiers it
     * asks on and whether it can ask right now.
     *
     * Parts given unsaved take the place of the saved ones, refused as saving them would be, so a
     * preview asks for each part exactly as checkouts would once it was saved. Nothing is written.
     */
    async readForCheckout(unsaved = {}) {
        const changes = changesOf(unsaved);
        // Checked in the same transaction as the read, so both see the same tiers and fields.
        const { named, saved } = changes.length
            ? await this.knex.transaction(async (trx) => ({
                named: await assertTargets(trx, changes, this.fields),
                saved: await this.readSaved(trx),
            }))
            : { named: new Map(), saved: await this.readSaved() };
        const config = { ...saved.config, ...unsaved };
        const bound = new Map([...saved.bound, ...named]);
        return {
            design: config.design,
            shipping: config.shipping && {
                tierIds: config.shipping.tierIds,
                allowedCountries: config.shipping.allowedCountries,
                collectable: collectableFrom('shipping', bound),
            },
            phone: config.phone && {
                tierIds: config.phone.tierIds,
                collectable: collectableFrom('phone', bound),
            },
            taxNumber: config.taxNumber && {
                tierIds: config.taxNumber.tierIds,
                collectable: collectableFrom('taxNumber', bound),
            },
        };
    }
    /** The config as saved, and the custom field each port is bound to. */
    async readSaved(db = this.knex) {
        const rows = zod_1.z.array(ReadRow).parse(await db(`${schema_1.CONFIG_TABLE} as config`)
            // Every part's tiers in one join and every port in another, so the rows grow with the
            // tiers times the ports, rather than with a join per part and per port multiplied
            // together.
            .leftJoin(`${schema_1.CONFIG_TIERS_TABLE} as named`, (join) => join.onIn('named.section', models_1.COLLECTED_SECTIONS.map((section) => zod_1.z.encode(schema_1.DbSection, section))))
            .leftJoin('products as tier', (join) => join.on('tier.id', '=', 'named.product_id').andOnVal('tier.type', '=', 'paid'))
            .leftJoin(`${BINDINGS_TABLE} as binding`, (join) => join
            .onIn('binding.port', COLLECTED_PORTS)
            .andOnVal('binding.metafield_namespace', '=', identity_1.CUSTOM_NAMESPACE))
            .leftJoin(this.fields.table(db, 'field'), (join) => join
            .on('field.namespace', '=', 'binding.metafield_namespace')
            .andOn('field.key', '=', 'binding.metafield_key')
            .andOnVal('field.status', '=', ACTIVE))
            .where('config.slug', schema_1.CONFIG_SLUG)
            .select(...schema_1.DbConfigParts.keyof().options.map((column) => `config.${column}`), 'named.section', 'tier.id as paid_tier_id', 'binding.port', 'binding.metafield_key as bound_key', 'field.key as active_key', 'field.type as active_type'));
        const [first] = rows;
        const bound = boundFields(rows);
        if (!first) {
            return { config: { design: null, shipping: null, phone: null, taxNumber: null }, bound };
        }
        const { design, shipping, phone, tax_number: taxNumber } = zod_1.z.decode(this.configRow, first);
        return {
            config: {
                design,
                shipping: shipping && shippingFrom(shipping, tierIdsOf('shipping', shipping, rows), bound),
                phone: phone && phoneFrom(tierIdsOf('phone', phone, rows), bound),
                taxNumber: taxNumber && taxNumberFrom(tierIdsOf('taxNumber', taxNumber, rows)),
            },
            bound,
        };
    }
    /**
     * Saves the parts of the config that the request includes, and records the save in the staff
     * history.
     *
     * The tiers and fields the collected parts name are checked inside the same transaction as
     * the write, with their rows locked, so nothing can change between the check and the write.
     */
    async edit(context, input) {
        const { design, ...requested } = (0, parse_request_1.parseRequest)(serializers_1.CheckoutConfigInput, input, 'checkout_config');
        // Only the parts in the request are written, so saving one part never overwrites another.
        const changes = changesOf(requested);
        const columns = zod_1.z.encode(this.configRow.partial(), {
            ...(design === undefined ? {} : { design }),
            ...(0, case_keys_1.snakeKeys)(storedColumns(requested)),
        });
        const at = new Date();
        const now = (0, date_1.toDatabaseDate)(at);
        await this.knex.transaction(async (trx) => {
            await assertTargets(trx, changes, this.fields);
            await trx(schema_1.CONFIG_TABLE)
                .insert({
                id: new bson_objectid_1.default().toHexString(),
                slug: schema_1.CONFIG_SLUG,
                created_at: now,
                updated_at: now,
                ...columns,
            })
                .onConflict('slug')
                .merge({ ...columns, updated_at: now });
            for (const change of changes) {
                await this.writeTargets(trx, change, at);
            }
        });
        // An existing row keeps its id, so read the id back for the history entry.
        const saved = await this.knex(schema_1.CONFIG_TABLE).where('slug', schema_1.CONFIG_SLUG).first('id');
        if (!saved) {
            throw new errors_1.default.InternalServerError({
                message: 'The Stripe Checkout config was not found right after saving it.',
            });
        }
        await this.recordAction({ context, subject: saved.id });
    }
    /**
     * Settles which tiers a collected part is limited to and which fields it lands in. Switched
     * off, it keeps neither, so turning it back on doesn't inherit old tiers or fields.
     */
    async writeTargets(trx, { section, targets }, now) {
        const name = zod_1.z.encode(schema_1.DbSection, section);
        await trx(schema_1.CONFIG_TIERS_TABLE).where('section', name).del();
        if (targets?.tierIds) {
            await trx(schema_1.CONFIG_TIERS_TABLE).insert(targets.tierIds.map((productId) => ({ section: name, product_id: productId })));
        }
        if (targets) {
            for (const { port, customFieldKey } of targets.destinations) {
                await this.bindings.bind(trx, port, { namespace: identity_1.CUSTOM_NAMESPACE, key: customFieldKey }, now);
            }
        }
        else {
            for (const { port } of PARTS[section].destinations) {
                await this.bindings.remove(trx, port);
            }
        }
    }
}
exports.StripeCheckoutConfigService = StripeCheckoutConfigService;
/**
 * The tiers a collected part is limited to as the read found them: null for every paid tier,
 * and empty once every tier it named has been deleted.
 */
function tierIdsOf(section, { tier_scope: tierScope }, rows) {
    if (tierScope === 'all_paid') {
        return null;
    }
    return [
        ...new Set(rows.flatMap((row) => row.section === section && row.paid_tier_id ? [row.paid_tier_id] : [])),
    ];
}
/** Shipping as the read found it, or null when what it points at is gone. */
function shippingFrom(stored, tierIds, bound) {
    const address = bound.get(checkout_1.STRIPE_PORT.shippingAddress);
    const name = bound.get(checkout_1.STRIPE_PORT.shippingName);
    if (!address || !name || tierIds?.length === 0) {
        return null;
    }
    return {
        tierIds,
        allowedCountries: stored.allowed_countries,
        addressCustomFieldKey: address.customFieldKey,
        nameCustomFieldKey: name.customFieldKey,
    };
}
/** The phone number settings as the read found them, or null when what they point at is gone. */
function phoneFrom(tierIds, bound) {
    const field = bound.get(checkout_1.STRIPE_PORT.phone);
    if (!field || tierIds?.length === 0) {
        return null;
    }
    return { tierIds, customFieldKey: field.customFieldKey };
}
/** The tax ID settings as the read found them, or null once every tier they named is gone. */
function taxNumberFrom(tierIds) {
    return tierIds?.length === 0 ? null : { tierIds };
}
/** Whether checkouts can ask for a part: while every field it can't do without can take a value. */
function collectableFrom(section, bound) {
    return PARTS[section].destinations.every(({ port, essential }) => !essential || bound.get(port)?.ready === true);
}
/**
 * Refuses tiers and custom fields the collected parts can't use, checking every part in one
 * pass. The tiers, the fields and the current bindings are locked until the write commits.
 *
 * A part names paid tiers or none. A free tier has no checkout, so naming one would be a
 * setting that looks saved and does nothing. An archived paid tier is accepted, so it keeps its
 * place for when it is restored.
 *
 * A custom field has to exist, be active unless it is the one already chosen, and be the type
 * its port supplies. A publisher who named a field meant that field, so being told now beats
 * finding out later that nothing was saved. Each port needs a field of its own, as two ports
 * writing one field would overwrite each other on every checkout.
 *
 * Returns the custom field each port the parts name would be bound to once saved.
 */
async function assertTargets(trx, changes, fieldReads) {
    const switchedOn = changes.flatMap(({ section, targets }) => targets ? [{ section, ...targets }] : []);
    if (!switchedOn.length) {
        return new Map();
    }
    const tierIds = [...new Set(switchedOn.flatMap((part) => part.tierIds ?? []))];
    const tiers = tierIds.length
        ? zod_1.z
            .array(LockedTier)
            .parse(await trx('products').whereIn('id', tierIds).select('id', 'type').forShare())
        : [];
    const typeOfTier = new Map(tiers.map((tier) => [tier.id, tier.type]));
    for (const { section, tierIds: named } of switchedOn) {
        const unusable = named?.find((id) => typeOfTier.get(id) !== 'paid');
        if (unusable) {
            throw new errors_1.default.ValidationError({
                message: typeOfTier.has(unusable)
                    ? `Only paid tiers have a checkout to collect a ${models_1.COLLECTED_NOUNS[section]} at.`
                    : `Unknown tier: ${unusable}`,
                property: `${models_1.SECTION_NAMES[section]}.tier_ids`,
            });
        }
    }
    const destinations = switchedOn.flatMap((part) => part.destinations);
    const fields = zod_1.z.array(LockedField).parse(await fieldReads
        .locked(trx, identity_1.CUSTOM_NAMESPACE, destinations.map((destination) => destination.customFieldKey))
        .select('key', 'type', 'status'));
    const bindings = zod_1.z
        .array(LockedBinding)
        .parse(await trx(BINDINGS_TABLE)
        .whereIn('port', COLLECTED_PORTS)
        .where('metafield_namespace', identity_1.CUSTOM_NAMESPACE)
        .select('port', 'metafield_key')
        .forUpdate());
    const chosen = new Map(bindings.map((binding) => [binding.port, binding.metafield_key]));
    for (const { port, customFieldKey, property, wrongType } of destinations) {
        const field = fields.find((candidate) => candidate.key === customFieldKey);
        if (!field) {
            throw new errors_1.default.ValidationError({
                message: 'Choose a custom field the site already has.',
                property,
            });
        }
        // Keeping a field that was archived after it was chosen is allowed, so a client can save
        // back what it read. Nothing is written to it while it stays archived.
        if (field.status !== ACTIVE && chosen.get(port) !== customFieldKey) {
            throw new errors_1.default.ValidationError({
                message: 'An archived custom field cannot receive collected data. Restore it first.',
                property,
            });
        }
        if (field.type !== checkout_1.PORT_FIELD[port].type) {
            throw new errors_1.default.ValidationError({ message: wrongType, property });
        }
    }
    // Only once every field could take its value, so a field of the wrong type says so first.
    // The fields the parts left out of the request keep saving into count too.
    const replaced = new Set(changes.flatMap(({ section }) => PARTS[section].destinations.map(({ port }) => port)));
    const saving = [
        ...bindings
            .filter(({ port }) => !replaced.has(port))
            .map(({ port, metafield_key: customFieldKey }) => ({ port, customFieldKey })),
        ...destinations,
    ];
    for (const { port, customFieldKey, property } of destinations) {
        const sharing = saving.find((other) => other.port !== port && other.customFieldKey === customFieldKey);
        if (sharing) {
            throw new errors_1.default.ValidationError({
                message: `That custom field already holds ${PORT_HOLDS.get(sharing.port)}. Choose another.`,
                property,
            });
        }
    }
    return new Map(destinations.map(({ port, customFieldKey }) => [
        port,
        {
            customFieldKey,
            // Each field was checked to be the type its port supplies, so only an archived one
            // kept from before can't take a value.
            ready: fields.some((field) => field.key === customFieldKey && field.status === ACTIVE),
        },
    ]));
}
