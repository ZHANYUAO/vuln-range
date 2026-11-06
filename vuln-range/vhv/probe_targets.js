#!/usr/bin/env node
/**
 * 横向复现验证器：把 lodash 上的发现当作「假设」，在其他 path 库上验证是否同类。
 *
 * 判据分两类，都不能靠"看起来像"：
 *   read  —— 必须真的拿到可执行的 Function（调用它并验证返回 1），
 *            只判 typeof==='function' 不够：随便一个普通函数也能骗过。
 *   write —— 必须让一个**新建空对象**看见 marker。只查 Object.prototype 不够，
 *            因为有些库污染的是别的原型。
 *
 * 每个 case 都用唯一 marker，并在 finally 里清理。不清理会让后一个 case
 * 读到前一个的污染，直接假阳性 —— 这个坑在原型污染测试里是头号陷阱。
 *
 * 用法：node probe_targets.js
 */
'use strict';

const RESULT = [];
const mk = () => 'vhv_' + Math.random().toString(36).slice(2, 8);

/** 读型：path 能否穿到 Function 构造器，且该结果真的可执行。 */
function readCase(lib, ver, api, expr) {
  let out = null, err = null, exec = null;
  try {
    out = expr();
    if (typeof out === 'function') {
      try { exec = out('return "VHVEXEC"')(); } catch (e) { exec = 'ERR:' + e.message.slice(0, 40); }
    }
  } catch (e) { err = e.message.slice(0, 60); }
  const hit = exec === 'VHVEXEC';
  RESULT.push({ lib, ver, api, kind: 'read->Function', hit, exec, err });
}

/** 写型：能否让一个新建空对象看见 marker（即改到了某个原型）。 */
function writeCase(lib, ver, api, expr) {
  const m = mk();
  let err = null, polluted = false, via = null;
  try { expr(m); } catch (e) { err = e.message.slice(0, 60); }
  try {
    if (({})[m] !== undefined) { polluted = true; via = 'object'; }
    else if (Object.prototype[m] !== undefined) { polluted = true; via = 'Object.prototype'; }
  } catch (e) { /* ignore */ }
  try { delete Object.prototype[m]; } catch (e) { /* ignore */ }
  RESULT.push({ lib, ver, api, kind: 'write->pollute', hit: polluted, exec: via, err });
}

/** 正常功能对照：库没被我们的测试搞坏。 */
function normalCase(lib, ver, api, expr, want) {
  let got = null, err = null;
  try { got = expr(); } catch (e) { err = e.message.slice(0, 60); }
  RESULT.push({ lib, ver, api, kind: 'normal-control', hit: got === want, exec: String(got), err });
}

const FS = require('fs'), PATH = require('path');

/** 版本号：有些包用 exports 字段封死了 /package.json 子路径，直接读文件更稳。 */
function ver(p) {
  try {
    const entry = require.resolve(p);
    const root = PATH.dirname(entry);
    return JSON.parse(FS.readFileSync(PATH.join(root, 'package.json'), 'utf8')).version;
  } catch (e) { return '?'; }
}

/** 取可调用导出：兼容 module.exports = fn / {default: fn} / {getValue: fn} 三种形态。 */
function callable(mod, altNames) {
  if (typeof mod === 'function') return mod;
  for (const k of ['default'].concat(altNames || [])) {
    if (mod && typeof mod[k] === 'function') return mod[k];
  }
  return null;
}

// ---------- object-path 0.11.8 ----------
{
  const lib = 'object-path', v = ver('object-path');
  const op = require('object-path');
  readCase(lib, v, 'get', () => op.get({}, '__proto__.constructor.constructor'));
  readCase(lib, v, 'get(arr)', () => op.get({}, ['__proto__', 'constructor', 'constructor']));
  writeCase(lib, v, 'set', (m) => op.set({}, '__proto__.' + m, 1));
  writeCase(lib, v, 'set(arr)', (m) => op.set({}, ['__proto__', m], 1));
  normalCase(lib, v, 'get', () => op.get({ a: { b: 3 } }, 'a.b'), 3);
}

// ---------- set-value 4.1.0 ----------
{
  const lib = 'set-value', v = ver('set-value');
  const set = require('set-value');
  readCase(lib, v, '(no getter)', () => { throw new Error('库无 get 导出'); });
  writeCase(lib, v, 'set', (m) => set({}, '__proto__.' + m, 1));
  writeCase(lib, v, 'set(arr)', (m) => set({}, ['__proto__', m], 1));
  writeCase(lib, v, 'set(ctor)', (m) => set({}, 'constructor.prototype.' + m, 1));
  normalCase(lib, v, 'set', () => { const o = {}; set(o, 'a.b', 5); return o.a.b; }, 5);
}

// ---------- get-value ----------
{
  const lib = 'get-value';
  let v = '?'; try { v = require('get-value/package.json').version; } catch (e) { v = '4.x(eol)'; }
  const get = require('get-value');
  readCase(lib, v, 'get', () => get({}, '__proto__.constructor.constructor'));
  readCase(lib, v, 'get(arr)', () => get({}, ['__proto__', 'constructor', 'constructor']));
  normalCase(lib, v, 'get', () => get({ a: { b: 9 } }, 'a.b'), 9);
}

// ---------- deep-set 1.0.1（npm 已标记 deprecated）----------
{
  const lib = 'deep-set', v = ver('deep-set');
  const ds = require('deep-set');
  writeCase(lib, v, 'set', (m) => ds({}, '__proto__.' + m, 1));
  writeCase(lib, v, 'set(ctor)', (m) => ds({}, 'constructor.prototype.' + m, 1));
  normalCase(lib, v, 'set', () => { const o = {}; ds(o, 'a.b.c', 4); return o.a.b.c; }, 4);
}

// ---------- jsonpointer 5.0.1（JSON Pointer 语法）----------
{
  const lib = 'jsonpointer', v = ver('jsonpointer');
  const jp = require('jsonpointer');
  readCase(lib, v, 'get(/__proto__/...)', () => jp.get({}, '/__proto__/constructor/constructor'));
  writeCase(lib, v, 'set(/__proto__/x)', (m) => jp.set({}, '/__proto__/' + m, 1));
  writeCase(lib, v, 'set(/constructor/prototype/x)', (m) => jp.set({}, '/constructor/prototype/' + m, 1));
  normalCase(lib, v, 'get', () => jp.get({ a: { b: 8 } }, '/a/b'), 8);
}

// ---------- dot-object 2.1.5 ----------
{
  const lib = 'dot-object', v = ver('dot-object');
  const dot = require('dot-object');
  readCase(lib, v, 'pick', () => dot.pick('__proto__.constructor.constructor', {}));
  writeCase(lib, v, 'str', (m) => dot.str('__proto__.' + m, 1, {}));
  writeCase(lib, v, 'set', (m) => dot.set('__proto__.' + m, 1, {}));
  writeCase(lib, v, 'str(ctor)', (m) => dot.str('constructor.prototype.' + m, 1, {}));
  normalCase(lib, v, 'pick', () => dot.pick('a.b', { a: { b: 6 } }), 6);
}

// ---------- just-safe-set 4.2.1（预期是阴性对照）----------
{
  const lib = 'just-safe-set', v = ver('just-safe-set');
  const safeSet = require('just-safe-set');
  writeCase(lib, v, 'safeSet(str)', (m) => safeSet({}, '__proto__.' + m, 1));
  writeCase(lib, v, 'safeSet(arr)', (m) => safeSet({}, ['__proto__', m], 1));
  writeCase(lib, v, 'safeSet(ctor)', (m) => safeSet({}, ['constructor', 'prototype', m], 1));
  normalCase(lib, v, 'safeSet', () => { const o = {}; safeSet(o, 'a.b', 2); return o.a.b; }, 2);
}

// ---------- 输出 ----------
const pad = (s, n) => String(s == null ? '' : s).padEnd(n);
console.log(pad('LIB', 16) + pad('VER', 9) + pad('API', 30) + pad('KIND', 18) + '判定    备注');
console.log('-'.repeat(112));
for (const r of RESULT) {
  let mark;
  if (r.kind === 'normal-control') mark = r.hit ? 'OK   ' : 'FAIL ';
  else mark = r.hit ? '命中 ' : '未命中';
  const note = r.err ? ('ERR ' + r.err) : (r.exec ? String(r.exec).slice(0, 28) : '');
  console.log(pad(r.lib, 16) + pad(r.ver, 9) + pad(r.api, 30) + pad(r.kind, 18) + pad(mark, 8) + note);
}

const readHits = RESULT.filter((r) => r.kind === 'read->Function' && r.hit);
const writeHits = RESULT.filter((r) => r.kind === 'write->pollute' && r.hit);
const ctrls = RESULT.filter((r) => r.kind === 'normal-control');
const libsRead = new Set(readHits.map((r) => r.lib));
const libsWrite = new Set(writeHits.map((r) => r.lib));
const libsAll = new Set(RESULT.filter((r) => r.kind !== 'normal-control').map((r) => r.lib));

console.log('-'.repeat(112));
console.log('读型穿透到 Function 的库: %d / %d  ->  %s',
  libsRead.size, libsAll.size, [...libsRead].join(', ') || '(none)');
console.log('写型可污染原型的库:       %d / %d  ->  %s',
  libsWrite.size, libsAll.size, [...libsWrite].join(', ') || '(none)');
console.log('正常功能对照通过:         %d / %d',
  ctrls.filter((r) => r.hit).length, ctrls.length);
if (ctrls.some((r) => !r.hit)) {
  console.log('⚠ 有对照未通过，说明该库的"未命中"可能是装置故障而非安全。');
}
