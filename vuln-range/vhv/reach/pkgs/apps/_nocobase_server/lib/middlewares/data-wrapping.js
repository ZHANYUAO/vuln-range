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
var data_wrapping_exports = {};
__export(data_wrapping_exports, {
  dataWrapping: () => dataWrapping,
  default: () => data_wrapping_default
});
module.exports = __toCommonJS(data_wrapping_exports);
var import_stream = __toESM(require("stream"));
function dataWrapping() {
  return /* @__PURE__ */ __name(async function dataWrapping2(ctx, next) {
    var _a, _b;
    await next();
    if (ctx.withoutDataWrapping) {
      return;
    }
    if (ctx.body instanceof import_stream.default.Readable) {
      return;
    }
    if (ctx.body instanceof Buffer) {
      return;
    }
    if (!ctx.body) {
      if (((_a = ctx.action) == null ? void 0 : _a.actionName) == "get") {
        ctx.status = 200;
      }
    }
    if (Array.isArray(ctx.body)) {
      ctx.body = {
        data: ctx.body
      };
    } else {
      if (ctx.body) {
        const { rows, ...meta } = ctx.body;
        if (rows) {
          ctx.body = {
            data: rows,
            meta
          };
        } else {
          ctx.body = {
            data: ctx.body
          };
          if (ctx.bodyMeta) {
            ctx.body.meta = ctx.bodyMeta;
          }
        }
      } else if (ctx.action) {
        ctx.body = {
          data: ctx.body
        };
      }
    }
    if (ctx.body && ((_b = ctx.state.messages) == null ? void 0 : _b.length)) {
      ctx.body.messages = ctx.state.messages;
    }
    ctx.dataWrapped = true;
  }, "dataWrapping");
}
__name(dataWrapping, "dataWrapping");
var data_wrapping_default = dataWrapping;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  dataWrapping
});
