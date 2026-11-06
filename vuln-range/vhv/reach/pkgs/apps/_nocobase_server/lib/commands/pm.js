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
var pm_exports = {};
__export(pm_exports, {
  default: () => pm_default
});
module.exports = __toCommonJS(pm_exports);
var import_app_supervisor = require("../app-supervisor");
var import_plugin_command_error = require("../errors/plugin-command-error");
var import_utils = require("../plugin-manager/utils");
/* istanbul ignore file -- @preserve */
var pm_default = /* @__PURE__ */ __name((app) => {
  const pm = app.command("pm");
  pm.command("list").action(async () => {
    const items = await (0, import_utils.pmListSummary)(app);
    console.log("--- BEGIN_PLUGIN_LIST_JSON ---");
    console.log(JSON.stringify(items));
    console.log("--- END_PLUGIN_LIST_JSON ---");
  });
  pm.command("create").argument("plugin").option("--force-recreate").action(async (plugin, options) => {
    await app.pm.create(plugin, options);
  });
  pm.command("pull").arguments("<packageNames...>").option("--registry [registry]").option("--auth-token [authToken]").option("--version [version]").action(async (packageNames, options, cli) => {
    try {
      let name = packageNames;
      if (Array.isArray(packageNames) && packageNames.length === 1) {
        name = packageNames[0];
      }
      await app.pm.pull(name, { ...options });
    } catch (error) {
      throw new import_plugin_command_error.PluginCommandError(`Failed to pull plugin`, { cause: error });
    }
  });
  pm.command("add").ipc().preload().arguments("<packageNames...>").option("--registry [registry]").option("--auth-token [authToken]").option("--version [version]").action(async (packageNames, options, cli) => {
    try {
      let name = packageNames;
      if (Array.isArray(packageNames) && packageNames.length === 1) {
        name = packageNames[0];
      }
      await app.pm.addViaCLI(name, { ...options });
    } catch (error) {
      throw new import_plugin_command_error.PluginCommandError(`Failed to add plugin`, { cause: error });
    }
  });
  pm.command("update").argument("<packageNames...>").option("--registry [registry]").option("--auth-token [authToken]").option("--version [version]").action(async (packageNames, options) => {
    try {
      await app.pm.update(packageNames, {
        ...options
      });
    } catch (error) {
      throw new import_plugin_command_error.PluginCommandError(`Failed to update plugin`, { cause: error });
    }
  });
  pm.command("enable-all").ipc().preload().action(async () => {
    try {
      await app.pm.enable("*");
    } catch (error) {
      throw new import_plugin_command_error.PluginCommandError(`Failed to enable plugin`, { cause: error });
    }
  });
  pm.command("enable").ipc().preload().arguments("<plugins...>").action(async (plugins) => {
    try {
      await app.pm.enable(plugins);
    } catch (error) {
      await app.tryReloadOrRestart({
        recover: true
      });
      throw new import_plugin_command_error.PluginCommandError(`Failed to enable plugin`, { cause: error });
    }
  });
  pm.command("disable").ipc().preload().arguments("<plugins...>").action(async (plugins) => {
    try {
      await app.pm.disable(plugins);
    } catch (error) {
      throw new import_plugin_command_error.PluginCommandError(`Failed to disable plugin`, { cause: error });
    }
  });
  pm.command("remove").auth().arguments("<plugins...>").option("--force").option("--remove-dir").option("--app [app]").action(async (plugins, options) => {
    if (options.app) {
      await app.load();
      const subApp = await import_app_supervisor.AppSupervisor.getInstance().getApp(options.app, { upgrading: true });
      const args = [];
      if (options.force) {
        args.push("--force");
      }
      if (options.removeDir) {
        args.push("--remove-dir");
      }
      await subApp.runCommand("pm", "remove", ...plugins, ...args);
    } else {
      await app.pm.remove(plugins, options);
    }
  });
}, "default");
