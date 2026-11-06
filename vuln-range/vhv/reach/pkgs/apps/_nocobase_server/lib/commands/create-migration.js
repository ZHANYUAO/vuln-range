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
var create_migration_exports = {};
__export(create_migration_exports, {
  default: () => create_migration_default
});
module.exports = __toCommonJS(create_migration_exports);
var import_dayjs = __toESM(require("dayjs"));
var import_fs = __toESM(require("fs"));
var import_path = require("path");
/* istanbul ignore file -- @preserve */
var create_migration_default = /* @__PURE__ */ __name((app) => {
  app.command("create-migration").argument("<name>").option("--pkg <pkg>").option("--on [on]").action(async (name, options) => {
    const pkg = options.pkg;
    const dir = await import_fs.default.promises.realpath((0, import_path.resolve)(process.env.NODE_MODULES_PATH, pkg));
    const filename = (0, import_path.resolve)(
      dir,
      pkg === "@nocobase/server" ? "src" : "src/server",
      "migrations",
      `${(0, import_dayjs.default)().format("YYYYMMDDHHmmss")}-${name}.ts`
    );
    const version = app.getPackageVersion();
    const regex = /(\d+)\.(\d+)\.(\d+)(-[\w.]+)?/;
    const nextVersion = version.replace(regex, (match, major, minor, patch, suffix) => {
      if (version.includes("beta") || version.includes("alpha")) {
        return `${major}.${minor}.${patch}`;
      }
      return `${major}.${1 + 1 * minor}.0`;
    });
    const from = pkg === "@nocobase/server" ? `../migration` : "@nocobase/server";
    const data = `import { Migration } from '${from}';

export default class extends Migration {
  on = '${options.on || "afterLoad"}'; // 'beforeLoad' or 'afterLoad'
  appVersion = '<${nextVersion}';

  async up() {
    // coding
  }
}
`;
    await import_fs.default.promises.mkdir((0, import_path.dirname)(filename), { recursive: true });
    await import_fs.default.promises.writeFile(filename, data, "utf8");
    console.log(`migration file in ${filename}`);
  });
}, "default");
