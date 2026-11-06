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
var db_drivers_exports = {};
__export(db_drivers_exports, {
  loadMariadbDriver: () => loadMariadbDriver,
  loadMysqlDriver: () => loadMysqlDriver,
  loadPgModule: () => loadPgModule
});
module.exports = __toCommonJS(db_drivers_exports);
function loadMysqlDriver() {
  return require("mysql2/promise");
}
__name(loadMysqlDriver, "loadMysqlDriver");
function loadMariadbDriver() {
  return require("mariadb");
}
__name(loadMariadbDriver, "loadMariadbDriver");
function loadPgModule() {
  return require("pg");
}
__name(loadPgModule, "loadPgModule");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  loadMariadbDriver,
  loadMysqlDriver,
  loadPgModule
});
