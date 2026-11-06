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
var run_plugin_static_imports_exports = {};
__export(run_plugin_static_imports_exports, {
  runPluginStaticImports: () => runPluginStaticImports
});
module.exports = __toCommonJS(run_plugin_static_imports_exports);
var import_logger = require("@nocobase/logger");
var import_server = require("@nocobase/server");
var import_utils = require("@nocobase/utils");
async function runPluginStaticImports() {
  const packages = await (0, import_server.findAllPlugins)();
  for (const name of packages) {
    const { packageName } = await import_server.PluginManager.parseName(name);
    try {
      const plugin = await (0, import_utils.importModule)(packageName);
      if (plugin && plugin.staticImport) {
        import_logger.logger.info("run static import", { packageName });
        await plugin.staticImport();
      }
    } catch (error) {
      import_logger.logger.error(error, { packageName });
      continue;
    }
  }
}
__name(runPluginStaticImports, "runPluginStaticImports");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  runPluginStaticImports
});
