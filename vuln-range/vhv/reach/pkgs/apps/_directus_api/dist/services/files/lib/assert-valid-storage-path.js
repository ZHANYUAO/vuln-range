import { getExtensionsPath } from "../../../extensions/lib/get-extensions-path.js";
import { assertValidStorageLocation } from "./assert-valid-storage-location.js";
import { isWithinPath } from "../../../utils/is-within-path.js";
import { sanitizeFilepath } from "./sanitize-filepath.js";
import { useEnv } from "@directus/env";
import { ForbiddenError } from "@directus/errors";
import { toArray } from "@directus/utils";
import path from "node:path";

//#region src/services/files/lib/assert-valid-storage-path.ts
/**
* Reject storage filepaths that write to "forbidden" locations
*
* @throws ForbiddenError
* @throws InvalidPayloadError when the storage location doesn't exist
*
*/
function assertValidStoragePath(filepath, storage) {
	const env = useEnv();
	const location = storage || toArray(env["STORAGE_LOCATIONS"])[0].trim();
	assertValidStorageLocation(location);
	const getEnv = (name) => env[name] ?? "";
	const normalizedFilePath = sanitizeFilepath(filepath);
	const extensionsLocation = getEnv("EXTENSIONS_LOCATION").trim();
	if (extensionsLocation && extensionsLocation.toUpperCase() === location.toUpperCase()) {
		if (isWithinPath(normalizedFilePath, sanitizeFilepath(getEnv("EXTENSIONS_PATH")))) throw new ForbiddenError();
	}
	const storageDriver = getEnv(`STORAGE_${location.toUpperCase()}_DRIVER`);
	const storageRoot = getEnv(`STORAGE_${location.toUpperCase()}_ROOT`);
	if (storageDriver === "local") {
		const filePath = path.resolve(storageRoot, normalizedFilePath);
		for (const blockedPath of getBlockedPaths()) if (isWithinPath(filePath, blockedPath)) throw new ForbiddenError();
	}
}
/**
* Get the local file paths that Directus uploads should be prevented from uploading to
*/
function getBlockedPaths() {
	const env = useEnv();
	const packageFileLocation = env["PACKAGE_FILE_LOCATION"];
	const packagePaths = [path.resolve("node_modules")];
	if (typeof packageFileLocation === "string") {
		packagePaths.push(path.join(packageFileLocation, "package.json"));
		packagePaths.push(path.join(packageFileLocation, "node_modules"));
	}
	const sqlitePaths = [];
	if (env["DB_CLIENT"] === "sqlite3" && typeof env["DB_FILENAME"] === "string") for (const suffix of [
		"",
		"-journal",
		"-wal",
		"-shm"
	]) sqlitePaths.push(env["DB_FILENAME"] + suffix);
	return [
		getExtensionsPath(),
		env["TEMP_PATH"],
		env["MIGRATIONS_PATH"],
		env["EMAIL_TEMPLATES_PATH"],
		env["CONFIG_PATH"],
		...packagePaths,
		...sqlitePaths
	].filter((blockedPath) => typeof blockedPath === "string");
}

//#endregion
export { assertValidStoragePath };