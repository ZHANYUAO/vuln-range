import { getCases } from "../permissions/modules/process-ast/lib/get-cases.js";
import applyQuery from "../database/run-ast/lib/apply-query/index.js";
import database_default from "../database/index.js";
import { fetchPolicies } from "../permissions/lib/fetch-policies.js";
import { fetchPermissions } from "../permissions/lib/fetch-permissions.js";
import { isAdmin } from "../utils/is-admin.js";
import { validateAccess } from "../permissions/modules/validate-access/validate-access.js";
import { mergeFilters } from "@directus/utils";
import { isArray } from "lodash-es";

//#region src/services/meta.ts
var MetaService = class {
	knex;
	accountability;
	schema;
	constructor(options) {
		this.knex = options.knex || database_default();
		this.accountability = options.accountability || null;
		this.schema = options.schema;
	}
	async getMetaForQuery(collection, query) {
		if (!query || !query.meta) return;
		return (await Promise.all(query.meta.map((metaVal) => {
			if (metaVal === "total_count") return this.totalCount(collection);
			if (metaVal === "filter_count") return this.filterCount(collection, query);
		}))).reduce((metaObject, value, index) => {
			return {
				...metaObject,
				[query.meta[index]]: value
			};
		}, {});
	}
	async totalCount(collection) {
		return this.filterCount(collection, {});
	}
	async filterCount(collection, query) {
		let permissions = [];
		let filter = query.filter ?? null;
		if (!isAdmin(this.accountability)) {
			const context = {
				knex: this.knex,
				schema: this.schema
			};
			await validateAccess({
				accountability: this.accountability,
				action: "read",
				collection
			}, context);
			const policies = await fetchPolicies(this.accountability, context);
			permissions = await fetchPermissions({
				action: "read",
				accountability: this.accountability,
				policies
			}, context);
			if (collection === "directus_folders") filter = mergeFilters(filter, { type: { _neq: "flows" } });
		}
		const { cases } = getCases(collection, permissions, []);
		const { query: dbQuery, hasJoins } = applyQuery(this.knex, collection, this.knex(collection), {
			filter,
			search: query.search ?? null
		}, this.schema, cases, permissions);
		if (hasJoins) dbQuery.countDistinct({ count: [`${collection}.${this.schema.collections[collection].primary}`] });
		else dbQuery.count("*", { as: "count" });
		const records = await dbQuery;
		return Number((isArray(records) ? records[0]?.["count"] : records?.["count"]) ?? 0);
	}
};

//#endregion
export { MetaService };