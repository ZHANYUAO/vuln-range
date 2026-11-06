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
var handler_manager_exports = {};
__export(handler_manager_exports, {
  HandlerManager: () => HandlerManager
});
module.exports = __toCommonJS(handler_manager_exports);
var import_node_crypto = __toESM(require("node:crypto"));
var import_lodash = __toESM(require("lodash"));
const _HandlerManager = class _HandlerManager {
  constructor(publisherId) {
    this.publisherId = publisherId;
    this.reset();
  }
  handlers;
  uniqueMessageHandlers;
  async getMessageHash(message) {
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(message));
    const hashBuffer = await import_node_crypto.default.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    return hashHex;
  }
  verifyMessage({ onlySelf, skipSelf, publisherId }) {
    if (onlySelf && publisherId !== this.publisherId) {
      return;
    } else if (!onlySelf && skipSelf && publisherId === this.publisherId) {
      return;
    }
    return true;
  }
  debounce(func, wait) {
    if (wait) {
      return import_lodash.default.debounce(func, wait);
    }
    return func;
  }
  async handleMessage({ channel, message, callback, debounce }) {
    if (!debounce) {
      await callback(message);
      return;
    }
    const messageHash = channel + await this.getMessageHash(message);
    if (!this.uniqueMessageHandlers.has(messageHash)) {
      this.uniqueMessageHandlers.set(messageHash, this.debounce(callback, debounce));
    }
    const handler = this.uniqueMessageHandlers.get(messageHash);
    try {
      await handler(message);
      setTimeout(() => {
        this.uniqueMessageHandlers.delete(messageHash);
      }, debounce);
    } catch (error) {
      this.uniqueMessageHandlers.delete(messageHash);
      throw error;
    }
  }
  wrapper(channel, callback, options) {
    const { debounce = 0 } = options;
    return async (wrappedMessage) => {
      const json = JSON.parse(wrappedMessage);
      if (!this.verifyMessage(json)) {
        return;
      }
      await this.handleMessage({ channel, message: json.message, debounce, callback });
    };
  }
  set(channel, callback, options) {
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, /* @__PURE__ */ new Map());
    }
    const headlerMap = this.handlers.get(channel);
    const headler = this.wrapper(channel, callback, options);
    headlerMap.set(callback, headler);
    return headler;
  }
  get(channel, callback) {
    const headlerMap = this.handlers.get(channel);
    if (!headlerMap) {
      return;
    }
    return headlerMap.get(callback);
  }
  delete(channel, callback) {
    if (!callback) {
      return;
    }
    const headlerMap = this.handlers.get(channel);
    if (!headlerMap) {
      return;
    }
    const headler = headlerMap.get(callback);
    headlerMap.delete(callback);
    return headler;
  }
  cancelPendingDebounce() {
    if (this.uniqueMessageHandlers) {
      for (const handler of this.uniqueMessageHandlers.values()) {
        if (typeof (handler == null ? void 0 : handler.cancel) === "function") {
          handler.cancel();
        }
      }
      this.uniqueMessageHandlers.clear();
    }
  }
  reset() {
    this.cancelPendingDebounce();
    this.handlers = /* @__PURE__ */ new Map();
    this.uniqueMessageHandlers = /* @__PURE__ */ new Map();
  }
  async each(callback) {
    for (const [channel, headlerMap] of this.handlers) {
      for (const headler of headlerMap.values()) {
        await callback(channel, headler);
      }
    }
  }
};
__name(_HandlerManager, "HandlerManager");
let HandlerManager = _HandlerManager;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  HandlerManager
});
