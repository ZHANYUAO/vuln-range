"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deepFreeze = deepFreeze;
exports.validateConfig = validateConfig;
exports.createConfig = createConfig;
const lodash_1 = __importDefault(require("lodash"));
const zod_1 = require("zod");
const config_url_helpers_1 = require("@tryghost/config-url-helpers");
const helpers_1 = require("./helpers");
const guard_1 = require("./guard");
const schema_1 = require("./schema");
/**
 * Recursively freeze a plain-data tree in place. Only safe on a structure
 * nothing else holds a reference to, and an already-frozen subtree is left
 * alone, children included.
 */
function deepFreeze(value) {
    if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
        return value;
    }
    Object.freeze(value);
    for (const child of Object.values(value)) {
        deepFreeze(child);
    }
    return value;
}
/**
 * Whether a schema violation is fatal.
 *
 * Only the environments this repo runs itself are strict: a schema mistake here
 * should fail a developer's boot or CI, not a live site's. Ghost(Pro) injects
 * config through environment variables this repo cannot see, and self-hosters
 * and embedders pick their own NODE_ENV (`staging`, whatever else), so anything
 * unrecognised warns rather than turning into a boot crash-loop.
 *
 * `GHOST_CONFIG_SCHEMA_STRICT` overrides in either direction, which is how a
 * production deploy opts in once it trusts the schema.
 *
 * @TODO: removing this flag retires checkUrlProtocol() in ./utils.ts with it,
 * and makes every required key a hard boot failure everywhere - which is only
 * safe once the schema is known to match what Ghost(Pro) and self-hosters
 * actually supply.
 *
 * `startsWith('test')` matches `isTestEnv()` in ./helpers.ts, covering `testing`
 * and `testing-mysql`.
 */
function isStrict(env) {
    const override = process.env.GHOST_CONFIG_SCHEMA_STRICT;
    if (override !== undefined) {
        return override === 'true';
    }
    return env === 'development' || env.startsWith('test');
}
/**
 * Make a validated tree read-only: frozen in production, proxied in the
 * environments this repo runs itself so a write throws rather than being
 * dropped. See ./guard.ts.
 */
function readOnly(tree) {
    return ((0, guard_1.shouldGuard)(String(tree.env)) ? (0, guard_1.guardReadOnly)(tree) : deepFreeze(tree));
}
/**
 * Validate a config tree and make it read-only.
 *
 * Takes ownership of the tree: it is frozen in place, and zod passes keys the
 * schema does not name straight through by reference, so a shared tree would be
 * frozen out from under its other owner.
 */
function validateConfig(tree) {
    const result = schema_1.configSchema.safeParse(tree);
    if (result.success) {
        return readOnly(result.data);
    }
    const report = zod_1.z.prettifyError(result.error);
    if (isStrict(String(tree.env))) {
        // new Error is allowed here, as we do not want config to depend on @tryghost/error
        // oxlint-disable-next-line ghost/ghost-custom/no-native-error
        throw new Error(`Ghost config failed validation:\n${report}`);
    }
    // eslint-disable-next-line no-console
    console.error(`Ghost config failed validation (not enforced in the ${tree.env} environment):\n${report}`);
    return readOnly(tree);
}
const MISS = Symbol('config.miss');
/** A key that is present but undefined is a hit, not a miss. */
function lookup(root, key) {
    let node = root;
    for (const segment of key.split(':')) {
        if (node === null || typeof node !== 'object' || !(segment in node)) {
            return MISS;
        }
        node = node[segment];
    }
    return node;
}
/**
 * Write a key path into a tree, copying each level on the way down.
 *
 * The copy is unconditional, because an override's value is written into every
 * later tree by reference and may be an object a caller still holds - usually
 * one a test read back out of config. Writing a deeper path in place would
 * reach back through both. Copying only when a level is frozen looks equivalent
 * but is not: under the guard nothing is frozen, so the same nested override
 * would mutate what an earlier `get()` returned.
 */
function writePath(tree, key, value) {
    const segments = key.split(':');
    const leaf = segments.pop();
    let node = tree;
    for (const segment of segments) {
        const child = node[segment];
        if (child === null || typeof child !== 'object') {
            node[segment] = {};
        }
        else {
            node[segment] = Array.isArray(child) ? [...child] : { ...child };
        }
        node = node[segment];
    }
    node[leaf] = value;
}
/**
 * Build Ghost's config from a merged source tree.
 *
 * nconf layers the sources (see ./loader.ts) and is then done with: the frozen,
 * validated tree this returns is the only representation anything reads. One
 * representation is what makes the whole config immutable rather than only the
 * part a schema names, and what will let the schema transform values later
 * without a raw read disagreeing with a transformed one.
 */
function createConfig(sources) {
    const base = structuredClone(sources);
    const overrides = new Map();
    function build() {
        const tree = structuredClone(base);
        for (const [key, value] of overrides) {
            writePath(tree, key, value);
        }
        return validateConfig(tree);
    }
    let current = build();
    function rebuild() {
        current = build();
    }
    const config = {
        get(key) {
            if (key === undefined) {
                return current;
            }
            const found = lookup(current, key);
            return found === MISS ? undefined : found;
        },
        set(key, value) {
            // Cloned first, before anything is recorded: cloning can throw - on a
            // value with a throwing getter, say - and doing it here means that throw
            // cannot leave `overrides` half-updated. cloneDeep rather than
            // structuredClone, because under the guard this value may be a proxy and
            // structuredClone rejects those.
            //
            // The clone itself is needed because rebuild() makes whatever ends up in
            // the tree read-only, and this value is the caller's own object.
            const cloned = lodash_1.default.cloneDeep(value);
            const previous = new Map(overrides);
            // deleted first so the key moves to the end: overrides replay in
            // insertion order, and Map.set on an existing key keeps its old position,
            // which would let an earlier write beat this one. Setting `paths` after
            // `paths:contentPath` has to win, as it does in nconf.
            overrides.delete(key);
            overrides.set(key, cloned);
            try {
                rebuild();
            }
            catch (err) {
                // a rejected override must not stay recorded, or every later set()
                // reapplies it and throws again
                overrides.clear();
                for (const [existingKey, existingValue] of previous) {
                    overrides.set(existingKey, existingValue);
                }
                rebuild();
                throw err;
            }
        },
        reset() {
            overrides.clear();
            rebuild();
        },
    };
    Object.defineProperty(config, 'validated', {
        get: () => current,
        enumerable: true,
        configurable: true,
    });
    (0, config_url_helpers_1.bindAll)(config);
    (0, helpers_1.bindAll)(config);
    return config;
}
