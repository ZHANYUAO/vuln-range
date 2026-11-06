/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var plugin_exports = {};
__export(plugin_exports, {
  Plugin: () => Plugin,
  default: () => plugin_default
});
module.exports = __toCommonJS(plugin_exports);
var import_utils = require("@nocobase/utils");
var import_fs = __toESM(require("fs"));
var import_path = require("path");
var import_plugin_manager = require("./plugin-manager");
var import_utils2 = require("./plugin-manager/utils");
var import_ai = require("@nocobase/ai");
/* istanbul ignore file -- @preserve */
const _Plugin = class _Plugin {
  options;
  app;
  /**
   * @deprecated
   */
  model;
  /**
   * @internal
   */
  state = {};
  /**
   * @internal
   */
  _sourceDir;
  constructor(app, options) {
    this.app = app;
    this.setOptions(options);
  }
  get log() {
    return this.app.log.child({
      reqId: this.app.context.reqId,
      module: this.name
    });
  }
  get name() {
    return this.options.name;
  }
  get ai() {
    return this.app.aiManager;
  }
  get pm() {
    return this.app.pm;
  }
  get db() {
    return this.app.db;
  }
  get enabled() {
    return this.options.enabled;
  }
  set enabled(value) {
    this.options.enabled = value;
  }
  get installed() {
    return this.options.installed;
  }
  set installed(value) {
    this.options.installed = value;
  }
  get isPreset() {
    return this.options.isPreset;
  }
  getName() {
    return this.options.name;
  }
  createLogger(options) {
    return this.app.createLogger(options);
  }
  afterAdd() {
  }
  beforeLoad() {
  }
  async load() {
  }
  async install(options) {
  }
  async upgrade() {
  }
  async beforeEnable() {
  }
  async afterEnable() {
  }
  async beforeDisable() {
  }
  async afterDisable() {
  }
  async beforeRemove() {
  }
  async afterRemove() {
  }
  async handleSyncMessage(message) {
  }
  async sendSyncMessage(message, options) {
    if (!this.name) {
      throw new Error(`plugin name invalid`);
    }
    try {
      await this.app.syncMessageManager.publish(this.name, message, options);
    } catch (err) {
      this.log.error(err);
    }
  }
  /**
   * @deprecated
   */
  async importCollections(collectionsPath) {
  }
  /**
   * @internal
   */
  setOptions(options) {
    this.options = options || {};
  }
  /**
   * @internal
   */
  async loadMigrations() {
    this.app.log.debug(`load plugin migrations [${this.name}]`);
    const basePath = await this.getPluginBasePath();
    if (!basePath) {
      return { beforeLoad: [], afterSync: [], afterLoad: [] };
    }
    const directory = (0, import_path.resolve)(basePath, "server/migrations");
    return await this.app.loadMigrations({
      directory,
      namespace: this.options.packageName,
      context: {
        plugin: this
      }
    });
  }
  async getPluginBasePath() {
    if (!this.options.packageName) {
      this.app.log.trace(`plugin '${this.name}' is missing packageName`);
      return;
    }
    return (0, import_utils2.getPluginBasePath)(this.options.packageName);
  }
  /**
   * @internal
   */
  async loadCollections() {
    const basePath = await this.getPluginBasePath();
    if (!basePath) {
      return;
    }
    const directory = (0, import_path.resolve)(basePath, "server/collections");
    if (await (0, import_utils.fsExists)(directory)) {
      this.app.log.trace(`load plugin collections [${this.name}]`);
      await this.db.import({
        directory,
        from: this.options.packageName
      });
    }
  }
  /**
   * @internal
   */
  async loadAI() {
    const pluginRoot = await this.getPluginBasePath();
    if (!pluginRoot) {
      return;
    }
    const basePath = (0, import_path.resolve)(pluginRoot, "ai");
    if (!await (0, import_utils.fsExists)(basePath)) {
      return;
    }
    const toolsLoader = new import_ai.ToolsLoader(this.ai, {
      pluginName: this.getName(),
      scan: {
        basePath,
        pattern: ["**/tools/**/*.ts", "**/tools/**/*.js", "!**/tools/**/*.d.ts", "**/tools/**/*/description.md"]
      },
      log: this.log
    });
    await toolsLoader.load();
    const mcpLoader = new import_ai.MCPLoader(this.ai, {
      pluginName: this.getName(),
      scan: {
        basePath,
        pattern: ["mcp/*.ts", "mcp/*.js", "!mcp/*.d.ts"]
      },
      log: this.log
    });
    await mcpLoader.load();
    const skillsLoader = new import_ai.SkillsLoader(this.ai, {
      pluginName: this.getName(),
      scan: { basePath, pattern: ["**/skills/**/SKILLS.md"] },
      log: this.log
    });
    await skillsLoader.load();
    const employeeLoader = new import_ai.AIEmployeeLoader(this.ai, {
      pluginName: this.getName(),
      scan: {
        basePath,
        pattern: [
          "**/ai-employees/*.ts",
          "**/ai-employees/*/index.ts",
          "**/ai-employees/*.js",
          "**/ai-employees/*/index.js",
          "**/ai-employees/*/prompt.md",
          "!**/ai-employees/**/*.d.ts"
        ]
      },
      log: this.log
    });
    await employeeLoader.load();
  }
  /**
   * @deprecated
   */
  requiredPlugins() {
    return [];
  }
  t(text, options = {}) {
    return this.app.i18n.t(text, { ns: this.options["packageName"], ...options });
  }
  /**
   * @experimental
   */
  async toJSON(options = {}) {
    const { locale = "en-US" } = options;
    const { name, packageName, packageJson } = this.options;
    if (!packageName) {
      return {
        ...this.options
      };
    }
    const langMap = {
      "zh-CN": "cn/",
      "en-US": "",
      "ja-JP": "ja/",
      "es-ES": "es/",
      "pt-PT": "pt/",
      "de-DE": "de",
      "fr-FR": "fr/"
    };
    if (packageName.startsWith("@nocobase/plugin-")) {
      packageJson.homepage = `https://docs.nocobase.com/${langMap[locale] || ""}plugins/${packageName}`;
    }
    const results = {
      ...this.options,
      keywords: packageJson.keywords,
      readmeUrl: (0, import_plugin_manager.getExposeReadmeUrl)(packageName, locale),
      changelogUrl: (0, import_plugin_manager.getExposeChangelogUrl)(packageName),
      displayName: packageJson[`displayName.${locale}`] || packageJson.displayName || name,
      description: packageJson[`description.${locale}`] || packageJson.description,
      homepage: packageJson.homepage
    };
    if (!options.withOutOpenFile) {
      const file = await import_fs.default.promises.realpath(
        (0, import_path.resolve)(process.env.NODE_MODULES_PATH || (0, import_path.resolve)(process.cwd(), "node_modules"), packageName)
      );
      return {
        ...results,
        ...await (0, import_utils2.checkAndGetCompatible)(packageName),
        lastUpdated: (await import_fs.default.promises.stat(file)).ctime,
        file,
        updatable: file.startsWith((0, import_utils.resolvePluginStoragePath)())
      };
    }
    return results;
  }
};
__name(_Plugin, "Plugin");
let Plugin = _Plugin;
var plugin_default = Plugin;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Plugin
});
