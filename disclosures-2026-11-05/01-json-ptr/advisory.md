# json-ptr 3.1.1: write path blocks prototype access, read path does not

**Package**: `json-ptr` (npm, ~4.1M weekly downloads)
**Repository**: `https://github.com/flitbit/json-ptr` — **returns HTTP 404 as of 2026-11-05**
**Version tested**: 3.1.1 (latest, published 2022-07-13)
**Category**: CWE-668 (exposure of resource to wrong sphere) / CWE-1321 (read-side)
**Status**: **no live upstream repository** — published as a public advisory

---

## 1. Summary

`json-ptr` blocks prototype access on the **write** path and does not on the **read** path.

```js
// dist/json-ptr.js — setValueAtPath (write)
if (step === '__proto__' || step === 'constructor' || step === 'prototype') {
  throw new Error('Attempted prototype pollution disallowed.');
}
```

The read path (`compilePointerDereference`) performs no check at all, and it does not
interpret the pointer as data — it **compiles it into JavaScript source**:

```js
// dist/json-ptr.js — compilePointerDereference (read)
body = path.reduce((body, _, i) =>
  body + "\n && it !== null && typeof((it = it['" +
  escape(path[i]) + "'])) !== 'undefined'", "if (typeof(it) !== 'undefined'");
return new Function('it', body);
```

Two consequences:

1. `escape()` correctly handles `\` and `'`, so the code-injection class fixed in
   **GHSA-rrqv-vjrw-hrcr** ("Arbitrary Code Execution in json-ptr") stays fixed.
2. `__proto__` is a **valid RFC 6901 segment** — no injection trick is needed to walk the
   prototype chain. The missing control is *access*, not *escaping*.

---

## 2. Reproduction (Node v22.22.2, json-ptr 3.1.1)

```js
const { JsonPointer } = require('json-ptr');

// control
JsonPointer.get({ user: { role: 'user' } }, '/user/role');            // => "user"

// write: blocked (as intended)
JsonPointer.set({}, '/__proto__/polluted', 'x');
// => Error: Attempted prototype pollution disallowed.

// read: not blocked
const F = JsonPointer.get({}, '/__proto__/constructor/constructor');
// => [Function: Function]
```

Harness output:

```
[PASS] jsonptr.control     -> user
[PASS] jsonptr.set_guard   -> blocked: Attempted prototype pollution disallowed.
[HIT ] jsonptr.read_bypass -> function
```

---

## 3. Impact — and what we did NOT demonstrate

`get()` **returns** the resolved value. It does not invoke it. The escalation is therefore
conditional on the consumer:

| Consumer behaviour | Consequence |
|---|---|
| Returns the value to the client / stores it | Information disclosure only (`typeof === 'function'`; JSON serialisation drops it) |
| Compares it (`test` op in RFC 6902) | Oracle: attacker learns whether a path exists |
| **Invokes it as a function** | Arbitrary code execution |

We demonstrated the RCE chain **in-process only** (calling the returned constructor ourselves
in the test harness). We did **not** demonstrate a downstream application that invokes the
value, and we did not test any production service.

Conservative library-level CVSS 3.1:
`AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:L` = **7.3**.
The previously circulated 9.1 assumes a downstream call sink that we did not verify.

### Why this matters despite the conditional nature

- The **set** path explicitly refuses the same segments. The library clearly intends to
  prevent prototype access; the read path simply missed it.
- The read path is reachable from three ordinary surfaces: `JsonPointer.get`,
  RFC 6902 `test` operations, and `$ref` resolution (`JsonReference.resolve`).
- `new Function` compilation means static analysis does not see the access.

---

## 4. Suggested fix

Apply the same segment policy to reads, and prefer an ownership check over a denylist:

```js
// in compilePointerDereference, before compiling
for (const step of path) {
  if (step === '__proto__' || step === 'constructor' || step === 'prototype') {
    throw new Error('Attempted prototype pollution disallowed.');
  }
}
```

Better (structural, covers future `Object.prototype` additions): replace the generated
function with a plain loop that checks ownership at each hop:

```js
let it = target;
for (const step of path) {
  if (it === null || typeof it !== 'object' ||
      !Object.prototype.hasOwnProperty.call(it, step)) return undefined;
  it = it[step];
}
return it;
```

The second form also removes the `new Function` dependency, which is the reason this class
stays invisible to SAST.

---

## 5. Affected range

Verified on **3.1.1** only. `compilePointerDereference` has existed since the 2.x line;
all versions that compile pointers should be assumed affected until the maintainer confirms.

Note: the package has had **no release since 2022-07-13**, and the GitHub repository now
returns 404. If the project is abandoned, consumers should be advised to migrate to
`jsonpointer` / `jsonpatch`, both of which use ownership checks.

---

## 6. Disclosure

- No private channel exists (repository 404, no security contact published on npm).
- Published openly with a 45-day window before any wider distribution.
- No downstream application or user data was touched; all tests were in-process.
