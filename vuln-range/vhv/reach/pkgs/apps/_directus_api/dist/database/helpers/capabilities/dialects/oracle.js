import { CapabilitiesHelper } from "../types.js";

//#region src/database/helpers/capabilities/dialects/oracle.ts
var CapabilitiesHelperOracle = class extends CapabilitiesHelper {
	getMaxBindings() {
		return 1e3;
	}
};

//#endregion
export { CapabilitiesHelperOracle };