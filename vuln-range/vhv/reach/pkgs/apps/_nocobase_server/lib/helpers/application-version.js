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
var application_version_exports = {};
__export(application_version_exports, {
  ApplicationVersion: () => ApplicationVersion
});
module.exports = __toCommonJS(application_version_exports);
var import_semver = __toESM(require("semver"));
const _ApplicationVersion = class _ApplicationVersion {
  app;
  collection;
  constructor(app) {
    this.app = app;
    app.db.collection({
      origin: "@nocobase/server",
      name: "applicationVersion",
      dataCategory: "system",
      migrationRules: ["schema-only"],
      dataType: "meta",
      timestamps: false,
      dumpRules: "required",
      fields: [{ name: "value", type: "string" }]
    });
    this.collection = this.app.db.getCollection("applicationVersion");
  }
  async get() {
    const model = await this.collection.model.findOne();
    if (!model) {
      return null;
    }
    return model.get("value");
  }
  async update(version) {
    await this.collection.model.destroy({
      truncate: true
    });
    await this.collection.model.create({
      value: version || this.app.getVersion()
    });
  }
  async satisfies(range) {
    const model = await this.collection.model.findOne();
    const version = model == null ? void 0 : model.value;
    if (!version) {
      return true;
    }
    return import_semver.default.satisfies(version, range, { includePrerelease: true });
  }
};
__name(_ApplicationVersion, "ApplicationVersion");
let ApplicationVersion = _ApplicationVersion;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ApplicationVersion
});
