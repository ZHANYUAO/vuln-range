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
var aes_encryptor_exports = {};
__export(aes_encryptor_exports, {
  AesEncryptor: () => AesEncryptor,
  default: () => aes_encryptor_default
});
module.exports = __toCommonJS(aes_encryptor_exports);
var import_crypto = __toESM(require("crypto"));
var import_fs_extra = __toESM(require("fs-extra"));
var import_path = __toESM(require("path"));
var import_utils = require("@nocobase/utils");
const _AesEncryptor = class _AesEncryptor {
  key;
  constructor(key) {
    if (key.length !== 32) {
      throw new Error("Key must be 32 bytes for AES-256 encryption.");
    }
    this.key = key;
  }
  async encrypt(text) {
    return new Promise((resolve2, reject) => {
      try {
        const iv = import_crypto.default.randomBytes(16);
        const cipher = import_crypto.default.createCipheriv("aes-256-cbc", this.key, iv);
        const encrypted = Buffer.concat([cipher.update(Buffer.from(text, "utf8")), cipher.final()]);
        resolve2(iv.toString("hex") + encrypted.toString("hex"));
      } catch (error) {
        reject(error);
      }
    });
  }
  async decrypt(encryptedText) {
    return new Promise((resolve2, reject) => {
      try {
        resolve2(this.decryptSync(encryptedText));
      } catch (error) {
        reject(error);
      }
    });
  }
  decryptSync(encryptedText) {
    const iv = Buffer.from(encryptedText.slice(0, 32), "hex");
    const encrypted = Buffer.from(encryptedText.slice(32), "hex");
    const decipher = import_crypto.default.createDecipheriv("aes-256-cbc", this.key, iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  }
  static async getOrGenerateKey(keyFilePath) {
    try {
      const key = await import_fs_extra.default.readFile(keyFilePath);
      if (key.length !== 32) {
        throw new Error("Invalid key length in file.");
      }
      return key;
    } catch (error) {
      if (error.code === "ENOENT") {
        const key = import_crypto.default.randomBytes(32);
        await import_fs_extra.default.mkdir(import_path.default.dirname(keyFilePath), { recursive: true });
        await import_fs_extra.default.writeFile(keyFilePath, key);
        return key;
      } else {
        throw new Error(`Failed to load key: ${error.message}`);
      }
    }
  }
  static async getKeyPath(appName) {
    const appKeyPath = (0, import_utils.storagePathJoin)("apps", appName, "aes_key.dat");
    const appKeyExists = await import_fs_extra.default.exists(appKeyPath);
    if (appKeyExists) {
      return appKeyPath;
    }
    const envKeyPath = (0, import_utils.storagePathJoin)("environment-variables", appName, "aes_key.dat");
    const envKeyExists = await import_fs_extra.default.exists(envKeyPath);
    if (envKeyExists) {
      return envKeyPath;
    }
    return appKeyPath;
  }
  static async create(app) {
    if (process.env.APP_AES_SECRET_KEY) {
      const key2 = Buffer.from(process.env.APP_AES_SECRET_KEY, "hex");
      return new _AesEncryptor(key2);
    }
    const KEY_PATH = process.env.APP_AES_SECRET_KEY_PATH;
    const keyPath = KEY_PATH ? (0, import_path.resolve)(process.cwd(), KEY_PATH) : await this.getKeyPath(app.name);
    const key = await _AesEncryptor.getOrGenerateKey(keyPath);
    return new _AesEncryptor(key);
  }
};
__name(_AesEncryptor, "AesEncryptor");
let AesEncryptor = _AesEncryptor;
var aes_encryptor_default = AesEncryptor;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AesEncryptor
});
