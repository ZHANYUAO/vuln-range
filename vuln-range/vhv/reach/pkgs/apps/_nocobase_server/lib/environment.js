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
var environment_exports = {};
__export(environment_exports, {
  Environment: () => Environment
});
module.exports = __toCommonJS(environment_exports);
var import_utils = require("@nocobase/utils");
var import_lodash = __toESM(require("lodash"));
const _Environment = class _Environment {
  vars = {};
  secretKeys = /* @__PURE__ */ new Set();
  setVariable(key, value, options) {
    this.vars[key] = value;
    if ((options == null ? void 0 : options.isSecret) === true) {
      this.secretKeys.add(key);
    } else if ((options == null ? void 0 : options.isSecret) === false) {
      this.secretKeys.delete(key);
    }
  }
  removeVariable(key) {
    delete this.vars[key];
    this.secretKeys.delete(key);
  }
  getVariablesAndSecrets() {
    return this.vars;
  }
  getVariables() {
    return this.vars;
  }
  getNonSecretVariables() {
    const result = {};
    for (const key of Object.keys(this.vars)) {
      if (!this.secretKeys.has(key)) {
        result[key] = this.vars[key];
      }
    }
    return result;
  }
  renderJsonTemplate(template, options) {
    if (options == null ? void 0 : options.omit) {
      const omitTemplate = import_lodash.default.omit(template, options.omit);
      const parsed = (0, import_utils.parse)(omitTemplate)({
        $env: this.vars
      });
      for (const key of options.omit) {
        import_lodash.default.set(parsed, key, import_lodash.default.get(template, key));
      }
      return parsed;
    }
    return (0, import_utils.parse)(template)({
      $env: this.vars
    });
  }
};
__name(_Environment, "Environment");
let Environment = _Environment;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Environment
});
