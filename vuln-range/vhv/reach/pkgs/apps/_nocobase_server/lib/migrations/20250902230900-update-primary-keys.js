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
var update_primary_keys_exports = {};
__export(update_primary_keys_exports, {
  default: () => update_primary_keys_default
});
module.exports = __toCommonJS(update_primary_keys_exports);
var import_sequelize = require("sequelize");
var import_migration = require("../migration");
const collections = [
  "departments",
  "desktopRoutes",
  "mobileRoutes",
  "collectionCategories",
  "dataSourcesRolesResources",
  "dataSourcesRolesResourcesActions",
  "dataSourcesRolesResourcesScopes",
  "storages",
  "workflows",
  "flow_nodes",
  "executions",
  "userWokrflowTasks",
  "workflowCategories",
  "approvalExecutions",
  "approvalRecords",
  "approvals",
  "workflowManualTasks",
  "workflowCcTasks",
  "approvalMsgTpls",
  "mailAccounts",
  "mailSettings"
];
const _update_primary_keys_default = class _update_primary_keys_default extends import_migration.Migration {
  on = "afterLoad";
  // 'beforeLoad' or 'afterLoad'
  appVersion = "<1.9.0";
  async up() {
    const repo = this.db.getRepository("fields");
    if (!repo) {
      return;
    }
    const queryInterface = this.db.sequelize.getQueryInterface();
    for (const collectionName of collections) {
      const collection = this.db.getCollection(collectionName);
      if (collection) {
        const tableName = collection.getTableNameWithSchema();
        if (this.db.isPostgresCompatibleDialect()) {
          await this.db.sequelize.transaction(async (transaction) => {
            const schema = collection.collectionSchema();
            const table = collection.model.tableName;
            const seqName = `"${schema}"."${table}_id_seq"`;
            await this.db.sequelize.query(`ALTER TABLE "${schema}"."${table}" ALTER COLUMN id DROP DEFAULT;`, {
              transaction
            });
            await this.db.sequelize.query(`DROP SEQUENCE IF EXISTS ${seqName} CASCADE;`, { transaction });
          });
        } else {
          await queryInterface.changeColumn(tableName, "id", {
            type: import_sequelize.DataTypes.BIGINT,
            allowNull: false
          });
        }
      }
      const field = await repo.findOne({
        filter: {
          collectionName,
          name: "id"
        }
      });
      if (field) {
        const options = { ...field.options };
        delete options["autoIncrement"];
        await repo.update({
          filter: { key: field.key },
          values: {
            type: "snowflakeId",
            options
          }
        });
      }
    }
    const treeCollections = [...this.db.collections.values()].filter((collection) => collection.options.tree);
    for (const collection of treeCollections) {
      const pathCollection = this.db.getCollection(`main_${collection.name}_path`);
      if (pathCollection) {
        const nodePk = pathCollection.getField("nodePk").columnName();
        await queryInterface.changeColumn(pathCollection.getTableNameWithSchema(), nodePk, {
          type: import_sequelize.DataTypes.BIGINT
        });
        const rootPk = pathCollection.getField("rootPk").columnName();
        await queryInterface.changeColumn(pathCollection.getTableNameWithSchema(), rootPk, {
          type: import_sequelize.DataTypes.BIGINT
        });
      }
    }
  }
};
__name(_update_primary_keys_default, "default");
let update_primary_keys_default = _update_primary_keys_default;
