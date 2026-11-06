import { UserIntegrityCheckFlag } from "../packages/types/dist/index.js";
import { clearCache } from "../permissions/cache.js";
import { clearSystemCache } from "../cache.js";
import { ItemsService } from "./items.js";
import { InvalidPayloadError } from "@directus/errors";
import { IpBlocklist } from "@directus/utils/node";

//#region src/services/policies.ts
function isIpAccessValid(value) {
	if (value === null) return true;
	if (!Array.isArray(value)) return false;
	return value.every((ip) => typeof ip === "string" && !ip.includes("*") && IpBlocklist.isNetwork(ip.trim()));
}
var PoliciesService = class extends ItemsService {
	constructor(options) {
		super("directus_policies", options);
	}
	async clearCaches(opts) {
		await clearSystemCache({
			autoPurgeCache: opts?.autoPurgeCache,
			autoPurgeSchema: false
		});
		if (this.cache && opts?.autoPurgeCache !== false) await this.cache.clear();
	}
	assertValidIpAccess(partialItem) {
		if ("ip_access" in partialItem && !isIpAccessValid(partialItem["ip_access"])) throw new InvalidPayloadError({ reason: "IP Access contains an incorrect value. Valid values are: IP addresses, IP ranges and CIDR blocks" });
	}
	async createOne(data, opts = {}) {
		this.assertValidIpAccess(data);
		const result = await super.createOne(data, opts);
		await clearCache();
		return result;
	}
	async updateMany(keys, data, opts = {}) {
		this.assertValidIpAccess(data);
		if ("admin_access" in data) {
			let flags = UserIntegrityCheckFlag.RemainingAdmins;
			if (data["admin_access"] === true) flags |= UserIntegrityCheckFlag.All;
			opts.userIntegrityCheckFlags = (opts.userIntegrityCheckFlags ?? UserIntegrityCheckFlag.None) | flags;
		}
		if ("app_access" in data) opts.userIntegrityCheckFlags = (opts.userIntegrityCheckFlags ?? UserIntegrityCheckFlag.None) | UserIntegrityCheckFlag.UserLimits;
		if (opts.userIntegrityCheckFlags) opts.onRequireUserIntegrityCheck?.(opts.userIntegrityCheckFlags);
		const result = await super.updateMany(keys, data, opts);
		if ("admin_access" in data || "app_access" in data || "ip_access" in data || "enforce_tfa" in data) await this.clearCaches(opts);
		return result;
	}
	async deleteMany(keys, opts = {}) {
		opts.userIntegrityCheckFlags = UserIntegrityCheckFlag.All;
		opts.onRequireUserIntegrityCheck?.(opts.userIntegrityCheckFlags);
		const result = await super.deleteMany(keys, opts);
		await this.clearCaches(opts);
		return result;
	}
};

//#endregion
export { PoliciesService, isIpAccessValid };