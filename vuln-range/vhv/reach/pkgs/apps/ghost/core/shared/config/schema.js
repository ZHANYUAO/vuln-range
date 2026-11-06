"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configSchema = void 0;
const zod_1 = require("zod");
/**
 * The validated shape of Ghost's config.
 *
 * A key is listed here once it has a real schema. `config.get()` then returns
 * that key's validated, deep-frozen value with a real type, at every existing
 * call site - no call-site change is needed. Keys that are not listed still come
 * through at runtime (the object is loose) and still read straight from nconf,
 * typed `any` as they always have been.
 *
 * Two rules keep this safe to grow against config that is already running:
 *
 * 1. Validate, don't transform - for now. `z.object()` strips unknown keys and
 *    `z.coerce` rewrites values; either would silently change a live site's
 *    config, and the round-trip test in the unit suite fails if one does.
 *    Secrets are deliberately left unparsed by ./secrets.ts - a password of
 *    `01234` must stay a string. Deliberate transforms can come later, but they
 *    need `get()` rerouted by top-level key first, so a raw read of an unlisted
 *    sibling path can't disagree with a transformed one.
 * 2. Nothing here may be stricter than what the loader already enforced.
 *    Tightening beyond that is its own change, with its own release note.
 */
exports.configSchema = zod_1.z.looseObject({
    /**
     * Only as strict as the `checkUrlProtocol` assertion that has always run at
     * the end of the config load - anything this rejects, boot already rejected.
     */
    url: zod_1.z
        .string()
        .regex(/^https?:\/\//i, {
        message: 'URL in config must be provided with protocol, eg. "http://my-ghost-blog.com"',
    })
        .meta({
        description: "The site's public URL, including protocol. A path is a subdirectory install.",
        examples: ['https://example.com', 'https://example.com/blog'],
    }),
    /**
     * Set by the loader from `getNodeEnv()`, so always a non-empty string. Not an
     * enum: Ghost runs under custom NODE_ENV values (`testing-mysql`, and whatever
     * an embedder picks) and rejecting those would be a boot failure.
     */
    env: zod_1.z
        .string()
        .min(1)
        .meta({
        description: 'The environment Ghost is running as, from NODE_ENV. Set by the loader, not by a config file.',
        examples: ['production', 'development'],
    }),
    /**
     * Where Ghost looks for its own code, its bundled assets and the site's
     * content.
     *
     * Every key here is supplied in-repo - ten by overrides.json, which no store
     * can override, and four by defaults.json - so all of them are present in any
     * loaded config. An env config narrows a value; none removes a key.
     *
     * The values are absolute by the time anything reads them:
     * `makePathsAbsolute` rewrites the whole subtree in ./loader.ts before
     * createConfig sees it. That ordering is load-bearing, and the transform still
     * lives in ./utils.ts rather than here - see SCHEMA.md.
     *
     * Closed, unlike the top level, because every reader is in this repo and reads
     * a key named here: no `paths:<key>` read anywhere in the monorepo is missing
     * from this list, none is built at runtime, and an adapter is handed only its
     * own config block, never the paths tree. So `z.object` strips nothing a real
     * boot produces - checked against every shipped env config - and in exchange
     * the type matches the runtime exactly, which makes
     * `config.get('paths').contentPatth` a compile error rather than `unknown`.
     *
     * The consequence to know: a key added to config but not to this list is
     * dropped, silently. Add both.
     */
    paths: zod_1.z.object({
        appRoot: zod_1.z.string().meta({ description: "Ghost's own install directory." }),
        corePath: zod_1.z.string().meta({ description: "Ghost's core/ directory." }),
        contentPath: zod_1.z.string().meta({
            description: "The site's content directory: themes, images, adapters, settings. The one path a self-hoster normally sets.",
            examples: ['/var/www/ghost/content'],
        }),
        assetSrc: zod_1.z.string().meta({ description: 'Frontend asset sources.' }),
        adminAssets: zod_1.z.string().meta({ description: 'Built Admin client assets.' }),
        helperTemplates: zod_1.z.string().meta({ description: 'Templates for theme helpers.' }),
        defaultViews: zod_1.z.string().meta({ description: "Ghost's own server-rendered views." }),
        defaultRouteSettings: zod_1.z.string().meta({ description: 'The default routes.yaml.' }),
        internalAppPath: zod_1.z.string().meta({ description: 'Bundled frontend apps.' }),
        internalAdaptersPath: zod_1.z.string().meta({ description: 'Bundled adapter implementations.' }),
        /**
         * The one key here with no default: an escape hatch for Docker builds that
         * install adapters outside the bind-mounted content directory. Only a
         * self-hoster's own config supplies it, so it is optional.
         */
        installedAdaptersPath: zod_1.z.string().optional().meta({
            description: 'Extra adapter lookup path, for images that install adapters outside content/.',
        }),
        migrationPath: zod_1.z.string().meta({ description: 'Database migrations, read by knex-migrator.' }),
        publicFilePath: zod_1.z.string().meta({ description: 'Files served at the site root.' }),
        fixtures: zod_1.z.string().meta({ description: 'Fixture data loaded on a fresh install.' }),
        defaultSettings: zod_1.z
            .string()
            .meta({ description: 'Default settings loaded on a fresh install.' }),
    }),
});
