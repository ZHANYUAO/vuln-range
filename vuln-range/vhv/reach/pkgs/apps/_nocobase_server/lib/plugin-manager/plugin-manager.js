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
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
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
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var plugin_manager_exports = {};
__export(plugin_manager_exports, {
  AddPresetError: () => AddPresetError,
  PluginManager: () => PluginManager,
  default: () => plugin_manager_default,
  sleep: () => sleep
});
module.exports = __toCommonJS(plugin_manager_exports);
var import_topo = __toESM(require("@hapi/topo"));
var import_utils = require("@nocobase/utils");
var import_execa = __toESM(require("execa"));
var import_fast_glob = __toESM(require("fast-glob"));
var import_fs_extra = __toESM(require("fs-extra"));
var import_lodash = __toESM(require("lodash"));
var import_path = require("path");
var import_helper = require("../helper");
var import_middleware = require("./middleware");
var import_collection = __toESM(require("./options/collection"));
var import_resource = __toESM(require("./options/resource"));
var import_plugin_manager_repository = require("./plugin-manager-repository");
var import_plugin_package = require("../../../utils/plugin-package");
var import_utils2 = require("./utils");
const _PluginLoadError = class _PluginLoadError extends Error {
  constructor(pluginName) {
    super(`${pluginName} plugin load error`);
    this.name = "PluginLoadError";
  }
};
__name(_PluginLoadError, "PluginLoadError");
let PluginLoadError = _PluginLoadError;
const sleep = /* @__PURE__ */ __name(async (timeout = 0) => {
  return new Promise((resolve2) => {
    setTimeout(resolve2, timeout);
  });
}, "sleep");
const _AddPresetError = class _AddPresetError extends Error {
};
__name(_AddPresetError, "AddPresetError");
let AddPresetError = _AddPresetError;
const _PluginManager = class _PluginManager {
  /**
   * @internal
   */
  constructor(options) {
    this.options = options;
    this.app = options.app;
    this.app.db.registerRepositories({
      PluginManagerRepository: import_plugin_manager_repository.PluginManagerRepository
    });
    this.collection = this.app.db.collection(import_collection.default);
    this._repository = this.collection.repository;
    this._repository.setPluginManager(this);
    this.app.resourcer.define(import_resource.default);
    this.app.acl.allow("pm", "listEnabled", "public");
    this.app.acl.allow("pm", "listEnabledV2", "public");
    this.app.acl.registerSnippet({
      name: "pm",
      actions: ["pm:*"]
    });
    this.app.db.addMigrations({
      namespace: "core/pm",
      directory: (0, import_path.resolve)(__dirname, "../migrations")
    });
    this.app.resourceManager.use(import_middleware.uploadMiddleware, { tag: "upload", after: "acl" });
  }
  static async checkAndGetCompatible(packageName) {
    if (this.compatibleCache.has(packageName)) {
      return this.compatibleCache.get(packageName);
    }
    const pending = this.compatiblePending.get(packageName);
    if (pending) {
      return pending;
    }
    const task = (0, import_utils2.checkAndGetCompatible)(packageName).then((compatible) => {
      this.compatibleCache.set(packageName, compatible);
      return compatible;
    }).finally(() => {
      this.compatiblePending.delete(packageName);
    });
    this.compatiblePending.set(packageName, task);
    return task;
  }
  /**
   * @internal
   */
  app;
  /**
   * @internal
   */
  collection;
  /**
   * @internal
   */
  pluginInstances = /* @__PURE__ */ new Map();
  /**
   * @internal
   */
  pluginAliases = /* @__PURE__ */ new Map();
  /**
   * @internal
   */
  server;
  /**
   * @internal
   */
  _repository;
  get repository() {
    return this.app.db.getRepository("applicationPlugins");
  }
  static async packageExists(nameOrPkg) {
    const { packageName } = await this.parseName(nameOrPkg);
    const file = (0, import_path.resolve)(process.env.NODE_MODULES_PATH, packageName, "package.json");
    return import_fs_extra.default.exists(file);
  }
  /**
   * @internal
   */
  static async getPackageJson(nameOrPkg) {
    const { packageName } = await this.parseName(nameOrPkg);
    const nodeModulesPath = String(process.env.NODE_MODULES_PATH ?? "").trim();
    if (!nodeModulesPath) {
      throw new Error("NODE_MODULES_PATH is not configured");
    }
    const packageFile = (0, import_path.resolve)(nodeModulesPath, packageName, "package.json");
    if (!await import_fs_extra.default.exists(packageFile)) {
      throw new Error(`Cannot find plugin '${nameOrPkg}'`);
    }
    return import_fs_extra.default.readJSON(packageFile);
  }
  /**
   * @internal
   */
  static async getPackageName(name) {
    const { packageName } = await this.parseName(name);
    const packageFile = (0, import_path.resolve)(process.env.NODE_MODULES_PATH, packageName, "package.json");
    if (!await import_fs_extra.default.exists(packageFile)) {
      return null;
    }
    return packageName;
  }
  /**
   * @internal
   */
  static getPluginPkgPrefix() {
    return (0, import_plugin_package.getPluginPackagePrefixes)();
  }
  /**
   * @internal
   */
  static async findPackage(name) {
    try {
      const packageName = this.getPackageName(name);
      return packageName;
    } catch (error) {
      console.log(`\`${name}\` plugin not found locally`);
      const prefixes = this.getPluginPkgPrefix();
      for (const prefix of prefixes) {
        try {
          const packageName = `${prefix}${name}`;
          console.log(`Try to find ${packageName}`);
          await (0, import_execa.default)("npm", ["v", packageName, "versions"]);
          console.log(`${packageName} downloading`);
          await (0, import_execa.default)("yarn", ["add", packageName, "-W"]);
          console.log(`${packageName} downloaded`);
          return packageName;
        } catch (error2) {
          continue;
        }
      }
    }
    throw new Error(`No available packages found, ${name} plugin does not exist`);
  }
  /**
   * @internal
   */
  static clearCache(packageName) {
    return;
    const packageNamePath = packageName.replace("/", import_path.sep);
    Object.keys(require.cache).forEach((key) => {
      if (key.includes(packageNamePath)) {
        delete require.cache[key];
      }
    });
  }
  /**
   * @internal
   */
  static async resolvePlugin(pluginName, isUpgrade = false, isPkg = false) {
    if (typeof pluginName === "string") {
      const { packageName } = await this.parseName(pluginName);
      return await (0, import_utils.importModule)(packageName);
    } else {
      return pluginName;
    }
  }
  static async parseName(nameOrPkg) {
    (0, import_utils2.assertSafePluginPackageName)(nameOrPkg);
    if (this.parsedNames[nameOrPkg]) {
      return this.parsedNames[nameOrPkg];
    }
    this.parsedNames[nameOrPkg] = await (0, import_plugin_package.parsePluginName)(nameOrPkg, {
      nodeModulesPath: process.env.NODE_MODULES_PATH,
      pluginPackagePrefixes: this.getPluginPkgPrefix()
    });
    return this.parsedNames[nameOrPkg];
  }
  addPreset(plugin, options = {}) {
    if (this.app.loaded) {
      throw new AddPresetError("must be added before executing app.load()");
    }
    if (!this.options.plugins) {
      this.options.plugins = [];
    }
    this.options.plugins.push([plugin, options]);
  }
  getPlugins() {
    return this.app.pm.pluginInstances;
  }
  getAliases() {
    return this.app.pm.pluginAliases.keys();
  }
  get(name) {
    if (typeof name === "string") {
      return this.app.pm.pluginAliases.get(name);
    }
    return this.app.pm.pluginInstances.get(name);
  }
  has(name) {
    if (typeof name === "string") {
      return this.app.pm.pluginAliases.has(name);
    }
    return this.app.pm.pluginInstances.has(name);
  }
  del(name) {
    const instance = this.get(name);
    if (instance) {
      this.app.pm.pluginAliases.delete(instance.name);
      this.app.pm.pluginInstances.delete(instance.constructor);
    }
  }
  /* istanbul ignore next -- @preserve */
  async create(pluginName, options) {
    const createPlugin = /* @__PURE__ */ __name(async (name) => {
      const pluginDir = (0, import_path.resolve)(process.cwd(), "packages/plugins", name);
      if (options == null ? void 0 : options.forceRecreate) {
        await import_fs_extra.default.rm(pluginDir, { recursive: true, force: true });
      }
      const { PluginGenerator } = require("@nocobase/cli-v1/src/plugin-generator");
      const generator = new PluginGenerator({
        cwd: process.cwd(),
        args: {},
        context: {
          name
        }
      });
      await generator.run();
    }, "createPlugin");
    await createPlugin(pluginName);
    this.app.log.info("attempt to add the plugin to the app");
  }
  async addOrThrow(plugin, options = {}, insert = false, isUpgrade = false) {
    if (!isUpgrade && this.has(plugin)) {
      const name = typeof plugin === "string" ? plugin : plugin.name;
      throw new Error(`plugin [${name}] already added`);
    }
    if (!options.name && typeof plugin === "string") {
      options.name = plugin;
    }
    if (typeof plugin === "string" && options.name && !options.packageName) {
      const packageName = await _PluginManager.getPackageName(options.name);
      if (packageName) {
        options["packageName"] = packageName;
      }
    }
    if (options.packageName) {
      const packageJson = await _PluginManager.getPackageJson(options.packageName);
      options["packageJson"] = packageJson;
      options["version"] = packageJson.version;
    }
    const P = await _PluginManager.resolvePlugin(options.packageName || plugin, isUpgrade, !!options.packageName);
    if (!P) {
      throw new Error(`plugin [${(options == null ? void 0 : options.name) || "unknown"}] load error`);
    }
    const instance = new P((0, import_helper.createAppProxy)(this.app), options);
    this.pluginInstances.set(P, instance);
    if (options.name) {
      this.pluginAliases.set(options.name, instance);
    }
    if (options.packageName) {
      this.pluginAliases.set(options.packageName, instance);
    }
    await instance.afterAdd();
  }
  async add(plugin, options = {}, insert = false, isUpgrade = false) {
    try {
      await this.addOrThrow(plugin, options, insert, isUpgrade);
    } catch (error) {
      this.app.log.error(error);
    }
  }
  /**
   * @internal
   */
  async initPlugins() {
    await this.initPresetPlugins();
    await this.initOtherPlugins();
  }
  /**
   * @internal
   */
  async loadCommands() {
    this.app.log.info("load commands");
    const items = await this.repository.find({
      filter: {
        enabled: true
      }
    });
    const packageNames = items.map((item) => item.packageName);
    const source = [];
    for (const packageName of packageNames) {
      try {
        const dirname = await (0, import_utils2.getPluginBasePath)(packageName);
        const directory = (0, import_path.join)(dirname, "server/commands/*." + ((0, import_path.basename)(dirname) === "src" ? "{ts,js}" : "js"));
        source.push(directory.replaceAll(import_path.sep, "/"));
      } catch (error) {
        this.app.log.error(error);
        continue;
      }
    }
    for (const plugin of this.options.plugins || []) {
      if (typeof plugin === "string") {
        const { packageName } = await _PluginManager.parseName(plugin);
        const dirname = await (0, import_utils2.getPluginBasePath)(packageName);
        const directory = (0, import_path.join)(dirname, "server/commands/*." + ((0, import_path.basename)(dirname) === "src" ? "{ts,js}" : "js"));
        source.push(directory.replaceAll(import_path.sep, "/"));
      }
    }
    const files = await (0, import_fast_glob.default)(source, {
      ignore: ["**/*.d.ts"],
      cwd: process.env.NODE_MODULES_PATH
    });
    for (const file of files) {
      const callback = await (0, import_utils.importModule)(file);
      callback(this.app);
    }
  }
  async load(options = {}) {
    this.app.log.debug("loading plugins...");
    this.app.setMaintainingMessage("loading plugins...");
    const total = this.pluginInstances.size;
    let current = 0;
    for (const [P, plugin] of this.getPlugins()) {
      if (plugin.state.loaded) {
        continue;
      }
      const name = plugin.name || P.name;
      current += 1;
      this.app.setMaintainingMessage(`before load plugin [${name}], ${current}/${total}`);
      if (!plugin.enabled) {
        continue;
      }
      this.app.logger.trace(`before load plugin [${name}]`, { submodule: "plugin-manager", method: "load", name });
      await plugin.beforeLoad();
    }
    current = 0;
    for (const [P, plugin] of this.getPlugins()) {
      if (plugin.state.loaded) {
        continue;
      }
      const name = plugin.name || P.name;
      current += 1;
      this.app.setMaintainingMessage(`load plugin [${name}], ${current}/${total}`);
      if (!plugin.enabled) {
        continue;
      }
      await this.app.emitAsync("beforeLoadPlugin", plugin, options);
      this.app.logger.trace(`load plugin [${name}] `, { submodule: "plugin-manager", method: "load", name });
      await plugin.loadCollections();
      await plugin.loadAI();
      await plugin.load();
      plugin.state.loaded = true;
      await this.app.emitAsync("afterLoadPlugin", plugin, options);
    }
    const getSourceAndTargetForAddAction = /* @__PURE__ */ __name(async (ctx) => {
      const { packageName } = ctx.action.params;
      return {
        targetCollection: "applicationPlugins",
        targetRecordUK: packageName
      };
    }, "getSourceAndTargetForAddAction");
    const getSourceAndTargetForUpdateAction = /* @__PURE__ */ __name(async (ctx) => {
      let { packageName } = ctx.action.params;
      if (ctx.file) {
        packageName = ctx.request.body.packageName;
      }
      return {
        targetCollection: "applicationPlugins",
        targetRecordUK: packageName
      };
    }, "getSourceAndTargetForUpdateAction");
    const getSourceAndTargetForOtherActions = /* @__PURE__ */ __name(async (ctx) => {
      const { filterByTk } = ctx.action.params;
      return {
        targetCollection: "applicationPlugins",
        targetRecordUK: filterByTk
      };
    }, "getSourceAndTargetForOtherActions");
    this.app.auditManager.registerActions([
      { name: "pm:add", getSourceAndTarget: getSourceAndTargetForAddAction },
      { name: "pm:update", getSourceAndTarget: getSourceAndTargetForUpdateAction },
      { name: "pm:enable", getSourceAndTarget: getSourceAndTargetForOtherActions },
      { name: "pm:disable", getSourceAndTarget: getSourceAndTargetForOtherActions },
      { name: "pm:remove", getSourceAndTarget: getSourceAndTargetForOtherActions }
    ]);
    this.app.log.debug("plugins loaded");
    this.app.setMaintainingMessage("plugins loaded");
  }
  async install(options = {}) {
    this.app.setMaintainingMessage("install plugins...");
    const total = this.pluginInstances.size;
    let current = 0;
    this.app.log.debug("call db.sync()");
    await this.app.db.sync();
    const toBeUpdated = [];
    for (const [P, plugin] of this.getPlugins()) {
      if (plugin.state.installing || plugin.state.installed) {
        continue;
      }
      const name = plugin.name || P.name;
      current += 1;
      if (!plugin.enabled) {
        continue;
      }
      plugin.state.installing = true;
      this.app.setMaintainingMessage(`before install plugin [${name}], ${current}/${total}`);
      await this.app.emitAsync("beforeInstallPlugin", plugin, options);
      this.app.logger.debug(`install plugin [${name}]...`);
      await plugin.install(options);
      toBeUpdated.push(name);
      plugin.state.installing = false;
      plugin.state.installed = true;
      plugin.installed = true;
      this.app.setMaintainingMessage(`after install plugin [${name}], ${current}/${total}`);
      await this.app.emitAsync("afterInstallPlugin", plugin, options);
    }
    await this.repository.update({
      filter: {
        name: toBeUpdated
      },
      values: {
        installed: true
      }
    });
  }
  async enable(nameOrPkg) {
    let pluginNames = nameOrPkg;
    if (nameOrPkg === "*") {
      const plugin = this.get("nocobase");
      pluginNames = await plugin.findLocalPlugins();
    }
    pluginNames = await this.sort(pluginNames);
    try {
      const added = {};
      for (const name of pluginNames) {
        const { name: pluginName } = await _PluginManager.parseName(name);
        if (this.has(pluginName)) {
          added[pluginName] = true;
          continue;
        }
        await this.addOrThrow(pluginName);
      }
      for (const name of pluginNames) {
        const { name: pluginName } = await _PluginManager.parseName(name);
        const plugin = this.get(pluginName);
        if (!plugin) {
          throw new PluginLoadError(pluginName);
        }
        if (added[pluginName]) {
          continue;
        }
        const instance = await this.repository.findOne({
          filter: {
            name: pluginName
          }
        });
        if (instance) {
          plugin.enabled = instance.enabled;
          plugin.installed = instance.installed;
        }
        if (plugin.enabled) {
          continue;
        }
        await plugin.beforeLoad();
      }
      for (const name of pluginNames) {
        const { name: pluginName } = await _PluginManager.parseName(name);
        const plugin = this.get(pluginName);
        if (!plugin) {
          throw new PluginLoadError(pluginName);
        }
        if (added[pluginName]) {
          continue;
        }
        if (plugin.enabled) {
          continue;
        }
        await plugin.loadCollections();
        await plugin.loadAI();
        await plugin.load();
      }
    } catch (error) {
      await this.app.tryReloadOrRestart({
        recover: true
      });
      throw error;
    }
    this.app.log.debug(`enabling plugin ${pluginNames.join(",")}`);
    this.app.setMaintainingMessage(`enabling plugin ${pluginNames.join(",")}`);
    const toBeUpdated = [];
    for (const name of pluginNames) {
      const { name: pluginName } = await _PluginManager.parseName(name);
      const plugin = this.get(pluginName);
      if (!plugin) {
        throw new PluginLoadError(pluginName);
      }
      if (plugin.enabled) {
        continue;
      }
      await this.app.emitAsync("beforeEnablePlugin", pluginName);
      try {
        await plugin.beforeEnable();
        toBeUpdated.push(pluginName);
      } catch (error) {
        if (nameOrPkg === "*") {
          this.app.log.error(error.message);
        } else {
          throw error;
        }
      }
    }
    if (toBeUpdated.length === 0) {
      return;
    }
    try {
      this.app.log.debug(`syncing database in enable plugin ${toBeUpdated.join(",")}...`);
      this.app.setMaintainingMessage(`syncing database in enable plugin ${toBeUpdated.join(",")}...`);
      await this.app.db.sync();
      for (const pluginName of toBeUpdated) {
        const plugin = this.get(pluginName);
        if (!plugin.installed) {
          this.app.log.debug(`installing plugin ${pluginName}...`);
          this.app.setMaintainingMessage(`installing plugin ${pluginName}...`);
          await plugin.install();
          plugin.installed = true;
        }
      }
      for (const pluginName of toBeUpdated) {
        const { name } = await _PluginManager.parseName(pluginName);
        const packageJson = await _PluginManager.getPackageJson(pluginName);
        const values = {
          name,
          packageName: packageJson == null ? void 0 : packageJson.name,
          enabled: true,
          installed: true,
          version: packageJson == null ? void 0 : packageJson.version
        };
        await this.repository.updateOrCreate({
          values,
          filterKeys: ["name"]
        });
      }
      for (const pluginName of toBeUpdated) {
        const plugin = this.get(pluginName);
        this.app.log.debug(`emit afterEnablePlugin event...`);
        await plugin.afterEnable();
        plugin.enabled = true;
        await this.app.emitAsync("afterEnablePlugin", pluginName);
        this.app.log.debug(`afterEnablePlugin event emitted`);
      }
      await this.app.tryReloadOrRestart();
    } catch (error) {
      await this.app.tryReloadOrRestart({
        recover: true
      });
      throw error;
    }
  }
  async disable(name) {
    const pluginNames = import_lodash.default.castArray(name);
    this.app.log.debug(`disabling plugin ${pluginNames.join(",")}`);
    this.app.setMaintainingMessage(`disabling plugin ${pluginNames.join(",")}`);
    const toBeUpdated = [];
    for (const name2 of pluginNames) {
      const { name: pluginName } = await _PluginManager.parseName(name2);
      const plugin = this.get(pluginName);
      if (!plugin) {
        throw new PluginLoadError(pluginName);
      }
      if (!plugin.enabled) {
        continue;
      }
      await this.app.emitAsync("beforeDisablePlugin", pluginName);
      await plugin.beforeDisable();
      plugin.enabled = false;
      toBeUpdated.push(pluginName);
    }
    if (toBeUpdated.length === 0) {
      return;
    }
    try {
      for (const pluginName of toBeUpdated) {
        const plugin = this.get(pluginName);
        this.app.log.debug(`emit afterDisablePlugin event...`);
        await plugin.afterDisable();
        await this.app.emitAsync("afterDisablePlugin", pluginName);
        this.app.log.debug(`afterDisablePlugin event emitted`);
      }
      await this.repository.update({
        filter: {
          name: toBeUpdated
        },
        values: {
          enabled: false
        }
      });
      await this.app.tryReloadOrRestart();
    } catch (error) {
      await this.app.tryReloadOrRestart({
        recover: true
      });
      throw error;
    }
  }
  async remove(name, options) {
    const names = import_lodash.default.castArray(name);
    const pluginNames = [];
    const records = [];
    for (const nameOrPkg of names) {
      const { name: name2, packageName } = await _PluginManager.parseName(nameOrPkg);
      pluginNames.push(name2);
      records.push({
        name: name2,
        packageName
      });
    }
    const removeDir = /* @__PURE__ */ __name(async () => {
      await Promise.all(
        records.map(async (plugin) => {
          const dir = (0, import_path.resolve)(process.env.NODE_MODULES_PATH, plugin.packageName);
          try {
            const realDir = await import_fs_extra.default.realpath(dir);
            console.log("realDir", realDir);
            this.app.log.debug(`rm -rf ${realDir}`);
            return import_fs_extra.default.rm(realDir, { force: true, recursive: true });
          } catch (error) {
            return false;
          }
        })
      );
    }, "removeDir");
    await this.repository.destroy({
      filter: {
        name: pluginNames
      }
    });
    if (!this.app.db.getCollection("applications")) {
      await removeDir();
    }
  }
  async pull(urlOrName, options, emitStartedEvent = true) {
    if (Array.isArray(urlOrName)) {
      for (const packageName of urlOrName) {
        await this.addViaCLI(packageName, import_lodash.default.omit(options, "name"), false);
      }
      return;
    }
    if ((0, import_utils.isURL)(urlOrName)) {
      await this.addByCompressedFileUrl(
        {
          ...options,
          compressedFileUrl: urlOrName
        },
        emitStartedEvent
      );
    } else if (await import_fs_extra.default.exists(urlOrName)) {
      await this.addByCompressedFileUrl(
        {
          ...options,
          compressedFileUrl: urlOrName
        },
        emitStartedEvent
      );
    } else if (options == null ? void 0 : options.registry) {
      const { name, packageName } = await _PluginManager.parseName(urlOrName);
      options["name"] = name;
      await this.addByNpm(
        {
          ...options,
          packageName
        },
        emitStartedEvent
      );
    }
  }
  /**
   * @internal
   */
  async addViaCLI(urlOrName, options, emitStartedEvent = true) {
    const writeFile = /* @__PURE__ */ __name(async () => {
      if (process.env.VITEST) {
        return;
      }
      const file = (0, import_utils.storagePathJoin)(".upgrading");
      this.app.log.debug("pending upgrade");
      await import_fs_extra.default.writeFile(file, "upgrading");
    }, "writeFile");
    await writeFile();
    if (Array.isArray(urlOrName)) {
      for (const packageName of urlOrName) {
        await this.addViaCLI(packageName, import_lodash.default.omit(options, "name"), false);
      }
      return;
    }
    if ((0, import_utils.isURL)(urlOrName)) {
      await this.addByCompressedFileUrl(
        {
          ...options,
          compressedFileUrl: urlOrName
        },
        emitStartedEvent
      );
    } else if (await import_fs_extra.default.exists(urlOrName)) {
      await this.addByCompressedFileUrl(
        {
          ...options,
          compressedFileUrl: urlOrName
        },
        emitStartedEvent
      );
    } else if (options == null ? void 0 : options.registry) {
      const { name, packageName } = await _PluginManager.parseName(urlOrName);
      options["name"] = name;
      await this.addByNpm(
        {
          ...options,
          packageName
        },
        emitStartedEvent
      );
    }
  }
  /**
   * @internal
   */
  async addByNpm(options, throwError = true) {
    let { name = "", registry, packageName, authToken } = options;
    name = name.trim();
    registry = registry.trim();
    packageName = packageName.trim();
    authToken = authToken == null ? void 0 : authToken.trim();
    const { compressedFileUrl } = await (0, import_utils2.getPluginInfoByNpm)({
      packageName,
      registry,
      authToken
    });
    return this.addByCompressedFileUrl({ name, compressedFileUrl, registry, authToken, type: "npm" }, throwError);
  }
  /**
   * @internal
   */
  async addByFile(options, throwError = true) {
    const { file, authToken } = options;
    const { packageName, tempFile, tempPackageContentDir } = await (0, import_utils2.downloadAndUnzipToTempDir)(file, authToken);
    await (0, import_utils2.copyTempPackageToStorageAndLinkToNodeModules)(tempFile, tempPackageContentDir, packageName);
  }
  /**
   * @internal
   */
  async addByCompressedFileUrl(options, throwError = true) {
    const { compressedFileUrl, authToken } = options;
    const { packageName, tempFile, tempPackageContentDir } = await (0, import_utils2.downloadAndUnzipToTempDir)(
      compressedFileUrl,
      authToken
    );
    await (0, import_utils2.copyTempPackageToStorageAndLinkToNodeModules)(tempFile, tempPackageContentDir, packageName);
  }
  async update(nameOrPkg, options, emitStartedEvent = true) {
    const upgrade = /* @__PURE__ */ __name(async () => {
      if (!await this.app.isStarted()) {
        this.app.log.debug("app upgrading");
        await this.app.runCommand("upgrade");
        await (0, import_helper.tsxRerunning)();
        await (0, import_execa.default)("yarn", ["nocobase", "pm2-restart"], {
          env: process.env
        });
        return;
      }
      const file = (0, import_utils.storagePathJoin)("app-upgrading");
      await import_fs_extra.default.writeFile(file, "", "utf-8");
      await (0, import_helper.tsxRerunning)();
      await (0, import_execa.default)("yarn", ["nocobase", "pm2-restart"], {
        env: process.env
      });
    }, "upgrade");
    if (Array.isArray(nameOrPkg)) {
      for (const name of nameOrPkg) {
        await this.update(name, { ...options }, false);
      }
      return upgrade();
    }
    const opts = { ...options };
    if ((0, import_utils.isURL)(nameOrPkg)) {
      opts.compressedFileUrl = nameOrPkg;
    } else if (await import_fs_extra.default.exists(nameOrPkg)) {
      opts.compressedFileUrl = nameOrPkg;
    }
    if (opts.compressedFileUrl) {
      await this.upgradeByCompressedFileUrl(opts);
    } else {
      const { name, packageName } = await _PluginManager.parseName(nameOrPkg);
      await this.upgradeByNpm({ ...opts, packageName, name });
    }
    if (emitStartedEvent) {
      await upgrade();
    }
  }
  /**
   * @internal
   */
  async upgradeByNpm(values) {
    var _a, _b, _c;
    const name = values.name;
    if (!await this.repository.has(name)) {
      throw new Error(`plugin name [${name}] not exists`);
    }
    if (!values.registry) {
      throw new Error(`plugin name [${name}] not installed by npm`);
    }
    const version = (_a = values.version) == null ? void 0 : _a.trim();
    const registry = (_b = values.registry) == null ? void 0 : _b.trim();
    const authToken = (_c = values.authToken) == null ? void 0 : _c.trim();
    const { compressedFileUrl } = await (0, import_utils2.getPluginInfoByNpm)({
      packageName: values.packageName,
      registry,
      authToken,
      version
    });
    return this.upgradeByCompressedFileUrl({
      compressedFileUrl,
      name,
      version,
      registry,
      authToken
    });
  }
  /**
   * @internal
   */
  async upgradeByCompressedFileUrl(options) {
    const { compressedFileUrl, authToken } = options;
    const { packageName, version } = await (0, import_utils2.updatePluginByCompressedFileUrl)({
      compressedFileUrl,
      authToken,
      repository: this.repository
    });
    const { name } = await _PluginManager.parseName(packageName);
  }
  /**
   * @internal
   */
  getNameByPackageName(packageName) {
    const prefixes = _PluginManager.getPluginPkgPrefix();
    const prefix = prefixes.find((prefix2) => packageName.startsWith(prefix2));
    if (!prefix) {
      throw new Error(
        `package name [${packageName}] invalid, just support ${prefixes.join(
          ", "
        )}. You can modify process.env.PLUGIN_PACKAGE_PREFIX add more prefix.`
      );
    }
    return packageName.replace(prefix, "");
  }
  async list(options = {}) {
    const { locale = "en-US", isPreset = false } = options;
    return Promise.all(
      [...this.getPlugins().keys()].map((name) => {
        const plugin = this.get(name);
        if (!isPreset && plugin.options.isPreset) {
          return;
        }
        return plugin.toJSON({ locale });
      }).filter(Boolean)
    );
  }
  /**
   * @internal
   */
  async getNpmVersionList(name) {
    const plugin = this.get(name);
    const npmInfo = await (0, import_utils2.getNpmInfo)(plugin.options.packageName, plugin.options.registry, plugin.options.authToken);
    return Object.keys(npmInfo.versions);
  }
  /**
   * @internal
   */
  async loadPresetMigrations() {
    const migrations = {
      beforeLoad: [],
      afterSync: [],
      afterLoad: []
    };
    for (const [P, plugin] of this.getPlugins()) {
      if (!plugin.isPreset) {
        continue;
      }
      const { beforeLoad, afterSync, afterLoad } = await plugin.loadMigrations();
      migrations.beforeLoad.push(...beforeLoad);
      migrations.afterSync.push(...afterSync);
      migrations.afterLoad.push(...afterLoad);
    }
    return {
      beforeLoad: {
        up: /* @__PURE__ */ __name(async () => {
          this.app.log.debug("run preset migrations(beforeLoad)");
          const migrator = this.app.db.createMigrator({ migrations: migrations.beforeLoad });
          await migrator.up();
        }, "up")
      },
      afterSync: {
        up: /* @__PURE__ */ __name(async () => {
          this.app.log.debug("run preset migrations(afterSync)");
          const migrator = this.app.db.createMigrator({ migrations: migrations.afterSync });
          await migrator.up();
        }, "up")
      },
      afterLoad: {
        up: /* @__PURE__ */ __name(async () => {
          this.app.log.debug("run preset migrations(afterLoad)");
          const migrator = this.app.db.createMigrator({ migrations: migrations.afterLoad });
          await migrator.up();
        }, "up")
      }
    };
  }
  /**
   * @internal
   */
  async loadOtherMigrations() {
    const migrations = {
      beforeLoad: [],
      afterSync: [],
      afterLoad: []
    };
    for (const [P, plugin] of this.getPlugins()) {
      if (plugin.isPreset) {
        continue;
      }
      if (!plugin.enabled) {
        continue;
      }
      const { beforeLoad, afterSync, afterLoad } = await plugin.loadMigrations();
      migrations.beforeLoad.push(...beforeLoad);
      migrations.afterSync.push(...afterSync);
      migrations.afterLoad.push(...afterLoad);
    }
    return {
      beforeLoad: {
        up: /* @__PURE__ */ __name(async () => {
          this.app.log.debug("run others migrations(beforeLoad)");
          const migrator = this.app.db.createMigrator({ migrations: migrations.beforeLoad });
          await migrator.up();
        }, "up")
      },
      afterSync: {
        up: /* @__PURE__ */ __name(async () => {
          this.app.log.debug("run others migrations(afterSync)");
          const migrator = this.app.db.createMigrator({ migrations: migrations.afterSync });
          await migrator.up();
        }, "up")
      },
      afterLoad: {
        up: /* @__PURE__ */ __name(async () => {
          this.app.log.debug("run others migrations(afterLoad)");
          const migrator = this.app.db.createMigrator({ migrations: migrations.afterLoad });
          await migrator.up();
        }, "up")
      }
    };
  }
  /**
   * @internal
   */
  async loadPresetPlugins() {
    await this.initPresetPlugins();
    await this.load();
  }
  async upgrade() {
    this.app.log.info("run upgrade");
    const toBeUpdated = [];
    for (const [P, plugin] of this.getPlugins()) {
      if (plugin.state.upgraded) {
        continue;
      }
      if (!plugin.enabled) {
        continue;
      }
      if (!plugin.isPreset && !plugin.installed) {
        this.app.log.info(`install built-in plugin [${plugin.name}]`);
        await plugin.install();
        toBeUpdated.push(plugin.name);
      }
      this.app.log.debug(`upgrade plugin [${plugin.name}]`);
      await plugin.upgrade();
      plugin.state.upgraded = true;
    }
    await this.repository.update({
      filter: {
        name: toBeUpdated
      },
      values: {
        installed: true
      }
    });
  }
  /**
   * @internal
   */
  async initOtherPlugins() {
    if (this["_initOtherPlugins"]) {
      return;
    }
    await this.repository.init();
    this["_initOtherPlugins"] = true;
  }
  /**
   * @internal
   */
  async initPresetPlugins() {
    if (this["_initPresetPlugins"]) {
      return;
    }
    for (const plugin of this.options.plugins) {
      const [p, opts = {}] = Array.isArray(plugin) ? plugin : [plugin];
      await this.add(p, { enabled: true, isPreset: true, ...opts });
    }
    this["_initPresetPlugins"] = true;
  }
  async sort(names) {
    const pluginNames = import_lodash.default.castArray(names);
    if (pluginNames.length === 1) {
      return pluginNames;
    }
    const sorter = new import_topo.default.Sorter();
    for (const pluginName of pluginNames) {
      const packageJson = await _PluginManager.getPackageJson(pluginName);
      const peerDependencies = Object.keys((packageJson == null ? void 0 : packageJson.peerDependencies) || {});
      sorter.add(pluginName, { after: peerDependencies, group: (packageJson == null ? void 0 : packageJson.packageName) || pluginName });
    }
    return sorter.nodes;
  }
};
__name(_PluginManager, "PluginManager");
__publicField(_PluginManager, "compatibleCache", /* @__PURE__ */ new Map());
__publicField(_PluginManager, "compatiblePending", /* @__PURE__ */ new Map());
__publicField(_PluginManager, "parsedNames", {});
let PluginManager = _PluginManager;
var plugin_manager_default = PluginManager;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AddPresetError,
  PluginManager,
  sleep
});
