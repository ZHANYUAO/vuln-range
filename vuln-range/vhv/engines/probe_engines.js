'use strict';
/**
 * 外部路径 / 表达式引擎的危害探针
 *
 * 为什么换目标：Web 应用里"用户能控 path"极罕见（8 个应用 0/8）。
 * 但下面这些库的存在前提就是「让不可信输入指定访问路径」——
 * 它们是 path 可控的天然场所。
 *
 * 判定：能否从「攻击者给的 path 字符串」走到 Function 构造器。
 * 每个引擎都先跑正常取值对照，对照失败一律记 NA（装置问题），不记 MISS。
 */

const path = require('path');
const ROOT = __dirname;
const NM = path.join(ROOT, 'pkgs');
const load = (n) => require(path.join(NM, n));
const ver = (n) => { try { return require(path.join(NM, n, 'package.json')).version; } catch (e) { return '?'; } };

const rows = [];
const rec = (engine, kind, detail, state, extra) => {
  rows.push({ engine, kind, detail, state, extra: extra || null });
};

const DOT = ['__proto__.constructor.constructor', 'constructor.constructor', 'toString.constructor'];
const ARR = [['__proto__', 'constructor', 'constructor']];

function judge(v) { return v === Function; }

// ---------------------------------------------------------------------------
const tests = [];

// 1. object-path —— 最典型的「安全取值」库
tests.push({
  engine: 'object-path', version: ver('object-path'),
  control: () => load('object-path').get({ a: { b: 7 } }, 'a.b') === 7,
  cases: [
    ...DOT.map(p => ({ kind: 'dot', payload: p, run: (p) => load('object-path').get({ a: 1 }, p) })),
    { kind: 'array', payload: '["__proto__","constructor","constructor"]',
      run: () => load('object-path').get({ a: 1 }, ['__proto__', 'constructor', 'constructor']) },
  ],
});

// 2. json-ptr —— RFC 6901 指针
tests.push({
  engine: 'json-ptr', version: ver('json-ptr'),
  control: () => load('json-ptr').JsonPointer.get({ a: { b: 7 } }, '/a/b') === 7,
  cases: [
    { kind: 'pointer', payload: '/__proto__/constructor/constructor',
      run: (p) => load('json-ptr').JsonPointer.get({ a: 1 }, p) },
    { kind: 'pointer', payload: '/constructor/constructor',
      run: (p) => load('json-ptr').JsonPointer.get({ a: 1 }, p) },
  ],
});

// 3. jsonpath-plus —— JSONPath 查询
tests.push({
  engine: 'jsonpath-plus', version: ver('jsonpath-plus'),
  control: () => {
    const r = load('jsonpath-plus').JSONPath({ path: '$.a.b', json: { a: { b: 7 } } });
    return Array.isArray(r) && r[0] === 7;
  },
  cases: [
    { kind: 'jsonpath', payload: '$.__proto__.constructor.constructor',
      run: (p) => { const r = load('jsonpath-plus').JSONPath({ path: p, json: { a: 1 }, wrap: true }); return r[0]; } },
    { kind: 'jsonpath', payload: '$..constructor',
      run: (p) => { const r = load('jsonpath-plus').JSONPath({ path: p, json: { a: 1 }, wrap: true }); return r[0]; } },
  ],
});

// 4. jmespath —— AWS 的查询语言
tests.push({
  engine: 'jmespath', version: ver('jmespath'),
  control: () => load('jmespath').search({ a: { b: 7 } }, 'a.b') === 7,
  cases: [
    ...DOT.map(p => ({ kind: 'dot', payload: p, run: (p) => load('jmespath').search({ a: 1 }, p) })),
  ],
});

// 5. jsonata —— 表达式查询语言
tests.push({
  engine: 'jsonata', version: ver('jsonata'),
  control: () => {
    const e = load('jsonata')('a.b');
    return e.evaluate({ a: { b: 7 } }) === 7;
  },
  cases: [
    { kind: 'expr', payload: '__proto__.constructor.constructor',
      run: (p) => load('jsonata')(p).evaluate({ a: 1 }) },
    { kind: 'expr', payload: 'constructor.constructor',
      run: (p) => load('jsonata')(p).evaluate({ a: 1 }) },
  ],
});

// 6. json-logic-js —— 规则引擎（var 操作符带路径）
tests.push({
  engine: 'json-logic-js', version: ver('json-logic-js'),
  control: () => load('json-logic-js').apply({ var: 'a.b' }, { a: { b: 7 } }) === 7,
  cases: DOT.map(p => ({
    kind: 'var', payload: `{"var":"${p}"}`,
    run: () => load('json-logic-js').apply({ var: p }, { a: 1 }),
  })),
});

// 7. expr-eval —— 表达式引擎（应无路径语义，作负对照）
tests.push({
  engine: 'expr-eval', version: ver('expr-eval'),
  control: () => {
    const E = load('expr-eval');
    const P = E.Parser || E.default && E.default.Parser;
    return P.parse('a + 1').evaluate({ a: 6 }) === 7;
  },
  cases: [
    { kind: 'expr', payload: '__proto__.constructor.constructor',
      run: (p) => {
        const E = load('expr-eval');
        const P = E.Parser || (E.default && E.default.Parser);
        return P.parse(p).evaluate({ a: 1 });
      } },
  ],
});

// ---------------------------------------------------------------------------
console.log('='.repeat(96));
console.log('引擎危害探针：攻击者给的 path 能走到 Function 构造器吗');
console.log('='.repeat(96));

for (const t of tests) {
  let ctrl = false, ctrlErr = null;
  try { ctrl = t.control(); } catch (e) { ctrlErr = e.message; }

  const ctrlState = ctrl ? 'PASS' : 'FAIL';
  console.log(`\n▍${t.engine} @ ${t.version}   对照 ${ctrlState}${ctrlErr ? ' (' + ctrlErr.slice(0, 60) + ')' : ''}`);
  rec(t.engine, 'control', '正常取值', ctrl ? 'PASS' : 'FAIL');

  if (!ctrl) {
    // 对照失败 = 装置问题，不判定漏洞
    for (const c of t.cases) rec(t.engine, c.kind, c.payload, 'NA');
    console.log('   对照失败，跳过错判（记 NA，不记 MISS）');
    continue;
  }

  for (const c of t.cases) {
    let v = null, err = null;
    try { v = c.run(c.payload); } catch (e) { err = e.message; }
    const hit = judge(v);
    const state = hit ? 'HIT' : 'MISS';
    rec(t.engine, c.kind, c.payload, state, { got: typeof v, err: err ? err.slice(0, 80) : null });
    const shown = hit ? 'Function ✅' : (err ? 'ERR ' + err.slice(0, 50) : typeof v + ' : ' + String(v).slice(0, 40));
    console.log(`   [${state}] ${c.kind.padEnd(9)} ${c.payload.slice(0, 46).padEnd(48)} -> ${shown}`);
  }
}

// ---------------------------------------------------------------------------
const hitN = rows.filter(r => r.state === 'HIT').length;
const missN = rows.filter(r => r.state === 'MISS').length;
const naN = rows.filter(r => r.state === 'NA').length;
const ctrlFail = rows.filter(r => r.kind === 'control' && r.state === 'FAIL').length;

console.log('\n' + '='.repeat(96));
console.log(`HIT ${hitN} / MISS ${missN} / NA ${naN} | 对照失败 ${ctrlFail}`);
console.log('='.repeat(96));

if (process.argv.includes('--json')) {
  const p = process.argv[process.argv.indexOf('--json') + 1];
  require('fs').writeFileSync(p, JSON.stringify({
    generated_at: new Date().toISOString(),
    node: process.version,
    summary: { hit: hitN, miss: missN, na: naN, control_fail: ctrlFail },
    rows,
  }, null, 1), 'utf8');
  console.log('JSON: ' + p);
}
