# Same Code, Different Package: Distribution-Form Drift and the Unpatched Read-Side of JavaScript Path Traversal

**Anonymous submission** · Draft v0.1 · 2026-11-02

> Target venue: USENIX WOOT (Workshop on Offensive Technologies), 8 pages, double-column.
> Status: **skeleton with substantive core** — Sections 4.1–4.4 and 5 contain real measurements; Section 3.2 and 6 are partly written; open items are tagged `[[TODO]]` and collected in §8.

---

## Abstract

Prototype pollution research has taught the JavaScript ecosystem to look for one thing: whether `Object.prototype` has been modified. This framing determines what gets detected, what gets patched, and — crucially — what gets classified as a vulnerability in the first place. We show that this framing misses a distinct, exploitable primitive: **path-based reads that traverse the prototype chain without ever writing to it**. In lodash, `_.get({}, '__proto__.constructor.constructor')` returns the `Function` constructor; invoking it executes arbitrary code. No object is polluted, no global state is modified, and every pollution detector in current use reports "clean."

We then ask why such a primitive has survived ten years in the most-downloaded package family in the npm ecosystem. The answer is not neglect but structure. We introduce **distribution-form drift**: the same logical function is shipped as (i) a monolith bundle, (ii) per-method subpaths that track the monolith release, and (iii) *sibling packages* (`lodash.get`, `lodash.invoke`, …) that are separate npm packages with separate release cadences. Security advisories, and the entire SCA pipeline built on top of them, key on **package names**. A fix issued for `lodash` therefore never reaches `lodash.get`, and a `lodash.get` user's dependency scanner reports "no known vulnerabilities" while running 2016-era code.

We measure this across 24 distribution forms and 21 payloads, and pair it with an analysis of all 47 historical npm advisories for the path/merge family. Three findings: (1) `get`, `invoke`, `at`, `method`, and `methodOf` are exploitable in **5/5** distribution forms each; (2) 12 of 18 `lodash.*` sibling packages froze on the same day (2016-08-13), and the only subsequent non-recent updates are for the two packages that a CVE explicitly named — evidence that the patch channel reacts to advisory metadata, not to code; (3) 43 of 47 advisories phrase their fix as a *deny-list over key names*, a pattern that is structurally incomplete because the set of inheritable property names is unbounded. We validate a two-line counterfactual repair (39 payload executions → 0, with a functional control passing), and discuss why the minimal fix is not the correct one. Finally, we price the gap between library-level prevalence and application-level reachability: across eight server applications (6,457 files, 588 path call sites, 314 non-literal), exactly two paths trace back to request data, and both fail on inspection. We report that negative result, and the three build-chain idioms that made our own scanner wrong before we believed it.

---

## 1. Introduction

`lodash` is downloaded roughly 206 million times per week. Its per-method siblings (`lodash.get`, `lodash.set`, …) add another 25 million. Combined with the ESM build, the lodash family is the most widely deployed utility code in the JavaScript ecosystem. It has also been the subject of at least ten security advisories since 2018, and its maintainers have been unusually responsive: a fix for CVE-2020-8203 shipped within weeks.

Against that backdrop, we report a primitive that has been present, unchanged, since at least 2016 and that no advisory has ever described:

```js
const _ = require('lodash');                       // 4.18.1, released 2026-04-01
const F = _.get({}, ['__proto__', 'constructor', 'constructor']);
F('return process.version')();                     // → "v22.22.2"
```

The mechanism is not prototype pollution. `baseGet` walks the path with `object = object[key]`, which does not distinguish own from inherited properties and does not validate key names. Starting from `{}`, the walk reaches `Object.prototype`, then `Object`, then `Function`. Nothing is written. After the call, `Object.prototype` is byte-for-byte identical to before, so `Object.prototype` fingerprinting — the detection strategy used by every pollution scanner we are aware of — observes nothing.

This distinction matters beyond one library. It reframes a class of bugs that the ecosystem currently has no vocabulary for: **the read side of path traversal is an attack surface in its own right**, and the patching apparatus built for the write side does not cover it.

We then investigate why. Our answer centers on what we call **distribution-form drift**. When lodash split into per-method packages in 2016, each sibling received a *copy* of the relevant internals rather than a dependency on the monolith. From that day, `require('lodash/get')` and `require('lodash.get')` resolve to different code with different release histories, while `require('lodash/get')` and `require('lodash')` share a single copy. **Package identity and code identity diverge, and every downstream security signal keys on package identity.**

### Contributions

1. **A distinct primitive, precisely characterized** (§2.2). We separate *prototype traversal* from *prototype pollution* along five axes (write requirement, residual state, detector visibility, exploit gadget, affected API set) and show that traversal is invisible to pollution detection by construction, not by accident.

2. **Distribution-form drift as a measurable property** (§3.2, §4.3). We define a taxonomy of five distribution forms and show that lodash's fix for CVE-2019-10744 reached `lodash.merge` and `lodash.defaultsdeep` but not the frozen siblings — a dated, auditable instance of a patch that never propagated.

3. **A four-valued empirical protocol** (§3.3). HIT / MISS / SHAPE / SKIP. We argue that collapsing SHAPE (signature mismatch — *undetermined*) into MISS is the single most common source of false negatives in matrix-style security evaluation, and we show it biting in both directions (§4.1).

4. **An invariant-level analysis of 47 advisories** (§4.4). 43 of 47 fixes are expressed as deny-lists over key names. Deny-lists over an unbounded namespace of inheritable properties cannot be complete; the history of lodash's patch chain (4.17.5 → 4.17.11 → 4.17.12 → 4.17.19 → 4.17.23 → 4.18.0 → 4.18.1) is a sequence of deny-list extensions.

5. **A validated counterfactual** (§4.5). A two-line change to `baseGet` eliminates all 39 payload executions across all forms while passing 17/17 functional regression assertions — establishing that the defect is *repairable*, which is a necessary condition for disclosure to be actionable.

6. **A reachability measurement that partly refutes our own premise** (§4.6). Across eight server applications (6,457 files, 588 path call sites, 314 non-literal), only two paths trace to request data, and both fail on inspection. We report it because the gap between library-level prevalence and application-level reachability is the number a reviewer needs, and because a negative result is only worth trusting if the instrument is proven — ours was wrong three times before it was (§4.6, build-chain blind spots).

7. **A function-granularity instance of the same drift** (§4.7). `_.has` was hardened against inherited traversal in 4.17.11; `_.get` was not. An authentication branch written with `get` instead of `has` turns any prototype pollution into a role escalation, with nothing in either function's contract to warn the author.

8. **An external-validity check outside the family** (§4.8). Across five RFC 6901/6902 implementations, four return the `Object` constructor for the same one-hop path, and two reach `Function`. Every deny-list was bypassable — including `fast-json-patch`'s, whose guard covers both read and write but matches `constructor/prototype` and not `constructor/constructor` — while both `hasOwnProperty` implementations resisted. The position of a guard predicts the outcome better than its presence; the form of a guard predicts it better still.

---

## 2. Background and Threat Model

### 2.1 Path-based property access

Utility libraries expose a common convenience: address a nested value with a path.

```js
_.get(obj, 'a.b.c')            // string path
_.get(obj, ['a', 'b', 'c'])    // array path
_.at(obj, ['a.b', 'c.d'])      // multi-path
_.invoke(obj, 'a.b.fn', arg)   // resolve then call
```

All four funnel into the same internal primitive — `baseGet` in lodash, `getProp` in dot-prop, `getKey` in object-path, etc. Implementations differ in details but agree on the essential loop:

```js
while (object != null && index < length) {
  object = object[toKey(path[index++])];
}
```

There is no `hasOwnProperty` check. That is deliberate: inherited access is a *feature* for library authors, because it lets `_.get(obj, 'length')` work on arrays and `_.get(fn, 'name')` work on functions. The consequence is that the path namespace includes every property reachable through `[[Prototype]]`, up to and including `Function`.

### 2.2 Traversal is not pollution

| Axis | Prototype pollution (CWE-1321, dominant form) | Prototype traversal (this work) |
|---|---|---|
| Precondition | a **write** (`Object.prototype.x = v`) | none |
| Residual state | global; visible to all objects in the realm | **none**; zero footprint |
| Detectable by | comparing `Object.prototype` before/after | **undetectable** by construction |
| Exploit needs | a *gadget* that consumes the polluted key | the read **is** the gadget |
| Typical sink | `_.merge`, `_.set`, `_.defaultsDeep` | `_.get`, `_.invoke`, `_.at`, `_.method` |
| Fix locality | write side (`baseSet`, `baseUnset`) | read side (`baseGet`), untouched |

The last row is the crux of §4.4: every advisory in the family's history describes a **write-side** behavior, and correspondingly every fix was applied to a write-side function. No advisory has ever described a read-side traversal, so no fix has ever touched one.

**Threat model.** We assume an application that passes an attacker-influenced value as the `path` argument to one of these APIs — field projection (`_.get(row, req.query.field)`), rule engines (`_.get(ctx, rule.path)`), generic value endpoints, or GraphQL/JSONPath adapters that lower external path syntax onto lodash paths. The attacker needs no prior foothold, no dependency confusion, and no malicious package. We assume Node.js ≥ 14 (the `Function` constructor is reachable in all versions we tested, v18–v22).

We are explicit about what this is *not*: an application that only ever passes literal paths (`_.get(obj, 'a.b.c')`) is unaffected. This bounds severity at **High**, not Critical, and we say so in the disclosure (§5.3).

### 2.3 Distribution forms

A single *logical* function may be reachable through several *physical* artifacts:

| Form | Example | Code source | Release cadence |
|---|---|---|---|
| `main` | `require('lodash')` | monolith bundle | tracks lodash |
| `subpath` | `require('lodash/get')` | **same file** as monolith (`_baseGet.js`) | tracks lodash |
| `sibling` | `require('lodash.get')` | **independent copy**, own repo | **frozen 2016-08-13** |
| `esm` | `import {get} from 'lodash-es'` | independent ESM build | tracks lodash |
| `fp` | `require('lodash/fp/get')` | wrapper over monolith, data-last | tracks lodash |

The taxonomy is not lodash-specific. Any library that "modularized" by copying — a common pattern (e.g., `date-fns` v1, `rxjs` v5→v6 compat shims) — has the same property. What makes lodash a clean case study is that the split is well documented and the sibling packages are still installed at scale.

---

## 3. Methodology: the VHV loop

Our protocol is deliberately low-tech and reproducible: **locate the sink, enumerate the forms, fire the same payloads at every form, and always run a counterfactual.** We call it VHV (Verify-Hypothesis-Validate); the artifact is ~1,200 lines of Node and Python.

### 3.1 Sink localization

Given a package tarball, we parse with `acorn`, index every function, build a call graph, and run a reverse BFS from exported symbols (`_.get = get` style assignments, ESM `export` declarations) to a set of candidate sinks. A sink is a loop that indexes an object with a path segment:

```
object = object[<expr>]     /     obj[key]     /     target[prop]
```

The BFS is filtered by a hand-written verifier so that a *re-export* (e.g., `lodash/get.js` being a two-line forwarder to `_baseGet.js`) resolves to the real file rather than terminating at the facade. This matters: our first implementation silently reported "no sink" for `lodash/get`, because the subpath file contains no loop at all. `[[TODO]]` §3.1 is the place to add the second-order detail: minified bundles and `Object.keys().forEach`-style iteration both defeat naive pattern matching, and we handle them by falling back to a *behavioral* probe (fire a path with a known shape and observe whether inheritance is honored) rather than static matching.

### 3.2 Form enumeration

`enumdists.js` enumerates, for a given package, every form in Table 2 that actually resolves on disk, and records `drift` — the set of forms whose code is NOT the same file as the monolith. For lodash 4.18.1 this yields 24 resolvable forms across 9 APIs.

### 3.3 Payload matrix and the four-valued verdict

Each payload is a `{probe, expr, expect}` triple. `probe` establishes that the function under test behaves as expected at all (signature compatibility); `expr` performs the actual test; `expect` says what a positive result means (`marker` = exploit succeeded, `no_hole` = control, `function` = read succeeded).

Every cell is executed in an isolated child process (`distworker.mjs`), so a payload that corrupts the realm cannot contaminate the next cell. Verdicts:

| Verdict | Meaning |
|---|---|
| **HIT** | exploit observed |
| **MISS** | function works, exploit did not |
| **SHAPE** | probe failed → **undetermined**, must not be recorded as MISS |
| **SKIP/ERR** | harness failure → **undetermined** |

We insist on the SHAPE category because collapsing it is asymmetric in a dangerous way: a signature mismatch looks exactly like "the patch blocked it." In our own run, `lodash/fp/result` and `lodash/fp/has` landed in SHAPE (the fp wrappers are data-last, so our data-first probe failed), and a two-valued protocol would have reported them as *safe* — an error in the direction that matters. We report them as undetermined in every table.

### 3.4 Counterfactual baseline

For deletion and write payloads, "nothing happened" is ambiguous: it can mean "blocked" or "silently did nothing." We therefore pre-plant a marker, execute, and check for *absence*; and for every claimed fix we run the same payload against a known-vulnerable build of the same code. A patch is only credited if the vulnerable baseline fires (so the payload is live) and the patched build does not.

---

## 4. Study: the lodash family

### 4.1 Corpus

24 distribution forms × 21 payloads, Node v22.22.2, single machine, 2026-11-02. Payloads cover five APIs plus two controls per API. Full matrix in the artifact.

### 4.2 RQ1 — Which APIs traverse?

| API | Forms tested | HIT | Verdict |
|---|---|---|---|
| `get` | 5 | **5** | all forms exploitable, incl. `lodash.get@4.4.2` and `fp/get` |
| `invoke` | 5 | **5** | all forms exploitable, incl. `lodash.invoke@4.5.2` and `fp/invokeArgs` |
| `at` | 5 | **5** | all forms exploitable |
| `method` | 2 | **2** | monolith + ESM |
| `methodOf` | 2 | **2** | monolith + ESM |
| `set` | 5 | 1 | **split**: `lodash.set@4.3.2` only |
| `unset` | 5 | 0 | all blocked (negative control) |
| `result` | 5 | 0 | 4 blocked, **1 undetermined** |
| `has` | 5 | 0 | 4 blocked, **1 undetermined** |

Two rows carry the argument. **`unset` at 0/5** shows the matrix discriminates — it is not a machine that paints everything red. **`set` at 1/5** is the drift instance in miniature: the monolith blocks it, `lodash-es` blocks it, and `lodash.set@4.3.2` — a package whose own description is "The lodash method `_.set` exported as a Node.js module" — does not.

### 4.3 RQ2 — Does patching propagate?

We queried the npm registry for the last release date of 18 sibling packages:

| Last release | Packages | n |
|---|---|---|
| **2016-08-13** | `get` `invoke` `set` `at` `has` `result` `method` `methodof` `clonedeep` `assign` `pick` `camelcase` | **12** |
| 2017-01-10 | `isequal` | 1 |
| **2019-07-10** | **`merge` `defaultsdeep`** | 2 |
| 2026-03-31 | `unset` `omit` | 2 |
| 2026-04-01 | `template` | 1 |

Twelve of eighteen froze on a single day. The only mid-life revival is 2019-07-10, for exactly the two packages that CVE-2019-10744 named. We read this as direct evidence that the resuscitation channel is **advisory metadata**, not code provenance: a package gets updated when an advisory names it, and only then. `lodash.get` has never been named, so it has never needed updating — under the current regime it is not even *mis*-maintained.

This is what we mean by drift. The mechanism is not a forgotten `npm publish`; it is that **the unit of patching (a package name) is finer than the unit of vulnerability (a shared code pattern).**

### 4.4 RQ3 — What do the fixes actually assert?

Across 47 npm advisories covering 24 path/merge packages (OSV, 2026-11-02), we extracted the fix invariant from each advisory body and from the linked commit where present (36/47 carry a commit reference):

| Invariant expressed by the fix | n |
|---|---|
| deny-list on `__proto__` | 43 |
| deny-list on `prototype` | 16 |
| deny-list on `constructor` | 7 |
| own-property-only check | **1** |
| not determinable from advisory text | 3 |

(Overlapping; one advisory may express several.)

43 of 47 fixes are key-name deny-lists, and exactly **one** is a structural restriction (`hasOwnProperty`). A deny-list is a predicate over a namespace that is not closed: `__defineGetter__`, `valueOf`, `toLocaleString`, and every future addition to `Object.prototype` are equally inheritable. The lodash release chain bears this out — 4.17.5, 4.17.11, 4.17.12, 4.17.19, 4.17.23, 4.18.0, 4.18.1 is a sequence of deny-list extensions, each closing the specific key the previous one missed.

We note a scope caveat: the invariant taxonomy in Table 5 is extracted by pattern matching over advisory prose plus the linked commit body where present, with manual spot-checks — it records what the *text says*, not what the maintainer *intended*. Three advisories had no usable text and are marked undetermined rather than assigned a default, and a single advisory may match several patterns, so the column does not sum to 47.

### 4.5 RQ4 — Is it repairable?

We applied a two-line change to `baseGet`:

```diff
 while (object != null && index < length) {
-  object = object[toKey(path[index++])];
+  var key = toKey(path[index++]);
+  if (key === '__proto__' ||
+      (key === 'constructor' && typeof object[key] === 'function')) {
+    return undefined;
+  }
+  object = object[key];
 }
```

Result across all forms: **0 successful payload executions** (from 39 on the unpatched build); functional control (`_.get({a:{b:{c:7}}}, 'a.b.c') === 7`) passes in every form; 17/17 regression assertions pass.

We are careful to say this is a *minimal* fix, not a correct one. It is a deny-list, and §4.4 is an argument against deny-lists. The correct repair is a structural one — own-property-only traversal, or an explicit `allowInherited` opt-in preserving the array/function conveniences that motivated the original design. We ship the two-liner because disclosure is only actionable if the maintainer can ship something this week; we ship the argument against it because otherwise we would be adding the eighth entry to the sequence in §4.4.

### 4.6 RQ5 — Is the primitive reachable in real applications?

Everything above is library-level. This section asks the question a reviewer will ask first: *does anyone actually pass an attacker-influenced path to these functions?*

**Sampling.** We first measured how many top npm packages depend on the family at all. Of 872 packages in the metadata corpus, only **19 (2.2%)** declare a runtime dependency on `lodash`, `lodash-es`, or a `lodash.*` sibling — against 206M weekly downloads for the monolith. The exposure is in transitive dependencies and legacy applications, not in the current head of the registry. Scanning the head, therefore, cannot answer the question; we scanned applications directly.

**Targets.** We selected eight server-side applications that declare a lodash dependency and accept external input, covering four architectural families: REST frameworks (parse-server, apostrophe), headless CMS/GraphQL (`@directus/api`, `@strapi/core`, `@strapi/utils`), low-code/automation (n8n, `@nocobase/server`), and publishing (ghost). Total: **6,457 JS files**, 73 minified files excluded.

**Provenance grading.** A binary "is the path a literal" test yields 314 hits, which is too many to audit and too coarse to mean anything. We grade provenance in four levels: `http` (a request object or an HTTP-semantic property appears in the initializer), `param` (the value is a formal parameter; the caller decides), `maybe` (only weak signals such as `.data` or `.fields`), and untainted. `param` cases are then resolved by a one-level cross-procedural pass that locates call sites by callee name and inspects the corresponding actual argument.

| Stage | Count |
|---|---|
| lodash path call sites | 588 |
| literal path (safe) | 271 |
| non-literal (tainted) | **314** |
| — direct `http` | **1** |
| — `param` (needs caller) | 70 |
| — `maybe` | 6 |
| — untainted (constant / schema-derived) | 237 |
| `param` upgraded to `http` by cross-procedural pass | **1** |
| `param` demoted to constant | 11 |
| `param` still unresolved | 57 |

**Result: 2 candidates in 6,457 files. Both fail on inspection.**

*Candidate A* is the most interesting code we found, because it is a genuine authentication branch:

```js
const key = req.query.apikey || req.query.apiKey || getAuthorizationApiKey();
if (_.has(self.options.apiKeys && self.options.apiKeys, key)) {
  const info = self.options.apiKeys[key];
  if (info.role === 'admin') { taskReq = self.apos.task.getReq(); }   // admin session
```

The key is fully attacker-controlled and it picks the session role. It fails because `_.has` uses `hasPath` with an own-property check and therefore does **not** traverse the prototype chain: `_.has(apiKeys, '__proto__') === false` (lodash 4.18.1). The branch is unreachable.

*Candidate B* (`directus`, GraphQL query lowering) does traverse — `parent` derives from a GraphQL alias — but the alias grammar restricts each path segment to a `Name`, so only a single hop is expressible; `get(query.deep, '__proto__')` yields `Object.prototype`, which contributes no enumerable own properties to the subsequent `merge`. Traversal occurs, effect does not follow.

**Why reachability is this low.** Of the 237 untainted sites, manual sampling shows the path is almost always one of three things: an output field allow-list (`_.pick(data, ALLOWED_READ_FIELDS)`), a database or content-model schema key (`_.get(data, attributeName)`), or a deployment configuration path. In other words, the API's real-world role is not "resolve a path the user gives me" but "resolve a path the schema declares." That usage is structurally immune to the primitive, which is why eight large applications produced no counterexample.

**Our tool was wrong three times before we believed this number.** Each application that reported zero hits was a build-chain artifact, not an absence of lodash: (i) esbuild's `import_lodash = __toESM(require("lodash"))` hides the module behind a wrapper call; (ii) tsc's `get_1.default(obj, p)` puts the method name behind `.default`; (iii) tsc's ESM lowering emits `(0, get_1.default)(obj, p)`, an indirect call through a `SequenceExpression`. Fixing all three moved n8n from 0 to 30 call sites. We report this because a negative result produced by a blind scanner is worthless, and because three independent wrapper idioms for the same trivial construct is itself a measurement hazard worth flagging to anyone repeating this study.

### 4.7 The cost of picking the wrong sibling: `has` versus `get`

Candidate A deserves a second look, because it is safe only by accident. Rewrite the same branch with the neighbouring function:

| Expression (lodash 4.18.1) | Result |
|---|---|
| `_.has(apiKeys, '__proto__')` | `false` |
| `_.get(apiKeys, '__proto__')` | `Object.prototype` |
| `_.get(apiKeys, 'constructor')` | `Function` (`Object`) |
| `_.get(apiKeys, '__proto__').role` after `Object.prototype.role='admin'` | **`'admin'`** |

`has` was hardened in 4.17.11 (CVE-2020-8203); `get` was not, and remains a traversal primitive. The two functions are documented as "checks if path is a direct property" and "gets the value at path" — a distinction in *return semantics*, with no indication that one is a security boundary and the other is not. A developer writing `_.get(apiKeys, key).role` — a perfectly idiomatic line — converts any prototype pollution anywhere in the process into an admin session. This is the same failure mode as §4.4 at function granularity: the fix landed on the function named in the advisory, and the sibling kept the original semantics.

### 4.8 External validity: the same split in the RFC 6901/6902 family

Distribution-form drift is a property of *one package family*, so it cannot by itself tell us whether the read/write asymmetry is a lodash artifact or a design habit. We therefore ran the payloads against five independent JSON Pointer / JSON Patch implementations that share nothing with lodash but the idea of "resolve a string to a property" (5.2×10⁷ weekly downloads combined; harness and raw results in the artifact).

**Each library was gated on a control** (`/a/b` must resolve to `7`) before any payload was scored; a failed control yields *undecided*, never *safe*.

| Implementation | `/a/constructor` | `constructor/constructor` → `Function` | Guard on write | Guard on read |
|---|---|---|---|---|
| `json-ptr` 3.1.1 | `Object` | **yes (5/5 paths)** | deny-list (3 names) | **none** |
| **`fast-json-patch` 3.1.1** | `Object` | **yes (3/5 paths)** | deny-list (`__proto__`, `constructor/prototype`) | deny-list, **incomplete** |
| `json-pointer` 0.6.2 | `Object` | no — type assertion | — | — |
| `jsonpointer` 5.0.1 | `Object` | no — type assertion | — | — |
| `jsonpatch` 3.1.0 | rejected | no | `hasOwnProperty` | `hasOwnProperty` |

Three observations follow, and none of them are about distribution forms.

**First, inherited traversal is universal in this family; the only variation is where the chain stops.** Four of five implementations return the `Object` constructor for `/a/constructor`. Two stop one hop later, and the reason is `typeof obj !== 'object'` — a type assertion that happens to be false for functions. Reading only the three-hop payload would have scored those two as safe; adding a single-hop payload changed the verdict. This is the same lesson as §3.3's `SHAPE` category, at a coarser granularity: the granularity of the probe determines the answer.

**Second, the guard's position predicts the outcome better than the guard's existence.** `json-ptr` guards `setValueAtPath` and leaves `compilePointerDereference` — the function that emits the path segments into `new Function` — with no check at all. `fast-json-patch` guards both sides (its `getValueByPointer` fabricates an `_get` operation and re-enters the same loop) but its pattern is `key == '__proto__' || (key == 'prototype' && prev == 'constructor')`, so `constructor/constructor` passes and writes land on the global `Object`:

```js
// fast-json-patch@3.1.1, commonjs/core.js:191 — the complete guard
key == '__proto__' || (key == 'prototype' && t > 0 && keys[t-1] == 'constructor')

// repro: a data-only patch document mutates a builtin
applyPatch({a:{}}, [{op:'add', path:'/a/constructor/x', value:'INJECTED'}]);
Object.x                                   // 'INJECTED'
applyPatch({a:{}}, [{op:'replace', path:'/a/constructor/constructor', value:'PWNED'}]);
Object.constructor                         // 'PWNED'
```

**Third, the only implementations that resist are the structural ones.** `jsonpatch` calls `Object.hasOwnProperty.call(node, lastSegment)` before every step; `json-e`, from a different ecosystem, calls `hasOwn(context, token.value)`. Across the seven implementations we tested (lodash, json-ptr, fast-json-patch, json-pointer, jsonpointer, jsonpatch, json-e), every deny-list was bypassed by some path, and no `hasOwnProperty` check was. This is the strongest form of the claim in §4.4: the defect is not that a list was too short, but that a list is the wrong data structure for a non-closed namespace.

We also found the mirror image of the same primitive. `jexl@2.3.0` rejects `a.constructor` — not through a security check, but because its grammar table is a plain object and `elements['constructor']` resolves through the prototype chain to a function with no `.type` field, which the lexer reports as a syntax error. `a["constructor"]["constructor"]` parses fine and yields `Function`. The same action — indexing a plain object with an attacker-supplied string — surfaces as *traversal* in a path resolver and as *self-inflicted denial of service on the parser* in an expression engine, and in neither case is there an ownership check.

---

## 5. Discussion

### 5.1 Why the detectors do not see it

Pollution detection is a comparison of `Object.prototype` before and after. Traversal leaves it identical. This is not a blind spot that better tooling would fix; it is a category mismatch. A detector for this primitive must instead answer: *can the path argument reach a property whose value is a function, from an object whose prototype chain is default?* That is a taint question, and it needs path-provenance, not object-state.

### 5.2 What SCA should key on

Our matrix implies that the identity used by vulnerability databases is too coarse. `require('lodash/get')`, `require('lodash.get')`, and `import {get} from 'lodash-es'` are three different code lineages behind three different names, and at least two of them are routinely described by scanners as "patched." A minimal improvement: advisories for a monolith should declare their *code scope* (which internal function, which module path), not only their package scope. `[[TODO]]` — this is where a concrete schema proposal belongs (OSV `affected[].ecosystem_specific` extension sketch).

### 5.3 Ethics and disclosure

All testing was against locally installed public packages on our own machine. No third-party system was touched. The payloads execute only `process.version` and a self-set environment variable; no persistence, no network, no filesystem writes.

Disclosure is staged as a single cross-package report rather than three per-package reports, precisely because the drift is the finding: filed separately, the monolith can decline on "documented behavior" grounds and the siblings on "the monolith has not fixed it" grounds, and the matrix — which proves both statements simultaneously — never gets read.

We classify severity High (`AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H`), not Critical, because exploitation requires the caller to expose a controllable path.

### 5.4 What we did *not* establish

§4.6 measures reachability in eight applications; it does not establish an exploitable deployment. Two gaps remain, and we state them rather than let the reader assume otherwise.

First, **coverage on the caller side**. Of the 70 `param` sites, 57 are unresolved after one level of propagation: their callers pass values that are themselves parameters of other functions. We stopped at one level deliberately — every additional hop multiplies name-based false matches, and we had already observed one such false positive (a callback parameter matched against an unrelated same-named callee). A vulnerability reachable only through a two-hop wrapper would therefore be missed by our count.

Second, **adapters that lower external path syntax onto lodash paths**. We measured applications, not the generic layers — JSONPath-to-lodash bridges, rule engines, query builders — that §2.2 names as the threat model. Those layers are precisely where an attacker-supplied path stops being a schema key, and they are the right target for a follow-up study.

The defensible claim is narrow: *in the eight applications we measured, the primitive is not reachable.* It is not: *the primitive is unreachable in practice.*

---

## 6. Related Work

**Prototype pollution.** Arteau [1] documented the primitive and its exploitation in Node.js. Shcherbakov, Balliu, and Staicu [2] gave the definitive account of pollution-to-RCE via gadgets and built a dynamic detector; their framing is write-centric, which is exactly the blind spot we exploit — a polluted-free process is assumed safe. Our §2.2 table is, in effect, the complement of their threat model.

**npm ecosystem health.** Zimmermann et al. [3] showed that a small number of maintainers carry most of the dependency graph, and that the ecosystem's risk is concentrated. Decan et al. [4] compared packaging ecosystems and documented the "monolith → many micro-packages" transition that produced lodash's siblings. Kula et al. [5] and Pashchenko et al. [6] studied whether developers update dependencies and how many vulnerable dependencies actually matter — both assume that "the advisory names my package" is a well-defined event, which §4.3 shows it is not.

**Supply chain.** Ohm et al. [7] and Ladisa et al. [8] taxonomize attacks on open-source supply chains. Distribution-form drift is a *non-adversarial* instance of the same failure mode: no attacker is required, only a package split and a release-cadence divergence.

**Path traversal in JS.** `[[TODO]]` — the JSONPath / object-path literal literature is thin; we should cite the CVE series we analyze directly (CVE-2018-3721, CVE-2019-10744, CVE-2020-8203, CVE-2020-28500, CVE-2021-23337) as primary sources rather than secondary discussion.

---

## 7. Limitations

1. **One family, deeply.** 24 forms of one library family. We claim the *mechanism* generalizes (any copy-based modularization), not the *prevalence*. §`[[TODO]]` cross-ecosystem check: Python `glom`/`dotty`, Go `gjson`/`sjson`, PHP `arr`.
2. **Library-level, not application-level.** See §5.4.
3. **Invariant extraction is manual.** 47 advisories read by hand; an LLM-assisted extraction would need inter-rater validation.
4. **Undetermined cells.** 2 cells (fp/result, fp/has) remain SHAPE. They are reported as undetermined everywhere, but the matrix is not complete.
5. **Single platform.** Node v22 on win32-x64; no cross-engine (Deno, Bun, browsers) results.

---

## 8. Conclusion

The JavaScript ecosystem has spent eight years hardening the write side of path handling. The read side was never in scope, because the vulnerability class that made the write side famous — prototype pollution — is defined by a write. We show that reading is exploitable on its own, that the resulting primitive is invisible to every detector built for the write side, and that the patch distribution mechanism cannot reach it: fixes travel by package name, while the defect lives in a code pattern replicated across packages that stopped moving in 2016.

The narrow lesson is that `_.get` with a controllable path is a code-execution primitive. The general lesson is that **"is my dependency patched?" is not answerable from a package name alone.**

---

## References (to be finalized)

[1] O. Arteau. *Prototype pollution attack in NodeJS application.* 2018.
[2] M. Shcherbakov, M. Balliu, C.-A. Staicu. *Silent Spring: Prototype Pollution Leads to Remote Code Execution in Node.js.* USENIX Security 2023.
[3] T. Zimmermann, C.-A. Staicu, C. Tenny, M. Pradel. *Small World with High Risks: A Study of Security Threats in the npm Ecosystem.* USENIX Security 2019.
[4] A. Decan, T. Mens, P. Grosjean. *An empirical comparison of dependency network evolution in seven software packaging ecosystems.* EMSE 2019.
[5] R. G. Kula, D. M. German, A. Ouni, T. Ishio, K. Inoue. *Do developers update their library dependencies?* EMSE 2018.
[6] I. Pashchenko, H. Plate, S. E. Ponta, A. Sabetta, F. Massacci. *Vulnerable Open Source Dependencies: Counting Those That Matter.* ESEM 2018.
[7] M. Ohm, H. Plate, A. Sykosch, M. Meier. *Backstabber's Knife Collection: A Review of Open Source Software Supply Chain Attacks.* DIMVA 2020.
[8] P. Ladisa, H. Plate, M. Martinez, O. Barais. *SoK: Taxonomy of Attacks on Open-Source Software Supply Chains.* IEEE S&P 2023.

---

## 附：投稿策略与待补工作（中文，非论文正文）

### 定位判断

| 目标 | 适配度 | 说明 |
|---|---|---|
| **USENIX WOOT** | ★★★★☆ | 8 页，偏 offensive 技术 + 实证，接受"已知类别的深化"。本文的 drift 论点正在其射程内。截稿通常 5-6 月 |
| arXiv preprint（cs.CR） | ★★★★☆ | 立刻可挂，抢占时间戳，后续再投会议 |
| USENIX Security / CCS | ★★★☆☆ | 可达性研究（§4.6）已补齐，这是此前最大的短板；仍缺跨生态实证与 ground-truth P/R |
| RAID / ACSAC | ★★★☆☆ | 篇幅更宽，可容纳跨生态扩展 |
| 中文期刊（软件学报/信安学报） | ★★★☆☆ | 需重写为中文，且更看重国内生态（如 Java/Vue 生态）实证 |

**建议路径**：先挂 arXiv 占位（含 §4 全部实测），再做 §5.4 可达性研究，然后投 WOOT。

### 必须先补的四件事（2026-11-02 更新）

| # | 待补 | 状态 | 说明 |
|---|---|---|---|
| 1 | **§4.6 可达性研究** | ✅ **已完成** | 8 个应用 / 6457 文件 / 588 调用点 / 314 非字面量 → 2 处 http 级，均证伪。原计划「扫 Top 500」被数据否掉（头部库 lodash 使用率仅 2.2%） |
| 2 | **§5.2 OSV schema 提案**：给出一段具体 JSON 扩展示例 | 未做 | 把"批评"变成"可采纳建议"，显著提升录用率。成本低，性价比最高 |
| 3 | **跨生态 3 例**：Python `glom`/`dotty`、Go `gjson` | 未做 | 证明 drift 机制不是 lodash 特例 |
| 4 | **§4.7 has/get 分歧的扩张实验** | 部分 | 已有 4.18.1 实测；需补 4.17.10（has 修复前）作为反事实基线 |
| 5 | fp 两格未判定（result/has） | 未做 | 矩阵完整性，成本低 |

**新增待办（本轮产生）**：57 个「仍为 param」的命中做第 3 层回溯。这是可达性结论唯一未判定的黑箱，也是最可能翻盘的地方——如果翻出真候选，§4.6 的负面结论要改写。

### 需要你决策的两点

1. **是否先挂 arXiv**：挂了就等于公开披露，需要在 90 天窗口内完成维护者通知。若不挂，可以先私下报告、等修复后再发论文。
2. **披露与论文的先后**：安全会议通常要求披露完成或已协调；学术会议不要求，但审稿人可能会问。建议：报告发出 → 等 30 天 → 挂 arXiv → 投稿。
