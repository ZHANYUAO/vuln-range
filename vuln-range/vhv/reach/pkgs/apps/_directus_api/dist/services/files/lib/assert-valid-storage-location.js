import { useEnv } from "@directus/env";
import { InvalidPayloadError } from "@directus/errors";
import { toArray } from "@directus/utils";

//#region src/services/files/lib/assert-valid-storage-location.ts
/**
* Reject storage locations that aren't configured, as none of the path checks apply to them.
* Location names are case-sensitive
*
* @throws InvalidPayloadError
*
*/
function assertValidStorageLocation(storage) {
	const locations = toArray(useEnv()["STORAGE_LOCATIONS"]).map((location) => location.trim());
	if (typeof storage !== "string" || locations.includes(storage) === false) throw new InvalidPayloadError({ reason: `Storage location "${storage}" doesn't exist` });
}

//#endregion
export { assertValidStorageLocation };