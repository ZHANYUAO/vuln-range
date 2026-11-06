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
var locale_exports = {};
__export(locale_exports, {
  Locale: () => Locale
});
module.exports = __toCommonJS(locale_exports);
var import_utils = require("@nocobase/utils");
var import_constants = require("../constants");
var import_resource = require("./resource");
var import_deepmerge = __toESM(require("deepmerge"));
const _Locale = class _Locale {
  app;
  cache;
  defaultLang = "en-US";
  localeFn = /* @__PURE__ */ new Map();
  resourceCached = /* @__PURE__ */ new Map();
  i18nInstances = /* @__PURE__ */ new Map();
  resourceStorers = new import_utils.Registry();
  sources = new import_utils.Registry();
  constructor(app) {
    this.app = app;
    this.app.on("afterLoad", async () => {
      this.app.log.debug("loading locale resource...", { submodule: "locale", method: "onAfterLoad" });
      this.app.setMaintainingMessage("load locale resource");
      await this.load();
      this.app.log.debug("locale resource loaded", { submodule: "locale", method: "onAfterLoad" });
      this.app.setMaintainingMessage("locale resource loaded");
    });
    this.app.syncMessageManager.subscribe("localeManager", async (message) => {
      switch (message.type) {
        case "reload":
          await this.reset();
          return;
      }
    });
  }
  async load() {
    this.cache = await this.app.cacheManager.createCache({
      name: "locale",
      prefix: "locale",
      store: "memory"
    });
    await this.get(this.defaultLang);
  }
  async reset() {
    const storers = Array.from(this.resourceStorers.getValues());
    const promises = storers.map((storer) => storer.reset());
    await Promise.all([this.cache.reset(), ...promises]);
  }
  async reload() {
    await this.reset();
    this.app.syncMessageManager.publish("localeManager", { type: "reload" });
  }
  setLocaleFn(name, fn) {
    this.localeFn.set(name, fn);
  }
  registerResourceStorer(name, storer) {
    this.resourceStorers.register(name, storer);
  }
  registerSource(name, source) {
    this.sources.register(name, source);
  }
  async syncSources(ctx, types) {
    const resources = { client: {} };
    const sources = Array.from(this.sources.getKeys());
    const syncSources = sources.filter((source) => types.includes(source) && this.sources.get(source).sync);
    const promises = syncSources.map((source) => this.sources.get(source).sync(ctx));
    const results = await Promise.all(promises);
    return results.reduce((result, resource) => {
      Object.entries(resource).forEach(([module2, texts]) => {
        result[module2] = {
          ...result[module2] || {},
          ...texts
        };
      });
      return result;
    }, resources);
  }
  async get(lang) {
    const defaults = {
      resources: await this.getCacheResources(lang)
    };
    for (const [name, fn] of this.localeFn) {
      const result = await this.wrapCache(`${name}:${lang}`, async () => await fn(lang));
      if (result) {
        defaults[name] = result;
      }
    }
    return defaults;
  }
  async wrapCache(key, fn) {
    return await this.cache.wrapWithCondition(key, fn, {
      isCacheable: /* @__PURE__ */ __name((val) => !import_utils.lodash.isEmpty(val), "isCacheable")
    });
  }
  async loadResourcesByLang(lang) {
    if (!this.cache) {
      return;
    }
    if (!this.resourceCached.has(lang)) {
      await this.getCacheResources(lang);
    }
  }
  async getCacheResources(lang) {
    this.resourceCached.set(lang, true);
    if (process.env.APP_ENV !== "production") {
      await this.reload();
    }
    return await this.wrapCache(`resources:${lang}`, () => this.getResources(lang));
  }
  async getBuiltInResources(lang) {
    var _a;
    const resources = {};
    const names = this.app.pm.getPlugins().keys();
    for (const name of names) {
      try {
        const p = this.app.pm.get(name);
        if (!p) {
          continue;
        }
        const packageName = (_a = p.options) == null ? void 0 : _a.packageName;
        if (!packageName) {
          continue;
        }
        const res = await (0, import_resource.getResource)(packageName, lang);
        if (res) {
          resources[packageName] = { ...res };
          if (packageName.includes(import_constants.OFFICIAL_PLUGIN_PREFIX)) {
            resources[packageName.substring(import_constants.OFFICIAL_PLUGIN_PREFIX.length)] = { ...res };
          }
        }
      } catch (err) {
      }
    }
    return resources;
  }
  async getResources(lang) {
    const resources = await this.getBuiltInResources(lang);
    const storers = this.resourceStorers.getValues();
    for (const storer of storers) {
      const custom = await storer.getResources(lang);
      Object.keys(custom).forEach((key) => {
        const module2 = key.replace("resources.", "");
        const resource = resources[module2];
        const customResource = custom[key];
        resources[module2] = resource ? (0, import_deepmerge.default)(resource, customResource) : customResource;
        const pkgName = `${import_constants.OFFICIAL_PLUGIN_PREFIX}${module2}`;
        if (resources[pkgName]) {
          resources[pkgName] = { ...resources[module2] };
        }
      });
    }
    Object.keys(resources).forEach((name) => {
      this.app.i18n.addResources(lang, name, resources[name]);
    });
    return resources;
  }
  async getI18nInstance(lang) {
    if (lang === "*" || !lang) {
      return this.app.i18n.cloneInstance({ initImmediate: false });
    }
    let instance = this.i18nInstances.get(lang);
    if (!instance) {
      instance = this.app.i18n.cloneInstance({ initImmediate: false });
      this.i18nInstances.set(lang, instance);
    }
    return instance;
  }
};
__name(_Locale, "Locale");
let Locale = _Locale;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Locale
});
