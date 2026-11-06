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
var clientStaticUtils_exports = {};
__export(clientStaticUtils_exports, {
  PLUGIN_STATICS_PATH: () => PLUGIN_STATICS_PATH,
  getDepPkgPath: () => getDepPkgPath,
  getExposeChangelogUrl: () => getExposeChangelogUrl,
  getExposeReadmeUrl: () => getExposeReadmeUrl,
  getExposeUrl: () => getExposeUrl,
  getPackageDir: () => getPackageDir,
  getPackageDirByExposeUrl: () => getPackageDirByExposeUrl,
  getPackageFilePath: () => getPackageFilePath,
  getPackageFilePathWithExistCheck: () => getPackageFilePathWithExistCheck,
  getPackageNameByExposeUrl: () => getPackageNameByExposeUrl
});
module.exports = __toCommonJS(clientStaticUtils_exports);
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
/* istanbul ignore file -- @preserve */
const PLUGIN_STATICS_PATH = "/static/plugins/";
function getDepPkgPath(packageName, cwd) {
  try {
    return require.resolve(`${packageName}/package.json`, { paths: cwd ? [cwd] : void 0 });
  } catch {
    const mainFile = require.resolve(`${packageName}`, { paths: cwd ? [cwd] : void 0 });
    const packageDir = mainFile.slice(0, mainFile.indexOf(packageName.replace("/", import_path.default.sep)) + packageName.length);
    return import_path.default.join(packageDir, "package.json");
  }
}
__name(getDepPkgPath, "getDepPkgPath");
function getPackageDir(packageName) {
  const packageJsonPath = getDepPkgPath(packageName);
  return import_path.default.dirname(packageJsonPath);
}
__name(getPackageDir, "getPackageDir");
function getPackageFilePath(packageName, filePath) {
  const packageDir = getPackageDir(packageName);
  return import_path.default.join(packageDir, filePath);
}
__name(getPackageFilePath, "getPackageFilePath");
function getPackageFilePathWithExistCheck(packageName, filePath) {
  const absolutePath = getPackageFilePath(packageName, filePath);
  const exists = import_fs.default.existsSync(absolutePath);
  return {
    filePath: absolutePath,
    exists
  };
}
__name(getPackageFilePathWithExistCheck, "getPackageFilePathWithExistCheck");
function getExposeUrl(packageName, filePath) {
  return `${process.env.PLUGIN_STATICS_PATH}${packageName}/${filePath}`;
}
__name(getExposeUrl, "getExposeUrl");
function getExposeReadmeUrl(packageName, lang) {
  let READMEPath = null;
  if (getPackageFilePathWithExistCheck(packageName, `README.${lang}.md`).exists) {
    READMEPath = `README.${lang}.md`;
  } else if (getPackageFilePathWithExistCheck(packageName, "README.md").exists) {
    READMEPath = "README.md";
  }
  return READMEPath ? getExposeUrl(packageName, READMEPath) : null;
}
__name(getExposeReadmeUrl, "getExposeReadmeUrl");
function getExposeChangelogUrl(packageName) {
  const { exists } = getPackageFilePathWithExistCheck(packageName, "CHANGELOG.md");
  return exists ? getExposeUrl(packageName, "CHANGELOG.md") : null;
}
__name(getExposeChangelogUrl, "getExposeChangelogUrl");
function getPackageNameByExposeUrl(pathname) {
  pathname = pathname.replace(process.env.PLUGIN_STATICS_PATH, "");
  const pathArr = pathname.split("/");
  if (pathname.startsWith("@")) {
    return pathArr.slice(0, 2).join("/");
  }
  return pathArr[0];
}
__name(getPackageNameByExposeUrl, "getPackageNameByExposeUrl");
function getPackageDirByExposeUrl(pathname) {
  return getPackageDir(getPackageNameByExposeUrl(pathname));
}
__name(getPackageDirByExposeUrl, "getPackageDirByExposeUrl");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  PLUGIN_STATICS_PATH,
  getDepPkgPath,
  getExposeChangelogUrl,
  getExposeReadmeUrl,
  getExposeUrl,
  getPackageDir,
  getPackageDirByExposeUrl,
  getPackageFilePath,
  getPackageFilePathWithExistCheck,
  getPackageNameByExposeUrl
});
