#!/usr/bin/env node
"use strict";
// Generates data into the configured database from an installed Ghost tree.
// Same options as `pnpm gx data generate`, which contributors use in a checkout.
Object.defineProperty(exports, "__esModule", { value: true });
const node_util_1 = require("node:util");
const schema_1 = require("../core/server/data/seeders/schema");
const { values } = (0, node_util_1.parseArgs)({
    options: {
        'base-data-pack': { type: 'string', default: '' },
        'clear-database': { type: 'boolean', default: false },
        tables: { type: 'string', default: '' },
        quantities: { type: 'string', default: '' },
        'with-default': { type: 'boolean', default: false },
        'print-dependencies': { type: 'boolean', default: false },
        seed: { type: 'string' },
    },
});
async function main() {
    const options = (0, schema_1.parseDataGeneratorOptions)(values);
    // Fail while creating the connection if MySQL can't stream LOAD DATA
    process.env.REQUIRE_INFILE_STREAM = '1';
    const config = require('../core/shared/config');
    const { knex } = require('../core/server/data/db');
    const { tables: schemaTables } = require('../core/server/data/schema');
    const DataGenerator = require('../core/server/data/seeders/data-generator');
    try {
        await new DataGenerator({
            ...options,
            knex,
            logger: console,
            baseUrl: config.getSiteUrl(),
            schemaTables,
        }).importData();
    }
    finally {
        await knex.destroy();
    }
}
main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
