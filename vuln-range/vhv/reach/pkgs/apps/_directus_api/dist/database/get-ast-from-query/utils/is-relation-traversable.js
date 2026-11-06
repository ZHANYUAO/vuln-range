import { getRelationInfo, isCollectionActive } from "@directus/utils";

//#region src/database/get-ast-from-query/utils/is-relation-traversable.ts
/**
* Whether a relational field can be followed into its related collection.
*/
function isRelationTraversable(schema, collection, field, knownRelation) {
	const relationInfo = getRelationInfo(knownRelation ? [knownRelation] : schema.relations, collection, field);
	const relation = relationInfo.relation;
	if (!relation) return false;
	if (relation.meta?.one_allowed_collections) return relation.meta.one_allowed_collections.some((allowed) => isCollectionActive(schema.collections[allowed]));
	const relatedCollection = relationInfo.oppositeCollection;
	return relatedCollection !== null && isCollectionActive(schema.collections[relatedCollection]);
}

//#endregion
export { isRelationTraversable };