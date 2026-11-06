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
var worker_mode_exports = {};
__export(worker_mode_exports, {
  isTransient: () => isTransient,
  serving: () => serving
});
module.exports = __toCommonJS(worker_mode_exports);
function isTransient() {
  return process.env.WORKER_MODE === "-";
}
__name(isTransient, "isTransient");
function serving(key) {
  const { WORKER_MODE = "" } = process.env;
  if (!WORKER_MODE) {
    return true;
  }
  if (WORKER_MODE === "-") {
    return false;
  }
  const topics = WORKER_MODE.trim().split(",");
  if (key) {
    if (WORKER_MODE === "*") {
      return true;
    }
    if (topics.includes(key)) {
      return true;
    }
    return false;
  } else {
    if (topics.includes("!")) {
      return true;
    }
    return false;
  }
}
__name(serving, "serving");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  isTransient,
  serving
});
