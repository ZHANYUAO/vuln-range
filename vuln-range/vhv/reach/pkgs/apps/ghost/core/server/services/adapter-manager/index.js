"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const adapter_manager_1 = require("../../../kernel/adapter-manager");
const adapter_paths_1 = require("./adapter-paths");
const base_classes_1 = require("./base-classes");
const config_1 = require("./config");
const config_2 = __importDefault(require("../../../shared/config"));
// Ghost's configured adapter manager: the kernel's generic loading, validation
// and instance management, composed with Ghost's adapter registry, search paths,
// module loader and configuration. `getAdapter` resolves the active adapter and
// its options from config on each call, so runtime config changes are always
// reflected. Boot validates the configured adapters with `init()`.
const adapterManager = new adapter_manager_1.AdapterManager({
    loadAdapterFromPath: require,
    getConfig: () => (0, config_1.normalizeAdapterConfig)(config_2.default),
    pathsToAdapters: adapter_paths_1.adapterPaths,
    baseClasses: base_classes_1.baseClasses,
});
exports.default = adapterManager;
