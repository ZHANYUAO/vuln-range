import { isAdmin } from "../../../utils/is-admin.js";
import { createCollectionForbiddenError } from "../process-ast/utils/validate-path/create-error.js";
import { getCollectionFromSchema } from "../../../utils/schema/get-collection-from-schema.js";
import { validateCollectionAccess } from "../validate-access/lib/validate-collection-access.js";
import { CollectionInactiveError } from "@directus/errors";
import { isCollectionActive } from "@directus/utils";

//#region src/permissions/modules/assert-collection-active/assert-collection-active.ts
/**
* Check whether the given collection is active, and throw if it isn't.
*/
async function assertCollectionActive(options, context) {
	const { accountability, collection, action } = options;
	if (isCollectionActive(getCollectionFromSchema(context.schema, collection))) return;
	if (isAdmin(accountability) === false) {
		if (!await validateCollectionAccess({
			accountability,
			collection,
			action
		}, context)) throw createCollectionForbiddenError("", collection);
	}
	throw new CollectionInactiveError({ collection });
}

//#endregion
export { assertCollectionActive };