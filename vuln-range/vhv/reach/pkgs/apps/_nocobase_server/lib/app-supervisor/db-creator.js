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
var db_creator_exports = {};
__export(db_creator_exports, {
  createConnection: () => createConnection,
  createConnectionCondition: () => createConnectionCondition,
  createDatabase: () => createDatabase,
  createDatabaseCondition: () => createDatabaseCondition,
  createSchema: () => createSchema,
  createSchemaCondition: () => createSchemaCondition
});
module.exports = __toCommonJS(db_creator_exports);
var import_db_drivers = require("./db-drivers");
async function createMySQLDatabase({
  host,
  port,
  username,
  password,
  database,
  driver
}) {
  var _a;
  const conn = await driver.createConnection({
    host,
    port,
    user: username,
    password
  });
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
  await (((_a = conn.end) == null ? void 0 : _a.call(conn)) ?? conn.close());
}
__name(createMySQLDatabase, "createMySQLDatabase");
async function withPgClient(options, fn) {
  const { Client } = (0, import_db_drivers.loadPgModule)();
  const client = new Client(options);
  await client.connect();
  try {
    await fn(client);
  } catch (e) {
    console.log(e);
  } finally {
    await client.end();
  }
}
__name(withPgClient, "withPgClient");
const createDatabaseCondition = /* @__PURE__ */ __name(({ appOptions }) => !(appOptions == null ? void 0 : appOptions.dbConnType) || appOptions.dbConnType === "new_database", "createDatabaseCondition");
const createConnectionCondition = /* @__PURE__ */ __name(({ appOptions }) => (appOptions == null ? void 0 : appOptions.dbConnType) === "new_connection", "createConnectionCondition");
const createSchemaCondition = /* @__PURE__ */ __name(({ appOptions }) => appOptions.dbConnType === "new_schema", "createSchemaCondition");
const createDatabase = /* @__PURE__ */ __name(async ({ app }) => {
  const { host, port, username, password, dialect, database } = app.options.database;
  if (dialect === "mysql") {
    const mysql = (0, import_db_drivers.loadMysqlDriver)();
    return createMySQLDatabase({
      host,
      port,
      username,
      password,
      database,
      driver: mysql
    });
  }
  if (dialect === "mariadb") {
    const mariadb = (0, import_db_drivers.loadMariadbDriver)();
    return createMySQLDatabase({
      host,
      port,
      username,
      password,
      database,
      driver: mariadb
    });
  }
  if (["postgres", "kingbase"].includes(dialect)) {
    return withPgClient({ host, port, user: username, password, database: dialect }, async (client) => {
      const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
      if (exists.rowCount === 0) {
        await client.query(`CREATE DATABASE "${database}"`);
      }
    });
  }
}, "createDatabase");
const createConnection = /* @__PURE__ */ __name(async ({ app }) => {
  const { host, port, username, password, dialect, database, schema } = app.options.database;
  if (dialect === "mysql") {
    const mysql = (0, import_db_drivers.loadMysqlDriver)();
    return createMySQLDatabase({
      host,
      port,
      username,
      password,
      database,
      driver: mysql
    });
  }
  if (dialect === "mariadb") {
    const mariadb = (0, import_db_drivers.loadMariadbDriver)();
    return createMySQLDatabase({
      host,
      port,
      username,
      password,
      database,
      driver: mariadb
    });
  }
  if (["postgres", "kingbase"].includes(dialect)) {
    if (schema) {
      return withPgClient(
        { host, port, user: username, password, database },
        (client) => client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`)
      );
    } else {
      return withPgClient(
        { host, port, user: username, password, database: dialect },
        (client) => client.query(`CREATE DATABASE "${database}"`)
      );
    }
  }
}, "createConnection");
const createSchema = /* @__PURE__ */ __name(async ({ app }) => {
  const { host, port, username, password, dialect, schema, database } = app.options.database;
  if (!["postgres", "kingbase"].includes(dialect)) {
    throw new Error("Schema is only supported for postgres/kingbase");
  }
  return withPgClient(
    { host, port, user: username, password, database },
    (client) => client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`)
  );
}, "createSchema");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createConnection,
  createConnectionCondition,
  createDatabase,
  createDatabaseCondition,
  createSchema,
  createSchemaCondition
});
