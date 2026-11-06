import { createCollectionForbiddenError } from "../../permissions/modules/process-ast/utils/validate-path/create-error.js";

//#region src/utils/schema/get-collection-from-schema.ts
/**
* Returns a collection from the schema and errors if it does not exist
*/
function getCollectionFromSchema(schema, collection, options) {
	const collectionName = collection ?? "";
	if (schema.collections[collectionName]) return schema.collections[collectionName];
	throw createCollectionForbiddenError(options?.field ?? "", collectionName);
}

//#endregion
export { getCollectionFromSchema };