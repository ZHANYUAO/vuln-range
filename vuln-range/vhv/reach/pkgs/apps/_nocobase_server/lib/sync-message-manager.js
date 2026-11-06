/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var sync_message_manager_exports = {};
__export(sync_message_manager_exports, {
  SyncMessageManager: () => SyncMessageManager,
  SyncMessageVersionManager: () => SyncMessageVersionManager
});
module.exports = __toCommonJS(sync_message_manager_exports);
const _SyncMessageManager = class _SyncMessageManager {
  constructor(app, options = {}) {
    this.app = app;
    this.options = options;
    this.versionManager = new SyncMessageVersionManager();
    app.on("beforeLoadPlugin", async (plugin) => {
      if (!plugin.name) {
        return;
      }
      if (typeof plugin.handleSyncMessage === "function") {
        await this.subscribe(plugin.name, async (...args) => {
          if (app.stopped || app.db.closed()) {
            return;
          }
          return plugin.handleSyncMessage(...args);
        });
      }
    });
  }
  versionManager;
  pubSubManager;
  get debounce() {
    return this.options.debounce || 1e3;
  }
  async publish(channel, message, options) {
    const { transaction, ...others } = options || {};
    if (transaction) {
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(
            new Error(
              `Publish message to ${channel} timeout, channel: ${channel}, message: ${JSON.stringify(message)}`
            )
          );
        }, 5e4);
        transaction.afterCommit(async () => {
          try {
            const r = await this.app.pubSubManager.publish(`${this.app.name}.sync.${channel}`, message, {
              skipSelf: true,
              ...others
            });
            resolve(r);
          } catch (error) {
            reject(error);
          } finally {
            clearTimeout(timer);
          }
        });
      });
    } else {
      return await this.app.pubSubManager.publish(`${this.app.name}.sync.${channel}`, message, {
        skipSelf: true,
        ...options
      });
    }
  }
  async subscribe(channel, callback) {
    return await this.app.pubSubManager.subscribe(`${this.app.name}.sync.${channel}`, callback, {
      debounce: this.debounce
    });
  }
  async unsubscribe(channel, callback) {
    return this.app.pubSubManager.unsubscribe(`${this.app.name}.sync.${channel}`, callback);
  }
  async sync() {
  }
};
__name(_SyncMessageManager, "SyncMessageManager");
let SyncMessageManager = _SyncMessageManager;
const _SyncMessageVersionManager = class _SyncMessageVersionManager {
  // TODO
};
__name(_SyncMessageVersionManager, "SyncMessageVersionManager");
let SyncMessageVersionManager = _SyncMessageVersionManager;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  SyncMessageManager,
  SyncMessageVersionManager
});
