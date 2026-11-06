import { useLogger } from "../../../logger/index.js";
import { getFlowManager } from "../../../flows.js";

//#region src/ai/tools/operations/position.ts
const COLUMN_SPACING = 18;
const ROW_SPACING = 16;
const ORIGIN = {
	x: 19,
	y: 1
};
/**
* Derives the flow's layout from its resolve/reject graph and persists what
* changed, so a flow always reads left-to-right in execution order no matter
* what positions operations were written with.
*
* @returns whether any positions were written
*/
async function layoutFlow(service, flow, entry) {
	const operations = await service.readByQuery({
		filter: { flow: { _eq: flow } },
		fields: [
			"id",
			"resolve",
			"reject",
			"position_x",
			"position_y"
		],
		sort: ["date_created", "id"],
		limit: -1
	});
	const operationsById = new Map(operations.map((operation) => [operation.id, operation]));
	const linked = new Set(operations.flatMap((operation) => [operation.resolve, operation.reject]));
	const positions = /* @__PURE__ */ new Map();
	let rows = 0;
	const layout = (id, depth, row) => {
		const operation = id === null ? void 0 : operationsById.get(id);
		if (!operation || positions.has(operation.id)) return;
		positions.set(operation.id, {
			position_x: ORIGIN.x + depth * COLUMN_SPACING,
			position_y: ORIGIN.y + row * ROW_SPACING
		});
		rows = Math.max(rows, row);
		layout(operation.resolve, depth + 1, row);
		layout(operation.reject, depth + 1, rows + 1);
	};
	layout(entry, 0, 0);
	for (const operation of operations) if (!linked.has(operation.id)) layout(operation.id, 0, positions.size === 0 ? 0 : rows + 1);
	let parked = 0;
	for (const operation of operations) if (!positions.has(operation.id)) positions.set(operation.id, {
		position_x: ORIGIN.x + parked++ * COLUMN_SPACING,
		position_y: ORIGIN.y + (rows + 1) * ROW_SPACING
	});
	const updates = [...positions].filter(([id, position]) => {
		const current = operationsById.get(id);
		return current.position_x !== position.position_x || current.position_y !== position.position_y;
	}).map(([id, position]) => ({
		id,
		...position
	}));
	if (updates.length === 0) return false;
	await service.updateBatch(updates);
	return true;
}
/**
* Lays out a flow and reloads the flow engine when anything was written, in
* case filter hooks piggybacked execution changes onto the layout writes.
* Layout is cosmetic, so failures are logged instead of failing the data
* operation that triggered them.
*/
async function relayoutFlow(layoutService, flowsService, flow) {
	try {
		if (await layoutFlow(layoutService, flow, (await flowsService.readOne(flow, { fields: ["operation"] }))["operation"] ?? null)) await getFlowManager().reload();
	} catch (error) {
		useLogger().warn(error, `Failed to lay out flow "${flow}"`);
	}
}

//#endregion
export { layoutFlow, relayoutFlow };