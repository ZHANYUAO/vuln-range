'use strict';
/**
 * verify_local.js — 三条发现的本地可复现验证（对照组 + HIT/MISS）
 *
 * 运行：
 *   NODE_PATH="C:/Users/yuao/WorkBuddy/2026-10-10-17-02-37/vuln-range/vhv/engines/pkgs" node verify_local.js
 *
 * 安全边界：只读本文件自身长度、只执行 6*7，不写盘、不联网。
 */
const path = require('path');
const NM = process.env.NODE_PATH || path.join(__dirname, '..', 'vuln-range', 'vhv', 'engines', 'pkgs');

const load = (n) => require(path.join(NM, n));
const ver = (n) => require(path.join(NM, n, 'package.json')).version;
const out = [];
const rec = (id, state, detail) => { out.push({ id, state, detail }); console.log(`[${state}] ${id}${detail ? '  -> ' + detail : ''}`); };

console.log('='.repeat(78));
console.log(`node ${process.version}`);
console.log('='.repeat(78));

// ---------------------------------------------------------------- json-ptr
try {
  const { JsonPointer } = load('json-ptr');
  console.log(`\n## json-ptr ${ver('json-ptr')}`);
  // control
  const ok = JsonPointer.get({ user: { role: 'user' } }, '/user/role');
  rec('jsonptr.control', ok === 'user' ? 'PASS' : 'FAIL', String(ok));
  // write guard (intended protection)
  try {
    JsonPointer.set({}, '/__proto__/polluted', 'x');
    rec('jsonptr.set_guard', 'MISS', 'write allowed (unexpected)');
  } catch (e) {
    rec('jsonptr.set_guard', 'PASS', 'blocked: ' + e.message.slice(0, 60));
  }
  // read bypass
  const F = JsonPointer.get({}, '/__proto__/constructor/constructor');
  rec('jsonptr.read_bypass', typeof F === 'function' ? 'HIT' : 'MISS', typeof F);
  // escalation only if the caller invokes the returned value
  if (typeof F === 'function') {
    rec('jsonptr.caller_invokes', 'HIT(conditional)', String(F('return 6*7')()));
  }
} catch (e) { rec('jsonptr', 'ERR', e.message); }

// ---------------------------------------------------------- fast-json-patch
try {
  const jp = load('fast-json-patch');
  console.log(`\n## fast-json-patch ${ver('fast-json-patch')}`);
  const ctrl = jp.getValueByPointer({ a: { b: 7 } }, '/a/b');
  rec('fjp.control', ctrl === 7 ? 'PASS' : 'FAIL', String(ctrl));
  // guard fires on __proto__
  try {
    jp.applyPatch({ a: {} }, [{ op: 'add', path: '/__proto__/x', value: 1 }]);
    rec('fjp.guard_proto', 'MISS', 'not blocked');
  } catch (e) { rec('fjp.guard_proto', 'PASS', 'blocked: ' + e.message.slice(0, 50)); }
  // bypass: constructor alone is not matched
  const f = jp.getValueByPointer({}, '/constructor/constructor');
  rec('fjp.read_bypass', typeof f === 'function' ? 'HIT' : 'MISS', typeof f);
  const doc = { a: {} };
  jp.applyPatch(doc, [{ op: 'add', path: '/a/constructor/x', value: 'INJECTED' }]);
  rec('fjp.write_bypass', Object.x === 'INJECTED' ? 'HIT' : 'MISS', 'Object.x=' + Object.x);
} catch (e) { rec('fjp', 'ERR', e.message); }

// ------------------------------------------------------------ json-logic-js
try {
  const jl = load('json-logic-js');
  console.log(`\n## json-logic-js ${ver('json-logic-js')}`);
  const ctrl = jl.apply({ var: 'user.role' }, { user: { role: 'user' } });
  rec('jl.control', ctrl === 'user' ? 'PASS' : 'FAIL', String(ctrl));
  const F = jl.apply({ var: '__proto__.constructor.constructor' }, {});
  rec('jl.var_bypass', typeof F === 'function' ? 'HIT' : 'MISS', typeof F);
  // historical method operator is gone (control that the old fix holds)
  try {
    jl.apply({ method: [{ var: 'x' }, 'constructor'] }, { x: {} });
    rec('jl.method_op', 'MISS', 'method operator still present');
  } catch (e) { rec('jl.method_op', 'PASS', 'removed: ' + e.message.slice(0, 40)); }
} catch (e) { rec('jl', 'ERR', e.message); }

console.log('\n' + '='.repeat(78));
console.log('HIT=' + out.filter(x => x.state.startsWith('HIT')).length +
            ' PASS=' + out.filter(x => x.state === 'PASS').length +
            ' MISS=' + out.filter(x => x.state === 'MISS').length +
            ' ERR=' + out.filter(x => x.state === 'ERR').length);
