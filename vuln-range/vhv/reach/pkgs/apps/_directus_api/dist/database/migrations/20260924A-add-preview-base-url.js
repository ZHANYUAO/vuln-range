//#region src/database/migrations/20260924A-add-preview-base-url.ts
async function up(knex) {
	await knex.schema.alterTable("directus_settings", (table) => {
		table.string("preview_base_url").nullable();
	});
}
async function down(knex) {
	await knex.schema.alterTable("directus_settings", (table) => {
		table.dropColumn("preview_base_url");
	});
}

//#endregion
export { down, up };