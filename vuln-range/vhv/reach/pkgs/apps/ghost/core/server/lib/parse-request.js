"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseRequest = parseRequest;
const errors_1 = __importDefault(require("@tryghost/errors"));
const zod_1 = require("zod");
/**
 * Parses what a request sent, turning the first problem into a validation error on the
 * property it names, or on `resource` when it names none.
 */
function parseRequest(schema, input, resource) {
    const parsed = zod_1.z.safeParse(schema, input);
    if (parsed.success) {
        return parsed.data;
    }
    const issue = parsed.error.issues[0];
    throw new errors_1.default.ValidationError({
        message: issue.message,
        property: issue.path.join('.') || resource,
    });
}
