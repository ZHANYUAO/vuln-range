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
var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var src_exports = {};
__export(src_exports, {
  appendToBuiltInPlugins: () => import_findPackageNames.appendToBuiltInPlugins,
  createContextVariablesScope: () => import_helper.createContextVariablesScope,
  default: () => import_application.Application,
  findAllPlugins: () => import_findPackageNames.findAllPlugins,
  findBuiltInPlugins: () => import_findPackageNames.findBuiltInPlugins,
  findLocalPlugins: () => import_findPackageNames.findLocalPlugins,
  middlewares: () => middlewares,
  packageNameTrim: () => import_findPackageNames.packageNameTrim,
  runPluginStaticImports: () => import_run_plugin_static_imports.runPluginStaticImports
});
module.exports = __toCommonJS(src_exports);
__reExport(src_exports, require("./aes-encryptor"), module.exports);
__reExport(src_exports, require("./app-supervisor"), module.exports);
__reExport(src_exports, require("./application"), module.exports);
__reExport(src_exports, require("./gateway/ws-server"), module.exports);
var import_application = require("./application");
__reExport(src_exports, require("./audit-manager"), module.exports);
__reExport(src_exports, require("./gateway"), module.exports);
__reExport(src_exports, require("./gateway/static-file-security"), module.exports);
var middlewares = __toESM(require("./middlewares"));
__reExport(src_exports, require("./migration"), module.exports);
__reExport(src_exports, require("./plugin"), module.exports);
__reExport(src_exports, require("./plugin-manager"), module.exports);
__reExport(src_exports, require("./pub-sub-manager"), module.exports);
__reExport(src_exports, require("./event-queue"), module.exports);
__reExport(src_exports, require("./worker-id-allocator"), module.exports);
__reExport(src_exports, require("./worker-mode"), module.exports);
__reExport(src_exports, require("./redis-connection-manager"), module.exports);
__reExport(src_exports, require("./main-data-source"), module.exports);
__reExport(src_exports, require("./constants"), module.exports);
var import_findPackageNames = require("./plugin-manager/findPackageNames");
var import_run_plugin_static_imports = require("./run-plugin-static-imports");
var import_helper = require("./helper");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  appendToBuiltInPlugins,
  createContextVariablesScope,
  findAllPlugins,
  findBuiltInPlugins,
  findLocalPlugins,
  middlewares,
  packageNameTrim,
  runPluginStaticImports,
  ...require("./aes-encryptor"),
  ...require("./app-supervisor"),
  ...require("./application"),
  ...require("./gateway/ws-server"),
  ...require("./audit-manager"),
  ...require("./gateway"),
  ...require("./gateway/static-file-security"),
  ...require("./migration"),
  ...require("./plugin"),
  ...require("./plugin-manager"),
  ...require("./pub-sub-manager"),
  ...require("./event-queue"),
  ...require("./worker-id-allocator"),
  ...require("./worker-mode"),
  ...require("./redis-connection-manager"),
  ...require("./main-data-source"),
  ...require("./constants")
});
