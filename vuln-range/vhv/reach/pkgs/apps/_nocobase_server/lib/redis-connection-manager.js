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
var redis_connection_manager_exports = {};
__export(redis_connection_manager_exports, {
  RedisConnectionManager: () => RedisConnectionManager
});
module.exports = __toCommonJS(redis_connection_manager_exports);
var import_merge = __toESM(require("lodash/merge"));
var import_redis = require("redis");
const _RedisConnectionManager = class _RedisConnectionManager {
  logger;
  config;
  connections = /* @__PURE__ */ new Map();
  connectionConfigs = /* @__PURE__ */ new Map();
  connecting = /* @__PURE__ */ new WeakMap();
  constructor(config) {
    this.config = config.redisConfig || {};
    this.logger = config.logger;
  }
  bindEvents(conn, key, config) {
    conn.on("connect", () => {
      this.logger.info(`Redis connected`, {
        method: "getConnection",
        key
      });
    });
    conn.on("ready", () => {
      this.logger.trace(`Redis ready`, {
        method: "getConnection",
        key
      });
    });
    conn.on("error", (err) => {
      this.logger.error(err.message, {
        err,
        method: "getConnection",
        key
      });
    });
    conn.on("end", () => {
      this.logger.trace(`Redis closed`, {
        method: "getConnection",
        key
      });
    });
  }
  mergeConfig(config) {
    return (0, import_merge.default)({}, this.config || {}, config || {});
  }
  hasConnectionOptions(config) {
    if (!config) {
      return false;
    }
    return Boolean(config.connectionString || config.url || config.socket);
  }
  buildClientOptions(config) {
    const { connectionString, ...rest } = config;
    const options = { ...rest };
    if (connectionString && !options.url) {
      options.url = connectionString;
    }
    return options;
  }
  ensureConnected(conn, key, config) {
    if (conn.isOpen || this.connecting.has(conn)) {
      return;
    }
    const promise = conn.connect().catch((err) => {
      this.logger.error(err.message, {
        err,
        method: "connect",
        key,
        config
      });
      this.connections.delete(key);
      this.connectionConfigs.delete(key);
      throw err;
    }).finally(() => {
      this.connecting.delete(conn);
    });
    this.connecting.set(conn, promise);
  }
  getClient(key = "default", config) {
    let conn = this.connections.get(key);
    if (conn) {
      this.ensureConnected(conn, key, this.connectionConfigs.get(key));
      return conn;
    }
    const cfg = this.mergeConfig(config);
    if (!this.hasConnectionOptions(cfg)) {
      return null;
    }
    conn = (0, import_redis.createClient)(this.buildClientOptions(cfg));
    this.connections.set(key, conn);
    this.connectionConfigs.set(key, cfg);
    this.bindEvents(conn, key, cfg);
    this.ensureConnected(conn, key, cfg);
    return conn;
  }
  getConnection(key = "default", config) {
    return this.getClient(key, config);
  }
  async waitUntilReady(conn) {
    if (conn.isReady) {
      return conn;
    }
    const pendingConnect = this.connecting.get(conn);
    if (pendingConnect) {
      await pendingConnect;
      if (conn.isReady) {
        return conn;
      }
    } else if (!conn.isOpen) {
      await conn.connect();
      if (conn.isReady) {
        return conn;
      }
    }
    return new Promise((resolve, reject) => {
      const cleanup = /* @__PURE__ */ __name(() => {
        conn.off("ready", handleReady);
        conn.off("error", handleError);
      }, "cleanup");
      const handleReady = /* @__PURE__ */ __name(() => {
        cleanup();
        resolve(conn);
      }, "handleReady");
      const handleError = /* @__PURE__ */ __name((err) => {
        cleanup();
        reject(err);
      }, "handleError");
      conn.once("ready", handleReady);
      conn.once("error", handleError);
    });
  }
  async getConnectionSync(key = "default", config) {
    const conn = this.getClient(key, config);
    if (!conn) {
      throw new Error("Redis connection configuration is missing");
    }
    return this.waitUntilReady(conn);
  }
  async closeConnection(key, conn) {
    if (!(conn == null ? void 0 : conn.isOpen)) {
      return;
    }
    try {
      await conn.quit();
    } catch (err) {
      this.logger.warn(`Failed to quit redis connection`, {
        err,
        method: "closeConnection",
        key
      });
      try {
        conn.destroy();
      } catch (disconnectErr) {
        this.logger.warn(`Failed to disconnect redis connection`, {
          err: disconnectErr,
          method: "closeConnection",
          key
        });
      }
    }
  }
  async close() {
    for (const [key, conn] of this.connections.entries()) {
      await this.closeConnection(key, conn);
    }
  }
};
__name(_RedisConnectionManager, "RedisConnectionManager");
let RedisConnectionManager = _RedisConnectionManager;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  RedisConnectionManager
});
