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
var package_name_unique_exports = {};
__export(package_name_unique_exports, {
  default: () => package_name_unique_default
});
module.exports = __toCommonJS(package_name_unique_exports);
var import_database = require("@nocobase/database");
var import_migration = require("../migration");
/* istanbul ignore file -- @preserve */
const _package_name_unique_default = class _package_name_unique_default extends import_migration.Migration {
  on = "beforeLoad";
  appVersion = "<0.14.0-alpha.2";
  async up() {
    const tableNameWithSchema = this.pm.collection.getTableNameWithSchema();
    const field = this.pm.collection.getField("packageName");
    const exists = await field.existsInDb();
    if (exists) {
      return;
    }
    try {
      await this.db.sequelize.getQueryInterface().addColumn(tableNameWithSchema, field.columnName(), {
        type: import_database.DataTypes.STRING
      });
      await this.db.sequelize.getQueryInterface().addConstraint(tableNameWithSchema, {
        type: "unique",
        fields: [field.columnName()]
      });
    } catch (error) {
    }
  }
};
__name(_package_name_unique_default, "default");
let package_name_unique_default = _package_name_unique_default;
