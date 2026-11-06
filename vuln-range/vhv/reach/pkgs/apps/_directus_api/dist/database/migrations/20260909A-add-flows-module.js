//#region src/database/migrations/20260909A-add-flows-module.ts
const MODULES_AFTER_FLOWS = [
	"deployments",
	"docs",
	"settings"
];
async function up(knex) {
	await updateModuleBar(knex, (moduleBar) => {
		if (moduleBar.find(({ id }) => id === "flows")) return;
		const flowsModule = {
			type: "module",
			id: "flows",
			enabled: true
		};
		const followingIndex = moduleBar.findIndex(({ id }) => MODULES_AFTER_FLOWS.includes(id));
		const insertAt = followingIndex === -1 ? moduleBar.length : followingIndex;
		moduleBar.splice(insertAt, 0, flowsModule);
		return moduleBar;
	});
}
async function down(knex) {
	await updateModuleBar(knex, (moduleBar) => moduleBar.filter(({ id }) => id !== "flows"));
}
async function updateModuleBar(knex, modify) {
	const result = await knex("directus_settings").select("module_bar", "id").first();
	if (result && result.module_bar) {
		const updatedModuleBar = modify(typeof result.module_bar === "string" ? JSON.parse(result.module_bar) : result.module_bar);
		if (!updatedModuleBar) return;
		await knex("directus_settings").update({ module_bar: JSON.stringify(updatedModuleBar) }).where("id", result.id);
	}
}

//#endregion
export { down, up };