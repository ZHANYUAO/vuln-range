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
var condition_registry_exports = {};
__export(condition_registry_exports, {
  ConditionalRegistry: () => ConditionalRegistry
});
module.exports = __toCommonJS(condition_registry_exports);
const _ConditionalRegistry = class _ConditionalRegistry {
  rules = [];
  defaultHandler;
  register(when, run, priority = 0) {
    this.rules.push({ when, run, priority });
    this.rules.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }
  setDefault(run) {
    this.defaultHandler = run;
  }
  async run(ctx) {
    for (const rule of this.rules) {
      if (await rule.when(ctx)) {
        return await rule.run(ctx);
      }
    }
    if (this.defaultHandler) {
      return await this.defaultHandler(ctx);
    }
    throw new Error("No handler matched and no default handler defined");
  }
};
__name(_ConditionalRegistry, "ConditionalRegistry");
let ConditionalRegistry = _ConditionalRegistry;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ConditionalRegistry
});
