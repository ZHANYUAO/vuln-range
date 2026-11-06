import { ItemsService } from "../../../services/items.js";
import { requireText } from "../../../utils/require-text.js";
import { defineTool } from "../define-tool.js";
import { OperationsService } from "../../../services/operations.js";
import { OperationItemInputSchema, OperationItemValidateSchema, QueryInputSchema, QueryValidateSchema } from "../schema.js";
import { buildSanitizedQueryFromArgs } from "../utils.js";
import { relayoutFlow } from "./position.js";
import { InvalidPayloadError } from "@directus/errors";
import { fileURLToPath } from "node:url";
import { z as z$1 } from "zod";
import { dirname, resolve } from "node:path";

//#region src/ai/tools/operations/index.ts
const __dirname = dirname(fileURLToPath(import.meta.url));
const OperationsValidationSchema = z$1.discriminatedUnion("action", [
	z$1.strictObject({
		action: z$1.literal("create"),
		data: OperationItemValidateSchema.refine((data) => data.position_x == null === (data.position_y == null), "Provide both `position_x` and `position_y`, or omit both for automatic layout")
	}),
	z$1.strictObject({
		action: z$1.literal("read"),
		query: QueryValidateSchema.optional()
	}),
	z$1.strictObject({
		action: z$1.literal("update"),
		data: OperationItemValidateSchema,
		key: z$1.string(),
		query: QueryValidateSchema.optional()
	}),
	z$1.strictObject({
		action: z$1.literal("delete"),
		key: z$1.string()
	})
]);
const OperationsInputSchema = z$1.object({
	action: z$1.enum([
		"create",
		"read",
		"update",
		"delete"
	]).describe("The operation to perform"),
	query: QueryInputSchema.optional(),
	data: OperationItemInputSchema.optional(),
	key: z$1.string().optional()
});
const operations = defineTool({
	name: "operations",
	admin: true,
	description: "Reads and changes Directus flow operations. Use to build or inspect operation chains inside automation flows.",
	instructions: requireText(resolve(__dirname, "./prompt.md")),
	keywords: [
		"flow steps",
		"automation steps",
		"data chain",
		"resolve",
		"reject",
		"operation key"
	],
	annotations: {
		title: "Directus - Operations",
		destructiveHint: true
	},
	inputSchema: OperationsInputSchema,
	validateSchema: OperationsValidationSchema,
	readOnly: (input) => input.action === "read",
	async handler({ args, schema, accountability }) {
		const operationService = new OperationsService({
			schema,
			accountability
		});
		const layoutService = new ItemsService("directus_operations", {
			schema,
			accountability
		});
		const flowsService = new ItemsService("directus_flows", {
			schema,
			accountability
		});
		if (args.action === "create") {
			const explicitPosition = args.data.position_x != null && args.data.position_y != null;
			if (!explicitPosition) args.data = {
				...args.data,
				position_x: 19,
				position_y: 1
			};
			const savedKey = await operationService.createOne(args.data);
			if (!explicitPosition && args.data.flow) await relayoutFlow(layoutService, flowsService, args.data.flow);
			return {
				type: "text",
				data: await operationService.readOne(savedKey) || null
			};
		}
		if (args.action === "read") {
			const sanitizedQuery = await buildSanitizedQueryFromArgs(args, schema, accountability);
			return {
				type: "text",
				data: await operationService.readByQuery(sanitizedQuery) || null
			};
		}
		if (args.action === "update") {
			const sanitizedQuery = await buildSanitizedQueryFromArgs(args, schema, accountability);
			let sourceFlow;
			if (args.data.flow != null) {
				const existing = await operationService.readOne(args.key, { fields: [
					"id",
					"flow",
					"resolve",
					"reject"
				] });
				sourceFlow = existing["flow"];
				if (args.data.flow !== existing["flow"]) {
					const resolve$1 = args.data.resolve !== void 0 ? args.data.resolve : existing["resolve"];
					const reject = args.data.reject !== void 0 ? args.data.reject : existing["reject"];
					const [referencedBy, entryPointOf] = await Promise.all([operationService.readByQuery({
						filter: { _or: [{ resolve: { _eq: args.key } }, { reject: { _eq: args.key } }] },
						fields: ["id"],
						limit: 1
					}), flowsService.readByQuery({
						filter: { operation: { _eq: args.key } },
						fields: ["id"],
						limit: 1
					})]);
					if (resolve$1 || reject || referencedBy.length > 0 || entryPointOf.length > 0) throw new InvalidPayloadError({ reason: "Cannot move a linked operation to another flow. Clear its resolve/reject and any references to it first" });
				}
			}
			const updatedKey = await operationService.updateOne(args.key, args.data);
			const linksChanged = args.data.resolve !== void 0 || args.data.reject !== void 0;
			const flowChanged = args.data.flow != null && args.data.flow !== sourceFlow;
			if (!(args.data.position_x != null || args.data.position_y != null) && (linksChanged || flowChanged)) {
				const flow = args.data.flow ?? (await operationService.readOne(args.key, { fields: ["flow"] }))["flow"];
				if (flow) await relayoutFlow(layoutService, flowsService, flow);
				if (flowChanged && sourceFlow) await relayoutFlow(layoutService, flowsService, sourceFlow);
			}
			return {
				type: "text",
				data: await operationService.readOne(updatedKey, sanitizedQuery) || null
			};
		}
		if (args.action === "delete") {
			const existing = await operationService.readOne(args.key, { fields: ["flow"] });
			const deletedKey = await operationService.deleteOne(args.key);
			if (existing["flow"]) await relayoutFlow(layoutService, flowsService, existing["flow"]);
			return {
				type: "text",
				data: deletedKey
			};
		}
		throw new Error("Invalid action.");
	}
});

//#endregion
export { OperationsInputSchema, OperationsValidationSchema, operations };