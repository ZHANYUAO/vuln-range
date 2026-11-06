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
var install_exports = {};
__export(install_exports, {
  default: () => install_default
});
module.exports = __toCommonJS(install_exports);
/* istanbul ignore file -- @preserve */
var install_default = /* @__PURE__ */ __name((app) => {
  app.command("install").ipc().auth().option("-f, --force").option("-c, --clean").option("--lang <lang>").action(async (options) => {
    if (options.lang) {
      process.env.INIT_APP_LANG = options.lang;
    }
    await app.install(options);
    const reinstall = options.clean || options.force;
    app.log.info(`app ${reinstall ? "reinstalled" : "installed"} successfully [v${app.getVersion()}]`);
  });
}, "default");
