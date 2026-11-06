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
var app_command_exports = {};
__export(app_command_exports, {
  AppCommand: () => AppCommand
});
module.exports = __toCommonJS(app_command_exports);
var import_commander = require("commander");
const _AppCommand = class _AppCommand extends import_commander.Command {
  _handleByIPCServer = false;
  _preload = false;
  ipc() {
    this._handleByIPCServer = true;
    return this;
  }
  auth() {
    this["_authenticate"] = true;
    return this;
  }
  preload() {
    this["_authenticate"] = true;
    this._preload = true;
    return this;
  }
  hasCommand(name) {
    const names = this.commands.map((c) => c.name());
    return names.includes(name);
  }
  findCommand(name) {
    return this._findCommand(name);
  }
  isHandleByIPCServer() {
    return this._handleByIPCServer;
  }
  createCommand(name) {
    return new _AppCommand(name);
  }
  parseHandleByIPCServer(argv, parseOptions) {
    const userArgs = this._prepareUserArgs(argv, parseOptions);
    if (userArgs[0] === "nocobase") {
      userArgs.shift();
    }
    let lastCommand = this;
    for (const arg of userArgs) {
      const subCommand = lastCommand._findCommand(arg);
      if (subCommand) {
        lastCommand = subCommand;
      } else {
        break;
      }
    }
    return lastCommand && lastCommand.isHandleByIPCServer();
  }
};
__name(_AppCommand, "AppCommand");
let AppCommand = _AppCommand;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AppCommand
});
