# `var` operator reaches the Function constructor in json-logic-js 2.0.5

**Package**: `json-logic-js` (npm)
**Repository**: https://github.com/jwadhams/json-logic-js
**Version tested**: 2.0.5 (latest, published 2024-07-09; verified 2026-11-05)
**Category**: CWE-1321 (prototype pollution, read-side) / CWE-668
**Reported by**: independent security research

---

## 1. Summary

The `var` operation resolves a dot-separated path with **raw property access** and no own-property check:

```js
// json-logic-js.js
"var": function (a, b) {
  var sub_props = String(a).split(".");
  for (var i = 0; i < sub_props.length; i++) {
    // ...
    data = data[sub_props[i]];
  }
  return data;
}
```

Because `constructor` and `__proto__` are inherited from `Object.prototype`, a rule such as
`{"var": "__proto__.constructor.constructor"}` resolves to the `Function` constructor.

This is the same primitive that was fixed in the `method` operator (GHSA-m9hw-7xfv-wqg7) by **removing the operator entirely** — we verified that the old `method` payload now throws `Unrecognized operation method`, so the historical fix is intact. The `var` path was not covered by that fix.

---

## 2. Reproduction (Node v22.22.2, json-logic-js 2.0.5)

```js
const jsonLogic = require('json-logic-js');

// control: normal rule still works
jsonLogic.apply({ var: 'user.role' }, { user: { role: 'user' } });   // => "user"

// historical fix still holds
jsonLogic.apply({ method: [{ var: 'x' }, 'constructor'] }, { x: {} });
// => Error: Unrecognized operation method

// read-side bypass
const F = jsonLogic.apply({ var: '__proto__.constructor.constructor' }, {});
// => [Function: Function]
```

Harness output:

```
[PASS] jl.control     -> user
[HIT ] jl.var_bypass  -> function
[PASS] jl.method_op   -> removed: Unrecognized operation method
```

---

## 3. Impact — and what we did NOT demonstrate

- In a **rule engine** deployment (the library's purpose), rules are frequently supplied by users or stored in a database. In that model, the rule itself is the payload; no additional precondition is needed on the data side.
- The library **returns** the `Function` constructor. It does **not** call it. Escalation to arbitrary code execution requires the consuming application to invoke the resolved value (or to feed it into a call site).
- We did **not** demonstrate exploitation in a downstream application, and we did not test any hosted service.

Conservative library-level CVSS 3.1:
`AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:L` = **7.3**.
If a downstream application invokes the resolved value, the same chain becomes 9.8 — but that is a property of the consumer, not proven here.

---

## 4. Suggested fix

Two layers, both cheap:

```js
"var": function (a, b) {
  var sub_props = String(a).split(".");
  for (var i = 0; i < sub_props.length; i++) {
    var key = sub_props[i];
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return undefined;
    if (data === null || typeof data !== 'object' ||
        !Object.prototype.hasOwnProperty.call(data, key)) return undefined;
    data = data[key];
  }
  return data;
}
```

The ownership check alone is sufficient for the general class (it also covers `valueOf`,
`toString`, `__defineGetter__`, and any future `Object.prototype` addition); the explicit
keys make the intent obvious and keep behaviour identical for normal documents.

Note that `json-e` and `jmespath` in the same ecosystem already use structural checks and
resisted all payloads we tested.

---

## 5. Affected range

Verified on **2.0.5** only. The `var` implementation is old and unchanged in shape for
many releases; please confirm the range from git history.

---

## 6. Disclosure

- Private report first; no public issue before a fix or 45 days.
- No downstream application or user data was touched.
- The harness (`verify_local.js`) is available on request.
