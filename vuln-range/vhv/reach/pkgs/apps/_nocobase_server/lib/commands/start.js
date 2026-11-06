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
var start_exports = {};
__export(start_exports, {
  default: () => start_default
});
module.exports = __toCommonJS(start_exports);
var import_fs_extra = __toESM(require("fs-extra"));
var import_utils = require("@nocobase/utils");
var import_application_not_install = require("../errors/application-not-install");
/* istanbul ignore file -- @preserve */
var start_default = /* @__PURE__ */ __name((app) => {
  app.command("start").auth().option("--db-sync").option("--quickstart").action(async (...cliArgs) => {
    const [options] = cliArgs;
    const file = (0, import_utils.storagePathJoin)(".upgrading");
    const upgrading = await import_fs_extra.default.exists(file);
    if (upgrading) {
      if (!process.env.VITEST) {
        if (await app.isInstalled()) {
          await app.upgrade();
        }
      }
      try {
        await import_fs_extra.default.rm(file, { recursive: true, force: true });
      } catch (error) {
      }
    } else if (options.quickstart) {
      if (await app.isInstalled()) {
        await app.upgrade({ quickstart: true });
      } else {
        await app.install();
      }
      app["_started"] = /* @__PURE__ */ new Date();
      await app.restart();
      app.log.info("app has been started");
      return;
    }
    if (!await app.isInstalled()) {
      app["_started"] = /* @__PURE__ */ new Date();
      throw new import_application_not_install.ApplicationNotInstall(
        `Application ${app.name} is not installed, Please run 'yarn nocobase install' command first`
      );
    }
    await app.load();
    await app.start({
      dbSync: options == null ? void 0 : options.dbSync,
      quickstart: options.quickstart,
      cliArgs,
      checkInstall: true
    });
    app.log.info("app has been started");
  });
}, "default");
