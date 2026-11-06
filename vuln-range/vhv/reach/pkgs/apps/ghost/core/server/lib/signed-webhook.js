"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeWebhookSignature = computeWebhookSignature;
exports.sanitizeWebhookUrl = sanitizeWebhookUrl;
exports.describeWebhookError = describeWebhookError;
exports.buildSignedWebhookRequest = buildSignedWebhookRequest;
const crypto_1 = __importDefault(require("crypto"));
const ghostVersion = require('@tryghost/version');
const REQUEST_TIMEOUT_MS = 30_000;
/**
 * Wire format for webhooks Ghost posts to the host (e.g. email verification,
 * export requests). The receiver verifies
 * `X-Ghost-Signature: base64(HMAC-SHA256(secret, "{timestamp}:{rawBody}"))`
 * against the raw request body, so the body must be sent exactly as signed.
 */
function computeWebhookSignature(timestamp, body, secret) {
    return crypto_1.default.createHmac('sha256', secret).update(`${timestamp}:${body}`).digest('base64');
}
/**
 * Reduces a webhook URL to its origin so logs never leak credentials or
 * tokens embedded in the path or query string.
 */
function sanitizeWebhookUrl(webhookUrl) {
    try {
        return new URL(webhookUrl).origin;
    }
    catch {
        return '[invalid webhook url]';
    }
}
/**
 * Describes a failed delivery for logs without using the error's message,
 * which the HTTP client fills with the full request URL.
 */
function describeWebhookError(error) {
    if (typeof error !== 'object' || error === null) {
        return 'unknown error';
    }
    const response = 'response' in error ? error.response : undefined;
    if (typeof response === 'object' &&
        response !== null &&
        'statusCode' in response &&
        typeof response.statusCode === 'number') {
        return `HTTP ${response.statusCode}`;
    }
    if ('code' in error && typeof error.code === 'string') {
        return error.code;
    }
    return 'unknown error';
}
/**
 * Builds the request options for a signed host webhook delivery. When no
 * secret is configured the payload is sent unsigned (the receiver decides
 * whether to accept that).
 */
function buildSignedWebhookRequest({ payload, secret, retryLimit, }) {
    const body = JSON.stringify(payload);
    const timestamp = Date.now().toString();
    const headers = {
        'Content-Length': Buffer.byteLength(body),
        'Content-Type': 'application/json',
        'Content-Version': `v${ghostVersion.safe}`,
        'X-Ghost-Request-Timestamp': timestamp,
    };
    if (secret) {
        headers['X-Ghost-Signature'] = computeWebhookSignature(timestamp, body, secret);
    }
    return {
        method: 'POST',
        body,
        headers,
        timeout: {
            request: REQUEST_TIMEOUT_MS,
        },
        retry: {
            limit: retryLimit,
        },
    };
}
