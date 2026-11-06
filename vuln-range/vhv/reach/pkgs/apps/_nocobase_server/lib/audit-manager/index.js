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
var audit_manager_exports = {};
__export(audit_manager_exports, {
  AuditManager: () => AuditManager
});
module.exports = __toCommonJS(audit_manager_exports);
var import_stream = __toESM(require("stream"));
const REQUEST_SOURCE_HEADER = "x-request-source";
function isStream(obj) {
  return obj instanceof import_stream.default.Readable || obj instanceof import_stream.default.Writable || obj instanceof import_stream.default.Duplex || obj instanceof import_stream.default.Transform;
}
__name(isStream, "isStream");
const _AuditManager = class _AuditManager {
  logger;
  resources;
  constructor() {
    this.resources = /* @__PURE__ */ new Map();
  }
  setLogger(logger) {
    this.logger = logger;
  }
  /**
   * 注册需要参与审计的资源和操作，支持几种写法
   *
   * 对所有资源生效；
   * registerActions(['create'])
   *
   * 对某个资源的所有操作生效 resource:*
   * registerActions(['app:*'])
   *
   * 对某个资源的某个操作生效 resouce:action
   * registerAction(['pm:update'])
   *
   * 支持传getMetaData方法
   *
   * registerActions([
   *  'create',
   *  { name: 'auth:signIn', getMetaData}
   * ])
   *
   * 支持传getUserInfo方法
   *
   * registerActions([
   * 'create',
   * { name: 'auth:signIn', getUserInfo }
   * ])
   *
   * 当注册的接口有重叠时，颗粒度细的注册方法优先级更高
   *
   * Action1: registerActions(['create']);
   *
   * Action2: registerAction([{ name: 'user:*', getMetaData }]);
   *
   * Action3: registerAction([{ name: 'user:create', getMetaData }]);
   *
   * 对于user:create接口，以上优先级顺序是 Action3 > Action2 > Action1
   *
   * @param actions 操作列表
   */
  registerActions(actions) {
    actions.forEach((action) => {
      this.registerAction(action);
    });
  }
  /**
   * 注册单个操作，支持的用法同registerActions
   * @param action 操作
   */
  registerAction(action) {
    let originAction = "";
    let getMetaData = null;
    let getUserInfo = null;
    let getSourceAndTarget = null;
    if (typeof action === "string") {
      originAction = action;
    } else {
      originAction = action.name;
      getMetaData = action.getMetaData;
      getUserInfo = action.getUserInfo;
      getSourceAndTarget = action.getSourceAndTarget;
    }
    const nameRegex = /^[a-zA-Z0-9_-]+$/;
    const resourceWildcardRegex = /^([a-zA-Z0-9_-]+):\*$/;
    const resourceAndActionRegex = /^([a-zA-Z0-9_-]+):([a-zA-Z0-9_-]+)$/;
    let resourceName = "";
    let actionName = "";
    if (nameRegex.test(originAction)) {
      actionName = originAction;
      resourceName = "__default__";
    }
    if (resourceWildcardRegex.test(originAction)) {
      const match = originAction.match(resourceWildcardRegex);
      resourceName = match[1];
      actionName = "__default__";
    }
    if (resourceAndActionRegex.test(originAction)) {
      const match = originAction.match(resourceAndActionRegex);
      resourceName = match[1];
      actionName = match[2];
    }
    if (!resourceName && !actionName) {
      return;
    }
    let resource = this.resources.get(resourceName);
    if (!resource) {
      resource = /* @__PURE__ */ new Map();
      this.resources.set(resourceName, resource);
    }
    const saveAction = {
      name: originAction
    };
    if (getMetaData) {
      saveAction.getMetaData = getMetaData;
    }
    if (getUserInfo) {
      saveAction.getUserInfo = getUserInfo;
    }
    if (getSourceAndTarget) {
      saveAction.getSourceAndTarget = getSourceAndTarget;
    }
    resource.set(actionName, saveAction);
  }
  getAction(action, resource) {
    let resourceName = resource;
    if (!resource) {
      resourceName = "__default__";
    }
    if (resourceName === "__default__") {
      const resourceActions = this.resources.get(resourceName);
      if (resourceActions) {
        const resourceAction = resourceActions.get(action);
        if (resourceAction) {
          return resourceAction;
        }
      }
    } else {
      const resourceActions = this.resources.get(resourceName);
      if (resourceActions) {
        let resourceAction = resourceActions.get(action);
        if (resourceAction) {
          return resourceAction;
        } else {
          resourceAction = resourceActions.get("__default__");
          if (resourceAction) {
            return resourceAction;
          } else {
            const defaultResourceActions = this.resources.get("__default__");
            if (defaultResourceActions) {
              const defaultResourceAction = defaultResourceActions.get(action);
              if (defaultResourceAction) {
                return defaultResourceAction;
              }
            }
          }
        }
      } else {
        const resourceActions2 = this.resources.get("__default__");
        if (resourceActions2) {
          const resourceAction = resourceActions2.get(action);
          if (resourceAction) {
            return resourceAction;
          }
        }
      }
    }
    return null;
  }
  async getDefaultMetaData(ctx) {
    var _a, _b, _c, _d;
    let body = null;
    if (ctx.body) {
      if (!Buffer.isBuffer(ctx.body) && !isStream(ctx.body)) {
        body = ctx.body;
      }
    }
    return {
      request: {
        params: ctx.request.params,
        query: ctx.request.query,
        body: ctx.request.body,
        path: ctx.request.path,
        headers: {
          "x-authenticator": (_a = ctx.request) == null ? void 0 : _a.headers["x-authenticator"],
          "x-locale": (_b = ctx.request) == null ? void 0 : _b.headers["x-locale"],
          "x-timezone": (_c = ctx.request) == null ? void 0 : _c.headers["x-timezone"],
          "x-request-source": (_d = ctx.request) == null ? void 0 : _d.headers[REQUEST_SOURCE_HEADER]
        }
      },
      response: {
        body
      }
    };
  }
  formatAuditData(ctx) {
    var _a, _b, _c;
    const { resourceName } = ctx.action;
    const ipvalues = ctx.request.header["x-forwarded-for"];
    let ipvalue = "";
    if (ipvalues instanceof Array) {
      ipvalue = ipvalues[0];
    } else {
      ipvalue = ipvalues;
    }
    const ips = ipvalue ? ipvalue == null ? void 0 : ipvalue.split(/\s*,\s*/) : [];
    const auditLog = {
      uuid: ctx.reqId,
      dataSource: ctx.request.header["x-data-source"] || "main",
      resource: resourceName,
      action: ctx.action.actionName,
      requestSource: ctx.request.header[REQUEST_SOURCE_HEADER],
      userId: (_b = (_a = ctx.state) == null ? void 0 : _a.currentUser) == null ? void 0 : _b.id,
      roleName: (_c = ctx.state) == null ? void 0 : _c.currentRole,
      ip: ips.length > 0 ? ips[0] : ctx.request.ip,
      ua: ctx.request.header["user-agent"],
      status: ctx.response.status
    };
    return auditLog;
  }
  async output(ctx, reqId, metadata) {
    var _a;
    try {
      if (!ctx.action) {
        return;
      }
      const { resourceName, actionName } = ctx.action;
      const action = this.getAction(actionName, resourceName);
      if (!action) {
        return;
      }
      const auditLog = this.formatAuditData(ctx);
      auditLog.uuid = reqId;
      auditLog.status = ctx.status;
      const defaultMetaData = await this.getDefaultMetaData(ctx);
      auditLog.metadata = { ...metadata, ...defaultMetaData };
      if (typeof action !== "string") {
        if (action.getUserInfo) {
          const userInfo = await action.getUserInfo(ctx);
          if (userInfo) {
            if (userInfo.userId) {
              auditLog.userId = userInfo.userId;
            }
            if (userInfo.roleName) {
              auditLog.roleName = userInfo.roleName;
            }
          }
        }
        if (action.getMetaData) {
          const extra = await action.getMetaData(ctx);
          if (extra) {
            if (extra.request) {
              auditLog.metadata.request = { ...auditLog.metadata.request, ...extra.request };
            }
            if (extra.response) {
              auditLog.metadata.response = { ...auditLog.metadata.response, ...extra.response };
            }
            auditLog.metadata = { ...extra, ...auditLog.metadata };
          }
        }
        if (action.getSourceAndTarget) {
          const sourceAndTarget = await action.getSourceAndTarget(ctx);
          if (sourceAndTarget) {
            auditLog.sourceCollection = sourceAndTarget.sourceCollection;
            auditLog.sourceRecordUK = sourceAndTarget.sourceRecordUK;
            auditLog.targetCollection = sourceAndTarget.targetCollection;
            auditLog.targetRecordUK = sourceAndTarget.targetRecordUK;
          }
        }
      }
      this.logger.log(auditLog);
    } catch (err) {
      (_a = ctx.log) == null ? void 0 : _a.error(err);
    }
  }
  // 中间件
  middleware() {
    return async (ctx, next) => {
      const reqId = ctx.reqId;
      let metadata = {};
      try {
        await next();
      } catch (err) {
        metadata = {
          status: ctx.status,
          errMsg: err.message
        };
        throw err;
      } finally {
        if (this.logger) {
          this.output(ctx, reqId, metadata);
        }
      }
    };
  }
};
__name(_AuditManager, "AuditManager");
let AuditManager = _AuditManager;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AuditManager
});
