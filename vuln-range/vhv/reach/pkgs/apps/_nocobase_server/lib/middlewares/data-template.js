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
var data_template_exports = {};
__export(data_template_exports, {
  dataTemplate: () => dataTemplate
});
module.exports = __toCommonJS(data_template_exports);
async function dataTemplate(ctx, next) {
  const { resourceName, actionName } = ctx.action;
  const { isTemplate, fields, appends } = ctx.action.params;
  await next();
  if (isTemplate && actionName === "get") {
    ctx.body = traverseJSON(JSON.parse(JSON.stringify(ctx.body)), {
      collection: ctx.getCurrentRepository().collection,
      include: [...fields || [], ...appends || []]
    });
  }
}
__name(dataTemplate, "dataTemplate");
const traverseHasMany = /* @__PURE__ */ __name((arr, { collection, exclude = [], include = [] }) => {
  if (!arr) {
    return arr;
  }
  return arr.map((item) => traverseJSON(item, { collection, exclude, include, isHasManyField: true }));
}, "traverseHasMany");
const traverseBelongsToMany = /* @__PURE__ */ __name((arr, { collection, exclude = [], through }) => {
  if (!arr) {
    return arr;
  }
  const throughCollection = collection.db.getCollection(through);
  return arr.map((item) => {
    const data = traverseJSON(item[through], { collection: throughCollection, exclude });
    if (data && Object.keys(data).length) {
      item[through] = data;
    } else {
      delete item[through];
    }
    return traverseJSON(item, {
      collection,
      excludePk: false
    });
  });
}, "traverseBelongsToMany");
const parseInclude = /* @__PURE__ */ __name((keys) => {
  const map = {};
  for (const key of keys) {
    const args = key.split(".");
    const field = args.shift();
    map[field] = map[field] || [];
    if (args.length) {
      map[field].push(args.join("."));
    }
  }
  return map;
}, "parseInclude");
const traverseJSON = /* @__PURE__ */ __name((data, options) => {
  if (!data) {
    return data;
  }
  const { collection, exclude = [], include = [], excludePk = true } = options;
  const map = parseInclude(include);
  const result = {};
  for (const key of Object.keys(data || {})) {
    const subInclude = map[key];
    if (include.length > 0 && !subInclude) {
      continue;
    }
    if (exclude.includes(key)) {
      continue;
    }
    if (["createdAt", "updatedAt", "createdBy", "createdById", "updatedById", "updatedBy"].includes(key)) {
      continue;
    }
    const field = collection.getField(key);
    if (!field) {
      result[key] = data[key];
      continue;
    }
    if (field.options.primaryKey && excludePk && !collection.isMultiFilterTargetKey()) {
      continue;
    }
    if (field.options.isForeignKey) {
      continue;
    }
    if (!options.isHasManyField && ["sort"].includes(field.type)) {
      continue;
    }
    if (["password", "sequence"].includes(field.type)) {
      continue;
    }
    if (field.type === "hasOne") {
      result[key] = traverseJSON(data[key], {
        collection: collection.db.getCollection(field.target),
        exclude: [field.foreignKey],
        include: subInclude
      });
    } else if (field.type === "hasMany") {
      result[key] = traverseHasMany(data[key], {
        collection: collection.db.getCollection(field.target),
        exclude: [field.foreignKey],
        include: subInclude
      });
    } else if (field.type === "belongsTo") {
      result[key] = data[key];
    } else if (field.type === "belongsToMany") {
      result[key] = traverseBelongsToMany(data[key], {
        collection: collection.db.getCollection(field.target),
        exclude: [field.foreignKey, field.otherKey],
        through: field.through
      });
    } else {
      result[key] = data[key];
    }
  }
  return result;
}, "traverseJSON");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  dataTemplate
});
