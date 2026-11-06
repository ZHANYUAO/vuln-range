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
var db_sync_exports = {};
__export(db_sync_exports, {
  default: () => db_sync_default
});
module.exports = __toCommonJS(db_sync_exports);
/* istanbul ignore file -- @preserve */
var db_sync_default = /* @__PURE__ */ __name((app) => {
  app.command("db:sync").auth().preload().action(async (...cliArgs) => {
    const [opts] = cliArgs;
    console.log("db sync...");
    const Collection = app.db.getCollection("collections");
    if (Collection) {
      await Collection.repository.setApp(app);
      await Collection.repository.load();
    }
    app.log.info("syncing database...");
    const force = false;
    await app.db.sync({
      force,
      alter: {
        drop: force
      }
    });
  });
}, "default");
