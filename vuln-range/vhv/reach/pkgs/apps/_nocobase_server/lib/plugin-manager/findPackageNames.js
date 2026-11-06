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
var findPackageNames_exports = {};
__export(findPackageNames_exports, {
  appendToBuiltInPlugins: () => appendToBuiltInPlugins,
  findAllPlugins: () => findAllPlugins,
  findBuiltInPlugins: () => findBuiltInPlugins,
  findLocalPlugins: () => findLocalPlugins,
  findPackageNames: () => findPackageNames,
  packageNameTrim: () => packageNameTrim
});
module.exports = __toCommonJS(findPackageNames_exports);
var import_plugin_package = require("../../../utils/plugin-package");
var import_lodash = __toESM(require("lodash"));
async function trim(packageNames) {
  const nameOrPkgs = import_lodash.default.uniq(packageNames).filter(Boolean);
  const names = [];
  for (const nameOrPkg of nameOrPkgs) {
    const { name, packageName } = await (0, import_plugin_package.parsePluginName)(nameOrPkg, {
      nodeModulesPath: process.env.NODE_MODULES_PATH
    });
    if (await (0, import_plugin_package.resolvePluginPackagePath)(packageName)) {
      names.push(name);
    }
  }
  return names;
}
__name(trim, "trim");
const excludes = [
  "external-db-data-source",
  "@nocobase/plugin-audit-logs",
  "@nocobase/plugin-backup-restore",
  "@nocobase/plugin-charts",
  "@nocobase/plugin-disable-pm-add",
  "@nocobase/plugin-mobile-client",
  "@nocobase/plugin-mock-collections",
  "@nocobase/plugin-multi-app-share-collection",
  "@nocobase/plugin-notifications",
  "@nocobase/plugin-snapshot-field",
  "@nocobase/plugin-workflow-test"
];
async function findPackageNames() {
  try {
    const packages = await (0, import_plugin_package.discoverPluginPackages)({
      nodeModulesPath: process.env.NODE_MODULES_PATH
    });
    return trim(packages.filter((pkg) => !excludes.includes(pkg.packageName)).map((pkg) => pkg.packageName));
  } catch (error) {
    return [];
  }
}
__name(findPackageNames, "findPackageNames");
async function getPackageJson() {
  const packageJson = await (0, import_plugin_package.getPresetNocoBasePackageJson)({
    nodeModulesPath: process.env.NODE_MODULES_PATH
  });
  if (!packageJson) {
    throw new Error("Cannot find @nocobase/preset-nocobase package.json");
  }
  return packageJson;
}
__name(getPackageJson, "getPackageJson");
async function findBuiltInPlugins() {
  const { APPEND_PRESET_BUILT_IN_PLUGINS = "" } = process.env;
  try {
    const packageJson = await getPackageJson();
    return trim((packageJson.builtIn || []).concat((0, import_plugin_package.splitPluginNames)(APPEND_PRESET_BUILT_IN_PLUGINS)));
  } catch (error) {
    return [];
  }
}
__name(findBuiltInPlugins, "findBuiltInPlugins");
async function findLocalPlugins() {
  const packageJson = await getPackageJson();
  const packages = await (0, import_plugin_package.discoverPluginPackages)({
    nodeModulesPath: process.env.NODE_MODULES_PATH
  });
  const builtInPackageNames = await Promise.all(
    (packageJson.builtIn || []).concat((0, import_plugin_package.splitPluginNames)(process.env.APPEND_PRESET_BUILT_IN_PLUGINS || "")).map(
      async (nameOrPkg) => (await (0, import_plugin_package.parsePluginName)(nameOrPkg, { nodeModulesPath: process.env.NODE_MODULES_PATH })).packageName
    )
  );
  const deprecatedPackageNames = await Promise.all(
    (packageJson.deprecated || []).map(
      async (nameOrPkg) => (await (0, import_plugin_package.parsePluginName)(nameOrPkg, { nodeModulesPath: process.env.NODE_MODULES_PATH })).packageName
    )
  );
  return trim(
    import_lodash.default.difference(
      packages.filter((pkg) => !excludes.includes(pkg.packageName)).map((pkg) => pkg.packageName),
      import_lodash.default.uniq(builtInPackageNames.concat(deprecatedPackageNames))
    )
  );
}
__name(findLocalPlugins, "findLocalPlugins");
async function findAllPlugins() {
  const builtInPlugins = await findBuiltInPlugins();
  const localPlugins = await findLocalPlugins();
  return import_lodash.default.uniq(builtInPlugins.concat(localPlugins));
}
__name(findAllPlugins, "findAllPlugins");
const packageNameTrim = trim;
async function appendToBuiltInPlugins(nameOrPkg) {
  const APPEND_PRESET_BUILT_IN_PLUGINS = process.env.APPEND_PRESET_BUILT_IN_PLUGINS || "";
  const keys = (0, import_plugin_package.splitPluginNames)(APPEND_PRESET_BUILT_IN_PLUGINS);
  const { name, packageName } = await (0, import_plugin_package.parsePluginName)(nameOrPkg, {
    nodeModulesPath: process.env.NODE_MODULES_PATH
  });
  if (keys.includes(packageName)) {
    return;
  }
  if (keys.includes(name)) {
    return;
  }
  process.env.APPEND_PRESET_BUILT_IN_PLUGINS += "," + nameOrPkg;
}
__name(appendToBuiltInPlugins, "appendToBuiltInPlugins");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  appendToBuiltInPlugins,
  findAllPlugins,
  findBuiltInPlugins,
  findLocalPlugins,
  findPackageNames,
  packageNameTrim
});
