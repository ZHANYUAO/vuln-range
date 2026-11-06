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
var utils_exports = {};
__export(utils_exports, {
  assertSafePluginPackageName: () => assertSafePluginPackageName,
  checkAndGetCompatible: () => checkAndGetCompatible,
  checkCompatible: () => checkCompatible,
  copyTempPackageToStorageAndLinkToNodeModules: () => copyTempPackageToStorageAndLinkToNodeModules,
  download: () => download,
  downloadAndUnzipToTempDir: () => downloadAndUnzipToTempDir,
  getAuthorizationHeaders: () => getAuthorizationHeaders,
  getCompatible: () => getCompatible,
  getExcludePackages: () => getExcludePackages,
  getExternalVersionFromSource: () => getExternalVersionFromSource,
  getIncludePackages: () => getIncludePackages,
  getLatestVersion: () => getLatestVersion,
  getLocalPluginDir: () => getLocalPluginDir,
  getLocalPluginPackagesPathArr: () => getLocalPluginPackagesPathArr,
  getNewVersion: () => getNewVersion,
  getNodeModulesPluginDir: () => getNodeModulesPluginDir,
  getNpmInfo: () => getNpmInfo,
  getPackageJson: () => getPackageJson,
  getPackageJsonByLocalPath: () => getPackageJsonByLocalPath,
  getPackageNameFromString: () => getPackageNameFromString,
  getPackagesFromFiles: () => getPackagesFromFiles,
  getPluginBasePath: () => getPluginBasePath,
  getPluginInfoByNpm: () => getPluginInfoByNpm,
  getServerPackages: () => getServerPackages,
  getStoragePluginDir: () => getStoragePluginDir,
  getTempDir: () => getTempDir,
  isNotBuiltinModule: () => isNotBuiltinModule,
  isValidPackageName: () => isValidPackageName,
  pmListSummary: () => pmListSummary,
  readJSONFileContent: () => readJSONFileContent,
  removePluginPackage: () => removePluginPackage,
  removeRequireCache: () => removeRequireCache,
  removeTmpDir: () => removeTmpDir,
  requireModule: () => requireModule,
  requireNoCache: () => requireNoCache,
  resolveSafeChildPath: () => resolveSafeChildPath,
  updatePluginByCompressedFileUrl: () => updatePluginByCompressedFileUrl
});
module.exports = __toCommonJS(utils_exports);
var import_utils = require("@nocobase/utils");
var import_plugin_symlink = require("@nocobase/utils/plugin-symlink");
var import_axios = __toESM(require("axios"));
var import_decompress = __toESM(require("@xhmikosr/decompress"));
var import_fast_glob = __toESM(require("fast-glob"));
var import_fs_extra = __toESM(require("fs-extra"));
var import_ini = __toESM(require("ini"));
var import_module = require("module");
var import_os = __toESM(require("os"));
var import_path = __toESM(require("path"));
var import_semver = __toESM(require("semver"));
var import_clientStaticUtils = require("./clientStaticUtils");
var import_constants = require("./constants");
var import_deps = __toESM(require("./deps"));
var import_findPackageNames = require("./findPackageNames");
var import_plugin_manager = __toESM(require("./plugin-manager"));
/* istanbul ignore next -- @preserve */
async function getTempDir() {
  const temporaryDirectory = await import_fs_extra.default.realpath(import_os.default.tmpdir());
  return import_path.default.join(temporaryDirectory, import_constants.APP_NAME);
}
__name(getTempDir, "getTempDir");
function assertSafePluginPackageName(packageName) {
  if (!packageName || typeof packageName !== "string") {
    throw new Error("Invalid plugin package name");
  }
  if (packageName.includes("\0")) {
    throw new Error("Invalid plugin package name");
  }
  if (import_path.default.isAbsolute(packageName)) {
    throw new Error("Invalid plugin package name");
  }
  if (packageName.includes("..") || packageName.includes("\\")) {
    throw new Error("Invalid plugin package name");
  }
  const valid = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(packageName);
  if (!valid) {
    throw new Error("Invalid plugin package name");
  }
}
__name(assertSafePluginPackageName, "assertSafePluginPackageName");
function resolveSafeChildPath(baseDir, child) {
  const resolvedBase = import_path.default.resolve(baseDir);
  const resolvedTarget = import_path.default.resolve(baseDir, child);
  if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(`${resolvedBase}${import_path.default.sep}`)) {
    throw new Error("Path traversal detected");
  }
  return resolvedTarget;
}
__name(resolveSafeChildPath, "resolveSafeChildPath");
function getLocalPluginPackagesPathArr() {
  const pluginPackagesPathArr = process.env.PLUGIN_PATH || import_constants.DEFAULT_PLUGIN_PATH;
  return pluginPackagesPathArr.split(",").map((pluginPackagesPath) => {
    pluginPackagesPath = pluginPackagesPath.trim();
    return import_path.default.isAbsolute(pluginPackagesPath) ? pluginPackagesPath : import_path.default.join(process.cwd(), pluginPackagesPath);
  });
}
__name(getLocalPluginPackagesPathArr, "getLocalPluginPackagesPathArr");
function getStoragePluginDir(packageName) {
  const pluginStoragePath = (0, import_utils.resolvePluginStoragePath)();
  assertSafePluginPackageName(packageName);
  return resolveSafeChildPath(pluginStoragePath, packageName);
}
__name(getStoragePluginDir, "getStoragePluginDir");
function getLocalPluginDir(packageDirBasename) {
  const localPluginDir = getLocalPluginPackagesPathArr().map((pluginPackagesPath) => import_path.default.join(pluginPackagesPath, packageDirBasename)).find((pluginDir) => import_fs_extra.default.existsSync(pluginDir));
  if (!localPluginDir) {
    throw new Error(`local plugin "${packageDirBasename}" not found`);
  }
  return localPluginDir;
}
__name(getLocalPluginDir, "getLocalPluginDir");
function getNodeModulesPluginDir(packageName) {
  assertSafePluginPackageName(packageName);
  return resolveSafeChildPath(process.env.NODE_MODULES_PATH, packageName);
}
__name(getNodeModulesPluginDir, "getNodeModulesPluginDir");
function getAuthorizationHeaders(registry, authToken) {
  const headers = {};
  if (registry && !authToken) {
    const npmrcPath = import_path.default.join(import_os.default.homedir(), ".npmrc");
    const url = new URL(registry);
    let envConfig = process.env;
    if (import_fs_extra.default.existsSync(npmrcPath)) {
      const content = import_fs_extra.default.readFileSync(npmrcPath, "utf-8");
      envConfig = {
        ...envConfig,
        ...import_ini.default.parse(content)
      };
    }
    const key = Object.keys(envConfig).find((key2) => key2.includes(url.host) && key2.includes("_authToken"));
    if (key) {
      authToken = envConfig[key];
    }
  }
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }
  return headers;
}
__name(getAuthorizationHeaders, "getAuthorizationHeaders");
async function getLatestVersion(packageName, registry, token) {
  const npmInfo = await getNpmInfo(packageName, registry, token);
  const latestVersion = npmInfo["dist-tags"].latest;
  return latestVersion;
}
__name(getLatestVersion, "getLatestVersion");
async function getNpmInfo(packageName, registry, token) {
  registry.endsWith("/") && (registry = registry.slice(0, -1));
  const response = await import_axios.default.get(`${registry}/${packageName}`, {
    headers: getAuthorizationHeaders(registry, token)
  });
  try {
    const data = response.data;
    return data;
  } catch (e) {
    console.error(e);
    throw new Error(`${registry} is not a valid registry, '${registry}/${packageName}' response is not a valid json.`);
  }
}
__name(getNpmInfo, "getNpmInfo");
async function download(url, destination, options = {}) {
  const response = await import_axios.default.get(url, {
    ...options,
    responseType: "stream"
  });
  import_fs_extra.default.mkdirpSync(import_path.default.dirname(destination));
  const writer = import_fs_extra.default.createWriteStream(destination);
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}
__name(download, "download");
async function removeTmpDir(tempFile, tempPackageContentDir) {
  await import_fs_extra.default.remove(tempFile);
  await import_fs_extra.default.remove(tempPackageContentDir);
}
__name(removeTmpDir, "removeTmpDir");
async function downloadAndUnzipToTempDir(fileUrl, authToken) {
  const fileName = import_path.default.basename(fileUrl);
  const tempDir = await getTempDir();
  const tempFile = import_path.default.join(tempDir, fileName);
  const tempPackageDir = tempFile.replace(import_path.default.extname(fileName), "");
  await import_fs_extra.default.remove(tempPackageDir);
  await import_fs_extra.default.remove(tempFile);
  if ((0, import_utils.isURL)(fileUrl)) {
    await download(fileUrl, tempFile, {
      headers: getAuthorizationHeaders(fileUrl, authToken)
    });
  } else if (await import_fs_extra.default.exists(fileUrl)) {
    await import_fs_extra.default.copy(fileUrl, tempFile);
  } else {
    throw new Error(`${fileUrl} does not exist`);
  }
  if (!import_fs_extra.default.existsSync(tempFile)) {
    throw new Error(`download ${fileUrl} failed`);
  }
  await (0, import_decompress.default)(tempFile, tempPackageDir);
  if (!import_fs_extra.default.existsSync(tempPackageDir)) {
    await import_fs_extra.default.remove(tempFile);
    throw new Error(`File is not a valid compressed file. Maybe the file need authorization.`);
  }
  let tempPackageContentDir = tempPackageDir;
  const files = import_fs_extra.default.readdirSync(tempPackageDir, { recursive: false, withFileTypes: true }).filter((item) => item.name !== "__MACOSX");
  if (files.length === 1 && files[0].isDirectory() && import_fs_extra.default.existsSync(import_path.default.join(tempPackageDir, files[0]["name"], "package.json"))) {
    tempPackageContentDir = import_path.default.join(tempPackageDir, files[0]["name"]);
  }
  const packageJsonPath = import_path.default.join(tempPackageContentDir, "package.json");
  if (!import_fs_extra.default.existsSync(packageJsonPath)) {
    await removeTmpDir(tempFile, tempPackageContentDir);
    throw new Error(`decompress ${fileUrl} failed`);
  }
  const packageJson = await readJSONFileContent(packageJsonPath);
  const mainFile = import_path.default.join(tempPackageContentDir, packageJson.main);
  if (!import_fs_extra.default.existsSync(mainFile)) {
    await removeTmpDir(tempFile, tempPackageContentDir);
    throw new Error(`main file ${packageJson.main} not found, Please check if the plugin has been built.`);
  }
  return {
    packageName: packageJson.name,
    version: packageJson.version,
    tempPackageContentDir,
    tempFile
  };
}
__name(downloadAndUnzipToTempDir, "downloadAndUnzipToTempDir");
async function copyTempPackageToStorageAndLinkToNodeModules(tempFile, tempPackageContentDir, packageName) {
  const packageDir = getStoragePluginDir(packageName);
  await import_fs_extra.default.remove(packageDir);
  await import_fs_extra.default.move(tempPackageContentDir, packageDir, { overwrite: true });
  await (0, import_plugin_symlink.createStoragePluginSymLink)(packageName);
  await removeTmpDir(tempFile, tempPackageContentDir);
  return {
    packageDir
  };
}
__name(copyTempPackageToStorageAndLinkToNodeModules, "copyTempPackageToStorageAndLinkToNodeModules");
async function getPluginInfoByNpm(options) {
  let { registry, version } = options;
  const { packageName, authToken } = options;
  if (registry.endsWith("/")) {
    registry = registry.slice(0, -1);
  }
  if (!version) {
    version = await getLatestVersion(packageName, registry, authToken);
  }
  const compressedFileUrl = `${registry}/${packageName}/-/${packageName.split("/").pop()}-${version}.tgz`;
  return { compressedFileUrl, version };
}
__name(getPluginInfoByNpm, "getPluginInfoByNpm");
function getServerPackages(packageDir) {
  function isBuiltinModule(packageName) {
    return import_module.builtinModules.includes(packageName);
  }
  __name(isBuiltinModule, "isBuiltinModule");
  function getSrcPlugins(sourceDir) {
    const importedPlugins = /* @__PURE__ */ new Set();
    const exts = [".js", ".ts", ".jsx", ".tsx"];
    const importRegex2 = /import\s+.*?\s+from\s+['"]([^'"\s.].+?)['"];?/g;
    const requireRegex2 = /require\s*\(\s*[`'"]([^`'"\s.].+?)[`'"]\s*\)/g;
    function setPluginsFromContent(reg, content) {
      let match;
      while (match = reg.exec(content)) {
        let importedPlugin = match[1];
        if (importedPlugin.startsWith("@")) {
          importedPlugin = importedPlugin.split("/").slice(0, 2).join("/");
        } else {
          importedPlugin = importedPlugin.split("/")[0];
        }
        if (!isBuiltinModule(importedPlugin)) {
          importedPlugins.add(importedPlugin);
        }
      }
    }
    __name(setPluginsFromContent, "setPluginsFromContent");
    function traverseDirectory(directory) {
      const files = import_fs_extra.default.readdirSync(directory);
      for (const file of files) {
        const filePath = import_path.default.join(directory, file);
        const stat = import_fs_extra.default.statSync(filePath);
        if (stat.isDirectory()) {
          traverseDirectory(filePath);
        } else if (stat.isFile() && !filePath.includes("__tests__")) {
          if (exts.includes(import_path.default.extname(filePath).toLowerCase())) {
            const content = import_fs_extra.default.readFileSync(filePath, "utf-8");
            setPluginsFromContent(importRegex2, content);
            setPluginsFromContent(requireRegex2, content);
          }
        }
      }
    }
    __name(traverseDirectory, "traverseDirectory");
    traverseDirectory(sourceDir);
    return [...importedPlugins];
  }
  __name(getSrcPlugins, "getSrcPlugins");
  const srcServerPlugins = getSrcPlugins(import_path.default.join(packageDir, "src/server"));
  return srcServerPlugins;
}
__name(getServerPackages, "getServerPackages");
function removePluginPackage(packageName) {
  const packageDir = getStoragePluginDir(packageName);
  const nodeModulesPluginDir = getNodeModulesPluginDir(packageName);
  return Promise.all([import_fs_extra.default.remove(packageDir), import_fs_extra.default.remove(nodeModulesPluginDir)]);
}
__name(removePluginPackage, "removePluginPackage");
async function getPackageJson(pluginName) {
  const packageDir = getStoragePluginDir(pluginName);
  return await getPackageJsonByLocalPath(packageDir);
}
__name(getPackageJson, "getPackageJson");
async function getPackageJsonByLocalPath(localPath) {
  if (!import_fs_extra.default.existsSync(localPath)) {
    return null;
  } else {
    const fullPath = import_path.default.join(localPath, "package.json");
    const data = await import_fs_extra.default.promises.readFile(fullPath, { encoding: "utf-8" });
    return JSON.parse(data);
  }
}
__name(getPackageJsonByLocalPath, "getPackageJsonByLocalPath");
async function updatePluginByCompressedFileUrl(options) {
  const { packageName, version, tempFile, tempPackageContentDir } = await downloadAndUnzipToTempDir(
    options.compressedFileUrl,
    options.authToken
  );
  const instance = await options.repository.findOne({
    filter: { packageName }
  });
  if (!instance) {
    await removeTmpDir(tempFile, tempPackageContentDir);
    throw new Error(`${packageName} does not exist`);
  }
  const { packageDir } = await copyTempPackageToStorageAndLinkToNodeModules(
    tempFile,
    tempPackageContentDir,
    packageName
  );
  return {
    packageName,
    packageDir,
    version
  };
}
__name(updatePluginByCompressedFileUrl, "updatePluginByCompressedFileUrl");
async function getNewVersion(plugin) {
  if (!(plugin.packageName && plugin.registry)) return false;
  const { version } = await getPluginInfoByNpm({
    packageName: plugin.packageName,
    registry: plugin.registry,
    authToken: plugin.authToken
  });
  return version !== plugin.version ? version : false;
}
__name(getNewVersion, "getNewVersion");
function removeRequireCache(fileOrPackageName) {
  delete require.cache[require.resolve(fileOrPackageName)];
  delete require.cache[fileOrPackageName];
}
__name(removeRequireCache, "removeRequireCache");
async function requireNoCache(fileOrPackageName) {
  return await (0, import_utils.importModule)(fileOrPackageName);
}
__name(requireNoCache, "requireNoCache");
async function readJSONFileContent(filePath) {
  const data = await import_fs_extra.default.promises.readFile(filePath, { encoding: "utf-8" });
  return JSON.parse(data);
}
__name(readJSONFileContent, "readJSONFileContent");
function requireModule(m) {
  if (typeof m === "string") {
    m = require(m);
  }
  if (typeof m !== "object") {
    return m;
  }
  return m.__esModule ? m.default : m;
}
__name(requireModule, "requireModule");
async function getExternalVersionFromDistFile(packageName) {
  const { exists, filePath } = (0, import_clientStaticUtils.getPackageFilePathWithExistCheck)(packageName, "dist/externalVersion.js");
  if (!exists) {
    return false;
  }
  try {
    return await requireNoCache(filePath);
  } catch (e) {
    console.error(e);
    return false;
  }
}
__name(getExternalVersionFromDistFile, "getExternalVersionFromDistFile");
function isNotBuiltinModule(packageName) {
  return !import_module.builtinModules.includes(packageName);
}
__name(isNotBuiltinModule, "isNotBuiltinModule");
const isValidPackageName = /* @__PURE__ */ __name((str) => {
  const pattern = /^(?:@[a-zA-Z0-9_-]+\/)?[a-zA-Z0-9_-]+$/;
  return pattern.test(str);
}, "isValidPackageName");
function getPackageNameFromString(str) {
  if (str.startsWith(".")) return null;
  const arr = str.split("/");
  let packageName;
  if (arr[0].startsWith("@")) {
    packageName = arr.slice(0, 2).join("/");
  } else {
    packageName = arr[0];
  }
  packageName = packageName.trim();
  return isValidPackageName(packageName) ? packageName : null;
}
__name(getPackageNameFromString, "getPackageNameFromString");
function getPackagesFromFiles(files) {
  const packageNames = files.map((item) => [
    ...[...item.matchAll(import_constants.importRegex)].map((item2) => item2[2]),
    ...[...item.matchAll(import_constants.requireRegex)].map((item2) => item2[1])
  ]).flat().map(getPackageNameFromString).filter(Boolean).filter(isNotBuiltinModule);
  return [...new Set(packageNames)];
}
__name(getPackagesFromFiles, "getPackagesFromFiles");
function getIncludePackages(sourcePackages, external, pluginPrefix2) {
  return sourcePackages.filter((packageName) => !external.includes(packageName)).filter((packageName) => !pluginPrefix2.some((prefix) => packageName.startsWith(prefix)));
}
__name(getIncludePackages, "getIncludePackages");
function getExcludePackages(sourcePackages, external, pluginPrefix2) {
  const includePackages = getIncludePackages(sourcePackages, external, pluginPrefix2);
  return sourcePackages.filter((packageName) => !includePackages.includes(packageName));
}
__name(getExcludePackages, "getExcludePackages");
async function getExternalVersionFromSource(packageName) {
  const packageDir = (0, import_clientStaticUtils.getPackageDir)(packageName);
  const sourceGlobalFiles = ["src/**/*.{ts,js,tsx,jsx}", "!src/**/__tests__"];
  const sourceFilePaths = await import_fast_glob.default.glob(sourceGlobalFiles, { cwd: packageDir, absolute: true });
  const sourceFiles = await Promise.all(sourceFilePaths.map((item) => import_fs_extra.default.readFile(item, "utf-8")));
  const sourcePackages = getPackagesFromFiles(sourceFiles);
  const excludePackages = getExcludePackages(sourcePackages, import_constants.EXTERNAL, import_constants.pluginPrefix);
  const data = excludePackages.reduce((prev, packageName2) => {
    const depPkgPath = (0, import_clientStaticUtils.getDepPkgPath)(packageName2, packageDir);
    const depPkg = require(depPkgPath);
    prev[packageName2] = depPkg.version;
    return prev;
  }, {});
  return data;
}
__name(getExternalVersionFromSource, "getExternalVersionFromSource");
async function getCompatible(packageName) {
  let externalVersion;
  const hasSrc = import_fs_extra.default.existsSync(import_path.default.join((0, import_clientStaticUtils.getPackageDir)(packageName), "src"));
  let hasError = false;
  if (hasSrc) {
    try {
      externalVersion = await getExternalVersionFromSource(packageName);
    } catch {
      hasError = true;
    }
  }
  if (hasError || !hasSrc) {
    const res = await getExternalVersionFromDistFile(packageName);
    if (!res) {
      return false;
    } else {
      externalVersion = res;
    }
  }
  return Object.keys(externalVersion).reduce((result, packageName2) => {
    const packageVersion = externalVersion[packageName2];
    const globalPackageName = import_deps.default[packageName2] ? packageName2 : import_deps.default[packageName2.split("/")[0]] ? packageName2.split("/")[0] : void 0;
    if (globalPackageName) {
      const versionRange = import_deps.default[globalPackageName];
      result.push({
        name: packageName2,
        result: import_semver.default.satisfies(packageVersion, versionRange, { includePrerelease: true }),
        versionRange,
        packageVersion
      });
    }
    return result;
  }, []);
}
__name(getCompatible, "getCompatible");
async function checkCompatible(packageName) {
  const compatible = await getCompatible(packageName);
  if (!compatible) return false;
  return compatible.every((item) => item.result);
}
__name(checkCompatible, "checkCompatible");
async function checkAndGetCompatible(packageName) {
  const compatible = await getCompatible(packageName);
  if (!compatible) {
    return {
      isCompatible: false,
      depsCompatible: []
    };
  }
  return {
    isCompatible: compatible.every((item) => item.result),
    depsCompatible: compatible
  };
}
__name(checkAndGetCompatible, "checkAndGetCompatible");
async function getPluginBasePath(packageName) {
  if (!packageName) {
    return;
  }
  const file = await import_fs_extra.default.realpath(await (0, import_utils.requireResolve)(packageName));
  try {
    const basePath = await import_fs_extra.default.realpath(import_path.default.resolve(process.env.NODE_MODULES_PATH, packageName, "src"));
    if (file.startsWith(basePath)) {
      return basePath;
    }
  } catch (error) {
  }
  return import_path.default.dirname(import_path.default.dirname(file));
}
__name(getPluginBasePath, "getPluginBasePath");
async function pmListSummary(app) {
  const plugins1 = await (0, import_findPackageNames.findBuiltInPlugins)();
  const plugins2 = await (0, import_findPackageNames.findLocalPlugins)();
  let enabledPlugins = [];
  try {
    enabledPlugins = (await app.pm.repository.find({
      filter: {
        enabled: true
      }
    })).map((item) => item.packageName);
  } catch (error) {
  }
  const items = await Promise.all(
    [...plugins1, ...plugins2].map(async (name) => {
      const item = await import_plugin_manager.default.parseName(name);
      const json = await import_plugin_manager.default.getPackageJson(item.packageName);
      return {
        displayName: json.displayName || name,
        packageName: item.packageName,
        enabled: enabledPlugins.includes(item.packageName),
        description: json.description
      };
    })
  );
  return items;
}
__name(pmListSummary, "pmListSummary");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  assertSafePluginPackageName,
  checkAndGetCompatible,
  checkCompatible,
  copyTempPackageToStorageAndLinkToNodeModules,
  download,
  downloadAndUnzipToTempDir,
  getAuthorizationHeaders,
  getCompatible,
  getExcludePackages,
  getExternalVersionFromSource,
  getIncludePackages,
  getLatestVersion,
  getLocalPluginDir,
  getLocalPluginPackagesPathArr,
  getNewVersion,
  getNodeModulesPluginDir,
  getNpmInfo,
  getPackageJson,
  getPackageJsonByLocalPath,
  getPackageNameFromString,
  getPackagesFromFiles,
  getPluginBasePath,
  getPluginInfoByNpm,
  getServerPackages,
  getStoragePluginDir,
  getTempDir,
  isNotBuiltinModule,
  isValidPackageName,
  pmListSummary,
  readJSONFileContent,
  removePluginPackage,
  removeRequireCache,
  removeTmpDir,
  requireModule,
  requireNoCache,
  resolveSafeChildPath,
  updatePluginByCompressedFileUrl
});
