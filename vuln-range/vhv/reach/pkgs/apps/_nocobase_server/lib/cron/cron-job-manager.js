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
var cron_job_manager_exports = {};
__export(cron_job_manager_exports, {
  CronJobManager: () => CronJobManager
});
module.exports = __toCommonJS(cron_job_manager_exports);
var import_cron = require("cron");
const _CronJobManager = class _CronJobManager {
  constructor(app) {
    this.app = app;
    app.on("beforeStop", async () => {
      this.stop();
    });
    app.on("afterStart", async () => {
      this.start();
    });
    app.on("beforeReload", async () => {
      this.stop();
    });
  }
  _jobs = /* @__PURE__ */ new Set();
  _started = false;
  get started() {
    return this._started;
  }
  get jobs() {
    return this._jobs;
  }
  addJob(options) {
    const cronJob = new import_cron.CronJob(options);
    this._jobs.add(cronJob);
    return cronJob;
  }
  removeJob(job) {
    job.stop();
    this._jobs.delete(job);
  }
  start() {
    this._jobs.forEach((job) => {
      job.start();
    });
    this._started = true;
  }
  stop() {
    this._jobs.forEach((job) => {
      job.stop();
    });
    this._started = false;
  }
};
__name(_CronJobManager, "CronJobManager");
let CronJobManager = _CronJobManager;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CronJobManager
});
