### Summary

**GHSA-m9hw-7xfv-wqg7** (prototype pollution, high) was fixed in **2.0.0** by removing the `method` operator entirely. The same reachability still exists one operator away, through `var`, which walks a dot-separated path with raw property access and no own-property check:

```js
"var": function (a, b) {
  var sub_props = String(a).split(".");
  for (var i = 0; i < sub_props.length; i++) {
    // ... no hasOwnProperty check
    data = data[sub_props[i]];
  }
  return data;
}
```

Because `constructor` and `__proto__` are inherited from `Object.prototype`, a rule can walk straight into the engine's own globals - the capability the 2020 fix removed from `method`.

### Reproduce (json-logic-js 2.0.5, Node 22)

```js
const jsonLogic = require('json-logic-js');

jsonLogic.apply({ var: 'user.role' }, { user: { role: 'user' } });   // "user"  (control)

// the historical fix is intact - good:
jsonLogic.apply({ method: [{ var: 'x' }, 'constructor'] }, { x: {} });
// Error: Unrecognized operation method

// but the same target is still one operator away:
jsonLogic.apply({ var: '__proto__.constructor.constructor' }, {});  // => [Function: Function]
```

### Why it matters

In a rule engine the rule itself is untrusted input, so no additional precondition is needed on the data side - the rule is the payload. Note that this is exactly the value the library already decided (in the `method` case) that rules must not be able to name.

Being precise about the boundary: the library **returns** the `Function` constructor, it does not call it. Escalation to code execution requires the consuming application to invoke the resolved value. I am not claiming an end-to-end RCE and I have not tested any hosted service.

### Suggested fix

Two layers, both small:

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

The ownership check alone covers the whole class (it also catches `valueOf`, `toString`, `__defineGetter__`, and anything added to `Object.prototype` later); the explicit key checks just make the intent obvious and keep behaviour identical for ordinary documents. `json-e` and `jmespath` in the same ecosystem already use structural checks and resisted every payload I tried.

### Affected range

Verified on **2.0.5** only. The `var` loop has had this shape for many releases - please confirm the range from git history rather than from my claim.

---

### On disclosure

This repository has private vulnerability reporting **disabled**, so there is no private form available. I am posting the minimal version rather than dropping a full technical report into a public thread unasked.

If you enable *Settings -> Code security -> Private vulnerability reporting*, or tell me how to reach you privately, I will send the complete report: the runnable harness (`verify_local.js`), the suggested patch as a diff, and the results of re-running the operator test suite against it.

If you would rather keep it public, say so and I will post the full detail here - your call.