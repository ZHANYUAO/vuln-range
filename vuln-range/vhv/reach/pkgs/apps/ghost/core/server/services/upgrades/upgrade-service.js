"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpgradeService = void 0;
const node_crypto_1 = require("node:crypto");
const errors_1 = __importDefault(require("@tryghost/errors"));
const adapter_base_upgrade_1 = require("@tryghost/adapter-base-upgrade");
// 502, not 503: Admin reads any 503 as Ghost itself being under maintenance.
const unavailable = {
    Error: errors_1.default.InternalServerError,
    statusCode: 502,
    code: 'UPGRADE_UNAVAILABLE',
    message: 'The update service is temporarily unavailable.',
    help: 'Retry later. Reuse the same idempotency_key if an update request lost its response.',
};
const rejections = {
    unsupported: {
        Error: errors_1.default.DisabledFeatureError,
        code: 'UPGRADE_UNSUPPORTED',
        message: 'This host does not support updating Ghost from Admin.',
        help: 'Ask your host to configure an upgrade adapter.',
    },
    unavailable,
    busy: {
        Error: errors_1.default.ConflictError,
        code: 'UPGRADE_BUSY',
        message: 'An update is already in progress.',
        help: 'Wait for the active job to finish before requesting another update.',
    },
    'target-unapproved': {
        Error: errors_1.default.ValidationError,
        code: 'UPGRADE_TARGET_UNAPPROVED',
        message: 'This update is not available as a one-click update.',
        help: 'Refresh the available updates before choosing one.',
    },
    'idempotency-conflict': {
        Error: errors_1.default.ConflictError,
        code: 'UPGRADE_IDEMPOTENCY_CONFLICT',
        message: 'This idempotency_key was already used for a different update.',
        help: 'Use a new idempotency_key for a new update request.',
    },
    'request-expired': {
        Error: errors_1.default.ConflictError,
        code: 'UPGRADE_REQUEST_EXPIRED',
        message: 'This update request has expired.',
        help: 'Check the outcome of the earlier request before making a new one.',
    },
};
/** The host owns acceptance and execution; this class owns Ghost's public boundary. */
class UpgradeService {
    #getAdapter;
    #logError;
    constructor({ getAdapter, logError, }) {
        this.#getAdapter = getAdapter;
        this.#logError = logError;
    }
    /** Never rejects: an unreachable host is a status for Admin to show, not an API error. */
    async getStatus() {
        try {
            return adapter_base_upgrade_1.upgradeStatusSchema.parse(await this.#getAdapter().getStatus());
        }
        catch (error) {
            if (!(error instanceof adapter_base_upgrade_1.UpgradeAdapterError && error.code === 'unavailable')) {
                this.#logError(new errors_1.default.InternalServerError({
                    message: 'The upgrade adapter failed during getStatus.',
                    err: error instanceof Error ? error : undefined,
                }));
            }
            return adapter_base_upgrade_1.upgradeStatusSchema.parse({ supported: true, availability: 'unavailable' });
        }
    }
    async createRequest(input, userId) {
        // Two staff users must never share, or be able to guess, each other's intents.
        const idempotencyKey = (0, node_crypto_1.createHash)('sha256')
            .update(JSON.stringify([userId, input.idempotencyKey]))
            .digest('hex');
        try {
            const job = adapter_base_upgrade_1.upgradeJobSchema.parse(await this.#getAdapter().createRequest({
                component: input.component,
                toVersion: input.toVersion,
                idempotencyKey,
            }));
            if (job.component !== input.component || job.toVersion !== input.toVersion) {
                throw new errors_1.default.IncorrectUsageError({
                    message: 'The accepted job does not match the requested update.',
                });
            }
            return job;
        }
        catch (error) {
            return this.#fail(error, 'createRequest');
        }
    }
    async getJob(id) {
        try {
            const job = adapter_base_upgrade_1.upgradeJobResultSchema.parse(await this.#getAdapter().getJob(id));
            if (job.id !== id) {
                throw new errors_1.default.IncorrectUsageError({ message: 'Lookup returned a different job.' });
            }
            return job;
        }
        catch (error) {
            return this.#fail(error, 'getJob');
        }
    }
    #fail(error, operation) {
        if (error instanceof adapter_base_upgrade_1.UpgradeAdapterError) {
            const code = adapter_base_upgrade_1.upgradeErrorCodeSchema.safeParse(error.code);
            const diagnostics = adapter_base_upgrade_1.upgradeDiagnosticsSchema.optional().safeParse(error.diagnostics);
            if (code.success && diagnostics.success) {
                const { Error: Rejection, ...rejection } = rejections[code.data];
                throw new Rejection({
                    ...rejection,
                    ...(diagnostics.data && { errorDetails: { diagnostics: diagnostics.data } }),
                });
            }
        }
        // Adapter errors and invalid output stay in the logs; the response never echoes them.
        this.#logError(new errors_1.default.InternalServerError({
            message: `The upgrade adapter failed during ${operation}.`,
            err: error instanceof Error ? error : undefined,
        }));
        const { Error: Unavailable, ...rejection } = unavailable;
        throw new Unavailable(rejection);
    }
}
exports.UpgradeService = UpgradeService;
