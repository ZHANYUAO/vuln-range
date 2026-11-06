import { Url } from "./url.js";
import { parseRequestUrl } from "./parse-request-url.js";
import { useEnv } from "@directus/env";
import { getEndpoint } from "@directus/utils";

//#region src/utils/should-skip-cache.ts
/**
* Whether to skip caching for the current request
*
* @param req Express request object
*/
function shouldSkipCache(req) {
	const env = useEnv();
	const referer = req.get("Referer");
	if (referer) {
		const adminUrl = new Url(env["PUBLIC_URL"]).addPath("admin");
		if (adminUrl.isRootRelative()) {
			if (new Url(referer).path.join("/").startsWith(adminUrl.path.join("/")) && checkAutoPurge()) return true;
		} else if (referer.startsWith(adminUrl.toString()) && checkAutoPurge()) return true;
	}
	if (env["CACHE_SKIP_ALLOWED"] && req.get("cache-control")?.includes("no-store")) return true;
	return false;
	function checkAutoPurge() {
		if (env["CACHE_AUTO_PURGE"] === false) return true;
		const path = parseRequestUrl(req.originalUrl).pathname;
		for (const collection of env["CACHE_AUTO_PURGE_IGNORE_LIST"]) {
			const ignoredPath = getEndpoint(collection);
			if (path.startsWith(ignoredPath)) return true;
		}
		return false;
	}
}

//#endregion
export { shouldSkipCache };