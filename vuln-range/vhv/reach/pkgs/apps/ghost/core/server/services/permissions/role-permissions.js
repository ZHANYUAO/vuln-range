"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.forRoles = forRoles;
exports.all = all;
exports.roleNames = roleNames;
const permissions_data_1 = require("./permissions-data");
const toKey = (perm) => `${perm.action_type}:${perm.object_type}`;
const allPermissions = Object.entries(permissions_data_1.permissions).flatMap(([objectType, actions]) => actions.map((actionType) => Object.freeze({ action_type: actionType, object_type: objectType })));
const byRole = new Map(Object.entries(permissions_data_1.rolePermissions).map(([roleName, objects]) => [
    roleName,
    allPermissions.filter((perm) => {
        const value = objects[perm.object_type];
        return value === 'all' || (value?.includes(perm.action_type) ?? false);
    }),
]));
/**
 * Every permission granted to any of the given roles, without duplicates.
 * Unknown roles, and Owner (which has no permissions of its own and is handled
 * as a bypass in canThis), contribute nothing.
 *
 * The permission objects are shared by every caller, so they are frozen.
 */
function forRoles(names) {
    const seen = new Set();
    const result = [];
    for (const roleName of names) {
        for (const perm of byRole.get(roleName) ?? []) {
            const key = toKey(perm);
            if (!seen.has(key)) {
                seen.add(key);
                result.push(perm);
            }
        }
    }
    return result;
}
/**
 * Every permission that exists, regardless of role. This is the universe the
 * actions map is built from.
 */
function all() {
    return allPermissions.slice();
}
/**
 * The roles the map knows about. Owner is not among them: it has no
 * permissions of its own and is handled as a bypass in canThis.
 */
function roleNames() {
    return [...byRole.keys()];
}
