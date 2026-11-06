'use strict';
// ===========================================================================
// probe_pointer.js —— RFC 6901 / RFC 6902 实现族的读侧原型链穿越横评
//
// 目的：判断 json-ptr 的读侧穿透是「单个库的疏忽」还是「这一族实现的共性」。
//
// 判定四值（沿用本项目铁律）：
//   HIT   拿到了 Function 构造器本体
//   MISS  取到普通值 / undefined（确实没穿）
//   SHAPE 对照组未通过 = 我的适配写错了 = 未判定（绝不能记 MISS）
//   SKIP  该库没有对应的 API
//
// 对照组设计：每条 payload 之前，先用 /a/b 取 7。取不到 7 就说明适配有问题，
// 此时该库所有判定作废，而不是"库安全"。
// ===========================================================================

const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();

const DOC = { a: { b: 7 }, user: { name: 'alice' } };
const CTRL_PTR = '/a/b';
const CTRL_VAL = 7;

// 载荷：四种前缀形态，覆盖「整串可控」到「深前缀固定」
const PAYLOADS = [
  { id: 'P1', ptr: '/a/constructor/constructor', note: '前缀固定 /a' },
  { id: 'P2', ptr: '/constructor/constructor', note: '首段即危险键' },
  { id: 'P3', ptr: '/__proto__/constructor/constructor', note: '经典 __proto__ 路径' },
  { id: 'P4', ptr: '/a/__proto__/constructor/constructor', note: '前缀 + __proto__' },
  { id: 'P5', ptr: '/a/b/constructor/constructor', note: '命中真实值后再穿' },
  // P6/P7 只走一跳：用来区分「完全没穿」和「穿了但被类型检查挡住」
  { id: 'P6', ptr: '/a/constructor', note: '单跳：应得 Object 构造器' },
  { id: 'P7', ptr: '/a/__proto__', note: '单跳：应得 Object.prototype' },
];

// ---------------------------------------------------------------------------
// 每个库一个适配器：返回 { get(obj,ptr), patch?(obj,ops), ver }
// 适配失败返回 null —— 由调用方记 SKIP，不记 MISS
// ---------------------------------------------------------------------------
const ADAPTERS = {
  'json-ptr': () => {
    const { JsonPointer } = require(path.join(ROOT, 'pkgs/json-ptr'));
    return {
      ver: require(path.join(ROOT, 'pkgs/json-ptr/package.json')).version,
      get: (o, p) => JsonPointer.get(o, p),
      has: (o, p) => JsonPointer.has(o, p),
      patch: (o, ops) => {
        for (const op of ops) {
          if (op.op === 'test') {
            const v = JsonPointer.get(o, op.path);
            if (String(v) !== String(op.value)) throw new Error('test failed');
          } else if (op.op === 'replace') {
            const old = JsonPointer.get(o, op.path);
            JsonPointer.set(o, op.path, op.value);
            return { old };
          }
        }
        return {};
      },
    };
  },

  'json-pointer': () => {
    const m = require(path.join(ROOT, 'pkgs/json-pointer'));
    return {
      ver: require(path.join(ROOT, 'pkgs/json-pointer/package.json')).version,
      get: (o, p) => m.get(o, p),
      has: (o, p) => m.has(o, p),
      patch: null,
    };
  },

  'jsonpointer': () => {
    const m = require(path.join(ROOT, 'pkgs/jsonpointer'));
    return {
      ver: require(path.join(ROOT, 'pkgs/jsonpointer/package.json')).version,
      get: (o, p) => m.get(o, p),
      has: null,
      patch: null,
    };
  },

  'jsonpatch': () => {
    const m = require(path.join(ROOT, 'pkgs/jsonpatch'));
    // jsonpatch 的读 API 是实例方法：new JSONPointer(path).get(doc)
    // 第一版写成静态 JSONPointer.get 拿到 NO_API —— 是适配错误，不是库没有读 API
    return {
      ver: require(path.join(ROOT, 'pkgs/jsonpatch/package.json')).version,
      get: (o, p) => new m.JSONPointer(p).get(o),
      has: null,
      patch: (o, ops) => m.apply_patch(o, ops),
    };
  },

  'fast-json-patch': () => {
    const m = require(path.join(ROOT, 'pkgs/fast-json-patch'));
    return {
      ver: require(path.join(ROOT, 'pkgs/fast-json-patch/package.json')).version,
      get: (o, p) => m.getValueByPointer(o, p),
      has: null,
      patch: (o, ops) => m.applyPatch(o, ops),
    };
  },
};

// ---------------------------------------------------------------------------
const results = [];

function probeCallPath() {
  // 只做能力佐证：一旦拿到 Function，调用是通用的，不属于任何单个库
  try {
    const F = ({}).constructor.constructor;
    return F('return 6*7')() === 42;
  } catch (e) { return false; }
}

for (const [name, factory] of Object.entries(ADAPTERS)) {
  const rec = { lib: name, ver: null, control: null, get: [], patch: [], note: null };
  let api = null;
  try { api = factory(); } catch (e) { rec.note = 'require/适配失败: ' + e.message.slice(0, 90); results.push(rec); continue; }
  rec.ver = api.ver;

  // --- 对照组：先证明我的适配能把 /a/b 解成 7 ---
  if (typeof api.get !== 'function') {
    rec.control = 'NO_API';
    rec.note = '该库无可用的读指针 API';
    results.push(rec);
    continue;
  }
  let ctrl;
  try { ctrl = api.get(DOC, CTRL_PTR); } catch (e) { ctrl = 'ERR:' + e.message.slice(0, 60); }
  rec.control = ctrl === CTRL_VAL ? 'PASS' : ('FAIL(' + ctrl + ')');

  if (rec.control !== 'PASS') {
    rec.note = '对照组未通过 → 全部判定作废（未判定，不是安全）';
    results.push(rec);
    continue;
  }

  // --- 读侧载荷 ---
  for (const pl of PAYLOADS) {
    let val, err = null;
    try { val = api.get(DOC, pl.ptr); } catch (e) { err = e.message.slice(0, 80); }
    let verdict;
    if (err) verdict = /disallow|forbid|denied|illegal|not allowed|pollution|banned/i.test(err) ? 'BLOCK' : 'ERR';
    else if (val === Function) verdict = 'HIT';
    else if (val === Object) verdict = 'HIT_CTOR';
    else if (val === Object.prototype) verdict = 'HIT_PROTO';
    else verdict = 'MISS';
    const show = err ? ('ERR: ' + err)
      : (val === Function ? 'Function'
        : val === Object ? 'Object 构造器'
          : val === Object.prototype ? 'Object.prototype'
            : (typeof val === 'undefined' ? 'undefined' : String(val).slice(0, 40)));
    rec.get.push({
      id: pl.id, ptr: pl.ptr, note: pl.note, verdict, got: show,
    });
  }

  // --- 写侧 / JSON Patch 场景（只有 patch 库有）---
  if (typeof api.patch === 'function') {
    // W1: test 操作 —— 只读，按协议 path 由客户端给定
    try {
      const out = api.patch({ a: { b: 7 } }, [{ op: 'test', path: '/a/constructor/constructor', value: 'x' }]);
      rec.patch.push({ id: 'W1', op: 'test', verdict: 'READ_OK', got: '未抛错（读到了东西）' });
    } catch (e) {
      const msg = e.message.slice(0, 90);
      rec.patch.push({
        id: 'W1', op: 'test',
        verdict: /test failed/.test(msg) ? 'READ_HIT' : (/disallow|forbid|pollution|illegal/i.test(msg) ? 'BLOCK' : 'ERR'),
        got: msg,
      });
    }
    // W2: replace 到 /__proto__ —— 写侧守卫对照
    try {
      const out = api.patch({ a: { b: 7 } }, [{ op: 'replace', path: '/__proto__', value: 1 }]);
      rec.patch.push({ id: 'W2', op: 'replace __proto__', verdict: 'WRITE_OK', got: JSON.stringify(out).slice(0, 60) });
    } catch (e) {
      rec.patch.push({ id: 'W2', op: 'replace __proto__', verdict: 'BLOCK', got: e.message.slice(0, 90) });
    }
  }

  results.push(rec);
}

// ---------------------------------------------------------------------------
const canCall = probeCallPath();

console.log('='.repeat(96));
console.log('RFC 6901 / 6902 实现族 —— 读侧原型链穿越横评');
console.log('doc = { a: { b: 7 }, user: { name: "alice" } }   对照: /a/b -> 7');
console.log('='.repeat(96));

for (const r of results) {
  console.log('\n▍' + r.lib + ' @ ' + r.ver + '   对照=' + r.control + (r.note ? '   ' + r.note : ''));
  if (r.get.length) {
    for (const g of r.get) {
      const mark = g.verdict === 'HIT' ? 'HIT ' : (g.verdict === 'HIT_CTOR' ? 'Ctor' : (g.verdict === 'HIT_PROTO' ? 'Proto' : (g.verdict === 'MISS' ? 'miss' : '----')));
      console.log('   [' + mark + '] ' + g.id + ' ' + g.ptr.padEnd(38) + ' -> ' + g.got);
    }
  }
  if (r.patch.length) {
    console.log('   -- JSON Patch 场景 --');
    for (const p of r.patch) {
      console.log('   [' + p.verdict + '] ' + p.id + ' ' + p.op.padEnd(18) + ' ' + p.got);
    }
  }
}

console.log('\n' + '='.repeat(96));
const fnLibs = results.filter(r => r.get.some(g => g.verdict === 'HIT'));
const ctorLibs = results.filter(r => !r.get.some(g => g.verdict === 'HIT') && r.get.some(g => g.verdict === 'HIT_CTOR' || g.verdict === 'HIT_PROTO'));
const ownLibs = results.filter(r => r.get.length && r.get.every(g => g.verdict === 'MISS' || g.verdict === 'BLOCK'));
const undecided = results.filter(r => r.control !== 'PASS');
console.log('A. 读侧可拿到 Function（可执行任意代码）: ' + (fnLibs.map(r => r.lib).join(', ') || '无'));
console.log('B. 读侧穿越但停在构造器/原型对象（差一跳）: ' + (ctorLibs.map(r => r.lib).join(', ') || '无'));
console.log('C. 读侧完全未穿: ' + (ownLibs.map(r => r.lib).join(', ') || '无'));
console.log('D. 未判定（对照组未过/无 API）: ' + (undecided.map(r => r.lib + '(' + r.control + ')').join(', ') || '无'));
console.log('拿到 Function 后能否执行（与库无关，能力佐证）: ' + (canCall ? '是，6*7=42' : '否'));
console.log('='.repeat(96));

const outIdx = process.argv.indexOf('--json');
if (outIdx > 0 && process.argv[outIdx + 1]) {
  fs.writeFileSync(process.argv[outIdx + 1],
    JSON.stringify({ generated_at: new Date().toISOString(), doc: DOC, ctrl: CTRL_PTR + '=' + CTRL_VAL, can_call: canCall, results }, null, 1), 'utf8');
  console.log('JSON: ' + process.argv[outIdx + 1]);
}
