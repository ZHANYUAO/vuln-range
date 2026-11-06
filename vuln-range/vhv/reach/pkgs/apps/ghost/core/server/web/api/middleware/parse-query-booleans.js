"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseQueryBooleans = parseQueryBooleans;
// Query keys can shadow `constructor`, so check the prototype instead
function isPlainObject(value) {
    if (value === null || typeof value !== 'object') {
        return false;
    }
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}
function parseValue(value) {
    if (value === 'true') {
        return true;
    }
    if (value === 'false') {
        return false;
    }
    if (Array.isArray(value)) {
        return value.map(parseValue);
    }
    if (isPlainObject(value)) {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, parseValue(item)]));
    }
    return value;
}
/**
 * Converts `'true'` and `'false'` query values to booleans, including inside
 * nested objects and arrays, e.g. `?filter=x&include=true` -> `{include: true}`
 */
function parseQueryBooleans(req, res, next) {
    req.query = parseValue(req.query);
    next();
}
