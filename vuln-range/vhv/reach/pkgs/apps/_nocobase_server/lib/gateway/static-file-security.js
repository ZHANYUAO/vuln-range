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
var static_file_security_exports = {};
__export(static_file_security_exports, {
  getStorageUploadSecurityHeaders: () => getStorageUploadSecurityHeaders,
  hasActiveContentExtension: () => hasActiveContentExtension
});
module.exports = __toCommonJS(static_file_security_exports);
var import_node_path = __toESM(require("node:path"));
const ACTIVE_CONTENT_EXTENSIONS = /* @__PURE__ */ new Set([
  ".htm",
  ".html",
  ".pdf",
  ".svg",
  ".svgz",
  ".xht",
  ".xhtml",
  ".xml",
  ".xsl",
  ".xslt"
]);
function stripQueryAndHash(pathname = "") {
  return pathname.split("?")[0].split("#")[0];
}
__name(stripQueryAndHash, "stripQueryAndHash");
function shouldDownload(pathname = "") {
  var _a;
  const query = (_a = pathname.split("?")[1]) == null ? void 0 : _a.split("#")[0];
  if (!query) {
    return false;
  }
  return new URLSearchParams(query).get("download") === "1";
}
__name(shouldDownload, "shouldDownload");
function hasActiveContentExtension(pathname = "") {
  const ext = import_node_path.default.extname(stripQueryAndHash(pathname)).toLowerCase();
  return ACTIVE_CONTENT_EXTENSIONS.has(ext);
}
__name(hasActiveContentExtension, "hasActiveContentExtension");
function getStorageUploadSecurityHeaders(pathname = "") {
  const headers = {
    "Cache-Control": "private, no-store",
    "Content-Security-Policy": "sandbox",
    "X-Content-Type-Options": "nosniff"
  };
  if (hasActiveContentExtension(pathname) || shouldDownload(pathname)) {
    headers["Content-Disposition"] = "attachment";
  }
  return headers;
}
__name(getStorageUploadSecurityHeaders, "getStorageUploadSecurityHeaders");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getStorageUploadSecurityHeaders,
  hasActiveContentExtension
});
