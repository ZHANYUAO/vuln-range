import { useLogger } from "../logger/index.js";
import { clearCache } from "../permissions/cache.js";
import { runExclusive } from "../utils/run-exclusive.js";
import { getSchema } from "../utils/get-schema.js";
import { getActiveCollections } from "./entitlements/lib/collections.js";
import { getActiveFlows } from "./entitlements/lib/flows.js";
import { getActiveSeats } from "./entitlements/lib/seats.js";
import { EntitlementManager, getEntitlementManager } from "./entitlements/manager.js";
import { scheduleSynchronizedJob } from "../utils/schedule.js";
import { SettingsService } from "../services/settings.js";
import { UsersService } from "../services/users.js";
import { useStore } from "../utils/store.js";
import "../services/index.js";
import { computeLicenseAction } from "./utils/compute-license-action.js";
import { computeLicenseStatus } from "./utils/compute-license-status.js";
import { durationToCron } from "./utils/duration-to-cron.js";
import { isActivationMissing, toReason, translateLicenseError } from "./utils/errors.js";
import { getLicenseKey } from "./utils/get-license-key.js";
import { getLicenseToken } from "./utils/get-license-token.js";
import { useRPC } from "./utils/use-rpc.js";
import { useEnv } from "@directus/env";
import { ForbiddenError, InvalidPayloadError } from "@directus/errors";
import { toBoolean } from "@directus/utils";
import { COUNTABLE_ENTITLEMENT_KEYS, DIRECTUS_CORE_LICENSE, ResolveInput, activateKey, billingPortal, deactivateKey, deleteAddon, isLicenseInactive, isLicenseServerError, previewKey, readAddons, refreshLicense, updateAddonQuantity, updateKey, verifyLicense } from "@directus/license";

//#region src/license/manager.ts
const env = useEnv();
const logger = useLogger();
const LICENSE_CHANNEL = `license`;
/** Seconds between retries while a key is set but no license is in effect */
const RETRY_INTERVAL = 3600;
/** Seconds between checks when the license has no validation interval, e.g. an offline token */
const DEFAULT_CHECK_INTERVAL = 43200;
let licenseCache = DIRECTUS_CORE_LICENSE;
let licenseManager;
function getLicenseManager() {
	if (licenseManager) return licenseManager;
	licenseManager = new LicenseManager();
	return licenseManager;
}
var LicenseManager = class {
	licenseKey = null;
	licenseToken = null;
	/** Where the key or token comes from */
	source = null;
	/** Ignores remote syncs while initializing */
	initializing = false;
	rpc = null;
	store = useStore(String(env["LICENSE_NAMESPACE"]));
	/** Scheduled license check */
	check = null;
	/** Load license state from env and the database */
	async initialize() {
		this.initializing = true;
		this.rpc ??= await useRPC(this, LICENSE_CHANNEL);
		getEntitlementManager();
		const { leader } = await runExclusive("license-reconcile", () => this.reconcile()).finally(() => {
			this.initializing = false;
		});
		if (!leader) await this.syncState();
	}
	/** Run the license action for the current key and token */
	async reconcile() {
		const envKey = env["LICENSE_KEY"];
		const envToken = env["LICENSE_TOKEN"];
		const { license_key: dbKey, license_token: dbToken } = await new SettingsService({ schema: await getSchema() }).readSingleton({ fields: ["license_key", "license_token"] });
		await this.executeLicenseAction(computeLicenseAction({
			envKey,
			envToken,
			dbKey,
			dbToken
		}));
	}
	/** Schedule the license check, stopping it when there is nothing to check */
	async scheduleCheck() {
		const { project_id } = await new SettingsService({ schema: await getSchema() }).readSingleton({ fields: ["project_id"] });
		const interval = this.getCheckInterval();
		const cron = interval === null ? null : durationToCron(interval, String(project_id));
		if (this.check && this.check.cron === cron) return;
		logger.debug(cron === null ? "License check stopped" : `License check scheduled (${cron})`);
		const previous = this.check;
		this.check = {
			cron,
			job: cron === null ? null : this.startCheck(cron)
		};
		await previous?.job?.stop();
	}
	/** Start the check job */
	startCheck(cron) {
		return scheduleSynchronizedJob("license-check", cron, async () => {
			logger.debug("Running license check");
			try {
				await runExclusive("license-reconcile", async () => {
					try {
						await this.reconcile();
					} catch (error) {
						logger.error(error, "License check failed");
					}
				});
			} catch (error) {
				logger.error(error, "License check could not run");
			}
		});
	}
	/** The check interval in seconds */
	getCheckInterval() {
		if (!this.licenseKey && !this.licenseToken) return null;
		if (this.source === null && this.licenseKey) return RETRY_INTERVAL;
		const validationInterval = licenseCache.meta.validation_interval;
		return validationInterval > 0 ? validationInterval : DEFAULT_CHECK_INTERVAL;
	}
	/** Run a license action, bypassing management guards */
	async executeLicenseAction(action) {
		if (action.kind === "fatal") {
			logger.fatal(action.message);
			throw new Error(action.message);
		}
		logger.debug(`License action: ${action.kind}`);
		if (action.kind === "clear-token") {
			await this.syncLicense({
				kind: "clear-token",
				invalidReason: null
			});
			return;
		}
		try {
			switch (action.kind) {
				case "activate":
					await this.applyActivation(action.key);
					break;
				case "update":
					await this.applyUpdate(action.currentKey, action.key);
					break;
				case "refresh":
					await this.refresh({
						key: action.key,
						token: action.token
					});
					break;
				case "sync":
					await this.syncLicense({ invalidReason: null });
					break;
			}
		} catch (error) {
			if (action.kind === "sync") throw error;
			await this.syncLicense({ invalidReason: isLicenseServerError(error) ? toReason(error) : void 0 });
			const message = this.source === null ? "License request failed, running on core tier" : "License request failed, continuing with the current license";
			logger.warn(error, message);
		}
	}
	getEditable() {
		if (env["LICENSE_KEY"] || env["LICENSE_TOKEN"]) return false;
		return toBoolean(env["LICENSE_KEY_MANAGEMENT_ENABLED"]);
	}
	async getLicense() {
		return licenseCache;
	}
	async getStatus() {
		return computeLicenseStatus(this.source === null ? null : await this.getLicense());
	}
	async getInvalidReason() {
		return await this.store(async (store) => store.get("invalidReason")).catch((error) => {
			logger.warn(error, "Could not read the license invalid reason");
			return null;
		}) ?? null;
	}
	getSource() {
		return this.source;
	}
	/** Throw unless the license is editable */
	assertCanManageLicense() {
		if (this.getEditable() === false) throw new ForbiddenError({ reason: `You cannot manage license for the current license.` });
	}
	/**
	* Throw without a key to update or deactivate
	*/
	assertLicenseExists() {
		if (this.licenseKey === null) throw new ForbiddenError({ reason: `There is no active license to manage.` });
	}
	/** Throw for core and offline licenses, which don't support addons */
	assertCanManageAddons() {
		if (this.source === null || this.licenseKey === null) throw new ForbiddenError({ reason: `You cannot manage addons for the current license.` });
	}
	async isLocked() {
		return await this.getStatus() === "locked";
	}
	/** Preview a key's license without activating it */
	async preview(key) {
		try {
			return await previewKey({ license_key: key });
		} catch (error) {
			throw translateLicenseError(error);
		}
	}
	/** Activate a key */
	async activate(key) {
		this.assertCanManageLicense();
		try {
			if (!this.licenseKey) {
				await this.applyActivation(key);
				return;
			}
			await this.applyUpdate(this.licenseKey, key);
		} catch (error) {
			throw translateLicenseError(error);
		}
	}
	/** Activate without guards */
	async applyActivation(key) {
		const settingsService = new SettingsService({ schema: await getSchema() });
		const { project_id } = await settingsService.readSingleton({ fields: ["project_id"] });
		const { token, new_project_id } = await activateKey({
			license_key: key,
			project_id,
			public_url: env["PUBLIC_URL"]
		});
		await settingsService.upsertSingleton({
			license_key: key,
			license_token: token,
			project_id: new_project_id ?? project_id
		});
		if (new_project_id) logger.info(`License activated, project ID changed to "${new_project_id}"`);
		await this.syncLicense({ invalidReason: null });
	}
	async deactivate() {
		this.assertCanManageLicense();
		this.assertLicenseExists();
		const { project_id } = await new SettingsService({ schema: await getSchema() }).readSingleton({ fields: ["project_id"] });
		try {
			await deactivateKey({
				license_key: this.licenseKey,
				project_id,
				public_url: env["PUBLIC_URL"]
			});
		} catch (error) {
			if (!isActivationMissing(error)) throw translateLicenseError(error);
			logger.warn(error, "Deactivating the stored license key failed, removing it locally");
		}
		logger.info("License deactivated, running on core tier");
		await this.syncLicense({
			kind: "downgrade",
			invalidReason: null
		});
	}
	/** Replace the current key with a new one */
	async update(newKey) {
		this.assertCanManageLicense();
		this.assertLicenseExists();
		try {
			await this.applyUpdate(this.licenseKey, newKey);
		} catch (error) {
			throw translateLicenseError(error);
		}
	}
	/** Update without guards, activating the new key when the current one has no activation */
	async applyUpdate(currentKey, newKey) {
		const settingsService = new SettingsService({ schema: await getSchema() });
		const { project_id } = await settingsService.readSingleton({ fields: ["project_id"] });
		let token;
		try {
			token = (await updateKey({
				license_key: currentKey,
				project_id,
				public_url: env["PUBLIC_URL"]
			}, { license_key: newKey })).token;
		} catch (error) {
			if (!isActivationMissing(error)) throw error;
			logger.warn(error, "Updating from the stored license key failed, activating the new key");
			return this.applyActivation(newKey);
		}
		await settingsService.upsertSingleton({
			license_key: newKey,
			license_token: token,
			project_id
		});
		await this.syncLicense({ invalidReason: null });
	}
	async verify(token) {
		try {
			const license = await verifyLicense(token);
			if (license.audience !== "directus") {
				logger.warn(`License token is for "${license.audience}", not directus`);
				return null;
			}
			return license;
		} catch (error) {
			logger.debug(error, "License token could not be verified");
			return null;
		}
	}
	/**
	* Verify the token and renew it with the license server.
	* Only a terminated license (canceled, suspended) clears the token.
	*/
	async refresh(options) {
		const key = options?.key ?? this.licenseKey;
		const token = options?.token ?? this.licenseToken;
		let license = null;
		let syncLicenseState = { invalidReason: null };
		if (token) {
			license = await this.verify(token);
			if (!license) syncLicenseState.invalidReason = "verification";
		}
		if (license?.meta.offline === false || key) {
			if (!key) throw new InvalidPayloadError({ reason: "A \"key\" is required" });
			const entitlementManager = getEntitlementManager();
			const settingsService = new SettingsService({ schema: await getSchema() });
			const { project_id } = await settingsService.readSingleton({ fields: ["project_id"] });
			const usage_metrics = {
				seats: await entitlementManager.getUsage("seats"),
				collections: await entitlementManager.getUsage("collections"),
				flows: await entitlementManager.getUsage("flows")
			};
			let renewedToken = null;
			try {
				renewedToken = (await refreshLicense({
					license_key: key,
					project_id,
					public_url: env["PUBLIC_URL"]
				}, { usage_metrics })).token;
			} catch (error) {
				logger.warn(error, "License refresh failed");
				const reason = toReason(error);
				syncLicenseState = {
					kind: isLicenseInactive(reason) ? "clear-token" : void 0,
					invalidReason: reason
				};
			}
			if (renewedToken) {
				await settingsService.upsertSingleton({ license_token: renewedToken });
				logger.debug("License refreshed");
				syncLicenseState = { invalidReason: null };
			}
		}
		await this.syncLicense(syncLicenseState);
	}
	async billingPortalUrl() {
		this.assertCanManageAddons();
		const { project_id } = await new SettingsService({ schema: await getSchema() }).readSingleton({ fields: ["project_id"] });
		try {
			const { url } = await billingPortal({
				license_key: this.licenseKey,
				project_id,
				public_url: env["PUBLIC_URL"]
			});
			return url;
		} catch (error) {
			throw translateLicenseError(error);
		}
	}
	async availableAddons() {
		this.assertCanManageAddons();
		const { project_id } = await new SettingsService({ schema: await getSchema() }).readSingleton({ fields: ["project_id"] });
		try {
			return (await readAddons({
				license_key: this.licenseKey,
				project_id,
				public_url: env["PUBLIC_URL"]
			})).available_addons.map((addon) => ({
				id: addon.id,
				name: addon.name,
				description: addon.description,
				icon: addon.icon,
				unit_price: addon.unit_price,
				billing_interval: addon.billing_interval,
				upgrade_required: addon.upgrade_required,
				pricing_summary: addon.pricing_summary,
				min_quantity: addon.min_quantity,
				max_quantity: addon.max_quantity,
				active_quantity: addon.active_quantity,
				scheduled_quantity: addon.scheduled_quantity
			}));
		} catch (error) {
			throw translateLicenseError(error);
		}
	}
	async setAddonQuantity(options) {
		this.assertCanManageAddons();
		const settingsService = new SettingsService({ schema: await getSchema() });
		const { project_id } = await settingsService.readSingleton({ fields: ["project_id"] });
		const entitlementManager = getEntitlementManager();
		let refreshedToken;
		try {
			refreshedToken = (await updateAddonQuantity({
				license_key: this.licenseKey,
				project_id,
				public_url: env["PUBLIC_URL"]
			}, {
				addons: [{
					addon_id: options.addonId,
					quantity: options.quantity
				}],
				usage_metrics: {
					seats: await entitlementManager.getUsage("seats"),
					collections: await entitlementManager.getUsage("collections"),
					flows: await entitlementManager.getUsage("flows")
				}
			})).token;
		} catch (error) {
			throw translateLicenseError(error);
		}
		await settingsService.upsertSingleton({ license_token: refreshedToken });
		await this.syncLicense({ invalidReason: null });
	}
	async removeAddon(addonId) {
		this.assertCanManageAddons();
		const { project_id } = await new SettingsService({ schema: await getSchema() }).readSingleton({ fields: ["project_id"] });
		try {
			await deleteAddon({
				license_key: this.licenseKey,
				project_id,
				public_url: env["PUBLIC_URL"]
			}, { addon_ids: [addonId] });
		} catch (error) {
			throw translateLicenseError(error);
		}
	}
	/** Entitlements that need resolving, empty when none */
	async pendingResolution(options) {
		const schema = await getSchema();
		const pendingResolution = [];
		let entitlements;
		/**
		* Resolve against
		*  - a key: that key's license, when changing tier
		*  - `null`: the core license
		*  - omitted: the current license
		*/
		if (options.licenseKey) entitlements = (await this.preview(options.licenseKey)).entitlements;
		else if (options.licenseKey === null) entitlements = null;
		else entitlements = (await this.getLicense()).entitlements;
		const entitlementManager = new EntitlementManager();
		entitlementManager.setEntitlements(entitlements);
		const candidateGetters = {
			seats: getActiveSeats,
			collections: getActiveCollections,
			flows: getActiveFlows
		};
		for (const check of COUNTABLE_ENTITLEMENT_KEYS) {
			const resolution = await entitlementManager.check(check);
			if (resolution.allowed === false) {
				const candidates = await candidateGetters[check]({ adminId: options.adminId });
				pendingResolution.push({
					key: check,
					kind: "limit",
					limit: resolution.hardLimit,
					usage: resolution.usage,
					candidates
				});
			}
		}
		if ((await entitlementManager.check("sso_enabled")).valid === false) {
			const adminUser = await new UsersService({ schema }).readOne(options.adminId, { fields: ["email", "password"] });
			const blockers = [];
			if (adminUser["email"] === null) blockers.push("ADMIN_MISSING_EMAIL");
			if (adminUser["password"] === null) blockers.push("ADMIN_MISSING_PASSWORD");
			pendingResolution.push({
				key: "sso_enabled",
				kind: "feature_gate",
				blockers
			});
		}
		if ((await entitlementManager.check("custom_llms_enabled")).valid === false) pendingResolution.push({
			key: "custom_llms_enabled",
			kind: "feature_gate"
		});
		if ((await entitlementManager.check("custom_permission_rules_enabled")).valid === false) pendingResolution.push({
			key: "custom_permission_rules_enabled",
			kind: "feature_gate"
		});
		return pendingResolution;
	}
	/** Apply a resolution, which may be partial */
	async applyResolution(resolution, ctx) {
		const entitlementManager = getEntitlementManager();
		const cachesToClear = [];
		if (resolution.collections && resolution.collections.length > 0) {
			await entitlementManager.resolve("collections", resolution.collections, { accountability: ctx?.accountability });
			cachesToClear.push("collections");
		}
		if (resolution.seats && resolution.seats.length > 0) {
			await entitlementManager.resolve("seats", resolution.seats, { accountability: ctx?.accountability });
			cachesToClear.push("seats");
		}
		if (resolution.flows && resolution.flows.length > 0) {
			await entitlementManager.resolve("flows", resolution.flows, { accountability: ctx?.accountability });
			cachesToClear.push("flows");
		}
		if (resolution.sso_enabled) {
			await entitlementManager.resolve("sso_enabled", resolution.sso_enabled, { accountability: ctx?.accountability });
			if (!cachesToClear.includes("seats")) cachesToClear.push("seats");
			cachesToClear.push("sso_enabled");
		}
		if (cachesToClear.length > 0) await entitlementManager.clearCache(...cachesToClear);
		if (await entitlementManager.checkAll()) await this.setInvalidReason(null);
	}
	/** Apply a license change and propagate it to all instances */
	async syncLicense(options) {
		if (options?.invalidReason !== void 0) await this.setInvalidReason(options.invalidReason);
		if (options?.kind === "downgrade") await new SettingsService({ schema: await getSchema() }).upsertSingleton({
			license_key: null,
			license_token: null
		});
		else if (options?.kind === "clear-token") {
			await new SettingsService({ schema: await getSchema() }).upsertSingleton({ license_token: null });
			logger.warn("Removed the stored license token, running on core tier");
		}
		await clearCache();
		await this.syncState({ local: true });
		await this.rpc?.syncState().catch((error) => {
			logger.warn(error, "Could not broadcast the license change");
		});
	}
	/** Record or clear the invalid reason */
	async setInvalidReason(reason) {
		try {
			await this.store(async (store) => {
				if (reason) await store.set("invalidReason", reason);
				else await store.delete("invalidReason");
			});
		} catch (error) {
			logger.warn(error, reason ? `Could not record the license invalid reason "${reason}"` : "Could not clear the license invalid reason");
		}
	}
	/**
	* Re-resolve state from env and the database.
	* Each instance derives its own, so the RPC only signals a change.
	*
	* @param options.local Whether the change was made on this instance
	*/
	async syncState(options) {
		if (this.initializing && !options?.local) return;
		const { source: keySource, key } = await getLicenseKey();
		const { source: tokenSource, token } = await getLicenseToken();
		this.licenseKey = key;
		this.licenseToken = token;
		let license = null;
		if (token) {
			license = await this.verify(token);
			if (license === null) logger.warn("The stored license token could not be verified, downgrading to core tier");
		}
		this.source = license ? keySource ?? tokenSource : null;
		licenseCache = license ?? DIRECTUS_CORE_LICENSE;
		getEntitlementManager().setEntitlements(licenseCache.entitlements);
		if (this.check) try {
			await this.scheduleCheck();
		} catch (error) {
			logger.warn(error, "Could not reschedule the license check");
		}
	}
};

//#endregion
export { LicenseManager, getLicenseManager };