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
var main_only_adapter_exports = {};
__export(main_only_adapter_exports, {
  MainOnlyAdapter: () => MainOnlyAdapter
});
module.exports = __toCommonJS(main_only_adapter_exports);
const _MainOnlyAdapter = class _MainOnlyAdapter {
  constructor(supervisor) {
    this.supervisor = supervisor;
    this.name = "main-only";
  }
  name;
  apps = {};
  status;
  appErrors = {};
  async getApp(appName, options = {}) {
    if (appName !== "main") {
      this.supervisor.logger.warn(`only main app is supported`, { method: "getApp", appName });
      return;
    }
    if (!options.withOutBootStrap) {
      await this.bootstrapApp(appName);
    }
    return this.apps[appName];
  }
  async bootstrapApp(appName) {
    if (appName !== "main") {
      return;
    }
    if (!this.apps[appName]) {
      this.setAppStatus(appName, "not_found");
      return;
    }
    const status = this.getAppStatus("main");
    if (this.hasApp(appName) && status && status !== "preparing") {
      return;
    }
    this.setAppStatus("main", "initializing");
    this.setAppStatus("main", "initialized");
  }
  addApp(app) {
    if (app.name !== "main") {
      this.supervisor.logger.warn(`only main app is supported`, { method: "addApp" });
      return;
    }
    if (this.apps[app.name]) {
      throw new Error(`app ${app.name} already exists`);
    }
    this.apps[app.name] = app;
    if (!this.status || this.status === "not_found") {
      this.setAppStatus(app.name, "preparing");
    }
    return app;
  }
  getApps() {
    return Object.values(this.apps);
  }
  async listAppModels() {
    return [];
  }
  hasApp(appName) {
    if (appName !== "main") {
      return false;
    }
    return !!this.apps[appName];
  }
  async startApp(appName) {
    if (appName !== "main") {
      this.supervisor.logger.warn(`only main app is supported`, { method: "startApp" });
      return;
    }
    const app = await this.getApp(appName, { withOutBootStrap: true });
    await (app == null ? void 0 : app.runCommand("start", "--quickstart"));
  }
  async stopApp(appName) {
    var _a;
    if (appName !== "main") {
      this.supervisor.logger.warn(`only main app is supported`, { method: "stopApp" });
      return;
    }
    if (!this.apps[appName]) {
      return;
    }
    await ((_a = this.apps[appName]) == null ? void 0 : _a.runCommand("stop"));
  }
  async removeApp(appName) {
    if (appName !== "main") {
      this.supervisor.logger.warn(`only main app is supported`, { method: "removeApp" });
      return;
    }
    if (!this.apps[appName]) {
      return;
    }
    await this.apps[appName].runCommand("destroy");
    this.apps[appName] = null;
  }
  async upgradeApp(appName) {
    if (appName !== "main") {
      this.supervisor.logger.warn(`only main app is supported`, { method: "upgrade" });
      return;
    }
    if (!this.apps[appName]) {
      return;
    }
    await this.apps[appName].runCommand("upgrade");
  }
  async dispatchAppEvent(appName, event, payload, _context) {
    const app = await this.getApp(appName, { withOutBootStrap: true });
    if (!app) {
      return;
    }
    await app.emitAsync(event, payload);
  }
  async removeAllApps() {
    return this.removeApp("main");
  }
  setAppStatus(appName, status, options = {}) {
    if (appName !== "main" || this.status === status) {
      return;
    }
    this.status = status;
    this.supervisor.emit("appStatusChanged", { appName, status, options });
  }
  getAppStatus(appName, defaultStatus) {
    if (appName !== "main") {
      return "not_found";
    }
    return this.status ?? defaultStatus ?? null;
  }
  hasAppError(appName) {
    return !!this.appErrors[appName];
  }
  setAppError(appName, error) {
    this.appErrors[appName] = error;
    this.supervisor.emit("appError", { appName, error });
  }
  clearAppError(appName) {
    this.appErrors[appName] = null;
  }
  setAppLastSeenAt() {
  }
  getAppLastSeenAt(appName) {
    return null;
  }
};
__name(_MainOnlyAdapter, "MainOnlyAdapter");
let MainOnlyAdapter = _MainOnlyAdapter;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MainOnlyAdapter
});
