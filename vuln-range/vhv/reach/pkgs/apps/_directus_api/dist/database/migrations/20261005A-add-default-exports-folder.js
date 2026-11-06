import { getDefaultIndexName } from "../../utils/get-default-index-name.js";
import { getDatabaseClient } from "../index.js";

//#region src/database/migrations/20261005A-add-default-exports-folder.ts
const indexName = getDefaultIndexName("foreign", "directus_settings", "default_exports_folder");
async function up(knex) {
	await knex.schema.alterTable("directus_settings", (table) => {
		const foreign = table.uuid("default_exports_folder").references("id").inTable("directus_folders").withKeyName(indexName);
		/**
		* MSSQL doesn't allow multiple cascade paths between the same tables, and
		* storage_default_folder already uses SET NULL on directus_folders
		*/
		if (getDatabaseClient(knex) !== "mssql") foreign.onDelete("SET NULL");
	});
}
async function down(knex) {
	await knex.schema.alterTable("directus_settings", (table) => {
		table.dropForeign(["default_exports_folder"], indexName);
		table.dropColumn("default_exports_folder");
	});
}

//#endregion
export { down, up };