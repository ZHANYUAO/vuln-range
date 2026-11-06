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
var ipc_socket_client_exports = {};
__export(ipc_socket_client_exports, {
  IPCSocketClient: () => IPCSocketClient,
  writeJSON: () => writeJSON
});
module.exports = __toCommonJS(ipc_socket_client_exports);
var import_logger = require("@nocobase/logger");
var events = __toESM(require("events"));
var import_net = __toESM(require("net"));
var import_xpipe = __toESM(require("xpipe"));
const writeJSON = /* @__PURE__ */ __name((socket, data) => {
  socket.write(JSON.stringify(data) + "\n", "utf8");
}, "writeJSON");
const _IPCSocketClient = class _IPCSocketClient extends events.EventEmitter {
  client;
  logger;
  constructor(client) {
    super();
    this.logger = (0, import_logger.createConsoleLogger)();
    this.client = client;
    this.client.on("data", (data) => {
      const dataAsString = data.toString();
      const messages = dataAsString.split("\n");
      for (const message of messages) {
        if (message.length === 0) {
          continue;
        }
        const dataObj = JSON.parse(message);
        this.handleServerMessage(dataObj);
      }
    });
  }
  static async getConnection(serverPath) {
    return new Promise((resolve, reject) => {
      const client = import_net.default.createConnection({ path: import_xpipe.default.eq(serverPath) }, () => {
        resolve(new _IPCSocketClient(client));
      });
      client.on("error", (err) => {
        reject(err);
      });
    });
  }
  async handleServerMessage({ reqId, type, payload }) {
    switch (type) {
      case "not_found":
        break;
      case "error":
        this.logger.error({ reqId, message: `${payload.message}|${payload.stack}` });
        break;
      case "success":
        this.logger.info({ reqId, message: "success" });
        break;
      default:
        this.logger.info({ reqId, message: JSON.stringify({ type, payload }) });
        break;
    }
    this.emit("response", { reqId, type, payload });
  }
  close() {
    this.client.end();
  }
  write(data) {
    writeJSON(this.client, data);
    return new Promise((resolve) => this.once("response", resolve));
  }
};
__name(_IPCSocketClient, "IPCSocketClient");
let IPCSocketClient = _IPCSocketClient;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  IPCSocketClient,
  writeJSON
});
