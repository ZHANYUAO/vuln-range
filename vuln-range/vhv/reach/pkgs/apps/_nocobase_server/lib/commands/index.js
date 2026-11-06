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
var commands_exports = {};
__export(commands_exports, {
  registerCli: () => registerCli
});
module.exports = __toCommonJS(commands_exports);
var import_create_migration = __toESM(require("./create-migration"));
var import_db_auth = __toESM(require("./db-auth"));
var import_db_clean = __toESM(require("./db-clean"));
var import_db_sync = __toESM(require("./db-sync"));
var import_destroy = __toESM(require("./destroy"));
var import_install = __toESM(require("./install"));
var import_pm = __toESM(require("./pm"));
var import_refresh = __toESM(require("./refresh"));
var import_restart = __toESM(require("./restart"));
var import_start = __toESM(require("./start"));
var import_stop = __toESM(require("./stop"));
var import_upgrade = __toESM(require("./upgrade"));
var import_console = __toESM(require("./console"));
var import_repair = __toESM(require("./repair"));
var import_ai = __toESM(require("./ai"));
/* istanbul ignore file -- @preserve */
function registerCli(app) {
  (0, import_console.default)(app);
  (0, import_db_auth.default)(app);
  (0, import_create_migration.default)(app);
  (0, import_db_clean.default)(app);
  (0, import_db_sync.default)(app);
  (0, import_install.default)(app);
  (0, import_upgrade.default)(app);
  (0, import_pm.default)(app);
  (0, import_restart.default)(app);
  (0, import_stop.default)(app);
  (0, import_destroy.default)(app);
  (0, import_start.default)(app);
  (0, import_refresh.default)(app);
  (0, import_repair.default)(app);
  (0, import_ai.default)(app);
  app.command("build").argument("[packages...]");
  app.command("clean");
  app.command("dev").usage("[options]").option("-p, --port [port]").option("--client").option("--server");
  app.command("doc").argument("[cmd]", "", "dev");
  app.command("test").option("-c, --db-clean");
  app.command("umi");
}
__name(registerCli, "registerCli");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  registerCli
});
