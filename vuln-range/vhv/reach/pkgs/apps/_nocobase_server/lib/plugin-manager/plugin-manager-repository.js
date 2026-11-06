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
var plugin_manager_repository_exports = {};
__export(plugin_manager_repository_exports, {
  PluginManagerRepository: () => PluginManagerRepository
});
module.exports = __toCommonJS(plugin_manager_repository_exports);
var import_topo = __toESM(require("@hapi/topo"));
var import_database = require("@nocobase/database");
var import_lodash = __toESM(require("lodash"));
var import_plugin_manager = require("./plugin-manager");
const _PluginManagerRepository = class _PluginManagerRepository extends import_database.Repository {
  /**
   * @internal
   */
  pm;
  /**
   * @internal
   */
  setPluginManager(pm) {
    this.pm = pm;
  }
  async createByName(nameOrPkgs) {
  }
  async has(nameOrPkg) {
    const { name } = await import_plugin_manager.PluginManager.parseName(nameOrPkg);
    const instance = await this.findOne({
      filter: {
        name
      }
    });
    return !!instance;
  }
  /**
   * @deprecated
   */
  async remove(name) {
    await this.destroy({
      filter: {
        name
      }
    });
  }
  /**
   * @deprecated
   */
  async enable(name) {
    const pluginNames = import_lodash.default.castArray(name);
    const plugins = pluginNames.map((name2) => this.pm.get(name2));
    for (const plugin of plugins) {
      const requiredPlugins = plugin.requiredPlugins();
      for (const requiredPluginName of requiredPlugins) {
        const requiredPlugin = this.pm.get(requiredPluginName);
        if (!requiredPlugin.enabled) {
          throw new Error(`${plugin.name} plugin need ${requiredPluginName} plugin enabled`);
        }
      }
    }
    for (const plugin of plugins) {
      await plugin.beforeEnable();
    }
    await this.update({
      filter: {
        name
      },
      values: {
        enabled: true,
        installed: true
      }
    });
    return pluginNames;
  }
  async updateVersions() {
    const items = await this.find({
      filter: {
        enabled: true
      }
    });
    for (const item of items) {
      try {
        const json = await import_plugin_manager.PluginManager.getPackageJson(item.packageName);
        item.set("version", json.version);
        await item.save();
      } catch (error) {
        this.pm.app.log.error(error);
      }
    }
  }
  /**
   * @deprecated
   */
  async disable(name) {
    name = import_lodash.default.cloneDeep(name);
    const pluginNames = import_lodash.default.castArray(name);
    console.log(`disable ${name}, ${pluginNames}`);
    const filter = {
      name
    };
    console.log(JSON.stringify(filter, null, 2));
    await this.update({
      filter,
      values: {
        enabled: false,
        installed: false
      }
    });
    return pluginNames;
  }
  async sort(names) {
    const pluginNames = import_lodash.default.castArray(names);
    if (pluginNames.length === 1) {
      return pluginNames;
    }
    const sorter = new import_topo.default.Sorter();
    for (const pluginName of pluginNames) {
      let packageJson = {};
      try {
        packageJson = await import_plugin_manager.PluginManager.getPackageJson(pluginName);
      } catch (error) {
        packageJson = {};
      }
      const peerDependencies = Object.keys((packageJson == null ? void 0 : packageJson.peerDependencies) || {});
      sorter.add(pluginName, { after: peerDependencies, group: (packageJson == null ? void 0 : packageJson.packageName) || pluginName });
    }
    return sorter.nodes;
  }
  async getItems() {
    const exists = await this.collection.existsInDb();
    if (!exists) {
      return [];
    }
    const items = await this.find({
      sort: "id",
      filter: {
        enabled: true
      }
    });
    const sortedItems = [];
    const map = {};
    for (const item of items) {
      if (item.packageName) {
        map[item.packageName] = item;
      } else {
        sortedItems.push(item);
      }
    }
    const names = await this.sort(Object.keys(map));
    for (const name of names) {
      sortedItems.push(map[name]);
    }
    return sortedItems;
  }
  async init() {
    const items = await this.getItems();
    for (const item of items) {
      const { options, ...others } = item.toJSON();
      await this.pm.add(item.get("name"), {
        ...others,
        ...options
      });
    }
  }
};
__name(_PluginManagerRepository, "PluginManagerRepository");
let PluginManagerRepository = _PluginManagerRepository;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  PluginManagerRepository
});
