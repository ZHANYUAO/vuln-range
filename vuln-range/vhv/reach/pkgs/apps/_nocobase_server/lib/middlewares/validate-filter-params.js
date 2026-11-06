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
var validate_filter_params_exports = {};
__export(validate_filter_params_exports, {
  default: () => validateFilterParams
});
module.exports = __toCommonJS(validate_filter_params_exports);
var import_utils = require("@nocobase/utils");
async function validateFilterParams(ctx, next) {
  const { params } = ctx.action;
  const guardedActions = ["update", "destroy"];
  const { actionName } = params;
  if (skipValidate(params)) {
    return await next();
  }
  if (emptyFilter(params) && emptyFilterByTk(params)) {
    throw new Error(`to do ${actionName} action, filter or filterByTk is required`);
  }
  if (params.filter && !(0, import_utils.isValidFilter)(params.filter) && guardedActions.includes(params.actionName)) {
    throw new Error(`Invalid filter: ${JSON.stringify(params.filter)}`);
  }
  await next();
}
__name(validateFilterParams, "validateFilterParams");
function emptyFilter(params) {
  return !(0, import_utils.isValidFilter)(params.filter);
}
__name(emptyFilter, "emptyFilter");
function emptyFilterByTk(params) {
  return !params.filterByTk;
}
__name(emptyFilterByTk, "emptyFilterByTk");
function skipValidate(actionParams) {
  const { actionName } = actionParams;
  if (actionName === "update") {
    return actionParams.forceUpdate;
  }
  if (actionName === "destroy") {
    return actionParams.truncate;
  }
  return true;
}
__name(skipValidate, "skipValidate");
