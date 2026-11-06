# Security Advisory draft — `fast-json-patch`

**Target**: `fast-json-patch` (npm), repo `Starcounter-Jack/JSON-Patch`, MIT
**Tested version**: `3.1.1` (latest, published 2022-03-24)
**Category**: CWE-1321 (prototype pollution) / CWE-668 (exposure of resource to wrong sphere)
**Severity**: High (see §5)

---

## 1. Summary

`fast-json-patch` ships a security option `banPrototypeModifications`, **enabled by default**, documented as banning modification of `__proto__` and `constructor/prototype`. The guard is a pattern match on path segments:

```js
// commonjs/core.js:191
if (banPrototypeModifications &&
    (key == '__proto__' ||
        (key == 'prototype' && t > 0 && keys[t - 1] == 'constructor'))) {
    throw new TypeError('JSON-Patch: modifying `__proto__` or `constructor/prototype` prop is banned ...');
}
```

It does not match `constructor` alone, nor `constructor/constructor`, nor `constructor/<anything>`. Both the read and the write path reach built-in objects through that gap.

Because RFC 6902 requires the `path` member of every operation to be supplied by the client, **the path is attacker-controlled by protocol design** in any service that applies a patch document received over the wire.

---

## 2. Minimal reproduction

```js
const jsonpatch = require('fast-json-patch');

// --- A. read: reach the Function constructor (banPrototypeModifications stays true) ---
jsonpatch.getValueByPointer({}, '/constructor/constructor');
// => [Function: Function]

jsonpatch.applyPatch({ a: 1 }, [{ op: 'test', path: '/a/constructor/constructor', value: 0 }]);
// => throws TEST_OPERATION_FAILED, i.e. the read succeeded and the value did not match

// --- B. write: mutate a built-in through the same gap ---
jsonpatch.applyPatch({ a: {} }, [{ op: 'add', path: '/a/constructor/x', value: 'INJECTED' }]);
// Object.x === 'INJECTED'          (global)

jsonpatch.applyPatch({ a: {} }, [{ op: 'replace', path: '/a/constructor/constructor', value: 'PWNED' }]);
// Object.constructor === 'PWNED'   (global)

// --- C. control: the guard does fire on the paths it enumerates ---
jsonpatch.applyPatch({ a: {} }, [{ op: 'add', path: '/__proto__/x', value: 1 }]);
// => TypeError: ... banned for security reasons   (as intended)
jsonpatch.applyPatch({ a: {} }, [{ op: 'add', path: '/a/constructor/prototype/x', value: 1 }]);
// => TypeError: ... banned for security reasons   (as intended)
```

Note that `getValueByPointer` is not a separate code path: it fabricates an `_get` operation and re-enters `applyOperation`, so the same guard — and the same gap — governs reads.

---

## 3. Root cause

The guard enumerates **specific segment patterns** instead of asking whether the segment is an own property of the node being traversed. `Object.prototype.constructor` is an inherited property, so every object satisfies it; the traversal loop then continues into `Object`, and from there `constructor` again yields `Function`.

The same loop is used for `add`, `replace`, `remove`, `test` and `_get`. A single missing pattern therefore affects both directions.

This is not fixable by extending the list. `valueOf`, `toLocaleString`, `__defineGetter__`, `isPrototypeOf`, `propertyIsEnumerable` and any future addition to `Object.prototype` are equally inherited and equally reachable; the list would have to be kept in sync with the language itself.

---

## 4. Suggested fix

Replace the pattern match with an ownership check, at the point where the loop descends:

```js
if (!Object.hasOwnProperty.call(obj, key)) {
    throw new JsonPatchError('Path not found in document', 'OPERATION_PATH_UNRESOLVED', index, operation, document);
}
```

`obj[key]` is then guarded structurally rather than syntactically, and the deny-list can be retired. This is the approach taken by `jsonpatch` (`JSONPointer.prototype.get` → `Object.hasOwnProperty.call(node, lastSegment)`), which resists all seven payloads we tested while remaining RFC 6902 compliant.

If the maintainers prefer to keep the option for compatibility, the ownership check can be applied only when `banPrototypeModifications` is true.

**Affected range**: we verified 3.1.1 only. The guard text has been present since `banPrototypeModifications` was introduced, so earlier 3.x and 2.x releases are likely affected — please confirm from the git history rather than from our claim.

**Not affected by this specific gap**: `__proto__`-based paths, and `constructor/prototype` pairs, which the guard does block (verified).

---

## 5. Impact

| Direction | Reachable | Consequence |
|---|---|---|
| Read (`test`, `getValueByPointer`) | `Function` constructor | When the resolved value is handed back to the caller or compared in `test`, an application that later invokes it gains arbitrary code execution. This is the same primitive as `lodash.get` / `json-ptr`. |
| Write (`add`, `replace`, `remove`) | own properties of `Object` / `Function` | Global namespace tampering from a data-only document; the stated guarantee of `banPrototypeModifications` does not hold. |

JSON values cannot carry functions, so the write path alone does not give code execution — it gives integrity loss and process-level denial of service (e.g. overwriting `Object.assign`). The read path is the one that escalates, and it requires the application to treat the returned value as callable.

Suggested CVSS 3.1: `AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:H/A:H` = **8.6 High**.

We have **not** demonstrated exploitation inside a downstream application; the finding is library-level with a protocol-level control argument for the path.

---

## 6. Disclosure plan

| Step | Content |
|---|---|
| 1 | Private report to maintainers via GitHub Security Advisory, with §2 reproduction |
| 2 | 30 days for acknowledgement; if no response, escalate to the repo's issue tracker without the PoC |
| 3 | Publish with CVE after fix; coordinate with the sibling findings below so that the advisory text can point at a common mitigation |

**Sibling findings that should ship together** (same primitive, different packages, all verified in this project):

- `json-ptr@3.1.1` — read path reaches `Function` (5/5 payloads), write path is guarded; 4.1M weekly downloads.
- `lodash` 4.18.1 / `lodash.get@4.4.2` — read path reaches `Function`; 22.3M weekly downloads for the frozen sibling.
- `jexl@2.3.0` — reads `Function` through bracket syntax, cannot call; dot-form denial is an accidental grammar-table bug.

---

## 7. Internal notes (not part of the advisory text)

- Every claim above is gated on a control (`/a/b → 7`); a failed control is recorded as undecided, never as safe.
- Three harness failures occurred while producing this table and are documented in
  `RFC6901实现族横评-2026-11-03.md` §8. Two of them would have produced a "the library is safe" conclusion.
- The single most persuasive sentence for a maintainer is probably: *the guard fires on `__proto__`, and the bypass contains neither `__proto__` nor `prototype`.*
