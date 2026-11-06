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
var errors_exports = {};
__export(errors_exports, {
  InvalidAppNameError: () => InvalidAppNameError,
  applyErrorWithArgs: () => applyErrorWithArgs,
  errors: () => errors,
  getErrorWithCode: () => getErrorWithCode
});
module.exports = __toCommonJS(errors_exports);
var import_app_supervisor = require("../app-supervisor");
var import_lodash = __toESM(require("lodash"));
const _InvalidAppNameError = class _InvalidAppNameError extends Error {
  constructor(appName) {
    super("invalid application name");
    this.appName = appName;
    this.name = "InvalidAppNameError";
  }
};
__name(_InvalidAppNameError, "InvalidAppNameError");
let InvalidAppNameError = _InvalidAppNameError;
function getMaintaining(app) {
  var _a;
  return (_a = app == null ? void 0 : app.getMaintaining) == null ? void 0 : _a.call(app);
}
__name(getMaintaining, "getMaintaining");
function getAppName(app) {
  return (app == null ? void 0 : app.name) || "unknown";
}
__name(getAppName, "getAppName");
const errors = {
  INVALID_APP_NAME: {
    status: 400,
    message: "invalid application name",
    maintaining: false
  },
  APP_ENVIRONMENT_UNAVAILABLE: {
    status: 503,
    message: /* @__PURE__ */ __name(({ appName }) => `deployment environment for application ${appName} is unavailable`, "message"),
    maintaining: true
  },
  APP_NOT_FOUND: {
    status: 404,
    message: /* @__PURE__ */ __name(({ appName }) => `application ${appName} not found`, "message"),
    maintaining: true
  },
  APP_ERROR: {
    status: 503,
    message: /* @__PURE__ */ __name(({ app }) => {
      if (!(app == null ? void 0 : app.name)) {
        return "";
      }
      const error = import_app_supervisor.AppSupervisor.getInstance().appErrors[app.name];
      if (!error) {
        return "";
      }
      let message = error.message;
      if (error.cause) {
        message = `${message}: ${error.cause.message}`;
      }
      return message;
    }, "message"),
    code: /* @__PURE__ */ __name(({ app }) => {
      if (!(app == null ? void 0 : app.name)) {
        return "APP_ERROR";
      }
      const error = import_app_supervisor.AppSupervisor.getInstance().appErrors[app.name];
      return (error == null ? void 0 : error["code"]) || "APP_ERROR";
    }, "code"),
    command: /* @__PURE__ */ __name(({ app }) => {
      var _a;
      return (_a = getMaintaining(app)) == null ? void 0 : _a.command;
    }, "command"),
    maintaining: true
  },
  APP_PREPARING: {
    status: 503,
    message: /* @__PURE__ */ __name(({ appName }) => `application ${appName} is preparing, please wait patiently`, "message"),
    maintaining: true
  },
  APP_STARTING: {
    status: 503,
    message: /* @__PURE__ */ __name(({ app }) => (app == null ? void 0 : app.maintainingMessage) || "", "message"),
    maintaining: true
  },
  APP_STOPPED: {
    status: 503,
    message: /* @__PURE__ */ __name(({ app, appName }) => `application ${appName || getAppName(app)} is stopped`, "message"),
    maintaining: true
  },
  APP_INITIALIZED: {
    status: 503,
    message: /* @__PURE__ */ __name(({ app }) => `application ${getAppName(app)} is initialized, waiting for command`, "message"),
    maintaining: true
  },
  APP_INITIALIZING: {
    status: 503,
    message: /* @__PURE__ */ __name(({ appName }) => `application ${appName} is initializing`, "message"),
    maintaining: true
  },
  COMMAND_ERROR: {
    status: 503,
    maintaining: true,
    message: /* @__PURE__ */ __name(({ app }) => {
      var _a, _b;
      return ((_b = (_a = getMaintaining(app)) == null ? void 0 : _a.error) == null ? void 0 : _b.message) || "";
    }, "message"),
    command: /* @__PURE__ */ __name(({ app }) => {
      var _a;
      return (_a = getMaintaining(app)) == null ? void 0 : _a.command;
    }, "command")
  },
  COMMAND_END: {
    status: 503,
    maintaining: true,
    message: /* @__PURE__ */ __name(({ app }) => {
      var _a, _b;
      return `${((_b = (_a = getMaintaining(app)) == null ? void 0 : _a.command) == null ? void 0 : _b.name) || "command"} running end`;
    }, "message"),
    command: /* @__PURE__ */ __name(({ app }) => {
      var _a;
      return (_a = getMaintaining(app)) == null ? void 0 : _a.command;
    }, "command")
  },
  APP_COMMANDING: {
    status: 503,
    maintaining: true,
    message: /* @__PURE__ */ __name(({ app, message }) => message || (app == null ? void 0 : app.maintainingMessage) || "", "message"),
    command: /* @__PURE__ */ __name(({ app, command }) => {
      var _a;
      return command || ((_a = getMaintaining(app)) == null ? void 0 : _a.command);
    }, "command")
  },
  APP_RUNNING: {
    status: 200,
    maintaining: false,
    message: /* @__PURE__ */ __name(({ message, app }) => message || `application ${getAppName(app)} is running`, "message")
  },
  UNKNOWN_ERROR: {
    status: 500,
    message: "unknown error",
    maintaining: true
  }
};
function getErrorWithCode(errorCode) {
  const rawCode = errorCode;
  errorCode = import_lodash.default.snakeCase(errorCode).toUpperCase();
  if (!errors[errorCode] && errors[`APP_${errorCode}`]) {
    errorCode = `APP_${errorCode}`;
  }
  if (!errors[errorCode]) {
    errorCode = "UNKNOWN_ERROR";
  }
  const error = import_lodash.default.cloneDeep(errors[errorCode]);
  if (!error.code) {
    error["code"] = errorCode == "UNKNOWN_ERROR" ? rawCode : errorCode;
  }
  return error;
}
__name(getErrorWithCode, "getErrorWithCode");
function applyErrorWithArgs(error, options) {
  const functionKeys = Object.keys(error).filter((key) => typeof error[key] === "function");
  const functionResults = functionKeys.map((key) => {
    return error[key](options);
  });
  return {
    ...error,
    ...import_lodash.default.zipObject(functionKeys, functionResults)
  };
}
__name(applyErrorWithArgs, "applyErrorWithArgs");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  InvalidAppNameError,
  applyErrorWithArgs,
  errors,
  getErrorWithCode
});
