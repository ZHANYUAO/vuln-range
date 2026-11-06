import { getEntitlementManager } from "../entitlements/manager.js";
import { isInCoreGracePeriod } from "./is-in-core-grace-period.js";
import "../index.js";

//#region src/license/utils/compute-license-status.ts
/**
* Compute the operational license status
*
* | license | withinLimits | coreGrace |      expires     | Outcome                                       | id |
* | ------- | ------------ | --------- | ---------------- | --------------------------------------------- | -- |
* |    n    |      n       |     y     |        -         | grace - core upgrade grace bypasses limits    | A  |
* |    n    |      n       |     n     |        -         | locked - core over limits                     | B  |
* |    n    |      y       |     *     |        -         | active - core within limits                   | C  |
* |    y    |      n       |     -     |        *         | locked - over entitlement limits              | D  |
* |    y    |      y       |     -     | none or future   | active - license not expired                  | E  |
* |    y    |      y       |     -     | past, in grace   | grace - expired but within license grace      | F  |
* |    y    |      y       |     -     | past grace       | active - awaiting the manager's downgrade     | G  |
*
* `expiry` is `expires_at`, falling back to `renews_at`. A grace period of -1 never ends.
*/
async function computeLicenseStatus(license) {
	const isWithinLimits = await getEntitlementManager().fork(license?.entitlements ?? null).checkAll();
	if (!license) {
		if (isWithinLimits === false) {
			if (await isInCoreGracePeriod()) return "grace";
			return "locked";
		}
		return "active";
	}
	if (isWithinLimits === false) return "locked";
	const now = Math.floor(Date.now() / 1e3);
	const expires = license.meta.expires_at ?? license.meta.renews_at ?? -1;
	const grace = license.meta.grace_period;
	if (expires === -1 || now < expires) return "active";
	if (grace === -1 || grace + expires > now) return "grace";
	return "active";
}

//#endregion
export { computeLicenseStatus };