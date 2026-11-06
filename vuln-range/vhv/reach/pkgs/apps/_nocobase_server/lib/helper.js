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
var helper_exports = {};
__export(helper_exports, {
  createAppProxy: () => createAppProxy,
  createContextVariablesScope: () => createContextVariablesScope,
  createI18n: () => createI18n,
  createResourcer: () => createResourcer,
  enablePerfHooks: () => enablePerfHooks,
  getBodyLimit: () => getBodyLimit,
  getCommandFullName: () => getCommandFullName,
  registerMiddlewares: () => registerMiddlewares,
  resolveCorsOrigin: () => resolveCorsOrigin,
  tsxRerunning: () => tsxRerunning
});
module.exports = __toCommonJS(helper_exports);
var import_cors = __toESM(require("@koa/cors"));
var import_logger = require("@nocobase/logger");
var import_resourcer = require("@nocobase/resourcer");
var import_utils = require("@nocobase/utils");
var import_crypto = require("crypto");
var import_fs = __toESM(require("fs"));
var import_i18next = __toESM(require("i18next"));
var import_koa_bodyparser = __toESM(require("koa-bodyparser"));
var import_koa_send = __toESM(require("koa-send"));
var import_perf_hooks = require("perf_hooks");
var import_data_wrapping = require("./middlewares/data-wrapping");
var import_extract_client_ip = require("./middlewares/extract-client-ip");
var import_static_file_security = require("./gateway/static-file-security");
var import_i18n = require("./middlewares/i18n");
function resolveAppPublicPath(value = "/") {
  const normalized = String(value || "/").trim() || "/";
  const withLeadingSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}
__name(resolveAppPublicPath, "resolveAppPublicPath");
function resolveApiBasePath(value = "/api") {
  const normalized = String(value || "/api").trim() || "/api";
  const withLeadingSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return withLeadingSlash.replace(/\/+$/g, "") || "/";
}
__name(resolveApiBasePath, "resolveApiBasePath");
function createI18n(options) {
  const instance = import_i18next.default.createInstance();
  instance.init({
    lng: process.env.INIT_LANG || "en-US",
    resources: {},
    keySeparator: false,
    nsSeparator: false,
    ...options.i18n
  });
  return instance;
}
__name(createI18n, "createI18n");
function createResourcer(options) {
  return new import_resourcer.Resourcer({ ...options.resourcer });
}
__name(createResourcer, "createResourcer");
function isWhitelistedCorsOrigin(ctx) {
  const origin = ctx.get("origin");
  if (!origin) {
    return false;
  }
  return (0, import_utils.isTrustedOrigin)(ctx, origin);
}
__name(isWhitelistedCorsOrigin, "isWhitelistedCorsOrigin");
function resolveCorsOrigin(ctx) {
  const origin = ctx.get("origin");
  const disallowNoOrigin = process.env.CORS_DISALLOW_NO_ORIGIN === "true";
  const whitelist = (0, import_utils.getCorsWhitelist)();
  if (!origin && disallowNoOrigin) {
    return false;
  }
  if (isWhitelistedCorsOrigin(ctx)) {
    return origin;
  }
  return whitelist ? false : origin;
}
__name(resolveCorsOrigin, "resolveCorsOrigin");
function registerMiddlewares(app, options) {
  var _a;
  app.use(
    /* @__PURE__ */ __name(async function generateReqId(ctx, next) {
      app.context.reqId = (0, import_crypto.randomUUID)();
      await next();
    }, "generateReqId"),
    { tag: "generateReqId" }
  );
  app.use(app.auditManager.middleware(), { tag: "audit", after: "generateReqId" });
  app.use((0, import_logger.requestLogger)(app.name, app.requestLogger, (_a = options.logger) == null ? void 0 : _a.request), { tag: "logger" });
  app.use(
    (0, import_cors.default)({
      credentials: isWhitelistedCorsOrigin,
      exposeHeaders: ["content-disposition", "x-new-token"],
      origin: resolveCorsOrigin,
      ...options.cors
    }),
    {
      tag: "cors",
      after: "bodyParser"
    }
  );
  if (options.bodyParser !== false) {
    const bodyLimit = getBodyLimit();
    app.use(
      (0, import_koa_bodyparser.default)({
        jsonLimit: bodyLimit,
        formLimit: bodyLimit,
        textLimit: bodyLimit,
        ...options.bodyParser
      }),
      {
        tag: "bodyParser",
        after: "logger"
      }
    );
  }
  app.use(/* @__PURE__ */ __name(async function getBearerToken(ctx, next) {
    ctx.getBearerToken = () => {
      var _a2, _b;
      const authorization = ctx.get("Authorization");
      if (authorization) {
        ctx.state.pendingAuthTokenSource = "authorization";
        return authorization.replace(/^Bearer\s+/gi, "");
      }
      if (ctx.query.token) {
        ctx.state.pendingAuthTokenSource = "query";
        return ctx.query.token;
      }
      const canUseAuthCookie = Boolean(((_a2 = ctx.state) == null ? void 0 : _a2.fileAccess) || ((_b = ctx.state) == null ? void 0 : _b.legacyFileAccess)) && ["GET", "HEAD"].includes(ctx.method);
      const cookieToken = canUseAuthCookie ? ctx.cookies.get((0, import_utils.getAuthCookieName)("authToken", app.name)) : void 0;
      ctx.state.pendingAuthTokenSource = cookieToken ? "cookie" : void 0;
      return cookieToken;
    };
    await next();
  }, "getBearerToken"));
  app.use(import_i18n.i18n, { tag: "i18n", before: "cors" });
  if (options.dataWrapping !== false) {
    app.use((0, import_data_wrapping.dataWrapping)(), { tag: "dataWrapping", after: "cors" });
  }
  app.use(
    /* @__PURE__ */ __name(async function legacyFileAccess(ctx, next) {
      const publicPath = resolveAppPublicPath(process.env.APP_PUBLIC_PATH);
      const uploadsPrefix = `${publicPath}storage/uploads/`;
      const authCheckPath = `${resolveApiBasePath(process.env.API_BASE_PATH)}/auth:checkLegacyFileAccess`;
      const isUploadRequest = ctx.path.startsWith(uploadsPrefix);
      const isAuthCheckRequest = ctx.path === authCheckPath || ctx.path === "/auth:checkLegacyFileAccess";
      if (!isUploadRequest && !isAuthCheckRequest) {
        return next();
      }
      if (!["GET", "HEAD"].includes(ctx.method)) {
        return ctx.throw(405);
      }
      ctx.state.legacyFileAccess = true;
      ctx.state.legacyLocalStoragePublicAccess = process.env.LEGACY_LOCAL_STORAGE_PUBLIC_ACCESS === "true";
      if (ctx.state.legacyLocalStoragePublicAccess) {
        ctx.skipAuthCheck = true;
      }
      if (isAuthCheckRequest) {
        return next();
      }
      const originalPath = ctx.path;
      ctx.path = authCheckPath;
      try {
        await next();
      } finally {
        ctx.path = originalPath;
      }
      const relativePath = `uploads/${originalPath.slice(uploadsPrefix.length)}`;
      const headers = (0, import_static_file_security.getStorageUploadSecurityHeaders)(`${originalPath}${ctx.search || ""}`);
      if (!headers["Content-Disposition"]) {
        headers["Content-Disposition"] = "inline";
      }
      for (const [name, value] of Object.entries(headers)) {
        ctx.set(name, value);
      }
      ctx.status = 200;
      await (0, import_koa_send.default)(ctx, relativePath, { root: (0, import_utils.resolveStorageRoot)() });
    }, "legacyFileAccess"),
    { tag: "legacyFileAccess", before: "dataSource", after: "dataWrapping" }
  );
  app.use(app.dataSourceManager.middleware(), { tag: "dataSource", after: "dataWrapping" });
  app.use((0, import_extract_client_ip.extractClientIp)(), { tag: "extractClientIp", before: "cors" });
}
__name(registerMiddlewares, "registerMiddlewares");
const createAppProxy = /* @__PURE__ */ __name((app) => {
  return new Proxy(app, {
    get(target, prop, ...args) {
      if (typeof prop === "string" && ["on", "once", "addListener"].includes(prop)) {
        return (eventName, listener) => {
          listener["_reinitializable"] = true;
          return target[prop](eventName, listener);
        };
      }
      return Reflect.get(target, prop, ...args);
    }
  });
}, "createAppProxy");
const getCommandFullName = /* @__PURE__ */ __name((command) => {
  const names = [];
  names.push(command.name());
  let parent = command == null ? void 0 : command.parent;
  while (parent) {
    if (!(parent == null ? void 0 : parent.parent)) {
      break;
    }
    names.unshift(parent.name());
    parent = parent.parent;
  }
  return names.join(".");
}, "getCommandFullName");
/* istanbul ignore next -- @preserve */
const tsxRerunning = /* @__PURE__ */ __name(async () => {
  await import_fs.default.promises.writeFile(process.env.WATCH_FILE, `export const watchId = '${(0, import_utils.uid)()}';`, "utf-8");
}, "tsxRerunning");
/* istanbul ignore next -- @preserve */
const enablePerfHooks = /* @__PURE__ */ __name((app) => {
  app.context.getPerfHistogram = (name) => {
    if (!app.perfHistograms.has(name)) {
      app.perfHistograms.set(name, (0, import_perf_hooks.createHistogram)());
    }
    return app.perfHistograms.get(name);
  };
  app.resourcer.define({
    name: "perf",
    actions: {
      view: /* @__PURE__ */ __name(async (ctx, next) => {
        const result = {};
        const histograms = ctx.app.perfHistograms;
        const sortedHistograms = [...histograms.entries()].sort(([i, a], [j, b]) => b.mean - a.mean);
        sortedHistograms.forEach(([name, histogram]) => {
          result[name] = histogram;
        });
        ctx.body = result;
        await next();
      }, "view"),
      reset: /* @__PURE__ */ __name(async (ctx, next) => {
        const histograms = ctx.app.perfHistograms;
        histograms.forEach((histogram) => histogram.reset());
        await next();
      }, "reset")
    }
  });
  app.acl.allow("perf", "*", "public");
}, "enablePerfHooks");
function getBodyLimit() {
  return process.env.REQUEST_BODY_LIMIT || "10mb";
}
__name(getBodyLimit, "getBodyLimit");
function getUser(ctx) {
  return async ({ fields }) => {
    var _a, _b;
    const userFields = fields.filter((f) => f && ctx.db.getFieldByPath("users." + f));
    (_a = ctx.logger) == null ? void 0 : _a.info("filter-parse: ", { userFields });
    if (!ctx.state.currentUser) {
      return;
    }
    if (!userFields.length) {
      return;
    }
    const user = await ctx.db.getRepository("users").findOne({
      filterByTk: ctx.state.currentUser.id,
      fields: userFields
    });
    (_b = ctx.logger) == null ? void 0 : _b.info("filter-parse: ", {
      $user: user == null ? void 0 : user.toJSON()
    });
    return user;
  };
}
__name(getUser, "getUser");
function isNumeric(str) {
  if (typeof str === "number") return true;
  if (typeof str != "string") return false;
  return !isNaN(str) && !isNaN(parseFloat(str));
}
__name(isNumeric, "isNumeric");
function getFieldFromCollectionManager(ctx, resourceName, fieldPath) {
  var _a;
  const collectionManager = (_a = ctx.dataSource) == null ? void 0 : _a.collectionManager;
  if (!(collectionManager == null ? void 0 : collectionManager.getCollection)) {
    return;
  }
  const collection = collectionManager.getCollection(resourceName);
  if (!(collection == null ? void 0 : collection.getField)) {
    return;
  }
  const [firstName, ...others] = fieldPath.split(".");
  let field = collection.getField(firstName);
  if (!field || !others.length) {
    return field;
  }
  let currentCollection = typeof field.targetCollection === "function" ? field.targetCollection() : field.targetCollection;
  for (const name of others) {
    if (!(currentCollection == null ? void 0 : currentCollection.getField)) {
      return;
    }
    field = currentCollection.getField(name);
    if (!field) {
      return;
    }
    currentCollection = typeof field.targetCollection === "function" ? field.targetCollection() : field.targetCollection;
  }
  return field;
}
__name(getFieldFromCollectionManager, "getFieldFromCollectionManager");
function createContextVariablesScope(ctx) {
  const state = JSON.parse(JSON.stringify(ctx.state));
  return {
    timezone: ctx.get("x-timezone"),
    now: (/* @__PURE__ */ new Date()).toISOString(),
    getField: /* @__PURE__ */ __name((path) => {
      const { resourceName } = ctx.action;
      const fieldPath = path.split(".").filter((p) => !p.startsWith("$") && !isNumeric(p)).join(".");
      if (!ctx.database) {
        return getFieldFromCollectionManager(ctx, resourceName, fieldPath);
      }
      return ctx.database.getFieldByPath(`${resourceName}.${fieldPath}`);
    }, "getField"),
    vars: {
      ctx: {
        state
      },
      // @deprecated
      $system: {
        now: (/* @__PURE__ */ new Date()).toISOString()
      },
      // @deprecated
      $date: (0, import_utils.getDateVars)(),
      // 新的命名方式，防止和 formily 内置变量冲突
      $nDate: (0, import_utils.getDateVars)(),
      $user: getUser(ctx),
      $nRole: ctx.state.currentRole === "__union__" ? ctx.state.currentRoles : ctx.state.currentRole
    }
  };
}
__name(createContextVariablesScope, "createContextVariablesScope");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createAppProxy,
  createContextVariablesScope,
  createI18n,
  createResourcer,
  enablePerfHooks,
  getBodyLimit,
  getCommandFullName,
  registerMiddlewares,
  resolveCorsOrigin,
  tsxRerunning
});
