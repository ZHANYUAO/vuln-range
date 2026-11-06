"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IN_DEVELOPMENT_TABLES = void 0;
exports.isInDevelopmentTable = isInDevelopmentTable;
exports.shouldCreateInDevelopmentTables = shouldCreateInDevelopmentTables;
exports.getInDevelopmentTables = getInDevelopmentTables;
exports.getTablesToCreate = getTablesToCreate;
exports.createMissingInDevelopmentTables = createMissingInDevelopmentTables;
exports.rebuildInDevelopmentTables = rebuildInDevelopmentTables;
const logging_1 = __importDefault(require("@tryghost/logging"));
const config_1 = __importDefault(require("../../../shared/config"));
// @ts-expect-error This module lacks type definitions.
const commands_1 = __importDefault(require("./commands"));
// @ts-expect-error This module lacks type definitions.
const schema_1 = __importDefault(require("./schema"));
/**
 * Tables listed here are defined in `schema.js` but are still being iterated on.
 *
 * - `knex-migrator init` only creates them in the development and testing
 *   environments, and only while `createInDevelopmentTables` is enabled in
 *   config, so production databases never contain them.
 * - Boot creates any that are missing from an existing development database.
 * - They need no versioned migration and are left out of the schema integrity
 *   hash, so their definition can change freely.
 *
 * Once a table's definition is final, remove it from this list and add the
 * versioned migration that creates it.
 *
 * Code that reads or writes these tables must stay dormant wherever the tables
 * are not created.
 */
exports.IN_DEVELOPMENT_TABLES = ['jobs_outbox'];
function isInDevelopmentTable(tableName) {
    return exports.IN_DEVELOPMENT_TABLES.includes(tableName);
}
/**
 * Only development and testing databases may contain in-development tables,
 * whatever the config says, so a misconfigured production site can't create
 * tables that have no migrations
 */
function shouldCreateInDevelopmentTables() {
    const env = config_1.default.get('env');
    const isDevelopmentOrTesting = env === 'development' || env.startsWith('testing');
    return isDevelopmentOrTesting && config_1.default.get('createInDevelopmentTables') === true;
}
/**
 * The in-development tables, in the order they appear in `schema.js`
 */
function getInDevelopmentTables() {
    return Object.keys(schema_1.default).filter(isInDevelopmentTable);
}
/**
 * The tables `knex-migrator init` should create in the current environment
 */
function getTablesToCreate() {
    const includeInDevelopment = shouldCreateInDevelopmentTables();
    return Object.keys(schema_1.default).filter((tableName) => includeInDevelopment || !isInDevelopmentTable(tableName));
}
/**
 * Creates in-development tables missing from an already initialised database
 */
async function createMissingInDevelopmentTables(knex) {
    if (!shouldCreateInDevelopmentTables()) {
        return;
    }
    const tables = getInDevelopmentTables();
    if (!tables.length) {
        return;
    }
    const existingTables = await commands_1.default.getTables(knex);
    for (const tableName of tables) {
        if (!existingTables.includes(tableName)) {
            logging_1.default.info(`Creating in-development table: ${tableName}`);
            await commands_1.default.createTable(tableName, knex);
        }
    }
}
/**
 * Drops and recreates every in-development table, discarding its data, so the
 * database picks up changes to their definitions in `schema.js`
 */
async function rebuildInDevelopmentTables(knex) {
    if (!shouldCreateInDevelopmentTables()) {
        logging_1.default.warn('In-development tables are disabled in this environment (createInDevelopmentTables)');
        return;
    }
    const tables = getInDevelopmentTables();
    // schema.js lists each table after the tables it references, so drop in
    // reverse to remove referencing tables before the tables they point to
    for (const tableName of tables.toReversed()) {
        logging_1.default.info(`Dropping in-development table: ${tableName}`);
        await commands_1.default.deleteTable(tableName, knex);
    }
    for (const tableName of tables) {
        logging_1.default.info(`Creating in-development table: ${tableName}`);
        await commands_1.default.createTable(tableName, knex);
    }
}
