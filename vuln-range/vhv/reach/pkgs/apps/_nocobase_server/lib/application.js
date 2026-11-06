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
var application_exports = {};
__export(application_exports, {
  Application: () => Application,
  default: () => application_default
});
module.exports = __toCommonJS(application_exports);
var import_actions = require("@nocobase/actions");
var import_auth = require("@nocobase/auth");
var import_data_source_manager = require("@nocobase/data-source-manager");
var import_database = __toESM(require("@nocobase/database"));
var import_logger = require("@nocobase/logger");
var import_telemetry = require("@nocobase/telemetry");
var import_ai = require("@nocobase/ai");
var import_lock_manager = require("@nocobase/lock-manager");
var import_snowflake_id = require("@nocobase/snowflake-id");
var import_utils = require("@nocobase/utils");
var import_crypto = require("crypto");
var import_glob = __toESM(require("glob"));
var import_koa = __toESM(require("koa"));
var import_koa_compose = __toESM(require("koa-compose"));
var import_lodash = __toESM(require("lodash"));
var import_path = __toESM(require("path"));
var import_semver = __toESM(require("semver"));
var import_acl = require("./acl");
var import_app_command = require("./app-command");
var import_app_supervisor = require("./app-supervisor");
var import_cache2 = require("./cache");
var import_commands = require("./commands");
var import_cron_job_manager = require("./cron/cron-job-manager");
var import_application_not_install = require("./errors/application-not-install");
var import_helper = require("./helper");
var import_application_version = require("./helpers/application-version");
var import_locale = require("./locale");
var import_main_data_source = require("./main-data-source");
var import_middlewares = require("./middlewares");
var import_data_template = require("./middlewares/data-template");
var import_validate_filter_params = __toESM(require("./middlewares/validate-filter-params"));
var import_plugin_manager = require("./plugin-manager");
var import_pub_sub_manager = require("./pub-sub-manager");
var import_sync_message_manager = require("./sync-message-manager");
var import_package = __toESM(require("../package.json"));
var import_available_action = require("./acl/available-action");
var import_aes_encryptor = __toESM(require("./aes-encryptor"));
var import_audit_manager = require("./audit-manager");
var import_environment = require("./environment");
var import_event_queue = require("./event-queue");
var import_redis_connection_manager = require("./redis-connection-manager");
var import_service_container = require("./service-container");
var import_snowflake_id_field = require("./snowflake-id-field");
var import_worker_id_allocator = require("./worker-id-allocator");
var import_worker_mode = require("./worker-mode");
const _Application = class _Application extends import_koa.default {
  constructor(options) {
    super();
    this.options = options;
    this.context.reqId = (0, import_crypto.randomUUID)();
    this.rawOptions = this.name == "main" ? import_lodash.default.cloneDeep(options) : {};
    this.init();
    if (!options.skipSupervisor) {
      this._appSupervisor.addApp(this);
    }
  }
  _instanceId;
  /**
   * @internal
   */
  stopped = false;
  /**
   * @internal
   */
  ready = false;
  /**
   * @internal
   */
  rawOptions;
  /**
   * @internal
   */
  activatedCommand = null;
  /**
   * @internal
   */
  running = false;
  /**
   * @internal
   */
  perfHistograms = /* @__PURE__ */ new Map();
  /**
   * @internal
   */
  redisConnectionManager;
  workerIdAllocator;
  snowflakeIdGenerator;
  aiManager;
  pubSubManager;
  syncMessageManager;
  requestLogger;
  plugins = /* @__PURE__ */ new Map();
  _appSupervisor = import_app_supervisor.AppSupervisor.getInstance();
  _authenticated = false;
  _maintaining = false;
  _maintainingCommandStatus;
  _maintainingStatusBeforeCommand;
  _actionCommand;
  container = new import_service_container.ServiceContainer();
  lockManager;
  eventQueue;
  static registerStaticCommand(callback) {
    this.staticCommands.push(callback);
  }
  static addCommand(callback) {
    this.staticCommands.push(callback);
  }
  _sqlLogger;
  get instanceId() {
    return this._instanceId;
  }
  /**
   * Adopt a worker id handed out at runtime, after the allocator loses its lease and acquires a different one. Ids may
   * only be minted under a worker id this process currently holds, so the generator is rebuilt to match.
   *
   * Returning early on an unchanged id is required rather than an optimisation: rebuilding restarts the sequence at 0,
   * so doing it for the same worker id inside one second would re-issue ids this process has already handed out.
   */
  setInstanceId(instanceId) {
    if (this._instanceId === instanceId) {
      return;
    }
    this._instanceId = instanceId;
    this.snowflakeIdGenerator = new import_snowflake_id.Snowflake({ workerId: instanceId });
    this.log.info(`adopt worker id: ${instanceId}`, { method: "setInstanceId" });
  }
  get sqlLogger() {
    return this._sqlLogger;
  }
  _logger;
  get logger() {
    return this._logger;
  }
  _started = null;
  /**
   * @experimental
   */
  get started() {
    return this._started;
  }
  get log() {
    return this._logger;
  }
  _loaded;
  /**
   * @internal
   */
  get loaded() {
    return this._loaded;
  }
  _maintainingMessage;
  /**
   * @internal
   */
  get maintainingMessage() {
    return this._maintainingMessage;
  }
  _env;
  get environment() {
    return this._env;
  }
  _cronJobManager;
  get cronJobManager() {
    return this._cronJobManager;
  }
  get mainDataSource() {
    var _a;
    return (_a = this.dataSourceManager) == null ? void 0 : _a.dataSources.get("main");
  }
  get db() {
    if (!this.mainDataSource) {
      return null;
    }
    return this.mainDataSource.collectionManager.db;
  }
  get resourceManager() {
    return this.mainDataSource.resourceManager;
  }
  /**
   * This method is deprecated and should not be used.
   * Use {@link #resourceManager} instead.
   * @deprecated
   */
  get resourcer() {
    return this.mainDataSource.resourceManager;
  }
  _cacheManager;
  get cacheManager() {
    return this._cacheManager;
  }
  _cache;
  get cache() {
    return this._cache;
  }
  /**
   * @internal
   */
  set cache(cache) {
    this._cache = cache;
  }
  _cli;
  get cli() {
    return this._cli;
  }
  _i18n;
  get i18n() {
    return this._i18n;
  }
  _pm;
  get pm() {
    return this._pm;
  }
  get acl() {
    return this.mainDataSource.acl;
  }
  _authManager;
  get authManager() {
    return this._authManager;
  }
  _auditManager;
  get auditManager() {
    return this._auditManager;
  }
  _locales;
  /**
   * This method is deprecated and should not be used.
   * Use {@link #localeManager} instead.
   * @deprecated
   */
  get locales() {
    return this._locales;
  }
  get localeManager() {
    return this._locales;
  }
  _telemetry;
  get telemetry() {
    return this._telemetry;
  }
  _version;
  get version() {
    return this._version;
  }
  get name() {
    return this.options.name || "main";
  }
  _dataSourceManager;
  get dataSourceManager() {
    return this._dataSourceManager;
  }
  _aesEncryptor;
  get aesEncryptor() {
    return this._aesEncryptor;
  }
  /**
   * @deprecated use {@link serving} from './worker-mode' instead.
   */
  serving(key) {
    return (0, import_worker_mode.serving)(key);
  }
  /**
   * @internal
   */
  getMaintaining() {
    return this._maintainingCommandStatus;
  }
  /**
   * @internal
   */
  async setMaintaining(_maintainingCommandStatus) {
    this._maintainingCommandStatus = _maintainingCommandStatus;
    await this.emitAsync("maintaining", _maintainingCommandStatus);
    if (_maintainingCommandStatus.status == "command_end") {
      this._maintaining = false;
      return;
    }
    this._maintaining = true;
  }
  /**
   * @internal
   */
  setMaintainingMessage(message) {
    this._maintainingMessage = message;
    this.emit("maintainingMessageChanged", {
      message: this._maintainingMessage,
      maintainingStatus: this._maintainingCommandStatus
    });
  }
  /**
   * This method is deprecated and should not be used.
   * Use {@link #this.getPackageVersion} instead.
   * @deprecated
   */
  getVersion() {
    return import_package.default.version;
  }
  getPackageVersion() {
    return import_package.default.version;
  }
  /**
   * This method is deprecated and should not be used.
   * Use {@link #this.pm.addPreset()} instead.
   * @deprecated
   */
  plugin(pluginClass, options) {
    this.log.debug(`add plugin`, { method: "plugin", name: pluginClass.name });
    this.pm.addPreset(pluginClass, options);
  }
  // @ts-ignore
  use(middleware, options) {
    this.middleware.add((0, import_utils.wrapMiddlewareWithLogging)(middleware, this.logger), options);
    return this;
  }
  /**
   * @internal
   */
  callback() {
    const fn = (0, import_koa_compose.default)(this.middleware.nodes);
    if (!this.listenerCount("error")) this.on("error", this.onerror);
    return (req, res) => {
      const ctx = this.createContext(req, res);
      return this.handleRequest(ctx, fn);
    };
  }
  /**
   * This method is deprecated and should not be used.
   * Use {@link #this.db.collection()} instead.
   * @deprecated
   */
  collection(options) {
    return this.db.collection(options);
  }
  /**
   * This method is deprecated and should not be used.
   * Use {@link #this.resourceManager.define()} instead.
   * @deprecated
   */
  resource(options) {
    return this.resourceManager.define(options);
  }
  /**
   * This method is deprecated and should not be used.
   * Use {@link #this.resourceManager.registerActionHandlers()} instead.
   * @deprecated
   */
  actions(handlers, options) {
    return this.resourceManager.registerActionHandlers(handlers);
  }
  command(name, desc, opts) {
    return this.cli.command(name, desc, opts).allowUnknownOption();
  }
  findCommand(name) {
    return this.cli._findCommand(name);
  }
  async disposeServices() {
    await this.workerIdAllocator.release();
    if (this.redisConnectionManager) {
      await this.redisConnectionManager.close();
    }
    if (this.cacheManager) {
      await this.cacheManager.close();
    }
    if (this.pubSubManager) {
      await this.pubSubManager.close();
    }
    if (this.telemetry.started) {
      await this.telemetry.shutdown();
    }
  }
  /**
   * @internal
   */
  async reInit() {
    if (!this._loaded) {
      return;
    }
    this.log.info("app reinitializing");
    await this.emitAsync("beforeStop");
    await this.emitAsync("afterStop");
    await this.disposeServices();
    this.closeLogger();
    const oldDb = this.db;
    this.init();
    if (!oldDb.closed()) {
      await oldDb.close();
    }
    this._loaded = false;
  }
  async createCacheManager() {
    this._cacheManager = await (0, import_cache2.createCacheManager)(this, {
      prefix: this.name,
      ...this.options.cacheManager
    });
    return this._cacheManager;
  }
  async load(options) {
    var _a;
    if (this._loaded) {
      return;
    }
    if (options == null ? void 0 : options.reload) {
      this.setMaintainingMessage("app reload");
      this.log.info(`app.reload()`, { method: "load" });
      await this.disposeServices();
      const oldDb = this.db;
      this.init();
      if (!oldDb.closed()) {
        await oldDb.close();
      }
    }
    this._aesEncryptor = await import_aes_encryptor.default.create(this);
    if (this.cacheManager) {
      await this.cacheManager.close();
    }
    this._cacheManager = await this.createCacheManager();
    this.log.debug("init plugins");
    this.setMaintainingMessage("init plugins");
    await this.pm.initPlugins();
    this.log.debug("loading app...");
    this.setMaintainingMessage("start load");
    this.setMaintainingMessage("emit beforeLoad");
    if ((options == null ? void 0 : options.hooks) !== false) {
      await this.emitAsync("beforeLoad", this, options);
    }
    if (this._instanceId == null) {
      this._instanceId = await this.workerIdAllocator.getWorkerId();
      this.log.info(`allocate worker id: ${this._instanceId}`, { method: "load" });
    }
    if (!this.snowflakeIdGenerator) {
      this.snowflakeIdGenerator = new import_snowflake_id.Snowflake({
        workerId: this._instanceId
      });
    }
    if (!this.telemetry.started) {
      this.telemetry.init();
      if ((_a = this.options.telemetry) == null ? void 0 : _a.enabled) {
        this.telemetry.start();
      }
    }
    await this.pm.load(options);
    if (options == null ? void 0 : options.sync) {
      await this.db.sync();
    }
    this.setMaintainingMessage("emit afterLoad");
    if ((options == null ? void 0 : options.hooks) !== false) {
      await this.emitAsync("afterLoad", this, options);
    }
    this._loaded = true;
  }
  async reload(options) {
    this.log.debug(`start reload`, { method: "reload" });
    this._loaded = false;
    await this.emitAsync("beforeReload", this, options);
    await this.load({
      ...options,
      reload: true
    });
    this.log.debug("emit afterReload", { method: "reload" });
    this.setMaintainingMessage("emit afterReload");
    await this.emitAsync("afterReload", this, options);
    this.log.debug(`finish reload`, { method: "reload" });
  }
  /**
   * This method is deprecated and should not be used.
   * Use {@link this.pm.get()} instead.
   * @deprecated
   */
  getPlugin(name) {
    return this.pm.get(name);
  }
  async authenticate() {
    if (this._authenticated) {
      return;
    }
    this._authenticated = true;
    await this.db.auth();
    await this.db.checkVersion();
    await this.db.prepare();
  }
  async runCommand(command, ...args) {
    return await this.runAsCLI([command, ...args], { from: "user" });
  }
  async runCommandThrowError(command, ...args) {
    return await this.runAsCLI([command, ...args], { from: "user", throwError: true });
  }
  /**
   * @internal
   */
  async loadMigrations(options) {
    const { directory, context, namespace } = options;
    const migrations = {
      beforeLoad: [],
      afterSync: [],
      afterLoad: []
    };
    const extensions = ["js", "ts"];
    const patten = `${directory}/*.{${extensions.join(",")}}`;
    const files = import_glob.default.sync(patten, {
      ignore: ["**/*.d.ts"]
    });
    const appVersion = await this.version.get();
    for (const file of files) {
      let filename = (0, import_path.basename)(file);
      filename = filename.substring(0, filename.lastIndexOf(".")) || filename;
      const Migration = await (0, import_utils.importModule)(file);
      const m = new Migration({ app: this, db: this.db, ...context });
      if (!m.appVersion || import_semver.default.satisfies(appVersion, m.appVersion, { includePrerelease: true })) {
        m.name = `${filename}/${namespace}`;
        migrations[m.on || "afterLoad"].push(m);
      }
    }
    return migrations;
  }
  /**
   * @internal
   */
  async loadCoreMigrations() {
    const migrations = await this.loadMigrations({
      directory: (0, import_path.resolve)(__dirname, "migrations"),
      namespace: "@nocobase/server"
    });
    return {
      beforeLoad: {
        up: /* @__PURE__ */ __name(async () => {
          this.log.debug("run core migrations(beforeLoad)");
          const migrator = this.db.createMigrator({ migrations: migrations.beforeLoad });
          await migrator.up();
        }, "up")
      },
      afterSync: {
        up: /* @__PURE__ */ __name(async () => {
          this.log.debug("run core migrations(afterSync)");
          const migrator = this.db.createMigrator({ migrations: migrations.afterSync });
          await migrator.up();
        }, "up")
      },
      afterLoad: {
        up: /* @__PURE__ */ __name(async () => {
          this.log.debug("run core migrations(afterLoad)");
          const migrator = this.db.createMigrator({ migrations: migrations.afterLoad });
          await migrator.up();
        }, "up")
      }
    };
  }
  /**
   * @internal
   */
  async runAsCLI(argv = process.argv, options) {
    if (this.activatedCommand) {
      return;
    }
    if (options == null ? void 0 : options.reqId) {
      this.context.reqId = options.reqId;
      this._logger = this._logger.child({ reqId: this.context.reqId });
    }
    this._maintainingStatusBeforeCommand = this._maintainingCommandStatus;
    try {
      const commandName = (options == null ? void 0 : options.from) === "user" ? argv[0] : argv[2];
      if (!this.cli.hasCommand(commandName)) {
        await this.pm.loadCommands();
      }
      const command = await this.cli.parseAsync(argv, options);
      await this.setMaintaining({
        status: "command_end",
        command: this.activatedCommand
      });
      return command;
    } catch (error) {
      if (!this.activatedCommand) {
        this.activatedCommand = {
          name: "unknown"
        };
      }
      await this.setMaintaining({
        status: "command_error",
        command: this.activatedCommand,
        error
      });
      if (options == null ? void 0 : options.throwError) {
        throw error;
      } else {
        this.log.error(error);
      }
    } finally {
      const _actionCommand = this._actionCommand;
      if (_actionCommand) {
        const options2 = _actionCommand["options"];
        _actionCommand["_optionValues"] = {};
        _actionCommand["_optionValueSources"] = {};
        _actionCommand["options"] = [];
        for (const option of options2) {
          _actionCommand.addOption(option);
        }
      }
      this._actionCommand = null;
      this.activatedCommand = null;
    }
  }
  async start(options = {}) {
    if (this._started) {
      return;
    }
    this._started = /* @__PURE__ */ new Date();
    if (options.checkInstall && !await this.isInstalled()) {
      throw new import_application_not_install.ApplicationNotInstall(
        `Application ${this.name} is not installed, Please run 'yarn nocobase install' command first`
      );
    }
    this.log.debug(`starting app...`);
    this.setMaintainingMessage("starting app...");
    if (this.db.closed()) {
      await this.db.reconnect();
    }
    this.setMaintainingMessage("emit beforeStart");
    await this.emitAsync("beforeStart", this, options);
    this.setMaintainingMessage("emit afterStart");
    await this.emitAsync("afterStart", this, options);
    await this.emitStartedEvent(options);
    this.stopped = false;
  }
  /**
   * @internal
   */
  async emitStartedEvent(options = {}) {
    await this.emitAsync("__started", this, {
      maintainingStatus: import_lodash.default.cloneDeep(this._maintainingCommandStatus),
      options
    });
  }
  async isStarted() {
    return Boolean(this._started);
  }
  /**
   * @internal
   */
  async tryReloadOrRestart(options = {}) {
    if (this._started) {
      await this.restart(options);
    } else {
      await this.reload(options);
    }
  }
  async restart(options = {}) {
    if (!this._started) {
      return;
    }
    this.log.info("restarting...");
    this._started = null;
    await this.emitAsync("beforeStop");
    await this.reload(options);
    await this.start(options);
    this.emit("__restarted", this, options);
  }
  async stop(options = {}) {
    const log = options.logging === false ? {
      debug() {
      },
      warn() {
      },
      info() {
      },
      error() {
      }
    } : this.log;
    log.debug("stop app...", { method: "stop" });
    this.setMaintainingMessage("stopping app...");
    if (this.stopped) {
      log.warn(`app is stopped`, { method: "stop" });
      return;
    }
    await this.emitAsync("beforeStop", this, options);
    try {
      if (!this.db.closed()) {
        log.info(`close db`, { method: "stop" });
        await this.db.close();
      }
    } catch (e) {
      log.error(e.message, { method: "stop", err: e.stack });
    }
    await this.disposeServices();
    await this.emitAsync("afterStop", this, options);
    this.emit("__stopped", this, options);
    this.stopped = true;
    log.info(`app has stopped`, { method: "stop" });
    this._started = null;
  }
  async destroy(options = {}) {
    this.log.debug("start destroy app", { method: "destory" });
    this.setMaintainingMessage("destroying app...");
    await this.emitAsync("beforeDestroy", this, options);
    await this.stop(options);
    this.log.debug("emit afterDestroy", { method: "destory" });
    await this.emitAsync("afterDestroy", this, options);
    this.log.debug("finish destroy app", { method: "destory" });
    this.closeLogger();
  }
  async isInstalled() {
    return await this.db.collectionExistsInDb("applicationVersion") || await this.db.collectionExistsInDb("collections");
  }
  async install(options = {}) {
    var _a;
    const reinstall = options.clean || options.force;
    if (reinstall) {
      await this.db.clean({ drop: true });
    }
    if (await this.isInstalled()) {
      this.log.warn("app is installed");
      return;
    }
    await this.reInit();
    await this.db.sync();
    await this.load({ hooks: false });
    this._loaded = false;
    this.log.debug("emit beforeInstall", { method: "install" });
    this.setMaintainingMessage("call beforeInstall hook...");
    await this.emitAsync("beforeInstall", this, options);
    await this.pm.install();
    await this.version.update();
    this.log.debug("emit afterInstall", { method: "install" });
    this.setMaintainingMessage("call afterInstall hook...");
    await this.emitAsync("afterInstall", this, options);
    if ((_a = this._maintainingStatusBeforeCommand) == null ? void 0 : _a.error) {
      return;
    }
    if (this._started) {
      await this.restart();
    }
  }
  async upgrade(options = {}) {
    this.log.info("upgrading...");
    const pkgVersion = this.getPackageVersion();
    const appVersion = await this.version.get();
    if (process.env.SKIP_SAME_VERSION_UPGRADE === "true" && pkgVersion === appVersion) {
      this.log.info(`app is already the latest version (${appVersion})`);
      return;
    }
    await this.reInit();
    const migrator1 = await this.loadCoreMigrations();
    await migrator1.beforeLoad.up();
    await this.db.sync();
    await migrator1.afterSync.up();
    await this.pm.initPresetPlugins();
    const migrator2 = await this.pm.loadPresetMigrations();
    await migrator2.beforeLoad.up();
    await this.pm.load();
    await this.db.sync();
    await migrator2.afterSync.up();
    await this.pm.upgrade();
    await this.pm.initOtherPlugins();
    const migrator3 = await this.pm.loadOtherMigrations();
    await migrator3.beforeLoad.up();
    await this.load({ sync: true });
    await migrator3.afterSync.up();
    await this.pm.upgrade();
    await migrator1.afterLoad.up();
    await migrator2.afterLoad.up();
    await migrator3.afterLoad.up();
    await this.pm.repository.updateVersions();
    await this.version.update();
    if (!options.quickstart) {
      await this.emitAsync("afterUpgrade", this, options);
    }
    await this.restart();
  }
  toJSON() {
    return {
      appName: this.name,
      name: this.name
    };
  }
  /**
   * @internal
   */
  reInitEvents() {
    for (const eventName of this.eventNames()) {
      for (const listener of this.listeners(eventName)) {
        if (listener["_reinitializable"]) {
          this.removeListener(eventName, listener);
        }
      }
    }
  }
  createLogger(options) {
    const { dirname } = options;
    return (0, import_logger.createLogger)({
      ...options,
      dirname: (0, import_logger.getLoggerFilePath)(import_path.default.join(this.name || "main", dirname || ""))
    });
  }
  createCLI() {
    const command = new import_app_command.AppCommand("nocobase").usage("[command] [options]").hook("preAction", async (_, actionCommand) => {
      this._actionCommand = actionCommand;
      this.activatedCommand = {
        name: (0, import_helper.getCommandFullName)(actionCommand)
      };
      await this.setMaintaining({
        status: "command_begin",
        command: this.activatedCommand
      });
      await this.setMaintaining({
        status: "command_running",
        command: this.activatedCommand
      });
      if (actionCommand["_authenticate"]) {
        await this.authenticate();
      }
      if (actionCommand["_preload"]) {
        await this.load();
      }
    }).hook("postAction", async (_, actionCommand) => {
      var _a;
      if (((_a = this._maintainingStatusBeforeCommand) == null ? void 0 : _a.error) && this._started) {
        await this.restart();
      }
    });
    command.exitOverride((err) => {
      throw err;
    });
    return command;
  }
  initLogger(options) {
    this._logger = (0, import_logger.createSystemLogger)({
      dirname: (0, import_logger.getLoggerFilePath)(this.name),
      filename: "system",
      seperateError: true,
      ...(options == null ? void 0 : options.system) || {}
    }).child({
      reqId: this.context.reqId,
      app: this.name,
      module: "application"
      // Due to the use of custom log levels,
      // we have to use any type here until Winston updates the type definitions.
    });
    this.requestLogger = (0, import_logger.createLogger)({
      dirname: (0, import_logger.getLoggerFilePath)(this.name),
      filename: "request",
      ...(options == null ? void 0 : options.request) || {}
    });
    this._sqlLogger = this.createLogger({
      filename: "sql",
      level: "debug"
    });
  }
  closeLogger() {
    var _a, _b, _c;
    (_a = this.log) == null ? void 0 : _a.close();
    (_b = this.requestLogger) == null ? void 0 : _b.close();
    (_c = this._sqlLogger) == null ? void 0 : _c.close();
  }
  init() {
    const options = this.options;
    this._instanceId = options.instanceId;
    this.snowflakeIdGenerator = void 0;
    this.initLogger(options.logger);
    this.reInitEvents();
    this.middleware = new import_utils.Toposort();
    this.plugins = /* @__PURE__ */ new Map();
    if (this.db) {
      this.db.removeAllListeners();
    }
    this.createMainDataSource(options);
    this.redisConnectionManager = new import_redis_connection_manager.RedisConnectionManager({
      redisConfig: options.redisConfig,
      logger: this._logger.child({ module: "redis-connection-manager" })
    });
    this.workerIdAllocator = new import_worker_id_allocator.WorkerIdAllocator();
    this._cronJobManager = new import_cron_job_manager.CronJobManager(this);
    this._env = new import_environment.Environment();
    this._cli = this.createCLI();
    this._i18n = (0, import_helper.createI18n)(options);
    this.aiManager = new import_ai.AIManager(this);
    this.pubSubManager = (0, import_pub_sub_manager.createPubSubManager)(this, options.pubSubManager);
    this.syncMessageManager = new import_sync_message_manager.SyncMessageManager(this, options.syncMessageManager);
    this.eventQueue = new import_event_queue.EventQueue(this, options.eventQueue);
    this.lockManager = new import_lock_manager.LockManager({
      defaultAdapter: process.env.LOCK_ADAPTER_DEFAULT,
      ...options.lockManager
    });
    this.context.db = this.db;
    this.context.resourcer = this.resourceManager;
    this.context.resourceManager = this.resourceManager;
    this.context.cacheManager = this._cacheManager;
    this.context.cache = this._cache;
    const plugins = this._pm ? this._pm.options.plugins : options.plugins;
    this._pm = new import_plugin_manager.PluginManager({
      app: this,
      plugins: plugins || []
    });
    this._telemetry = new import_telemetry.Telemetry({
      appName: this.name,
      version: this.getPackageVersion(),
      ...options.telemetry
    });
    this._authManager = new import_auth.AuthManager({
      authKey: "X-Authenticator",
      default: "basic",
      ...this.options.authManager || {}
    });
    this._auditManager = new import_audit_manager.AuditManager();
    this.resourceManager.define({
      name: "auth",
      actions: import_auth.actions
    });
    this._dataSourceManager.beforeAddDataSource((dataSource) => {
      if (dataSource.collectionManager instanceof import_data_source_manager.SequelizeCollectionManager) {
        (0, import_snowflake_id_field.setupSnowflakeIdField)(this, dataSource.collectionManager.db);
      }
    });
    this._dataSourceManager.afterAddDataSource((dataSource) => {
      if (dataSource.collectionManager instanceof import_data_source_manager.SequelizeCollectionManager) {
        for (const [actionName, actionParams] of Object.entries(import_available_action.availableActions)) {
          dataSource.acl.setAvailableAction(actionName, actionParams);
        }
      }
    });
    this._dataSourceManager.use(this._authManager.middleware(), { tag: "auth", before: "default" });
    this._dataSourceManager.use(import_auth.csrfMiddleware, { tag: "csrf", after: "auth", before: "default" });
    this._dataSourceManager.use(import_validate_filter_params.default, { tag: "validate-filter-params", before: ["auth"] });
    this._dataSourceManager.use(import_middlewares.parseVariables, {
      group: "parseVariables",
      after: "acl"
    });
    this._dataSourceManager.use(import_data_template.dataTemplate, { group: "dataTemplate", after: "acl" });
    this._locales = new import_locale.Locale((0, import_helper.createAppProxy)(this));
    if (options.perfHooks) {
      (0, import_helper.enablePerfHooks)(this);
    }
    (0, import_helper.registerMiddlewares)(this, options);
    if (options.registerActions !== false) {
      (0, import_actions.registerActions)(this);
    }
    (0, import_commands.registerCli)(this);
    this._version = new import_application_version.ApplicationVersion(this);
    for (const callback of _Application.staticCommands) {
      callback(this);
    }
    this.aiManager = new import_ai.AIManager(this);
  }
  createMainDataSource(options) {
    const mainDataSourceInstance = new import_main_data_source.MainDataSource({
      name: "main",
      database: this.createDatabase(options),
      acl: (0, import_acl.createACL)(),
      resourceManager: (0, import_helper.createResourcer)(options),
      useACL: options.acl
    });
    this._dataSourceManager = new import_data_source_manager.DataSourceManager({
      logger: this.logger,
      app: this
    });
    this.dataSourceManager.dataSources.set("main", mainDataSourceInstance);
  }
  createDatabase(options) {
    const logging = /* @__PURE__ */ __name((...args) => {
      let msg = args[0];
      if (typeof msg === "string") {
        msg = msg.replace(/[\r\n]/gm, "").replace(/\s+/g, " ");
      }
      if (msg.includes("INSERT INTO")) {
        msg = msg.substring(0, 2e3) + "...";
      }
      const content = { message: msg, app: this.name, reqId: this.context.reqId };
      if (args[1] && typeof args[1] === "number") {
        content.executeTime = args[1];
      }
      this._sqlLogger.debug(content);
    }, "logging");
    const dbOptions = options.database instanceof import_database.default ? options.database.options : options.database;
    const db = new import_database.default({
      ...dbOptions,
      logging: dbOptions.logging ? logging : false,
      migrator: {
        context: { app: this }
      },
      logger: this._logger.child({ module: "database" })
    });
    db.setMaxListeners(100);
    return db;
  }
};
__name(_Application, "Application");
__publicField(_Application, "staticCommands", []);
let Application = _Application;
(0, import_utils.applyMixins)(Application, [import_utils.AsyncEmitter]);
var application_default = Application;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Application
});
