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
var rename_plugins_exports = {};
__export(rename_plugins_exports, {
  default: () => rename_plugins_default
});
module.exports = __toCommonJS(rename_plugins_exports);
var import_migration = require("../migration");
const _rename_plugins_default = class _rename_plugins_default extends import_migration.Migration {
  on = "afterSync";
  // 'beforeLoad' or 'afterLoad'
  appVersion = "<1.0.0-alpha.3";
  async up() {
    const items = await this.pm.repository.find();
    for (const item of items) {
      if (item.name.startsWith("@nocobase/plugin-")) {
        item.set("name", item.name.substring("@nocobase/plugin-".length));
        await item.save();
      }
    }
  }
};
__name(_rename_plugins_default, "default");
let rename_plugins_default = _rename_plugins_default;
