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
var gateway_exports = {};
__export(gateway_exports, {
  Gateway: () => Gateway,
  getHost: () => import_utils4.getHost,
  getHostname: () => import_utils4.getHostname
});
module.exports = __toCommonJS(gateway_exports);
var import_logger = require("@nocobase/logger");
var import_utils = require("@nocobase/utils");
var import_utils2 = require("@nocobase/utils");
var import_plugin_symlink = require("@nocobase/utils/plugin-symlink");
var import_commander = require("commander");
var import_compression = __toESM(require("compression"));
var import_crypto = require("crypto");
var import_events = require("events");
var import_fs = __toESM(require("fs"));
var import_http = __toESM(require("http"));
var import_koa_compose = __toESM(require("koa-compose"));
var import_node_util = require("node:util");
var import_node_os = require("node:os");
var import_path = require("path");
var import_qs = __toESM(require("qs"));
var import_serve_handler = __toESM(require("serve-handler"));
var import_url = require("url");
var import_app_supervisor = require("../app-supervisor");
var import_plugin_manager = require("../plugin-manager");
var import_errors = require("./errors");
var import_ipc_socket_client = require("./ipc-socket-client");
var import_ipc_socket_server = require("./ipc-socket-server");
var import_utils3 = require("./utils");
var import_ws_server = require("./ws-server");
var import_node_worker_threads = require("node:worker_threads");
var import_node_process = __toESM(require("node:process"));
var import_utils4 = require("./utils");
const compress = (0, import_node_util.promisify)((0, import_compression.default)());
const APP_NAME_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_-]*$/;
const MAX_APP_NAME_LENGTH = 255;
function isValidAppName(name) {
  if (typeof name !== "string" || name.length > MAX_APP_NAME_LENGTH || !APP_NAME_PATTERN.test(name)) {
    return false;
  }
  return !(name in Object.prototype);
}
__name(isValidAppName, "isValidAppName");
function normalizeBasePath(path = "") {
  const normalized = path.replace(/\/+/g, "/").replace(/\/$/, "");
  return normalized || "/";
}
__name(normalizeBasePath, "normalizeBasePath");
function getFilesPathPrefixes(appPublicPath = "/") {
  const normalizedPublicPath = normalizeBasePath(appPublicPath);
  const canonicalPrefix = `${normalizedPublicPath === "/" ? "" : normalizedPublicPath}/files/`;
  return canonicalPrefix === "/files/" ? ["/files/"] : [canonicalPrefix, "/files/"];
}
__name(getFilesPathPrefixes, "getFilesPathPrefixes");
function getFileAccessRestPath(pathname, appPublicPath = "/") {
  const prefix = getFilesPathPrefixes(appPublicPath).find((prefix2) => pathname.startsWith(prefix2));
  return prefix ? pathname.slice(prefix.length) : null;
}
__name(getFileAccessRestPath, "getFileAccessRestPath");
function getSocketPath() {
  const socketPath = import_node_process.default.env.SOCKET_PATH;
  if (socketPath) {
    return (0, import_path.isAbsolute)(socketPath) ? socketPath : (0, import_path.resolve)(import_node_process.default.cwd(), socketPath);
  }
  if (import_node_process.default.env.NOCOBASE_RUNNING_IN_DOCKER === "true") {
    return (0, import_path.resolve)((0, import_node_os.homedir)(), ".nocobase", "gateway.sock");
  }
  return (0, import_utils.storagePathJoin)("gateway.sock");
}
__name(getSocketPath, "getSocketPath");
const _Gateway = class _Gateway extends import_events.EventEmitter {
  middlewares;
  /**
   * use main app as default app to handle request
   */
  selectorMiddlewares = new import_utils.Toposort();
  server = null;
  ipcSocketServer = null;
  wsServer;
  loggers = new import_utils.Registry();
  port = import_node_process.default.env.APP_PORT ? parseInt(import_node_process.default.env.APP_PORT) : null;
  host = "0.0.0.0";
  socketPath = getSocketPath();
  v2IndexTemplateCache = null;
  terminating = false;
  getOriginalRequestUrl(req) {
    return req.originalUrl || req.url;
  }
  async proxyRequestToSubApp(supervisor, appName, req, res) {
    const internalUrl = req.url;
    req.url = this.getOriginalRequestUrl(req);
    try {
      const proxied = await supervisor.proxyWeb(appName, req, res);
      const adapter = supervisor.getDiscoveryAdapter();
      if (!proxied && import_node_process.default.env.APP_MODE === "supervisor" && typeof adapter.proxyWeb === "function") {
        let code = "APP_ENVIRONMENT_UNAVAILABLE";
        if (typeof adapter.getAppModel === "function" && !await supervisor.getAppModel(appName)) {
          code = "APP_NOT_FOUND";
        }
        this.responseErrorWithCode(code, res, { appName });
        return true;
      }
      return proxied;
    } finally {
      req.url = internalUrl;
    }
  }
  onTerminate = /* @__PURE__ */ __name(async (signal) => {
    var _a;
    if (this.terminating) {
      return;
    }
    this.terminating = true;
    const supervisor = import_app_supervisor.AppSupervisor.getInstance();
    const apps = Object.values(supervisor.apps || {});
    try {
      for (const app of apps) {
        try {
          if (!app) {
            continue;
          }
          await app.destroy({ signal });
        } catch (error) {
          const logger = (app == null ? void 0 : app.log) ?? console;
          (_a = logger.error) == null ? void 0 : _a.call(logger, error);
        }
      }
      await supervisor.destroy();
    } catch (error) {
      console.error("Failed to shutdown applications gracefully", error);
    } finally {
      this.destroy();
    }
  }, "onTerminate");
  constructor() {
    super();
    this.reset();
    import_node_process.default.once("SIGTERM", this.onTerminate);
    import_node_process.default.once("SIGINT", this.onTerminate);
  }
  static getInstance(options = {}) {
    if (!_Gateway.instance) {
      _Gateway.instance = new _Gateway();
    }
    return _Gateway.instance;
  }
  use(middleware, options) {
    this.middlewares.add(middleware, options);
  }
  static async getIPCSocketClient() {
    const socketPath = getSocketPath();
    try {
      return await import_ipc_socket_client.IPCSocketClient.getConnection(socketPath);
    } catch (error) {
      return false;
    }
  }
  destroy() {
    import_node_process.default.off("SIGTERM", this.onTerminate);
    import_node_process.default.off("SIGINT", this.onTerminate);
    this.reset();
    _Gateway.instance = null;
  }
  reset() {
    this.middlewares = new import_utils.Toposort();
    this.selectorMiddlewares = new import_utils.Toposort();
    this.addAppSelectorMiddleware(
      async (ctx, next) => {
        var _a, _b;
        const { req } = ctx;
        const parsedUrl = (0, import_url.parse)(req.url);
        const appName = (_a = import_qs.default.parse(parsedUrl.query)) == null ? void 0 : _a.__appName;
        const apiBasePath = normalizeBasePath(import_node_process.default.env.API_BASE_PATH || "/api");
        const appPathPrefix = `${apiBasePath}/__app/`;
        if (req.headers["x-app"]) {
          ctx.resolvedAppName = req.headers["x-app"];
        }
        if (appName) {
          ctx.resolvedAppName = appName;
        }
        if ((_b = parsedUrl.pathname) == null ? void 0 : _b.startsWith(appPathPrefix)) {
          const restPath = parsedUrl.pathname.slice(appPathPrefix.length);
          const [pathAppName, ...segments] = restPath.split("/");
          if (pathAppName) {
            ctx.resolvedAppName = pathAppName;
            const rewrittenPath = `${apiBasePath}${segments.length ? `/${segments.join("/")}` : ""}`;
            const rewrittenUrl = `${rewrittenPath}${parsedUrl.search || ""}`;
            if (!req.originalUrl) {
              req.originalUrl = req.url;
            }
            req.url = rewrittenUrl;
          }
        }
        const fileAccessRestPath = parsedUrl.pathname ? getFileAccessRestPath(parsedUrl.pathname, import_node_process.default.env.APP_PUBLIC_PATH || "/") : null;
        if (fileAccessRestPath) {
          const restPath = fileAccessRestPath;
          const [pathAppName] = restPath.split("/");
          if (pathAppName) {
            try {
              ctx.resolvedAppName = decodeURIComponent(pathAppName);
            } catch (error) {
            }
          }
        }
        await next();
      },
      {
        tag: "core",
        group: "core"
      }
    );
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    if (this.ipcSocketServer) {
      this.ipcSocketServer.close();
      this.ipcSocketServer = null;
    }
    if (this.wsServer) {
      this.wsServer.close();
      this.wsServer = null;
    }
  }
  addAppSelectorMiddleware(middleware, options) {
    if (this.selectorMiddlewares.nodes.some((existingFunc) => existingFunc.toString() === middleware.toString())) {
      return;
    }
    this.selectorMiddlewares.add(middleware, options);
    this.emit("appSelectorChanged");
  }
  getLogger(appName, res) {
    if (!isValidAppName(appName)) {
      throw new Error("Invalid app name");
    }
    const reqId = (0, import_crypto.randomUUID)();
    res.setHeader("X-Request-Id", reqId);
    let logger = this.loggers.get(appName);
    if (logger) {
      return logger.child({ reqId });
    }
    logger = (0, import_logger.createSystemLogger)({
      dirname: (0, import_logger.getLoggerFilePath)(appName),
      filename: "system",
      defaultMeta: {
        app: appName,
        module: "gateway"
      }
    });
    this.loggers.register(appName, logger);
    return logger.child({ reqId });
  }
  responseError(res, error) {
    res.setHeader("Content-Type", "application/json");
    res.statusCode = error.status;
    res.end(JSON.stringify({ error }));
  }
  responseErrorWithCode(code, res, options) {
    const appName = options == null ? void 0 : options.appName;
    const loggerName = isValidAppName(appName) && import_app_supervisor.AppSupervisor.getInstance().hasApp(appName) ? appName : "main";
    const log = this.getLogger(loggerName, res);
    const error = (0, import_errors.applyErrorWithArgs)((0, import_errors.getErrorWithCode)(code), options);
    log.error(error.message, {
      method: "responseErrorWithCode",
      code,
      error,
      statusCode: res.statusCode,
      appName: options.appName
    });
    this.responseError(res, error);
  }
  getV2PublicPath() {
    return (0, import_utils3.resolveV2PublicPath)(import_node_process.default.env.APP_PUBLIC_PATH || "/");
  }
  getAppPublicPath() {
    return (0, import_utils3.resolvePublicPath)(import_node_process.default.env.APP_PUBLIC_PATH || "/");
  }
  isV2Request(pathname) {
    const v2PublicPath = this.getV2PublicPath();
    return pathname === v2PublicPath.slice(0, -1) || pathname.startsWith(v2PublicPath);
  }
  isV2IndexRequest(pathname) {
    if (!this.isV2Request(pathname)) {
      return false;
    }
    const v2PublicPath = this.getV2PublicPath();
    if (pathname === v2PublicPath || pathname === v2PublicPath.slice(0, -1) || pathname === `${v2PublicPath}index.html`) {
      return true;
    }
    return !(0, import_path.extname)(pathname);
  }
  getV2RuntimeConfig() {
    return {
      __nocobase_public_path__: this.getV2PublicPath(),
      __nocobase_modern_client_prefix__: (0, import_utils3.normalizeModernClientPrefix)(import_node_process.default.env.APP_MODERN_CLIENT_PREFIX),
      __webpack_public_path__: import_node_process.default.env.CDN_BASE_URL ? `${import_node_process.default.env.CDN_BASE_URL.replace(/\/+$/, "")}/` : "",
      __nocobase_api_base_url__: import_node_process.default.env.API_BASE_URL || import_node_process.default.env.API_BASE_PATH,
      __nocobase_api_client_storage_prefix__: import_node_process.default.env.API_CLIENT_STORAGE_PREFIX,
      __nocobase_api_client_storage_type__: import_node_process.default.env.API_CLIENT_STORAGE_TYPE,
      __nocobase_api_client_share_token__: import_node_process.default.env.API_CLIENT_SHARE_TOKEN === "true",
      __nocobase_ws_url__: import_node_process.default.env.WEBSOCKET_URL || "",
      __nocobase_ws_path__: import_node_process.default.env.WS_PATH,
      __nocobase_app_dev__: import_node_process.default.env.NOCOBASE_APP_DEV === "true",
      __esm_cdn_base_url__: import_node_process.default.env.ESM_CDN_BASE_URL || "https://esm.sh",
      __esm_cdn_suffix__: import_node_process.default.env.ESM_CDN_SUFFIX || ""
    };
  }
  getV2RuntimeConfigScript() {
    const runtimeConfig = this.getV2RuntimeConfig();
    const scriptContent = Object.entries(runtimeConfig).map(([key, value]) => `window['${key}'] = ${JSON.stringify(value)};`).join("\n");
    return `<script>${scriptContent}</script>`;
  }
  getV2AssetPublicPath() {
    if (import_node_process.default.env.CDN_BASE_URL) {
      return `${import_node_process.default.env.CDN_BASE_URL.replace(/\/+$/, "")}/${import_utils3.MODERN_CLIENT_DIST_DIR}/`;
    }
    return this.getV2PublicPath();
  }
  getV2IndexTemplate() {
    const file = `${import_node_process.default.env.APP_PACKAGE_ROOT}/dist/client/${import_utils3.MODERN_CLIENT_DIST_DIR}/index.html`;
    if (!import_fs.default.existsSync(file)) {
      return null;
    }
    const stat = import_fs.default.statSync(file);
    if (this.v2IndexTemplateCache && this.v2IndexTemplateCache.file === file && this.v2IndexTemplateCache.mtimeMs === stat.mtimeMs) {
      return this.v2IndexTemplateCache.html;
    }
    const html = import_fs.default.readFileSync(file, "utf-8");
    this.v2IndexTemplateCache = {
      file,
      mtimeMs: stat.mtimeMs,
      html
    };
    return html;
  }
  renderV2IndexHtml() {
    const template = this.getV2IndexTemplate();
    if (!template) {
      return null;
    }
    const html = (0, import_utils3.rewriteV2AssetPublicPath)(template, this.getV2AssetPublicPath());
    return (0, import_utils3.injectRuntimeScript)(html, this.getV2RuntimeConfigScript());
  }
  async requestHandler(req, res) {
    const { pathname, search } = (0, import_url.parse)(req.url);
    const { PLUGIN_STATICS_PATH } = import_node_process.default.env;
    const APP_PUBLIC_PATH = this.getAppPublicPath();
    if (pathname.endsWith("/__umi/api/bundle-status")) {
      res.statusCode = 200;
      res.end("ok");
      return;
    }
    if (APP_PUBLIC_PATH !== "/" && pathname.startsWith("/files/")) {
      res.statusCode = 302;
      res.setHeader("Location", `${APP_PUBLIC_PATH.replace(/\/$/, "")}${pathname}${search || ""}`);
      res.end();
      return;
    }
    const supervisor = import_app_supervisor.AppSupervisor.getInstance();
    let handleApp = "main";
    try {
      handleApp = await this.getRequestHandleAppName(req);
    } catch (error) {
      if (error instanceof import_errors.InvalidAppNameError) {
        this.responseErrorWithCode("INVALID_APP_NAME", res, {});
        return;
      }
      this.getLogger("main", res).error("Failed to get handle app name", { error });
      this.responseErrorWithCode("APP_INITIALIZING", res, { appName: handleApp });
      return;
    }
    if (pathname.startsWith(APP_PUBLIC_PATH + "dist/")) {
      if (handleApp !== "main") {
        const isProxy = await this.proxyRequestToSubApp(supervisor, handleApp, req, res);
        if (isProxy) {
          return;
        }
      }
      req.url = req.url.substring(APP_PUBLIC_PATH.length + "dist".length);
      await compress(req, res);
      return (0, import_serve_handler.default)(req, res, {
        public: (0, import_utils.storagePathJoin)("dist-client"),
        directoryListing: false
      });
    }
    if (pathname.startsWith(PLUGIN_STATICS_PATH) && !pathname.includes("/server/")) {
      if (handleApp !== "main") {
        const isProxy = await this.proxyRequestToSubApp(supervisor, handleApp, req, res);
        if (isProxy) {
          return;
        }
      }
      await compress(req, res);
      const packageName = (0, import_plugin_manager.getPackageNameByExposeUrl)(pathname);
      const publicDir = (0, import_plugin_manager.getPackageDirByExposeUrl)(pathname);
      const destination = pathname.replace(PLUGIN_STATICS_PATH, "").replace(packageName, "");
      return (0, import_serve_handler.default)(req, res, {
        public: publicDir,
        rewrites: [
          {
            source: pathname,
            destination
          }
        ]
      });
    }
    const isFilesRequest = Boolean(getFileAccessRestPath(pathname, APP_PUBLIC_PATH));
    const isLegacyUploadRequest = pathname.startsWith(APP_PUBLIC_PATH + "storage/uploads/");
    if (!pathname.startsWith(import_node_process.default.env.API_BASE_PATH) && !isFilesRequest && !isLegacyUploadRequest) {
      if (this.isV2Request(pathname)) {
        if (handleApp !== "main") {
          const isProxy = await this.proxyRequestToSubApp(supervisor, handleApp, req, res);
          if (isProxy) {
            return;
          }
        }
        if (this.isV2IndexRequest(pathname)) {
          const v2Html = this.renderV2IndexHtml();
          if (v2Html) {
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.end(v2Html);
            return;
          }
        }
        req.url = req.url.substring(APP_PUBLIC_PATH.length - 1);
        const modernPrefix = (0, import_utils3.normalizeModernClientPrefix)(import_node_process.default.env.APP_MODERN_CLIENT_PREFIX);
        if (modernPrefix !== import_utils3.MODERN_CLIENT_DIST_DIR && req.url.startsWith(`/${modernPrefix}/`)) {
          req.url = `/${import_utils3.MODERN_CLIENT_DIST_DIR}/${req.url.slice(modernPrefix.length + 2)}`;
        }
        await compress(req, res);
        return (0, import_serve_handler.default)(req, res, {
          public: `${import_node_process.default.env.APP_PACKAGE_ROOT}/dist/client`
        });
      }
      if (handleApp !== "main") {
        const isProxy = await this.proxyRequestToSubApp(supervisor, handleApp, req, res);
        if (isProxy) {
          return;
        }
      }
      req.url = req.url.substring(APP_PUBLIC_PATH.length - 1);
      await compress(req, res);
      return (0, import_serve_handler.default)(req, res, {
        public: `${import_node_process.default.env.APP_PACKAGE_ROOT}/dist/client`,
        rewrites: [{ source: "/**", destination: "/index.html" }]
      });
    }
    if (handleApp !== "main") {
      const isProxy = await this.proxyRequestToSubApp(supervisor, handleApp, req, res);
      if (isProxy) {
        return;
      }
    }
    const hasApp = supervisor.hasApp(handleApp);
    if (!hasApp) {
      void supervisor.bootstrapApp(handleApp);
    }
    let appStatus = await supervisor.getAppStatus(handleApp, "preparing");
    if (appStatus === "not_found") {
      this.responseErrorWithCode("APP_NOT_FOUND", res, { appName: handleApp });
      return;
    }
    if (appStatus === "preparing") {
      this.responseErrorWithCode("APP_PREPARING", res, { appName: handleApp });
      return;
    }
    if (appStatus === "initializing") {
      this.responseErrorWithCode("APP_INITIALIZING", res, { appName: handleApp });
      return;
    }
    if (appStatus === "initialized") {
      const appInstance = await supervisor.getApp(handleApp);
      if (!appInstance) {
        this.responseErrorWithCode("APP_NOT_FOUND", res, { appName: handleApp });
        return;
      }
      supervisor.startApp(handleApp);
      appStatus = await supervisor.getAppStatus(handleApp);
    }
    const app = await supervisor.getApp(handleApp);
    if (!app) {
      this.responseErrorWithCode("APP_NOT_FOUND", res, { appName: handleApp });
      return;
    }
    if (appStatus !== "running") {
      this.responseErrorWithCode(`${appStatus}`, res, { app, appName: handleApp });
      return;
    }
    if (req.url.endsWith("/__health_check")) {
      res.statusCode = 200;
      res.end("ok");
      return;
    }
    if (handleApp !== "main") {
      await supervisor.setAppLastSeenAt(handleApp);
    }
    const ctx = { req, res, appName: handleApp };
    const fn = (0, import_koa_compose.default)([
      ...this.middlewares.nodes,
      async (_ctx) => {
        await app.callback()(req, res);
      }
    ]);
    await fn(ctx);
  }
  getAppSelectorMiddlewares() {
    return this.selectorMiddlewares;
  }
  async getRequestHandleAppName(req) {
    const appSelectorMiddlewares = this.selectorMiddlewares.sort();
    const ctx = {
      req,
      resolvedAppName: null
    };
    await (0, import_koa_compose.default)(appSelectorMiddlewares)(ctx);
    if (!ctx.resolvedAppName) {
      ctx.resolvedAppName = "main";
    }
    if (!isValidAppName(ctx.resolvedAppName)) {
      throw new import_errors.InvalidAppNameError(ctx.resolvedAppName);
    }
    return ctx.resolvedAppName;
  }
  async handleUpgrade(request, socket, head) {
    const isProxy = await import_app_supervisor.AppSupervisor.getInstance().proxyWs(request, socket, head);
    if (isProxy) {
      return;
    }
    const appInstance = await import_app_supervisor.AppSupervisor.getInstance().getApp("main");
    for (const handle of _Gateway.wsServers) {
      const result = await handle(request, socket, head, appInstance);
      if (result !== false) {
        return;
      }
    }
    const { pathname } = (0, import_url.parse)(request.url);
    if (pathname === import_node_process.default.env.WS_PATH) {
      this.wsServer.wss.handleUpgrade(request, socket, head, (ws) => {
        this.wsServer.wss.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  }
  getCallback() {
    return this.requestHandler.bind(this);
  }
  /* istanbul ignore next -- @preserve */
  async watch() {
    if (!import_node_process.default.env.IS_DEV_CMD) {
      return;
    }
    const file = import_node_process.default.env.WATCH_FILE;
    if (!import_fs.default.existsSync(file)) {
      await import_fs.default.promises.writeFile(file, `export const watchId = '${(0, import_utils.uid)()}';`, "utf-8");
    }
    require(file);
  }
  /* istanbul ignore next -- @preserve */
  async run(options) {
    const isStart = this.isStart();
    let ipcClient;
    if (isStart) {
      await this.watch();
      const startOptions = this.getStartOptions();
      const port = startOptions.port || import_node_process.default.env.APP_PORT || 13e3;
      const host = startOptions.host || import_node_process.default.env.APP_HOST || "0.0.0.0";
      this.start({
        port,
        host
      });
    } else if (!this.isHelp()) {
      ipcClient = await this.tryConnectToIPCServer();
      if (ipcClient) {
        const response = await ipcClient.write({ type: "passCliArgv", payload: { argv: import_node_process.default.argv } });
        ipcClient.close();
        if (!["error", "not_found"].includes(response.type)) {
          return;
        }
      }
    }
    if (isStart || !ipcClient) {
      await (0, import_plugin_symlink.syncPluginSymlinks)();
    }
    const mainApp = import_app_supervisor.AppSupervisor.getInstance().bootMainApp(options.mainAppOptions);
    mainApp.setMaxListeners(50);
    mainApp.once("afterStart", () => {
      (0, import_utils2.lockdownSes)({
        consoleTaming: "unsafe",
        errorTaming: "unsafe",
        overrideTaming: "moderate",
        stackFiltering: "verbose"
      });
    });
    let runArgs = [import_node_process.default.argv, { throwError: true, from: "node" }];
    if (!import_node_worker_threads.isMainThread) {
      runArgs = [import_node_worker_threads.workerData.argv, { throwError: true, from: "user" }];
    }
    mainApp.runAsCLI(...runArgs).then(async () => {
      if (!isStart && !await mainApp.isStarted()) {
        await mainApp.stop({ logging: false });
      }
    }).catch(async (e) => {
      if (e.code !== "commander.helpDisplayed") {
        if (!import_node_worker_threads.isMainThread) {
          throw e;
        }
        mainApp.log.error(e);
      }
      if (!isStart && !await mainApp.isStarted()) {
        await mainApp.stop({ logging: false });
      }
    });
  }
  isStart() {
    const argv = import_node_process.default.argv;
    return argv[2] === "start";
  }
  isHelp() {
    const argv = import_node_process.default.argv;
    return argv[2] === "help";
  }
  getStartOptions() {
    const program = new import_commander.Command();
    program.allowUnknownOption().option("-s, --silent").option("-p, --port [post]").option("-h, --host [host]").option("--db-sync").parse(import_node_process.default.argv);
    return program.opts();
  }
  start(options) {
    this.startHttpServer(options);
    this.startIPCSocketServer();
  }
  startIPCSocketServer() {
    this.ipcSocketServer = import_ipc_socket_server.IPCSocketServer.buildServer(this.socketPath);
  }
  startHttpServer(options) {
    if ((options == null ? void 0 : options.port) !== null) {
      this.port = options.port;
    }
    if (options == null ? void 0 : options.host) {
      this.host = options.host;
    }
    if (this.port === null) {
      console.log("gateway port is not set, http server will not start");
      return;
    }
    this.server = import_http.default.createServer(async (req, res) => {
      const appInstance = await import_app_supervisor.AppSupervisor.getInstance().getApp("main");
      for (const handler2 of _Gateway.requestHandlers) {
        try {
          const result = await handler2(req, res, appInstance);
          if (result !== false) {
            return;
          }
        } catch (error) {
          console.error("gateway request handler error:", error);
        }
      }
      this.getCallback()(req, res);
    });
    this.wsServer = new import_ws_server.WSServer();
    this.server.on("upgrade", (request, socket, head) => {
      this.handleUpgrade(request, socket, head).catch((error) => {
        import_app_supervisor.AppSupervisor.getInstance().logger.error("Failed to handle websocket upgrade", { error });
        socket.destroy();
      });
    });
    this.server.listen(this.port, this.host, () => {
      console.log(`Gateway HTTP Server running at http://${this.host}:${this.port}/`);
      if (options == null ? void 0 : options.callback) {
        options.callback(this.server);
      }
    });
  }
  async tryConnectToIPCServer() {
    try {
      const ipcClient = await this.getIPCSocketClient();
      return ipcClient;
    } catch (e) {
      return false;
    }
  }
  async getIPCSocketClient() {
    return await import_ipc_socket_client.IPCSocketClient.getConnection(this.socketPath);
  }
  close() {
    var _a, _b;
    (_a = this.server) == null ? void 0 : _a.close();
    (_b = this.wsServer) == null ? void 0 : _b.close();
  }
  static registerRequestHandler(handler2) {
    _Gateway.requestHandlers.push(handler2);
  }
  static unregisterRequestHandler(handler2) {
    _Gateway.requestHandlers = _Gateway.requestHandlers.filter((h) => h !== handler2);
  }
  static registerWsHandler(wsServer) {
    _Gateway.wsServers.push(wsServer);
  }
  static unregisterWsHandler(wsServer) {
    _Gateway.wsServers = _Gateway.wsServers.filter((ws) => ws !== wsServer);
  }
};
__name(_Gateway, "Gateway");
__publicField(_Gateway, "instance");
__publicField(_Gateway, "requestHandlers", []);
__publicField(_Gateway, "wsServers", []);
let Gateway = _Gateway;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Gateway,
  getHost,
  getHostname
});
