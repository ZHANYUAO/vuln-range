"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.editAutomationStatusOnlySchema = exports.editAutomationDataSchema = exports.addAutomationDataSchema = void 0;
const bson_objectid_1 = __importDefault(require("bson-objectid"));
const zod_1 = require("zod");
const MAX_AUTOMATION_ACTIONS = 50;
const MAX_WAIT_HOURS = 720; // 30 days
const objectIdSchema = zod_1.z.string().refine((value) => bson_objectid_1.default.isValid(value));
const waitActionSchema = zod_1.z.object({
    id: objectIdSchema,
    type: zod_1.z.literal('wait'),
    data: zod_1.z.object({
        wait_hours: zod_1.z.number().int().positive().max(MAX_WAIT_HOURS),
    }),
});
const sendEmailActionSchema = zod_1.z.object({
    id: objectIdSchema,
    type: zod_1.z.literal('send_email'),
    data: zod_1.z.object({
        email_subject: zod_1.z.string(),
        email_lexical: zod_1.z.string(),
        email_design_setting_id: zod_1.z.string().min(1),
    }),
});
const edgeSchema = zod_1.z.object({
    source_action_id: objectIdSchema,
    target_action_id: objectIdSchema,
});
const automationShape = {
    name: zod_1.z.string().trim().min(1).max(191),
    description: zod_1.z.string().trim().max(2000),
    status: zod_1.z.enum(['active', 'inactive', 'archived']),
    actions: zod_1.z
        .array(zod_1.z.discriminatedUnion('type', [waitActionSchema, sendEmailActionSchema]))
        .max(MAX_AUTOMATION_ACTIONS),
    edges: zod_1.z.array(edgeSchema),
};
const defaultTriggerShape = {
    trigger_tier_scope: zod_1.z.enum(['free', 'all_paid']).nullable().optional(),
    trigger_tier_ids: zod_1.z.null().optional(),
};
const selectedPaidTriggerShape = {
    trigger_tier_scope: zod_1.z.literal('selected_paid'),
    trigger_tier_ids: zod_1.z
        .array(objectIdSchema)
        .min(1)
        .refine((ids) => new Set(ids).size === ids.length, {
        error: 'Duplicate trigger_tier_ids are not allowed.',
    }),
};
exports.addAutomationDataSchema = zod_1.z.discriminatedUnion('trigger_tier_scope', [
    zod_1.z.strictObject({ ...automationShape, ...defaultTriggerShape }),
    zod_1.z.strictObject({
        ...automationShape,
        ...selectedPaidTriggerShape,
    }),
]);
exports.editAutomationDataSchema = zod_1.z
    .object({
    ...automationShape,
    name: automationShape.name.optional(),
    description: automationShape.description.optional(),
})
    .and(zod_1.z.discriminatedUnion('trigger_tier_scope', [
    zod_1.z.object(defaultTriggerShape),
    zod_1.z.object(selectedPaidTriggerShape),
]));
exports.editAutomationStatusOnlySchema = zod_1.z.strictObject({
    // We disallow status-only activations because they could allow activations to
    // happen with an invalid graph (e.g,. an email without a subject). If we
    // change this, we should validate the graph on status-only activations as
    // well.
    status: zod_1.z.enum(['inactive', 'archived']),
});
