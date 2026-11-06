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
var resource_exports = {};
__export(resource_exports, {
  PackageUrls: () => PackageUrls,
  default: () => resource_default
});
module.exports = __toCommonJS(resource_exports);
var import_utils = require("@nocobase/utils");
var import_crypto = __toESM(require("crypto"));
var import_fs = __toESM(require("fs"));
var import_fs_extra = __toESM(require("fs-extra"));
var import_path = __toESM(require("path"));
var import_plugin_manager = __toESM(require("../plugin-manager"));
var import_utils2 = require("../utils");
var import_package = __toESM(require("../../../package.json"));
const PLUGIN_CLIENT_ENTRY_FILES = {
  client: "dist/client/index.js",
  "client-v2": "dist/client-v2/index.js"
};
const PLUGIN_CLIENT_MARKER_FILES = {
  client: "client.js",
  "client-v2": "client-v2.js"
};
function getAppDevPluginUrls() {
  if (process.env.NOCOBASE_APP_DEV !== "true" || !process.env.NOCOBASE_APP_DEV_PLUGIN_URLS) {
    return {};
  }
  try {
    return JSON.parse(process.env.NOCOBASE_APP_DEV_PLUGIN_URLS);
  } catch (error) {
    return {};
  }
}
__name(getAppDevPluginUrls, "getAppDevPluginUrls");
function getAppDevPluginDependencies(packageJson2, lane) {
  const appDevPluginUrls = getAppDevPluginUrls();
  const deps = {
    ...packageJson2.dependencies,
    ...packageJson2.peerDependencies,
    ...packageJson2.devDependencies
  };
  return Object.keys(deps).filter(
    (packageName) => {
      var _a;
      return ((_a = appDevPluginUrls[packageName]) == null ? void 0 : _a[lane]) || packageName.startsWith("@nocobase/plugin-") || packageName.startsWith("@nocobase/preset-");
    }
  );
}
__name(getAppDevPluginDependencies, "getAppDevPluginDependencies");
const _PackageUrls = class _PackageUrls {
  static clear() {
    this.items = {};
  }
  static getCacheKey(packageName, lane) {
    return `${lane}:${packageName}`;
  }
  static async get(packageName, lane = "client") {
    const appDevUrl = this.getAppDevUrl(packageName, lane);
    if (appDevUrl) {
      return appDevUrl;
    }
    const cacheKey = this.getCacheKey(packageName, lane);
    const cached = this.items[cacheKey];
    if (cached) {
      return cached;
    }
    const nextUrl = await this.fetch(packageName, lane);
    if (nextUrl == null ? void 0 : nextUrl.includes("?hash=")) {
      this.items[cacheKey] = nextUrl;
    } else {
      delete this.items[cacheKey];
    }
    return nextUrl;
  }
  static getAppDevUrl(packageName, lane) {
    var _a;
    return (_a = getAppDevPluginUrls()[packageName]) == null ? void 0 : _a[lane];
  }
  static async hasClientEntry(packageName, lane) {
    if (this.getAppDevUrl(packageName, lane)) {
      return true;
    }
    const pkgPath = import_path.default.resolve(process.env.NODE_MODULES_PATH, packageName);
    if (!await import_fs_extra.default.exists(pkgPath)) {
      return false;
    }
    return await import_fs_extra.default.exists(import_path.default.resolve(pkgPath, PLUGIN_CLIENT_MARKER_FILES[lane]));
  }
  static async fetch(packageName, lane = "client") {
    const pluginClientEntryFile = PLUGIN_CLIENT_ENTRY_FILES[lane];
    const pkgPath = import_path.default.resolve(process.env.NODE_MODULES_PATH, packageName);
    const pkgExists = await import_fs_extra.default.exists(pkgPath);
    if (!pkgExists) {
      return;
    }
    let t = "";
    const dist = import_path.default.resolve(pkgPath, pluginClientEntryFile);
    const distExists = await import_fs_extra.default.exists(dist);
    if (distExists) {
      const fsState = await import_fs_extra.default.stat(dist);
      const appKey = process.env.APP_KEY || "";
      let version = "";
      try {
        const pkgJson = await import_fs_extra.default.readJson(import_path.default.resolve(pkgPath, "package.json"));
        if (pkgJson && typeof pkgJson.version === "string") {
          version = pkgJson.version;
        }
      } catch (error) {
      }
      const appVersion = import_package.default.version;
      const salt = process.env.PLUGIN_URL_HASH_SALT || "";
      const hash = import_crypto.default.createHash("sha256").update(fsState.mtime.getTime() + appKey + version + appVersion + salt).digest("hex").slice(0, 8);
      t = `?hash=${hash}`;
    }
    const cdnBaseUrl = process.env.CDN_BASE_URL.replace(/\/+$/, "");
    const url = `${cdnBaseUrl}${"/static/plugins/"}${packageName}/${pluginClientEntryFile}${t}`;
    return url;
  }
};
__name(_PackageUrls, "PackageUrls");
__publicField(_PackageUrls, "items", {});
let PackageUrls = _PackageUrls;
async function listEnabledPlugins(ctx, lane = "client") {
  const pm = ctx.db.getRepository("applicationPlugins");
  const items = await pm.find({
    filter: {
      enabled: true
    }
  });
  const arr = [];
  for (const item of items) {
    if (lane === "client-v2" && !await PackageUrls.hasClientEntry(item.packageName, lane)) {
      continue;
    }
    const url = await PackageUrls.get(item.packageName, lane);
    const { name, packageName, options } = item.toJSON();
    if (url) {
      const entry = {
        name,
        packageName,
        options,
        url
      };
      if (PackageUrls.getAppDevUrl(packageName, lane)) {
        const packageJson2 = await import_plugin_manager.default.getPackageJson(packageName);
        entry.devMode = "esm";
        entry.appDevDependencies = getAppDevPluginDependencies(packageJson2, lane);
      }
      if (lane === "client" && await PackageUrls.hasClientEntry(packageName, "client-v2")) {
        const clientV2Url = await PackageUrls.get(packageName, "client-v2");
        if (clientV2Url) {
          entry.clientV2Url = clientV2Url;
        }
      }
      arr.push(entry);
    }
  }
  return arr;
}
__name(listEnabledPlugins, "listEnabledPlugins");
function normalizePmPluginKeys(filterByTk) {
  if (typeof filterByTk === "string") {
    return filterByTk.split(",").map((k) => k.trim()).filter(Boolean);
  }
  if (!Array.isArray(filterByTk) || filterByTk.some((item) => typeof item !== "string")) {
    return [];
  }
  return filterByTk.flatMap(
    (item) => item.split(",").map((k) => k.trim()).filter(Boolean)
  );
}
__name(normalizePmPluginKeys, "normalizePmPluginKeys");
function coerceAwaitResponse(value) {
  if (value === true || value === 1) {
    return true;
  }
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return v === "true" || v === "1" || v === "yes";
  }
  return false;
}
__name(coerceAwaitResponse, "coerceAwaitResponse");
var resource_default = {
  name: "pm",
  actions: {
    async add(ctx, next) {
      if (process.env.DISABLE_PM_ADD === "true") {
        ctx.throw(403, "The current environment does not allow adding plugins online");
      }
      const app = ctx.app;
      const { values = {} } = ctx.action.params;
      if (values == null ? void 0 : values.packageName) {
        const args = [];
        if (values.registry) {
          args.push("--registry=" + values.registry);
        }
        if (values.version) {
          args.push("--version=" + values.version);
        }
        if (values.authToken) {
          args.push("--auth-token=" + values.authToken);
        }
        app.runAsCLI(["pm", "add", values.packageName, ...args], { from: "user" });
      } else if (ctx.file) {
        const tmpDir = (0, import_utils.storagePathJoin)("tmp");
        try {
          await import_fs.default.promises.mkdir(tmpDir, { recursive: true });
        } catch (error) {
        }
        const tempFile = import_path.default.join(tmpDir, (0, import_utils.uid)() + import_path.default.extname(ctx.file.originalname));
        await import_fs.default.promises.writeFile(tempFile, ctx.file.buffer, "binary");
        app.runAsCLI(["pm", "add", tempFile], { from: "user" });
      } else if (values.compressedFileUrl) {
        app.runAsCLI(["pm", "add", values.compressedFileUrl], { from: "user" });
      }
      ctx.body = "ok";
      await next();
    },
    async update(ctx, next) {
      if (process.env.DISABLE_PM_ADD === "true") {
        ctx.throw(403, "The current environment does not allow adding plugins online");
      }
      const app = ctx.app;
      const values = ctx.action.params.values || {};
      const args = [];
      if (values.registry) {
        args.push("--registry=" + values.registry);
      }
      if (values.version) {
        args.push("--version=" + values.version);
      }
      if (values.authToken) {
        args.push("--auth-token=" + values.authToken);
      }
      if (ctx.file) {
        values.packageName = ctx.request.body.packageName;
        const tmpDir = (0, import_utils.storagePathJoin)("tmp");
        try {
          await import_fs.default.promises.mkdir(tmpDir, { recursive: true });
        } catch (error) {
        }
        const tempFile = import_path.default.join(tmpDir, (0, import_utils.uid)() + import_path.default.extname(ctx.file.originalname));
        await import_fs.default.promises.writeFile(tempFile, ctx.file.buffer, "binary");
        values.compressedFileUrl = tempFile;
      }
      app.runAsCLI(["pm", "update", values.compressedFileUrl || values.packageName, ...args], { from: "user" });
      ctx.body = "ok";
      await next();
    },
    async npmVersionList(ctx, next) {
      const { filterByTk } = ctx.action.params;
      if (!filterByTk) {
        ctx.throw(400, "plugin name invalid");
      }
      const pm = ctx.app.pm;
      ctx.body = await pm.getNpmVersionList(filterByTk);
      await next();
    },
    async enable(ctx, next) {
      const { filterByTk, awaitResponse: awaitResponseRaw } = ctx.action.params;
      const app = ctx.app;
      const keys = normalizePmPluginKeys(filterByTk);
      if (!keys.length) {
        ctx.throw(400, "plugin name invalid");
      }
      for (const key of keys) {
        try {
          (0, import_utils2.assertSafePluginPackageName)(key);
        } catch (error) {
          ctx.throw(400, "plugin name invalid");
        }
      }
      const awaitResponse = coerceAwaitResponse(awaitResponseRaw);
      const argv = ["pm", "enable", ...keys];
      if (awaitResponse) {
        await app.runAsCLI(argv, { from: "user", throwError: true });
      } else {
        app.runAsCLI(argv, { from: "user" }).catch((err) => {
          app.log.error(err);
        });
      }
      ctx.body = filterByTk;
      await next();
    },
    async disable(ctx, next) {
      const { filterByTk, awaitResponse: awaitResponseRaw } = ctx.action.params;
      const app = ctx.app;
      const keys = normalizePmPluginKeys(filterByTk);
      if (!keys.length) {
        ctx.throw(400, "plugin name invalid");
      }
      const awaitResponse = coerceAwaitResponse(awaitResponseRaw);
      const argv = ["pm", "disable", ...keys];
      if (awaitResponse) {
        await app.runAsCLI(argv, { from: "user", throwError: true });
      } else {
        app.runAsCLI(argv, { from: "user" }).catch((err) => {
          app.log.error(err);
        });
      }
      ctx.body = filterByTk;
      await next();
    },
    async remove(ctx, next) {
      const { filterByTk } = ctx.action.params;
      if (!filterByTk) {
        ctx.throw(400, "plugin name invalid");
      }
      const app = ctx.app;
      app.runAsCLI(["pm", "remove", filterByTk], { from: "user" });
      ctx.body = filterByTk;
      await next();
    },
    async list(ctx, next) {
      const { mode, v2 } = ctx.action.params;
      if (mode === "summary") {
        ctx.body = await (0, import_utils2.pmListSummary)(ctx.app);
        return next();
      }
      const locale = ctx.getCurrentLocale();
      const pm = ctx.app.pm;
      const plugin = pm.get("nocobase");
      const plugins = await plugin.getAllPlugins(locale);
      ctx.body = plugins.filter((item) => {
        var _a;
        if (process.env.NOCOBASE_SHOW_DEPRECATED_PLUGINS === "true") {
          return true;
        }
        if (!v2) {
          return true;
        }
        const nocobaseConfig = ((_a = item == null ? void 0 : item.packageJson) == null ? void 0 : _a.nocobase) || {};
        return nocobaseConfig.internal !== true && nocobaseConfig.deprecated !== true;
      });
      await next();
    },
    async listEnabled(ctx, next) {
      ctx.body = await listEnabledPlugins(ctx, "client");
      await next();
    },
    async listEnabledV2(ctx, next) {
      ctx.body = await listEnabledPlugins(ctx, "client-v2");
      await next();
    },
    async get(ctx, next) {
      const locale = ctx.getCurrentLocale();
      const pm = ctx.app.pm;
      const { filterByTk } = ctx.action.params;
      if (!filterByTk) {
        ctx.throw(400, "plugin name invalid");
      }
      const plugin = pm.get("nocobase");
      ctx.body = await plugin.getPluginInfo(filterByTk, locale);
      await next();
    }
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  PackageUrls
});
