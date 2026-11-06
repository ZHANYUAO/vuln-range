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
var i18n_exports = {};
__export(i18n_exports, {
  i18n: () => i18n
});
module.exports = __toCommonJS(i18n_exports);
async function i18n(ctx, next) {
  ctx.getCurrentLocale = () => {
    const lng2 = ctx.get("X-Locale") || ctx.request.query.locale || ctx.app.i18n.language || ctx.acceptsLanguages().shift() || "en-US";
    return lng2;
  };
  const lng = ctx.getCurrentLocale();
  const localeManager = ctx.app.localeManager;
  const i18n2 = await localeManager.getI18nInstance(lng);
  ctx.i18n = i18n2;
  ctx.t = i18n2.t.bind(i18n2);
  if (lng !== "*" && lng) {
    await i18n2.changeLanguage(lng);
    await localeManager.loadResourcesByLang(lng);
  }
  await next();
}
__name(i18n, "i18n");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  i18n
});
