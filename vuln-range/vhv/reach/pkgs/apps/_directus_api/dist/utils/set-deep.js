import { toPath } from "lodash-es";

//#region src/utils/set-deep.ts
/**
* Set `value` at `path` in `root`, creating any missing intermediate node as a null-prototype own
* object.
*
* Unlike lodash `set`, this never reads or follows an inherited property while walking the path: it
* reuses a segment only when it is already an own object, and otherwise creates a fresh
* null-prototype object. A user-controlled segment named like a builtin (`toString`, `__proto__`,
* `constructor`, …) therefore becomes a plain own key and can never reach or corrupt a shared
* prototype — the prototype-pollution vector behind GHSA-gwvv-rr68-cmv6.
*/
function setDeep(root, path, value) {
	const segments = Array.isArray(path) ? path.map(String) : toPath(path);
	if (segments.length === 0) return root;
	let node = root;
	for (let i = 0; i < segments.length - 1; i += 1) {
		const key = segments[i];
		if (!Object.hasOwn(node, key) || typeof node[key] !== "object" || node[key] === null) assignOwn(node, key, Object.create(null));
		node = node[key];
	}
	assignOwn(node, segments[segments.length - 1], value);
	return root;
}
/** Creates `key` as an own data property: plain `obj['__proto__'] = x` reparents `obj` instead of creating a key. */
function assignOwn(obj, key, value) {
	Object.defineProperty(obj, key, {
		value,
		writable: true,
		enumerable: true,
		configurable: true
	});
}

//#endregion
export { setDeep };