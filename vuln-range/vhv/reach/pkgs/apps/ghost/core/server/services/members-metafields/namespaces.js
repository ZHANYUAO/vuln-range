"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNamespaces = createNamespaces;
const errors_1 = __importDefault(require("@tryghost/errors"));
/**
 * The namespaces fields can be defined in, each with its policy.
 *
 * A namespace is settled before any question about the caller. Asking the caller first gets
 * the order wrong in a way that shows: a request to define a field in a namespace nobody owns
 * would be refused for want of a permission, telling the caller to go and get one, when no
 * permission would have helped.
 */
function createNamespaces(policies) {
    const byNamespace = new Map(policies.map((policy) => [policy.namespace, policy]));
    const owned = (namespace) => {
        const policy = byNamespace.get(namespace);
        if (!policy) {
            throw new errors_1.default.ValidationError({
                message: `Fields cannot be defined in the "${namespace}" namespace.`,
                property: 'namespace',
            });
        }
        return policy;
    };
    return {
        owned,
        unavailable() {
            return policies
                .filter(({ limits }) => limits.some(makesUnavailable))
                .map(({ namespace }) => namespace);
        },
        async assertChangeable(namespace) {
            for (const limit of owned(namespace).limits) {
                switch (limit.kind) {
                    case 'availability':
                        if (!limit.isAvailable()) {
                            await limit.refuse();
                        }
                        break;
                    case 'count':
                        // Asked of adding only: no other change holds more fields.
                        break;
                    default: {
                        const _exhaustive = limit;
                        throw new errors_1.default.InternalServerError({ message: `Unhandled limit: ${_exhaustive}` });
                    }
                }
            }
        },
        async assertRoom(namespace, held, adding) {
            for (const limit of owned(namespace).limits) {
                switch (limit.kind) {
                    case 'availability':
                        if (!limit.isAvailable()) {
                            await limit.refuse();
                        }
                        break;
                    case 'count':
                        await limit.assertRoom(held, adding);
                        break;
                    default: {
                        const _exhaustive = limit;
                        throw new errors_1.default.InternalServerError({ message: `Unhandled limit: ${_exhaustive}` });
                    }
                }
            }
        },
    };
}
function makesUnavailable(limit) {
    switch (limit.kind) {
        case 'availability':
            return !limit.isAvailable();
        case 'count':
            // A namespace with no room left still reads as it is stored.
            return false;
        default: {
            const _exhaustive = limit;
            throw new errors_1.default.InternalServerError({ message: `Unhandled limit: ${_exhaustive}` });
        }
    }
}
