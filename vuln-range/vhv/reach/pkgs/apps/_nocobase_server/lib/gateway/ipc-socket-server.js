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
var ipc_socket_server_exports = {};
__export(ipc_socket_server_exports, {
  IPCSocketServer: () => IPCSocketServer
});
module.exports = __toCommonJS(ipc_socket_server_exports);
var import_crypto = require("crypto");
var import_fs = __toESM(require("fs"));
var import_net = __toESM(require("net"));
var import_path = __toESM(require("path"));
var import_xpipe = __toESM(require("xpipe"));
var import_app_supervisor = require("../app-supervisor");
var import_ipc_socket_client = require("./ipc-socket-client");
const _IPCSocketServer = class _IPCSocketServer {
  socketServer;
  constructor(server) {
    this.socketServer = server;
  }
  static buildServer(socketPath) {
    if (import_fs.default.existsSync(socketPath)) {
      import_fs.default.unlinkSync(socketPath);
    }
    const dir = import_path.default.dirname(socketPath);
    if (!import_fs.default.existsSync(dir)) {
      import_fs.default.mkdirSync(dir, { recursive: true });
    }
    const socketServer = import_net.default.createServer((c) => {
      console.log("client connected");
      c.on("end", () => {
        console.log("client disconnected");
      });
      c.on("data", (data) => {
        const dataAsString = data.toString();
        const messages = dataAsString.split("\n");
        for (const message of messages) {
          if (message.length === 0) {
            continue;
          }
          const reqId = (0, import_crypto.randomUUID)();
          const dataObj = JSON.parse(message);
          _IPCSocketServer.handleClientMessage({ reqId, ...dataObj }).then((result) => {
            (0, import_ipc_socket_client.writeJSON)(c, {
              reqId,
              type: result === false ? "not_found" : "success"
            });
          }).catch((err) => {
            (0, import_ipc_socket_client.writeJSON)(c, {
              reqId,
              type: "error",
              payload: {
                message: err.message,
                stack: err.stack
              }
            });
          });
        }
      });
    });
    socketServer.listen(import_xpipe.default.eq(socketPath), () => {
      console.log(`Gateway IPC Server running at ${socketPath}`);
    });
    return new _IPCSocketServer(socketServer);
  }
  static async handleClientMessage({ reqId, type, payload }) {
    if (type === "appReady") {
      const status = await new Promise((resolve, reject) => {
        let status2;
        const max = 300;
        let count = 0;
        const timer = setInterval(async () => {
          status2 = await import_app_supervisor.AppSupervisor.getInstance().getAppStatus("main");
          if (status2 === "running") {
            clearInterval(timer);
            resolve(status2);
          }
          if (count++ > max) {
            reject("error");
          }
        }, 500);
      });
      console.log("status", status);
      return status;
    }
    if (type === "passCliArgv") {
      const argv = payload.argv;
      const mainApp = await import_app_supervisor.AppSupervisor.getInstance().getApp("main");
      if (!mainApp.cli.hasCommand(argv[2])) {
        await mainApp.pm.loadCommands();
      }
      const cli = mainApp.cli;
      if (!cli.parseHandleByIPCServer(argv, {
        from: "node"
      })) {
        mainApp.log.debug("Not handle by ipc server");
        return false;
      }
      return mainApp.runAsCLI(argv, {
        reqId,
        from: "node",
        throwError: true
      });
    }
    throw new Error(`Unknown message type ${type}`);
  }
  close() {
    this.socketServer.close();
  }
};
__name(_IPCSocketServer, "IPCSocketServer");
let IPCSocketServer = _IPCSocketServer;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  IPCSocketServer
});
