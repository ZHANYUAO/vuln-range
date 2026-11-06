"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onDeleteOf = onDeleteOf;
exports.foreignKeySpecsOf = foreignKeySpecsOf;
exports.foreignKeysOf = foreignKeysOf;
const zod_1 = require("zod");
const columns_1 = require("./columns");
const DeleteRuleSpec = zod_1.z.object({
    cascadeDelete: zod_1.z.boolean().optional(),
    restrictDelete: zod_1.z.boolean().optional(),
    setNullDelete: zod_1.z.boolean().optional(),
});
/**
 * A foreign key as a table's `@@FOREIGN_KEYS@@` declares it. A column's own `references` is
 * shorthand for one over that column alone.
 */
const ForeignKeySpec = zod_1.z.strictObject({
    ...DeleteRuleSpec.shape,
    columns: zod_1.z.array(zod_1.z.string()).min(1),
    references: zod_1.z.strictObject({ table: zod_1.z.string(), columns: zod_1.z.array(zod_1.z.string()).min(1) }),
    constraintName: zod_1.z.string().optional(),
});
const ColumnSpec = zod_1.z.object({
    ...DeleteRuleSpec.shape,
    references: zod_1.z
        .string()
        .regex(/^[^.]+\.[^.]+$/, { error: "A column's `references` is written as `table.column`." })
        .transform((reference) => {
        const [table, column] = reference.split('.');
        return { table, columns: [column] };
    })
        .optional(),
    constraintName: zod_1.z.string().optional(),
});
function onDeleteOf(spec) {
    if (spec.cascadeDelete === true) {
        return 'CASCADE';
    }
    if (spec.restrictDelete === true) {
        return 'RESTRICT';
    }
    if (spec.setNullDelete === true) {
        return 'SET NULL';
    }
    return undefined;
}
/**
 * Every foreign key a table declares in schema.js, as `@@FOREIGN_KEYS@@` entries, with each
 * column's `references` expanded into one. Throws on a declaration it cannot read,
 * including a key `@@FOREIGN_KEYS@@` does not know.
 */
function foreignKeySpecsOf(tableSpec) {
    const foreignKeys = [];
    for (const [columnName, { references, ...rest }] of Object.entries((0, columns_1.columnsOf)(tableSpec, ColumnSpec))) {
        if (references) {
            foreignKeys.push({ ...rest, columns: [columnName], references });
        }
    }
    return [...foreignKeys, ...zod_1.z.array(ForeignKeySpec).parse(tableSpec['@@FOREIGN_KEYS@@'] ?? [])];
}
/**
 * Every foreign key on a table declared in schema.js, named as knex names one it is not
 * given a name for.
 */
function foreignKeysOf(tableName, tableSpec) {
    return foreignKeySpecsOf(tableSpec).map((foreignKey) => ({
        constraintName: foreignKey.constraintName ?? defaultConstraintName(tableName, foreignKey.columns),
        columns: foreignKey.columns,
        references: foreignKey.references,
        onDelete: onDeleteOf(foreignKey) ?? 'NO ACTION',
    }));
}
// https://github.com/knex/knex/blob/e25d54bcb707714a17f5a5744eba5c4246bb4d1d/lib/schema/tablecompiler.js#L401-L415
function defaultConstraintName(tableName, columns) {
    return `${tableName.replace(/\.|-/g, '_')}_${columns.join('_')}_foreign`.toLowerCase();
}
