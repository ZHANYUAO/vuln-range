import { useLogger } from "../logger/index.js";
import { ALIAS_TYPES } from "../constants.js";
import { getMemorySchemaCache, setMemorySchemaCache } from "../cache.js";
import database_default from "../database/index.js";
import { RelationsService } from "../services/relations.js";
import getLocalType from "./get-local-type.js";
import getDefaultValue from "./get-default-value.js";
import { getSystemFieldRowsWithAuthProviders } from "./get-field-system-rows.js";
import { TimeoutError } from "./with-timeout.js";
import { runExclusive } from "./run-exclusive.js";
import { useEnv } from "@directus/env";
import { parseJSON, toArray, toBoolean } from "@directus/utils";
import { mapValues } from "lodash-es";
import { createInspector } from "@directus/schema";
import { isSystemCollection, systemCollectionRows } from "@directus/system-data";

//#region src/utils/get-schema.ts
const logger = useLogger();
async function getSchema(options) {
	const env = useEnv();
	if (options?.bypassCache || env["CACHE_SCHEMA"] === false) {
		const database = options?.database || database_default();
		return await getDatabaseSchema(database, createInspector(database));
	}
	const cached = getMemorySchemaCache();
	if (cached) return cached;
	try {
		const { result: schema, leader } = await runExclusive("schema-cache", async () => {
			const database = options?.database || database_default();
			const schema$1 = await getDatabaseSchema(database, createInspector(database));
			setMemorySchemaCache(schema$1);
			return schema$1;
		}, { timeout: env["CACHE_SCHEMA_SYNC_TIMEOUT"] });
		if (!leader) setMemorySchemaCache(schema);
		return schema;
	} catch (error) {
		if (error instanceof TimeoutError) logger.warn(`Schema retrieval exceeded the timeout. Increase CACHE_SCHEMA_SYNC_TIMEOUT in the env to prevent this from happening.`);
		throw error;
	}
}
async function getDatabaseSchema(database, schemaInspector) {
	const env = useEnv();
	const result = {
		collections: {},
		relations: []
	};
	const systemFieldRows$1 = getSystemFieldRowsWithAuthProviders();
	const schemaOverview = await schemaInspector.overview();
	const collections = [...await database.select("*").from("directus_collections"), ...systemCollectionRows];
	for (const [collection, info] of Object.entries(schemaOverview)) {
		if (toArray(env["DB_EXCLUDE_TABLES"]).includes(collection)) {
			logger.trace(`Collection "${collection}" is configured to be excluded and will be ignored`);
			continue;
		}
		if (!info.primary) {
			logger.warn(`Collection "${collection}" doesn't have a primary key column and will be ignored`);
			continue;
		}
		if (collection.includes(" ")) {
			logger.warn(`Collection "${collection}" has a space in the name and will be ignored`);
			continue;
		}
		const collectionMeta = collections.find((collectionMeta$1) => collectionMeta$1.collection === collection);
		const status = !isSystemCollection(collection) && collectionMeta && "status" in collectionMeta ? collectionMeta.status : "active";
		result.collections[collection] = {
			collection,
			primary: info.primary,
			singleton: toBoolean(collectionMeta?.singleton),
			note: collectionMeta?.note || null,
			sortField: collectionMeta?.sort_field || null,
			accountability: collectionMeta ? collectionMeta.accountability : "all",
			status,
			fields: mapValues(schemaOverview[collection]?.columns, (column) => {
				return {
					field: column.column_name,
					defaultValue: getDefaultValue(column) ?? null,
					nullable: column.is_nullable ?? true,
					generated: column.is_generated ?? false,
					type: getLocalType(column),
					dbType: column.data_type,
					precision: column.numeric_precision || null,
					scale: column.numeric_scale || null,
					special: [],
					note: null,
					validation: null,
					alias: false,
					searchable: true
				};
			})
		};
	}
	const fields = [...await database.select("id", "collection", "field", "special", "note", "validation", "searchable").from("directus_fields"), ...systemFieldRows$1].filter((field) => (field.special ? toArray(field.special) : []).includes("no-data") === false);
	for (const field of fields) {
		if (!result.collections[field.collection]) continue;
		const existing = result.collections[field.collection]?.fields[field.field];
		const column = schemaOverview[field.collection]?.columns[field.field];
		const special = field.special ? toArray(field.special) : [];
		if (ALIAS_TYPES.some((type$1) => special.includes(type$1)) === false && !existing) continue;
		const type = existing && getLocalType(column, { special }) || "alias";
		let validation = field.validation ?? null;
		if (validation && typeof validation === "string") validation = parseJSON(validation);
		result.collections[field.collection].fields[field.field] = {
			field: field.field,
			defaultValue: existing?.defaultValue ?? null,
			nullable: existing?.nullable ?? true,
			generated: existing?.generated ?? false,
			type,
			dbType: existing?.dbType || null,
			precision: existing?.precision || null,
			scale: existing?.scale || null,
			special,
			note: field.note,
			alias: existing?.alias ?? true,
			validation: validation ?? null,
			searchable: toBoolean(field.searchable) ?? true
		};
	}
	result.relations = await new RelationsService({
		knex: database,
		schema: result
	}).readAll(void 0, void 0, true);
	return result;
}

//#endregion
export { getSchema };