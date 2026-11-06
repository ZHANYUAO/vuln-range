"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const knex_1 = __importDefault(require("knex"));
const config_1 = __importDefault(require("../../../shared/config"));
const configure_knex_1 = require("./configure-knex");
// @TODO:
// - if you require this file before config file was loaded,
// - then this file is cached and you have no chance to connect to the db anymore
// - bring dynamic into this file (db.connect())
const dbConfig = config_1.default.get('database');
const knexInstance = dbConfig?.client ? (0, knex_1.default)((0, configure_knex_1.configure)(dbConfig)) : undefined;
module.exports = knexInstance;
