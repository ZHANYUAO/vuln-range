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
var app_supervisor_exports = {};
__export(app_supervisor_exports, {
  AppSupervisor: () => AppSupervisor,
  MainOnlyAdapter: () => import_main_only_adapter2.MainOnlyAdapter
});
module.exports = __toCommonJS(app_supervisor_exports);
var import_lodash = __toESM(require("lodash"));
var import_utils = require("@nocobase/utils");
var import_events = require("events");
var import_application = __toESM(require("../application"));
var import_worker_mode = require("../worker-mode");
var import_main_only_adapter = require("./main-only-adapter");
var import_handler = require("../errors/handler");
var import_condition_registry = require("./condition-registry");
var import_db_creator = require("./db-creator");
var import_app_options_factory = require("./app-options-factory");
var import_logger = require("@nocobase/logger");
var import_aes_encryptor = __toESM(require("../aes-encryptor"));
var import_lodash2 = __toESM(require("lodash"));
var import_main_only_adapter2 = require("./main-only-adapter");
const _AppSupervisor = class _AppSupervisor extends import_events.EventEmitter {
  runningMode = "multiple";
  singleAppName = null;
  logger;
  aesEncryptor;
  discoveryAdapter;
  processAdapter;
  commandAdapter;
  discoveryAdapterName;
  processAdapterName;
  commandAdapterName;
  appDbCreator = new import_condition_registry.ConditionalRegistry();
  appConditions = /* @__PURE__ */ new Map();
  appManifests = /* @__PURE__ */ new Map();
  appSsoIssuer;
  appOptionsFactory = import_app_options_factory.appOptionsFactory;
  environmentHeartbeatInterval = 2 * 60 * 1e3;
  environmentHeartbeatTimeout = 5 * 60 * 1e3;
  environmentHeartbeatTimer = null;
  constructor() {
    super();
    if (process.env.STARTUP_SUBAPP) {
      this.runningMode = "single";
      this.singleAppName = process.env.STARTUP_SUBAPP;
    }
    this.logger = (0, import_logger.createSystemLogger)({
      dirname: (0, import_logger.getLoggerFilePath)("main"),
      filename: "system",
      level: (0, import_logger.getLoggerLevel)(),
      seperateError: true,
      defaultMeta: {
        app: "main",
        module: "app-supervisor"
      }
    });
    this.discoveryAdapterName = this.resolveDiscoveryAdapterName();
    this.processAdapterName = this.resolveProcessAdapterName();
    this.commandAdapterName = this.resolveCommandAdapterName();
    this.logger.info(`App supervisor initialized`, {
      discoveryAdapter: this.discoveryAdapterName,
      processAdapter: this.processAdapterName,
      commandAdapter: this.commandAdapterName || ""
    });
    this.discoveryAdapter = this.createDiscoveryAdapter();
    this.processAdapter = this.createProcessAdapter();
    this.commandAdapter = this.createCommandAdapter();
    this.registerAppDbCreator(import_db_creator.createDatabaseCondition, import_db_creator.createDatabase);
    this.registerAppDbCreator(import_db_creator.createConnectionCondition, import_db_creator.createConnection);
    this.registerAppDbCreator(import_db_creator.createSchemaCondition, import_db_creator.createSchema);
    if (process.env.APP_SUPERVISOR_AES_SECRET_KEY) {
      try {
        const key = Buffer.from(process.env.APP_SUPERVISOR_AES_SECRET_KEY, "hex");
        this.aesEncryptor = new import_aes_encryptor.default(key);
      } catch (error) {
        this.logger.warn("Failed to initialize APP_SUPERVISOR_AES_SECRET_KEY encryptor", {
          error: error.message
        });
      }
    }
  }
  resolveDiscoveryAdapterName() {
    return process.env.APP_DISCOVERY_ADAPTER || _AppSupervisor.defaultDiscoveryAdapterName;
  }
  resolveProcessAdapterName() {
    return process.env.APP_PROCESS_ADAPTER || _AppSupervisor.defaultProcessAdapterName;
  }
  resolveCommandAdapterName() {
    return process.env.APP_COMMAND_ADAPTER || _AppSupervisor.defaultCommandAdapterName;
  }
  createDiscoveryAdapter() {
    const adapterName = this.discoveryAdapterName;
    let factory = adapterName ? _AppSupervisor.discoveryAdapterFactories.get(adapterName) : null;
    if (!factory && _AppSupervisor.defaultDiscoveryAdapterName && adapterName !== _AppSupervisor.defaultDiscoveryAdapterName) {
      factory = _AppSupervisor.discoveryAdapterFactories.get(_AppSupervisor.defaultDiscoveryAdapterName);
    }
    if (!factory) {
      throw new Error("No AppDiscovery adapter available");
    }
    return factory({ supervisor: this });
  }
  isProcessCapableAdapter(adapter) {
    return adapter && typeof adapter.addApp === "function" && typeof adapter.startApp === "function";
  }
  createProcessAdapter() {
    const adapterName = this.processAdapterName;
    if (adapterName && adapterName === this.discoveryAdapterName && this.isProcessCapableAdapter(this.discoveryAdapter)) {
      return this.discoveryAdapter;
    }
    let factory = adapterName ? _AppSupervisor.processAdapterFactories.get(adapterName) : null;
    if (!factory && _AppSupervisor.defaultProcessAdapterName && adapterName !== _AppSupervisor.defaultProcessAdapterName) {
      factory = _AppSupervisor.processAdapterFactories.get(_AppSupervisor.defaultProcessAdapterName);
    }
    if (!factory) {
      throw new Error("No AppProcess adapter available");
    }
    return factory({ supervisor: this });
  }
  createCommandAdapter() {
    const adapterName = this.commandAdapterName;
    let factory = adapterName ? _AppSupervisor.commandAdapterFactories.get(adapterName) : null;
    if (!factory && _AppSupervisor.defaultCommandAdapterName && adapterName !== _AppSupervisor.defaultCommandAdapterName) {
      factory = _AppSupervisor.commandAdapterFactories.get(_AppSupervisor.defaultCommandAdapterName);
    }
    if (!factory) {
      return;
    }
    return factory({ supervisor: this });
  }
  static registerDiscoveryAdapter(name, factory) {
    _AppSupervisor.discoveryAdapterFactories.set(name, factory);
  }
  static registerProcessAdapter(name, factory) {
    _AppSupervisor.processAdapterFactories.set(name, factory);
  }
  static registerCommandAdapter(name, factory) {
    _AppSupervisor.commandAdapterFactories.set(name, factory);
  }
  static setDefaultDiscoveryAdapter(name) {
    _AppSupervisor.defaultDiscoveryAdapterName = name;
  }
  static setDefaultProcessAdapter(name) {
    _AppSupervisor.defaultProcessAdapterName = name;
  }
  static setDefaultCommandAdapter(name) {
    _AppSupervisor.defaultCommandAdapterName = name;
  }
  static getInstance() {
    if (!_AppSupervisor.instance) {
      _AppSupervisor.instance = new _AppSupervisor();
    }
    return _AppSupervisor.instance;
  }
  get apps() {
    return this.processAdapter.apps ?? /* @__PURE__ */ Object.create(null);
  }
  get appStatus() {
    return this.discoveryAdapter.appStatus ?? /* @__PURE__ */ Object.create(null);
  }
  get appErrors() {
    return this.processAdapter.appErrors ?? /* @__PURE__ */ Object.create(null);
  }
  get lastSeenAt() {
    return this.discoveryAdapter.lastSeenAt ?? /* @__PURE__ */ new Map();
  }
  get lastMaintainingMessage() {
    return this.processAdapter.lastMaintainingMessage ?? /* @__PURE__ */ Object.create(null);
  }
  get statusBeforeCommanding() {
    return this.processAdapter.statusBeforeCommanding ?? /* @__PURE__ */ Object.create(null);
  }
  get environmentName() {
    return this.discoveryAdapter.environmentName;
  }
  get environmentUrl() {
    return this.discoveryAdapter.environmentUrl;
  }
  get environmentProxyUrl() {
    return this.discoveryAdapter.environmentProxyUrl;
  }
  getProcessAdapter() {
    return this.processAdapter;
  }
  getDiscoveryAdapter() {
    return this.discoveryAdapter;
  }
  registerAppDbCreator(condition, creator, priority) {
    this.appDbCreator.register(condition, creator, priority);
  }
  async createDatabase(options) {
    return this.appDbCreator.run(options);
  }
  setAppOptionsFactory(factory) {
    this.appOptionsFactory = factory ?? import_app_options_factory.appOptionsFactory;
  }
  setAppSsoIssuer(issuer) {
    const normalized = String(issuer || "").trim().replace(/\/+$/, "");
    this.appSsoIssuer = normalized || void 0;
  }
  getAppSsoIssuer() {
    return this.appSsoIssuer;
  }
  async bootstrapApp(appName) {
    return this.processAdapter.bootstrapApp(appName);
  }
  async initApp({ appName, options }) {
    const loadButNotStart = options == null ? void 0 : options.upgrading;
    const mainApp = await this.getApp("main");
    if (!mainApp) {
      return;
    }
    const appModel = await this.getAppModel(appName);
    if (!appModel) {
      this.logger.error(`App model ${appName} not found`);
      return;
    }
    if (appModel.environments && !appModel.environments.includes(this.environmentName)) {
      this.logger.error(`App model ${appName} is not available in environment ${this.environmentName}`);
      return;
    }
    const appOptions = appModel.options;
    if (!appOptions) {
      this.logger.error(`App options ${appName} not found`);
      return;
    }
    if ((appOptions == null ? void 0 : appOptions.standaloneDeployment) && this.runningMode !== "single") {
      return;
    }
    if (this.hasApp(appName)) {
      return;
    }
    this.registerApp({ appModel, mainApp });
    if (!loadButNotStart) {
      await this.startApp(appName);
    }
  }
  setAppError(appName, error) {
    this.processAdapter.setAppError(appName, error);
  }
  hasAppError(appName) {
    return this.processAdapter.hasAppError(appName);
  }
  clearAppError(appName) {
    this.processAdapter.clearAppError(appName);
  }
  async reset() {
    var _a, _b, _c, _d;
    this.stopEnvironmentHeartbeat();
    await this.processAdapter.removeAllApps();
    await ((_b = (_a = this.discoveryAdapter).dispose) == null ? void 0 : _b.call(_a));
    await ((_d = (_c = this.commandAdapter) == null ? void 0 : _c.dispose) == null ? void 0 : _d.call(_c));
    this.appManifests.clear();
    this.removeAllListeners();
    this.logger.close();
  }
  async destroy() {
    await this.reset();
    _AppSupervisor.instance = null;
  }
  async getAppStatus(appName, defaultStatus) {
    return this.discoveryAdapter.getAppStatus(appName, defaultStatus);
  }
  async setAppStatus(appName, status, options = {}) {
    if ((0, import_worker_mode.isTransient)()) {
      this.logger.debug("App running as worker, status will not be set", { appName, status });
      return;
    }
    this.logger.debug("Setting app status", { appName, status });
    return this.discoveryAdapter.setAppStatus(appName, status, options);
  }
  async clearAppStatus(appName) {
    if (typeof this.discoveryAdapter.clearAppStatus !== "function") {
      return;
    }
    return this.discoveryAdapter.clearAppStatus(appName);
  }
  async getAppsStatuses(appNames) {
    var _a, _b;
    return ((_b = (_a = this.discoveryAdapter).getAppsStatuses) == null ? void 0 : _b.call(_a, appNames)) ?? {};
  }
  async getBootstrapLock(appName) {
    if (typeof this.discoveryAdapter.getBootstrapLock !== "function") {
      return null;
    }
    return this.discoveryAdapter.getBootstrapLock(appName);
  }
  registerApp({ appModel, mainApp, hook }) {
    const appName = appModel.name;
    const appOptions = import_lodash.default.cloneDeep(appModel.options || {});
    if (this.aesEncryptor && (appOptions == null ? void 0 : appOptions.encryptedDbPassword)) {
      try {
        import_lodash2.default.set(appOptions, "database.password", this.aesEncryptor.decryptSync(appOptions.database.password));
      } catch (error) {
        this.logger.warn("Failed to decrypt database password for app registration", {
          appName,
          error: error.message
        });
      }
    }
    let options = appOptions;
    if (mainApp) {
      const defaultAppOptions = this.appOptionsFactory(appName, mainApp, appOptions);
      options = {
        ...import_lodash.default.merge({}, defaultAppOptions, appOptions),
        name: appName
      };
    }
    const app = new import_application.default(options);
    if (hook ?? !(0, import_worker_mode.isTransient)()) {
      app.on("afterStart", async () => {
        await this.sendSyncMessage(mainApp, {
          type: "app:started",
          appName
        });
      });
      app.on("afterStop", async () => {
        await this.sendSyncMessage(mainApp, {
          type: "app:stopped",
          appName
        });
      });
      app.on("afterDestroy", async () => {
        await this.sendSyncMessage(mainApp, {
          type: "app:removed",
          appName
        });
      });
    }
    return app;
  }
  bootMainApp(options) {
    const app = new import_application.default(options);
    this.registerCommandHandler(app);
    app.on("afterStart", async (app2) => {
      var _a, _b;
      if ((0, import_worker_mode.isTransient)()) {
        return;
      }
      await app2.syncMessageManager.subscribe(
        "app_supervisor:sync",
        async (message) => {
          const { type } = message;
          if (type === "app:started") {
            const { appName } = message;
            if (this.hasApp(appName)) {
              return;
            }
            const appModel = await this.getAppModel(appName);
            const appOptions = appModel == null ? void 0 : appModel.options;
            if (!appOptions) {
              return;
            }
            if (appModel.environments && !appModel.environments.includes(this.environmentName)) {
              return;
            }
            const newApp = this.registerApp({ appModel, mainApp: app2 });
            newApp.runCommand("start", "--quickstart");
          }
          if (type === "app:stopped") {
            const { appName } = message;
            await this.stopApp(appName);
          }
          if (type === "app:removed") {
            const { appName } = message;
            await this.removeApp(appName);
          }
        }
      );
      await this.registerEnvironment(app2);
      if (process.env.APP_MODE === "supervisor") {
        this.logger.info("Loading app models...");
        (_b = (_a = this.discoveryAdapter).loadAppModels) == null ? void 0 : _b.call(_a, app2);
      }
    });
    app.on("afterDestroy", async (app2) => {
      if ((0, import_worker_mode.isTransient)()) {
        return;
      }
      await this.unregisterEnvironment();
    });
    return app;
  }
  async setAppLastSeenAt(appName) {
    return this.discoveryAdapter.setAppLastSeenAt(appName);
  }
  async getAppLastSeenAt(appName) {
    return this.discoveryAdapter.getAppLastSeenAt(appName);
  }
  async addAppModel(appModel) {
    if (typeof this.discoveryAdapter.addAppModel !== "function") {
      return;
    }
    return this.discoveryAdapter.addAppModel(appModel);
  }
  async getAppModel(appName) {
    return this.discoveryAdapter.getAppModel(appName);
  }
  async listAppModels() {
    if (typeof this.discoveryAdapter.listAppModels !== "function") {
      return [];
    }
    return this.discoveryAdapter.listAppModels();
  }
  async setAppManifestItem(appName, namespace, itemKey, item) {
    if (typeof this.discoveryAdapter.setAppManifestItem === "function") {
      return this.discoveryAdapter.setAppManifestItem(appName, namespace, itemKey, item);
    }
    const manifest = this.getOrCreateAppManifest(appName, namespace);
    manifest.set(itemKey, item);
  }
  async removeAppManifestItem(appName, namespace, itemKey) {
    var _a;
    if (typeof this.discoveryAdapter.removeAppManifestItem === "function") {
      return this.discoveryAdapter.removeAppManifestItem(appName, namespace, itemKey);
    }
    (_a = this.appManifests.get(this.getAppManifestKey(appName, namespace))) == null ? void 0 : _a.delete(itemKey);
  }
  async removeAppManifest(appName, namespace) {
    if (typeof this.discoveryAdapter.removeAppManifest === "function") {
      return this.discoveryAdapter.removeAppManifest(appName, namespace);
    }
    this.appManifests.delete(this.getAppManifestKey(appName, namespace));
  }
  async getAppManifestItems(appName, namespace) {
    var _a;
    if (typeof this.discoveryAdapter.getAppManifestItems === "function") {
      return this.discoveryAdapter.getAppManifestItems(appName, namespace);
    }
    return Array.from(((_a = this.appManifests.get(this.getAppManifestKey(appName, namespace))) == null ? void 0 : _a.values()) || []);
  }
  async getAppManifests(namespace, appNames) {
    if (typeof this.discoveryAdapter.getAppManifests === "function") {
      return this.discoveryAdapter.getAppManifests(namespace, appNames);
    }
    const result = {};
    await Promise.all(
      appNames.map(async (appName) => {
        const manifest = await this.getAppManifestItems(appName, namespace);
        if (manifest.length > 0) {
          result[appName] = manifest;
        }
      })
    );
    return result;
  }
  getAppManifestKey(appName, namespace) {
    return `${namespace}:${appName}`;
  }
  getOrCreateAppManifest(appName, namespace) {
    const key = this.getAppManifestKey(appName, namespace);
    const manifest = this.appManifests.get(key);
    if (manifest) {
      return manifest;
    }
    const nextManifest = /* @__PURE__ */ new Map();
    this.appManifests.set(key, nextManifest);
    return nextManifest;
  }
  registerAppCondition(name, condition) {
    this.appConditions.set(name, condition);
  }
  unregisterAppCondition(name) {
    this.appConditions.delete(name);
  }
  getAppCondition(name) {
    return this.appConditions.get(name);
  }
  getAppConditions() {
    return Array.from(this.appConditions.entries());
  }
  async getAppsByCondition(conditionName, options = {}) {
    const condition = this.getAppCondition(conditionName);
    if (!condition || typeof this.discoveryAdapter.getAppsByCondition !== "function") {
      return [];
    }
    return this.discoveryAdapter.getAppsByCondition(conditionName, condition, {
      ...options,
      environmentName: options.allEnvironments ? options.environmentName : options.environmentName ?? this.environmentName
    });
  }
  async removeAppModel(appName) {
    if (typeof this.discoveryAdapter.removeAppModel !== "function") {
      return;
    }
    return this.discoveryAdapter.removeAppModel(appName);
  }
  async getAppNameByCName(cname) {
    if (typeof this.discoveryAdapter.getAppNameByCName !== "function") {
      return null;
    }
    return this.discoveryAdapter.getAppNameByCName(cname);
  }
  async addAppsToCondition(conditionName, environmentName, appNames) {
    if (typeof this.discoveryAdapter.addAppsToCondition !== "function") {
      return;
    }
    return this.discoveryAdapter.addAppsToCondition(conditionName, environmentName, appNames);
  }
  async removeAppsFromCondition(conditionName, environmentName, appNames) {
    if (typeof this.discoveryAdapter.removeAppsFromCondition !== "function") {
      return;
    }
    return this.discoveryAdapter.removeAppsFromCondition(conditionName, environmentName, appNames);
  }
  addApp(app) {
    this.processAdapter.addApp(app);
    this.bindAppEvents(app);
    this.emit("afterAppAdded", app);
    return app;
  }
  async getApp(appName, options = {}) {
    return this.processAdapter.getApp(appName, options);
  }
  hasApp(appName) {
    return this.processAdapter.hasApp(appName);
  }
  async createApp(options, context) {
    await this.processAdapter.createApp(options, context);
  }
  async startApp(appName, context) {
    await this.processAdapter.startApp(appName, context);
  }
  async stopApp(appName, context) {
    await this.processAdapter.stopApp(appName, context);
  }
  async removeApp(appName, context) {
    await this.processAdapter.removeApp(appName, context);
  }
  async upgradeApp(appName, context) {
    await this.processAdapter.upgradeApp(appName, context);
  }
  async dispatchAppEvent(appName, event, payload, context) {
    var _a, _b;
    return (_b = (_a = this.processAdapter).dispatchAppEvent) == null ? void 0 : _b.call(_a, appName, event, payload, context);
  }
  /**
   * @deprecated
   * use {#getApps} instead
   */
  subApps() {
    return this.processAdapter.getApps();
  }
  getApps() {
    return this.processAdapter.getApps();
  }
  async proxyWeb(appName, req, res) {
    if (process.env.APP_MODE !== "supervisor") {
      return false;
    }
    if (typeof this.discoveryAdapter.proxyWeb !== "function") {
      return false;
    }
    return this.discoveryAdapter.proxyWeb(appName, req, res);
  }
  async proxyWs(req, socket, head) {
    if (process.env.APP_MODE !== "supervisor") {
      return false;
    }
    if (typeof this.discoveryAdapter.proxyWs !== "function") {
      return false;
    }
    return this.discoveryAdapter.proxyWs(req, socket, head);
  }
  async registerEnvironment(mainApp) {
    if (!this.environmentName || typeof this.discoveryAdapter.registerEnvironment !== "function") {
      return;
    }
    const registered = await this.discoveryAdapter.registerEnvironment(this.getEnvironmentInfo(mainApp));
    if (registered) {
      this.heartbeatEnvironment(mainApp);
    }
  }
  getEnvironmentInfo(mainApp) {
    return {
      name: this.environmentName,
      url: this.environmentUrl || "",
      proxyUrl: this.environmentProxyUrl || this.environmentUrl || "",
      appVersion: mainApp.getPackageVersion(),
      lastHeartbeatAt: Date.now()
    };
  }
  async unregisterEnvironment() {
    this.stopEnvironmentHeartbeat();
    if (this.environmentName && typeof this.discoveryAdapter.unregisterEnvironment === "function") {
      await this.discoveryAdapter.unregisterEnvironment();
    }
  }
  normalizeEnvInfo(environment) {
    if (typeof environment.available === "boolean") {
      return environment;
    }
    const lastHeartbeatAt = environment.lastHeartbeatAt;
    if (!Number.isFinite(lastHeartbeatAt) || lastHeartbeatAt <= 0) {
      return {
        ...environment,
        available: false
      };
    }
    const available = Date.now() - lastHeartbeatAt <= this.environmentHeartbeatTimeout;
    return {
      ...environment,
      available
    };
  }
  async listEnvironments() {
    if (typeof this.discoveryAdapter.listEnvironments !== "function") {
      return [];
    }
    const environments = await this.discoveryAdapter.listEnvironments();
    return environments.map((env) => this.normalizeEnvInfo(env));
  }
  async getEnvironment(environmentName) {
    if (typeof this.discoveryAdapter.getEnvironment !== "function") {
      return null;
    }
    const environment = await this.discoveryAdapter.getEnvironment(environmentName);
    if (!environment) {
      return null;
    }
    return this.normalizeEnvInfo(environment);
  }
  async heartbeatEnvironment(mainApp) {
    if (typeof this.discoveryAdapter.heartbeatEnvironment !== "function") {
      return;
    }
    if (this.environmentHeartbeatTimer) {
      return;
    }
    this.environmentHeartbeatTimer = setInterval(async () => {
      try {
        await this.discoveryAdapter.heartbeatEnvironment(this.getEnvironmentInfo(mainApp));
      } catch (error) {
        this.logger.error(error instanceof Error ? error.message : String(error), { method: "heartbeatEnvironment" });
      }
    }, this.environmentHeartbeatInterval);
  }
  stopEnvironmentHeartbeat() {
    if (this.environmentHeartbeatTimer) {
      clearInterval(this.environmentHeartbeatTimer);
      this.environmentHeartbeatTimer = null;
    }
  }
  async dispatchCommand(command) {
    var _a;
    return (_a = this.commandAdapter) == null ? void 0 : _a.dispatchCommand(command);
  }
  registerCommandHandler(mainApp) {
    var _a;
    (_a = this.commandAdapter) == null ? void 0 : _a.registerCommandHandler(mainApp);
  }
  async sendSyncMessage(mainApp, message, options) {
    await mainApp.syncMessageManager.publish("app_supervisor:sync", message, options);
  }
  on(eventName, listener) {
    const listeners = this.listeners(eventName);
    const listenerName = listener.name;
    if (listenerName !== "") {
      const exists = listeners.find((l) => l.name === listenerName);
      if (exists) {
        super.removeListener(eventName, exists);
      }
    }
    return super.on(eventName, listener);
  }
  bindAppEvents(app) {
    if ((0, import_worker_mode.isTransient)()) {
      return;
    }
    app.on("afterDestroy", async () => {
      delete this.apps[app.name];
      delete this.appStatus[app.name];
      delete this.appErrors[app.name];
      delete this.lastMaintainingMessage[app.name];
      delete this.statusBeforeCommanding[app.name];
      this.lastSeenAt.delete(app.name);
      await this.clearAppStatus(app.name);
    });
    app.on("maintainingMessageChanged", async ({ message, maintainingStatus }) => {
      if (this.lastMaintainingMessage[app.name] === message) {
        return;
      }
      this.lastMaintainingMessage[app.name] = message;
      const appStatus = await this.getAppStatus(app.name);
      if (!maintainingStatus && appStatus !== "running") {
        return;
      }
      this.emit("appMaintainingMessageChanged", {
        appName: app.name,
        message,
        status: appStatus,
        command: appStatus == "running" ? null : maintainingStatus.command
      });
    });
    app.on("__started", async (_app, options) => {
      const { maintainingStatus, options: startOptions } = options;
      if (maintainingStatus && [
        "install",
        "upgrade",
        "refresh",
        "restore",
        "pm.add",
        "pm.update",
        "pm.enable",
        "pm.disable",
        "pm.remove"
      ].includes(maintainingStatus.command.name) && !startOptions.recover) {
        void this.setAppStatus(app.name, "running", { refresh: true });
      } else {
        void this.setAppStatus(app.name, "running");
      }
    });
    app.on("__stopped", async () => {
      await this.setAppStatus(app.name, "stopped");
    });
    app.on("maintaining", async (maintainingStatus) => {
      const { status } = maintainingStatus;
      switch (status) {
        case "command_begin":
          this.statusBeforeCommanding[app.name] = await this.getAppStatus(app.name);
          await this.setAppStatus(app.name, "commanding");
          break;
        case "command_running":
          break;
        case "command_end":
          {
            const appStatus = await this.getAppStatus(app.name);
            this.emit("appMaintainingStatusChanged", maintainingStatus);
            if (appStatus == "commanding") {
              await this.setAppStatus(app.name, this.statusBeforeCommanding[app.name]);
            }
          }
          break;
        case "command_error":
          {
            const errorLevel = (0, import_handler.getErrorLevel)(maintainingStatus.error);
            if (errorLevel === "fatal") {
              this.setAppError(app.name, maintainingStatus.error);
              await this.setAppStatus(app.name, "error");
              break;
            }
            if (errorLevel === "warn") {
              this.emit("appError", {
                appName: app.name,
                error: maintainingStatus.error
              });
            }
            await this.setAppStatus(app.name, this.statusBeforeCommanding[app.name]);
          }
          break;
      }
    });
  }
};
__name(_AppSupervisor, "AppSupervisor");
__publicField(_AppSupervisor, "instance");
__publicField(_AppSupervisor, "discoveryAdapterFactories", /* @__PURE__ */ new Map());
__publicField(_AppSupervisor, "processAdapterFactories", /* @__PURE__ */ new Map());
__publicField(_AppSupervisor, "commandAdapterFactories", /* @__PURE__ */ new Map());
__publicField(_AppSupervisor, "defaultDiscoveryAdapterName", "main-only");
__publicField(_AppSupervisor, "defaultProcessAdapterName", "main-only");
__publicField(_AppSupervisor, "defaultCommandAdapterName");
let AppSupervisor = _AppSupervisor;
(0, import_utils.applyMixins)(AppSupervisor, [import_utils.AsyncEmitter]);
AppSupervisor.registerDiscoveryAdapter("main-only", ({ supervisor }) => new import_main_only_adapter.MainOnlyAdapter(supervisor));
AppSupervisor.registerProcessAdapter("main-only", ({ supervisor }) => new import_main_only_adapter.MainOnlyAdapter(supervisor));
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AppSupervisor,
  MainOnlyAdapter
});
