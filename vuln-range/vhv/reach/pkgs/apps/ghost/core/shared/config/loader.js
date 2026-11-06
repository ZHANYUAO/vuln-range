"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadNconf = loadNconf;
const nconf_1 = __importDefault(require("nconf"));
const node_path_1 = __importDefault(require("node:path"));
const localUtils = __importStar(require("./utils"));
const secrets_1 = require("./secrets");
const validated_1 = require("./validated");
const _debug = require('@tryghost/debug')._base;
const debug = _debug('ghost:config');
function loadNconf(options) {
    debug('config start');
    const env = localUtils.getNodeEnv();
    options = options || {};
    const baseConfigPath = options.baseConfigPath || __dirname;
    const customConfigPath = options.customConfigPath || process.cwd();
    const nconf = new nconf_1.default.Provider();
    // ## Load Config
    // no channel can override the overrides
    nconf.file('overrides', node_path_1.default.join(baseConfigPath, 'overrides.json'));
    // command line arguments take precedence, then secret files, then environment variables
    nconf.argv();
    // secrets are not parsed - a password like `01234` must stay a string
    nconf.add('secrets', { type: 'literal', store: (0, secrets_1.loadSecretsFromEnv)() });
    nconf.env({
        separator: '__',
        parseValues: true,
        // the secrets store has already resolved these, so keep the file paths themselves
        // out of config - otherwise e.g. `database:connection` gains a bogus `password_FILE` key
        transform: ({ key, value }) => (0, secrets_1.isSecretFileRef)(key) ? false : { key, value },
    });
    // Now load various config json files
    nconf.file('custom-env', node_path_1.default.join(customConfigPath, 'config.' + env + '.json'));
    if (!env.startsWith('testing')) {
        if (process.env.GHOST_DEV_IS_DOCKER === 'true') {
            nconf.file('docker-env', node_path_1.default.join(baseConfigPath, 'env', 'config.development.docker.json'));
        }
        nconf.file('local-env', node_path_1.default.join(customConfigPath, 'config.local.json'));
        nconf.file('local-env-jsonc', {
            file: node_path_1.default.join(customConfigPath, 'config.local.jsonc'),
            format: localUtils.jsoncFormat,
        });
    }
    nconf.file('default-env', node_path_1.default.join(baseConfigPath, 'env', 'config.' + env + '.json'));
    // Finally, we load defaults, if nothing else has a value this will
    nconf.file('defaults', node_path_1.default.join(baseConfigPath, 'defaults.json'));
    for (const name of ['overrides', 'docker-env', 'default-env', 'defaults']) {
        localUtils.makeBundledDatabasePathsAbsolute(nconf.stores[name]?.store);
    }
    // ## Hand over
    // nconf's job ends here: it layered the sources. Everything below works on
    // the merged plain tree, and the validated, frozen tree createConfig returns
    // is the only representation anything reads from now on. See ./schema.ts.
    const tree = localUtils.mergeStores(nconf);
    // ## Sanitization
    // transform all relative paths to absolute paths
    localUtils.makePathsAbsolute(tree.paths);
    localUtils.sanitizeDatabaseProperties(tree.database);
    // Check if the URL in config has a protocol
    localUtils.checkUrlProtocol(tree.url);
    // Ensure that the content path exists
    localUtils.doesContentPathExist(tree.paths?.contentPath);
    // ## Other Stuff!
    // Manually set values
    tree.env = env;
    // To output this, use DEBUG=ghost:*,ghost-config
    if (_debug.enabled('ghost-config')) {
        debug(tree);
    }
    debug('config end');
    return (0, validated_1.createConfig)(tree);
}
