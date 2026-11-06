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
var main_data_source_exports = {};
__export(main_data_source_exports, {
  MainDataSource: () => MainDataSource
});
module.exports = __toCommonJS(main_data_source_exports);
var import_data_source_manager = require("@nocobase/data-source-manager");
const _MainDataSource = class _MainDataSource extends import_data_source_manager.SequelizeDataSource {
  status = "loaded";
  init(options = {}) {
    const { acl, resourceManager, database } = options;
    this.acl = acl;
    this.resourceManager = resourceManager;
    this.collectionManager = this.createCollectionManager({
      collectionManager: {
        database,
        collectionsFilter: /* @__PURE__ */ __name((collection) => {
          return collection.options.loadedFromCollectionManager;
        }, "collectionsFilter")
      }
    });
    if (options.useACL !== false) {
      this.resourceManager.use(this.acl.middleware(), { group: "acl", after: "auth" });
    }
  }
  async readTables() {
    const allTables = await this.introspector.getTableList();
    const existsCollections = this.collectionManager.db.collections;
    const existsTables = Array.from(existsCollections.values()).map(
      (collection) => collection.model.tableName
    );
    const diffTables = allTables.filter((table) => !existsTables.includes(table));
    return diffTables.map((name) => ({ name }));
  }
  async tables2Collections(tableNames) {
    const db = this.collectionManager.db;
    const results = await Promise.all(
      tableNames.map(async (tableName) => {
        let tableInfo;
        if (typeof tableName === "string") {
          tableInfo = { tableName };
          if (db.options.schema) {
            tableInfo.schema = db.options.schema;
          }
        } else {
          tableInfo = tableName;
        }
        try {
          return await this.introspector.getCollection({ tableInfo });
        } catch (e) {
          if (e.message.includes("No description found for")) {
            return null;
          }
          throw e;
        }
      })
    );
    return results.filter(Boolean);
  }
  async loadTables(ctx, tables) {
    const repo = this.collectionManager.db.getRepository("collections");
    const existsCollections = this.collectionManager.db.collections;
    const existsTables = Array.from(existsCollections.values()).map(
      (collection) => collection.model.tableName
    );
    const toAddTables = tables.filter((table) => !existsTables.includes(table));
    if (toAddTables.length) {
      try {
        this.status = "loading";
        const results = await this.tables2Collections(toAddTables);
        const values = results.map((result) => ({
          ...result,
          from: "dbsync",
          underscored: false
        }));
        await repo.create({ values, context: ctx });
      } catch (e) {
        throw e;
      } finally {
        this.status = "loaded";
      }
    }
  }
  async getLoadedCollections(filter) {
    const db = this.collectionManager.db;
    const loadedCollections = await db.getRepository("collections").find({
      appends: ["fields"],
      filter: {
        hidden: false,
        ...filter
      }
    });
    const collections = loadedCollections.filter(
      (collection) => {
        var _a;
        return !["db2cm", "dbsync"].includes((_a = collection.options) == null ? void 0 : _a.from);
      }
    );
    const loadedData = {};
    for (const collection of collections) {
      const c = db.getCollection(collection.name);
      loadedData[c.model.tableName] = {
        ...collection.toJSON(),
        fields: collection.fields.map((field) => {
          const f = c.getField(field.name);
          return {
            columnName: f == null ? void 0 : f.columnName(),
            ...field.toJSON()
          };
        })
      };
    }
    return loadedData;
  }
  async syncFieldsFromDatabase(ctx, collectionNames) {
    let filter = {};
    if (collectionNames == null ? void 0 : collectionNames.length) {
      filter = {
        name: collectionNames
      };
    }
    const db = this.collectionManager.db;
    const loadedCollections = await this.getLoadedCollections(filter);
    const tableNames = Object.values(loadedCollections).map(({ name }) => {
      const collection = db.getCollection(name);
      return collection.getTableNameWithSchema();
    });
    let collections = [];
    try {
      collections = await this.tables2Collections(tableNames);
    } catch (err) {
      ctx.log.error(err);
    }
    const toLoadCollections = this.mergeWithLoadedCollections(collections, loadedCollections);
    const currentSchema = process.env.COLLECTION_MANAGER_SCHEMA || db.options.schema || "public";
    for (const values of toLoadCollections) {
      if (values.schema === currentSchema) {
        delete values.schema;
      }
      const existsFields = loadedCollections[values.tableName].fields;
      const deletedFields = existsFields.filter((field) => !values.fields.find((f) => f.name === field.name));
      await db.sequelize.transaction(async (transaction) => {
        for (const field of deletedFields) {
          await db.getRepository("fields").destroy({
            filterByTk: field.key,
            context: ctx,
            transaction
          });
        }
        await db.getRepository("collections").update({
          filterByTk: values.name,
          values,
          updateAssociationValues: ["fields"],
          context: ctx,
          transaction
        });
      });
    }
  }
};
__name(_MainDataSource, "MainDataSource");
let MainDataSource = _MainDataSource;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MainDataSource
});
