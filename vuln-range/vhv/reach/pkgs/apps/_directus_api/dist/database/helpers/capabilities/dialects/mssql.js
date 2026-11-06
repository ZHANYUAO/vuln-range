import { CapabilitiesHelper } from "../types.js";

//#region src/database/helpers/capabilities/dialects/mssql.ts
var CapabilitiesHelperMSSQL = class extends CapabilitiesHelper {
	getMaxBindings() {
		return 2098;
	}
};

//#endregion
export { CapabilitiesHelperMSSQL };