//#region src/database/migrations/20260818A-add-flow-folders.ts
async function up(knex) {
	await knex.schema.alterTable("directus_folders", (table) => {
		table.string("type").notNullable().defaultTo("files");
	});
	await knex.schema.alterTable("directus_flows", (table) => {
		table.uuid("folder").references("id").inTable("directus_folders").onDelete("SET NULL");
	});
}
async function down(knex) {
	await knex.schema.alterTable("directus_flows", (table) => {
		table.dropForeign(["folder"]);
		table.dropColumn("folder");
	});
	await knex.schema.alterTable("directus_folders", (table) => {
		table.dropColumn("type");
	});
}

//#endregion
export { down, up };