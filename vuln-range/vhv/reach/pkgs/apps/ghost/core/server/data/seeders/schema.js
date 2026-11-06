"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDataGeneratorOptions = parseDataGeneratorOptions;
const zod_1 = require("zod");
const options = zod_1.z.object({
    'base-data-pack': zod_1.z.string().default(''),
    'clear-database': zod_1.z.boolean().default(false),
    tables: zod_1.z.string().default(''),
    quantities: zod_1.z.string().default(''),
    'with-default': zod_1.z.boolean().default(false),
    'print-dependencies': zod_1.z.boolean().default(false),
    seed: zod_1.z.union([zod_1.z.number(), zod_1.z.string()]).optional(),
});
const quantity = zod_1.z.string().regex(/^\d+$/).transform(Number).pipe(zod_1.z.number().int().nonnegative());
const tableEntry = zod_1.z.tuple([zod_1.z.string().min(1), quantity.optional()]);
const quantityEntry = zod_1.z.tuple([zod_1.z.string().min(1), quantity]);
const seedValue = zod_1.z.union([zod_1.z.number(), zod_1.z.string().trim().min(1).pipe(zod_1.z.coerce.number())]);
/** Validate parsed CLI values and normalize them for Core's data generator. */
function parseDataGeneratorOptions(value) {
    const argv = options.parse(value);
    const tables = argv.tables
        .split(',')
        .filter(Boolean)
        .map((entry) => {
        const [name, amount] = tableEntry.parse(entry.split(':'));
        return { name, quantity: amount };
    });
    const quantities = {};
    for (const entry of argv.quantities.split(',').filter(Boolean)) {
        const [name, amount] = quantityEntry.parse(entry.split(':'), {
            error: () => `Invalid quantity override: ${entry}`,
        });
        quantities[name] = amount;
    }
    return {
        baseDataPack: argv['base-data-pack'],
        clearDatabase: argv['clear-database'],
        tables,
        quantities,
        withDefault: argv['with-default'],
        printDependencies: argv['print-dependencies'],
        seed: argv.seed === undefined || argv.seed === '' ? undefined : seedValue.parse(argv.seed),
    };
}
