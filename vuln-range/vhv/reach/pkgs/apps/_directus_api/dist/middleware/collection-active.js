import async_handler_default from "../utils/async-handler.js";
import database_default from "../database/index.js";
import { assertCollectionActive } from "../permissions/modules/assert-collection-active/assert-collection-active.js";
import { createDefaultAccountability } from "../permissions/utils/create-default-accountability.js";

//#region src/middleware/collection-active.ts
/**
* Check if requested collection is active
*/
const collectionActive = (action) => async_handler_default(async (req, _res, next) => {
	if (!req.params["collection"]) return next();
	await assertCollectionActive({
		accountability: req.accountability ?? createDefaultAccountability(),
		collection: req.params["collection"],
		action: action ?? mapMethod(req.method)
	}, {
		schema: req.schema,
		knex: database_default()
	});
	return next();
});
function mapMethod(method) {
	switch (method.toUpperCase()) {
		case "POST": return "create";
		case "PATCH": return "update";
		case "DELETE": return "delete";
		case "GET":
		default: return "read";
	}
}
var collection_active_default = collectionActive;

//#endregion
export { collection_active_default as default };