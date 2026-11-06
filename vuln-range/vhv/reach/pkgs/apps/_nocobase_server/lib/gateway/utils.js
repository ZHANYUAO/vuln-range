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
var utils_exports = {};
__export(utils_exports, {
  MODERN_CLIENT_DIST_DIR: () => MODERN_CLIENT_DIST_DIR,
  getHost: () => getHost,
  getHostname: () => getHostname,
  injectRuntimeScript: () => injectRuntimeScript,
  normalizeModernClientPrefix: () => normalizeModernClientPrefix,
  resolvePublicPath: () => resolvePublicPath,
  resolveV2PublicPath: () => resolveV2PublicPath,
  rewriteV2AssetPublicPath: () => rewriteV2AssetPublicPath
});
module.exports = __toCommonJS(utils_exports);
const MODERN_CLIENT_DIST_DIR = "v";
function resolvePublicPath(appPublicPath = "/") {
  const normalized = String(appPublicPath || "/").trim() || "/";
  const withLeadingSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}
__name(resolvePublicPath, "resolvePublicPath");
function normalizeModernClientPrefix(value) {
  const segment = String(value || "").trim().replace(/^\/+|\/+$/g, "");
  return segment || MODERN_CLIENT_DIST_DIR;
}
__name(normalizeModernClientPrefix, "normalizeModernClientPrefix");
function resolveV2PublicPath(appPublicPath = "/") {
  const publicPath = resolvePublicPath(appPublicPath);
  const prefix = normalizeModernClientPrefix(process.env.APP_MODERN_CLIENT_PREFIX);
  return `${publicPath.replace(/\/$/, "")}/${prefix}/`;
}
__name(resolveV2PublicPath, "resolveV2PublicPath");
function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}
__name(ensureTrailingSlash, "ensureTrailingSlash");
function rewriteV2AssetPublicPath(html, assetPublicPath) {
  const normalizedAssetPublicPath = ensureTrailingSlash(assetPublicPath);
  const sentinel = `/${MODERN_CLIENT_DIST_DIR}/`;
  if (normalizedAssetPublicPath === sentinel) {
    return html;
  }
  const sentinelPattern = new RegExp(`((?:src|href)=["'])${sentinel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g");
  return html.replace(sentinelPattern, `$1${normalizedAssetPublicPath}`);
}
__name(rewriteV2AssetPublicPath, "rewriteV2AssetPublicPath");
function injectRuntimeScript(html, runtimeScript) {
  const browserCheckerScriptMatch = html.match(/<script\b[^>]*browser-checker\.js[^>]*><\/script>/i);
  if (browserCheckerScriptMatch == null ? void 0 : browserCheckerScriptMatch[0]) {
    return html.replace(browserCheckerScriptMatch[0], `${runtimeScript}
${browserCheckerScriptMatch[0]}`);
  }
  const moduleScriptMatch = html.match(/<script\b[^>]*type=["']module["'][^>]*>/i);
  if (moduleScriptMatch == null ? void 0 : moduleScriptMatch[0]) {
    return html.replace(moduleScriptMatch[0], `${runtimeScript}
${moduleScriptMatch[0]}`);
  }
  if (html.includes("</head>")) {
    return html.replace("</head>", `${runtimeScript}
</head>`);
  }
  return `${runtimeScript}
${html}`;
}
__name(injectRuntimeScript, "injectRuntimeScript");
function splitCommaSeparatedValues(value, limit) {
  return value.split(",", limit).map((v) => v.trim());
}
__name(splitCommaSeparatedValues, "splitCommaSeparatedValues");
function getHost(req) {
  let host = req.headers["x-forwarded-host"];
  if (!host) {
    host = req.headers[":authority"] || req.headers["host"];
  }
  if (!host) return "";
  host = splitCommaSeparatedValues(host, 1)[0];
  if (host.includes("@")) {
    try {
      host = new URL(`http://${host}`).host;
    } catch (e) {
      return "";
    }
  }
  return host;
}
__name(getHost, "getHost");
function getHostname(req) {
  const host = getHost(req);
  if (!host) return "";
  return host.split(":", 1)[0];
}
__name(getHostname, "getHostname");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MODERN_CLIENT_DIST_DIR,
  getHost,
  getHostname,
  injectRuntimeScript,
  normalizeModernClientPrefix,
  resolvePublicPath,
  resolveV2PublicPath,
  rewriteV2AssetPublicPath
});
