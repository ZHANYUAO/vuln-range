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
var app_options_factory_exports = {};
__export(app_options_factory_exports, {
  appOptionsFactory: () => appOptionsFactory
});
module.exports = __toCommonJS(app_options_factory_exports);
var import_database = require("@nocobase/database");
var import_lodash = __toESM(require("lodash"));
var import_path = __toESM(require("path"));
var import_lodash2 = __toESM(require("lodash"));
function getDatabaseConfig(app) {
  let oldConfig = app.options.database instanceof import_database.Database ? app.options.database.options : app.options.database;
  if (!oldConfig && app.db) {
    oldConfig = app.db.options;
  }
  return import_lodash.default.cloneDeep(import_lodash.default.omit(oldConfig, ["migrator"]));
}
__name(getDatabaseConfig, "getDatabaseConfig");
const appOptionsFactory = /* @__PURE__ */ __name((appName, mainApp, options) => {
  const rawDatabaseOptions = getDatabaseConfig(mainApp);
  let dbConnType = "new_database";
  if (rawDatabaseOptions.dialect === "sqlite") {
    const mainAppStorage = rawDatabaseOptions.storage;
    if (mainAppStorage !== ":memory:") {
      const mainStorageDir = import_path.default.dirname(mainAppStorage);
      rawDatabaseOptions.storage = import_path.default.join(mainStorageDir, `${appName}.sqlite`);
    }
  } else if (process.env.USE_DB_SCHEMA_IN_SUBAPP === "true" && ["postgres", "kingbase"].includes(rawDatabaseOptions.dialect)) {
    rawDatabaseOptions.schema = appName;
    dbConnType = "new_schema";
  } else if ((options == null ? void 0 : options.dbConnType) !== "new_schema") {
    rawDatabaseOptions.database = appName;
  }
  const defaultOptions = {
    dbConnType,
    database: {
      ...rawDatabaseOptions,
      tablePrefix: ""
    },
    plugins: ["nocobase"],
    resourcer: {
      prefix: process.env.API_BASE_PATH
    },
    cacheManager: {
      ...mainApp.options.cacheManager,
      prefix: appName
    },
    logger: mainApp.options.logger
  };
  return import_lodash2.default.merge({}, defaultOptions, { ...options, name: appName });
}, "appOptionsFactory");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  appOptionsFactory
});
