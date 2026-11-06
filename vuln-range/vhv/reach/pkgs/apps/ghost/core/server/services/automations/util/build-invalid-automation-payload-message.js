"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildInvalidAutomationPayloadMessage = buildInvalidAutomationPayloadMessage;
function buildInvalidAutomationPayloadMessage(issues, message) {
    if (!issues.length) {
        return message;
    }
    const issueSummaries = issues.slice(0, 3).map((issue) => {
        const path = issue.path.length ? issue.path.join('.') : 'payload';
        return `${path}: ${issue.message}`;
    });
    return `${message} ${issueSummaries.join('; ')}.`;
}
