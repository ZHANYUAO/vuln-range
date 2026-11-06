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
var resource_exports = {};
__export(resource_exports, {
  getResource: () => getResource
});
module.exports = __toCommonJS(resource_exports);
var import_promises = __toESM(require("fs/promises"));
const arr2obj = /* @__PURE__ */ __name((items) => {
  const obj = {};
  for (const item of items) {
    Object.assign(obj, item);
  }
  return obj;
}, "arr2obj");
const getResource = /* @__PURE__ */ __name(async (packageName, lang, isPlugin = true) => {
  const resources = [];
  const prefixes = [isPlugin ? "dist" : "lib"];
  if (process.env.APP_ENV !== "production") {
    try {
      require.resolve("@nocobase/client/src");
      if (packageName === "@nocobase/plugin-client") {
        packageName = "@nocobase/client";
      }
    } catch (error) {
    }
    try {
      require.resolve("@nocobase/flow-engine/src");
      if (packageName === "@nocobase/plugin-flow-engine") {
        packageName = "@nocobase/flow-engine";
      }
    } catch (error) {
    }
    prefixes.unshift("src");
  }
  for (const prefix of prefixes) {
    try {
      const file = `${packageName}/${prefix}/locale/${lang}.json`;
      const f = require.resolve(file);
      const resource = await import_promises.default.readFile(f, "utf8");
      resources.push(JSON.parse(resource));
    } catch (error) {
    }
    if (resources.length) {
      break;
    }
  }
  if (resources.length === 0 && lang.replace("-", "_") !== lang) {
    return await getResource(packageName, lang.replace("-", "_"));
  }
  return arr2obj(resources);
}, "getResource");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getResource
});
