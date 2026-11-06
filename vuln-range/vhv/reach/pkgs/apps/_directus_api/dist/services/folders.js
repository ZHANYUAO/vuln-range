import { useLogger } from "../logger/index.js";
import { isAdmin } from "../utils/is-admin.js";
import { NameDeduper } from "./assets/name-deduper.js";
import { validateAccess } from "../permissions/modules/validate-access/validate-access.js";
import { transaction } from "../utils/transaction.js";
import { ItemsService } from "./items.js";
import { InvalidPayloadError } from "@directus/errors";
import { mergeFilters } from "@directus/utils";

//#region src/services/folders.ts
const logger = useLogger();
var FoldersService = class extends ItemsService {
	constructor(options) {
		super("directus_folders", options);
	}
	/**
	* Flows folders are admin-only, ensure they cannot be changed
	* */
	async checkFlowsFolders(keys, action) {
		if (keys.length === 0 || isAdmin(this.accountability)) return;
		const folder = await this.knex.select("id").from("directus_folders").whereIn("id", keys).andWhere("type", "flows").first();
		if (folder) {
			logger.debug(`User ${this.accountability?.user} doesn't have permission to modify flows folder ${folder.id}.`);
			throw new InvalidPayloadError({ reason: `Cannot ${action} a flows folder` });
		}
	}
	/**
	* Flow folders are admin only, ensure a flow folder parent cannot be set
	*/
	async checkFlowsParent(parent) {
		if (typeof parent !== "string" || isAdmin(this.accountability)) return;
		const folder = await this.knex.select("id").from("directus_folders").where("id", parent).andWhere("type", "flows").first();
		if (folder) {
			logger.debug(`User ${this.accountability?.user} doesn't have permission to nest a folder under flows folder ${folder.id}.`);
			throw new InvalidPayloadError({ reason: `Cannot nest a folder under a flows folder` });
		}
	}
	async createOne(data, opts = {}) {
		try {
			if (!isAdmin(this.accountability) && data.type === "flows") throw new InvalidPayloadError({ reason: `Cannot create a flows folder` });
			await this.checkFlowsParent(data.parent);
		} catch (err) {
			opts.preMutationError = err;
		}
		return super.createOne(data, opts);
	}
	async updateMany(keys, data, opts = {}) {
		try {
			if (!isAdmin(this.accountability) && data.type === "flows") throw new InvalidPayloadError({ reason: `Cannot change a folder into a flows folder` });
			await this.checkFlowsParent(data.parent);
			await this.checkFlowsFolders(keys, "update");
		} catch (err) {
			opts.preMutationError = err;
		}
		return super.updateMany(keys, data, opts);
	}
	async deleteMany(keys, opts = {}) {
		try {
			await this.checkFlowsFolders(keys, "delete");
		} catch (err) {
			opts.preMutationError = err;
		}
		if (keys.length === 0) return super.deleteMany(keys, opts);
		return transaction(this.knex, async (trx) => {
			/**
			* MSSQL doesn't allow a second SET NULL foreign key from directus_settings to directus_folders,
			* so default_exports_folder has to be cleared manually before the folder can be deleted
			*/
			await trx("directus_settings").update({ default_exports_folder: null }).whereIn("default_exports_folder", keys);
			return new ItemsService("directus_folders", {
				knex: trx,
				accountability: this.accountability,
				schema: this.schema
			}).deleteMany(keys, opts);
		});
	}
	async readByQuery(query, opts) {
		if (!isAdmin(this.accountability)) query = {
			...query,
			filter: mergeFilters(query.filter ?? null, { type: { _neq: "flows" } })
		};
		return super.readByQuery(query, opts);
	}
	/**
	* Builds a permission-aware folder tree starting from the given root folder.
	*
	* Returns a map of folder IDs to their paths relative to the root.
	* Nested folders are included, with duplicate names handled per parent.
	*
	* Limited to file-library folders.
	*
	* @param {string} root - ID of the root folder.
	* @returns {Promise<Map<string, string>>} Map of folder IDs to relative paths.
	*
	* @remarks
	* - Includes the root folder.
	* - Uses the folder ID if a folder has no name.
	*/
	async buildTree(root) {
		if (this.accountability && this.accountability.admin !== true) await validateAccess({
			collection: "directus_folders",
			accountability: this.accountability,
			action: "read",
			primaryKeys: [root]
		}, {
			knex: this.knex,
			schema: this.schema
		});
		const folders = await this.readByQuery({
			filter: { type: { _eq: "files" } },
			fields: [
				"id",
				"parent",
				"name"
			],
			limit: -1
		});
		const folderLookup = /* @__PURE__ */ new Map();
		const childFolderLookup = /* @__PURE__ */ new Map();
		for (const folder of folders) {
			if (!folder["id"]) continue;
			folderLookup.set(folder["id"], folder);
			if (folder["parent"] && folder["id"] !== root) {
				const children = childFolderLookup.get(folder["parent"]) ?? [];
				children.push(folder["id"]);
				childFolderLookup.set(folder["parent"], children);
			}
		}
		const deduper = new NameDeduper();
		const rootName = deduper.add(folderLookup.get(root)?.name, { fallback: root });
		const stack = [[root, ""]];
		const tree = /* @__PURE__ */ new Map();
		while (stack.length > 0) {
			const [folderId, path] = stack.pop() ?? [];
			if (!folderId) continue;
			const folder = folderLookup.get(folderId);
			if (!folder) continue;
			const children = childFolderLookup.get(folderId);
			const folderName = deduper.add(folder["name"], {
				group: folder["parent"],
				fallback: folderId
			});
			const folderPath = path === "" ? rootName : `${path}/${folderName}`;
			tree.set(folderId, folderPath);
			for (const childFolderId of children ?? []) stack.push([childFolderId, folderPath]);
		}
		return tree;
	}
};

//#endregion
export { FoldersService };