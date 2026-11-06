"use strict";
// Memoization helper for pure derivations of immutable inputs.
//
// This is a memo helper, not a cache. Everything that goes through it must be a
// pure function of arguments that never change underneath us. Anything derived
// from mutable state needs real invalidation, which this deliberately does not
// have.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoize = memoize;
const errors = __importStar(require("@tryghost/errors"));
const lru_cache_1 = require("lru-cache");
/**
 * Memoize `compute` against a string key derived from its arguments, bounded by
 * `max` entries in LRU order.
 *
 * There is deliberately no TTL: entries are pure derivations of immutable
 * inputs, so an entry is never stale, only evicted to stay inside the bound.
 *
 * A throwing `compute` is not memoized: the next call with the same key retries.
 */
function memoize(compute, key, { max }) {
    if (!Number.isSafeInteger(max) || max < 1) {
        throw new errors.IncorrectUsageError({
            message: `memoize: max must be a positive integer, got ${String(max)}`,
        });
    }
    // lru-cache cannot store `undefined` (it reads as a miss), so an `undefined`
    // result is recomputed rather than served from the memo.
    const cache = new lru_cache_1.LRUCache({ max });
    const memoized = ((...args) => {
        const cacheKey = key(...args);
        const cached = cache.get(cacheKey);
        if (cached !== undefined) {
            return cached;
        }
        const value = compute(...args);
        if (value !== undefined) {
            cache.set(cacheKey, value);
        }
        return value;
    });
    memoized.reset = () => cache.clear();
    return memoized;
}
