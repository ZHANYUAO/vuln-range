import { CapabilitiesHelper } from "../types.js";

//#region src/database/helpers/capabilities/dialects/sqlite.ts
var CapabilitiesHelperSQLite = class extends CapabilitiesHelper {
	getMaxBindings() {
		return 32766;
	}
};

//#endregion
export { CapabilitiesHelperSQLite };