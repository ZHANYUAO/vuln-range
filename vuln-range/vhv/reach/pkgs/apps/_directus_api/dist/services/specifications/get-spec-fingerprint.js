import { version } from "directus/version";

//#region src/services/specifications/get-spec-fingerprint.ts
/**
* Builds a deterministic representation of the inputs that affect OpenAPI generation.
*
* Keep this in sync with the inputs consumed by generateTags, generatePaths,
* generateComponents, and generateField. Changes to any generator input that can
* affect the resulting spec should also be reflected here.
*
* @param schema The permission-filtered schema available to the current user.
* @param permissions The current user's permissions, including actions for readable collections.
* @param tags The generated OpenAPI tags, including system tags used to represent auth level.
*
* @returns A deterministic string suitable for hashing as the spec fingerprint.
*/
function getSpecFingerprint(schema, permissions, tags = []) {
	const collections = Object.keys(schema.collections).sort().map((name) => {
		const collection = schema.collections[name];
		const fields = Object.keys(collection.fields).sort().map((key) => {
			const field = collection.fields[key];
			return [
				field.field,
				field.type,
				field.nullable,
				field.note,
				field.defaultValue,
				field.generated
			];
		});
		return [
			collection.collection,
			collection.note,
			collection.singleton,
			collection.primary,
			fields
		];
	});
	const relations = schema.relations.map((relation) => [
		relation.collection,
		relation.field,
		relation.related_collection,
		relation.meta?.one_field,
		relation.meta?.one_collection_field,
		relation.meta?.one_allowed_collections
	]).sort(([collectionA, fieldA], [collectionB, fieldB]) => {
		if (collectionA !== collectionB) return collectionA < collectionB ? -1 : 1;
		if (fieldA !== fieldB) return fieldA < fieldB ? -1 : 1;
		return 0;
	});
	const actions = [...new Set(permissions.filter(({ collection }) => collection in schema.collections).map(({ collection, action }) => `${collection}:${action}`))].sort();
	const systemTags = tags.filter((tag) => !tag["x-collection"]).map((tag) => tag.name).sort();
	return JSON.stringify([
		version,
		systemTags,
		collections,
		relations,
		actions
	]);
}

//#endregion
export { getSpecFingerprint };