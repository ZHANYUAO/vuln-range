"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultMap = void 0;
/**
 * Like `Map`, but sets a default value for keys that don't exist yet.
 *
 * @example
 * const map = new DefaultMap(() => []);
 * map.get('key').push(123);
 * map.get('key');
 * // => [123]
 */
class DefaultMap {
    #getDefaultValue;
    #map = new Map();
    constructor(getDefaultValue) {
        this.#getDefaultValue = getDefaultValue;
    }
    get(key) {
        if (!this.#map.has(key)) {
            this.#map.set(key, this.#getDefaultValue());
        }
        return this.#map.get(key);
    }
    set(key, value) {
        this.#map.set(key, value);
        return this;
    }
    values() {
        return this.#map.values();
    }
}
exports.DefaultMap = DefaultMap;
