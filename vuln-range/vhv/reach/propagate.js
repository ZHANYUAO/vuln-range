#!/usr/bin/env node
/**
 * propagate.js —— 跨过程污点传播（把 param 级升格/降格为可判定结论）
 *
 * 为什么必须做：
 *   scan.js 只看单文件。真实应用里 `_.get(obj, p)` 的 p 几乎总是形参，
 *   真正的来源在另一个文件的调用点上。不跨过去，"可达性低"就只能算猜测。
 *
 * 做法（保守的两层）：
 *   1. 对每个 tainted 命中，找包含它的最小函数，确定 path 实参对应第几个形参
 *   2. 全包索引同名函数的调用点，取对应位置的实参
 *   3. 对实参做与 scan 相同的 httpSignals 判定；仍是标识符则在本文件再回溯一跳
 *
 * 明确不做（避免虚假信心）：
 *   - 方法调用 obj.fn(x) 的接收者类型推断（同名方法在不同类里语义不同）
 *   - 高阶函数 / 回调 / 事件绑定
 *   这些一律留 param，绝不猜成 http。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const walk = require('acorn-walk');

const HTTP_OBJ = new Set(['req', 'request', 'ctx', 'context', 'event', 'frame', 'args']);
const HTTP_PROP = new Set(['query', 'body', 'params', 'headers', 'searchParams']);
const HTTP_WEAK_PROP = new Set(['data', 'fields', 'url', 'pathname', 'include']);

function sigOf(node) {
  const strong = new Set(), weak = new Set();
  if (!node) return { strong, weak };
  try {
    walk.simple(node, {
      Identifier(n) { if (HTTP_OBJ.has(n.name)) strong.add('$' + n.name); },
      MemberExpression(n) {
        const p = n.property && (n.property.name || n.property.value);
        if (typeof p !== 'string') return;
        if (HTTP_PROP.has(p)) strong.add('.' + p);
        else if (HTTP_WEAK_PROP.has(p)) weak.add('~' + p);
      },
    });
  } catch (e) { /* ignore */ }
  return { strong, weak };
}

function listJsFiles(dir, acc = [], depth = 0) {
  if (depth > 12) return acc;
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return acc; }
  for (const e of ents) {
    if (['node_modules', '.git', 'test', 'tests', '__tests__'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listJsFiles(p, acc, depth + 1);
    else if (/\.(js|mjs|cjs)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

function parse(src, file) {
  const opts = { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true, locations: true };
  try { return acorn.parse(src, opts); } catch (e) {}
  try { return acorn.parse(src, { ...opts, sourceType: 'script' }); } catch (e) { return null; }
}

// ---------------------------------------------------------------------------
// 全包索引：函数定义 + 调用点
// ---------------------------------------------------------------------------
function indexPackage(pkgDir) {
  const files = listJsFiles(pkgDir);
  const funcs = [];          // {name, file, startLine, endLine, params[]}
  const callbackStarts = new Set(); // 作为「实参」传入的函数体起始行，不能按名字反查调用点
  const calls = new Map();   // calleeName -> [{file, line, args[]}]
  const defsByFile = new Map(); // file -> {defs:Map, params:Set}
  const asts = new Map();

  for (const f of files) {
    let src;
    try { src = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
    if (src.length > 3_000_000) continue;
    const ast = parse(src, f);
    if (!ast) continue;
    const rel = path.relative(pkgDir, f).replace(/\\/g, '/');
    asts.set(rel, { ast, src });

    const defs = new Map();
    const params = new Set();

    walk.simple(ast, {
      Function(n) {
        const id = n.id && n.id.name;
        const pnames = [];
        for (const p of (n.params || [])) {
          if (p.type === 'Identifier') { pnames.push(p.name); params.add(p.name); }
          else pnames.push(null);
        }
        if (id) funcs.push({
          name: id, file: rel, node: n,
          startLine: n.loc.start.line, endLine: n.loc.end.line, params: pnames,
        });
      },
      VariableDeclarator(n) {
        // const fn = (a,b)=>{...}  或  const fn = function(a,b){}
        if (n.id.type === 'Identifier' && n.init &&
            /Function(Expression)?$|ArrowFunctionExpression/.test(n.init.type)) {
          const pnames = (n.init.params || []).map(p => (p.type === 'Identifier' ? p.name : null));
          for (const p of pnames) if (p) params.add(p);
          funcs.push({
            name: n.id.name, file: rel, node: n.init,
            startLine: n.init.loc.start.line, endLine: n.init.loc.end.line, params: pnames,
          });
        }
        if (n.id.type === 'Identifier') {
          if (!defs.has(n.id.name)) defs.set(n.id.name, []);
          if (n.init) defs.get(n.id.name).push(n.init);
        }
      },
      // class X { foo(p) {} }  —— 类方法在真实应用里占大头，漏了它整个索引就废了一半
      MethodDefinition(n) {
        const nm = n.key && (n.key.name || n.key.value);
        if (typeof nm !== 'string' || !n.value || !n.value.params) return;
        const pnames = n.value.params.map(p => (p.type === 'Identifier' ? p.name : null));
        for (const p of pnames) if (p) params.add(p);
        funcs.push({
          name: nm, file: rel, node: n.value, kind: 'method',
          startLine: n.value.loc.start.line, endLine: n.value.loc.end.line, params: pnames,
        });
      },
      // const o = { foo(p) {} } —— 对象字面量方法
      Property(n) {
        if (!n.value || !/Function(Expression)?$|ArrowFunctionExpression/.test(n.value.type)) return;
        const nm = n.key && (n.key.name || n.key.value);
        if (typeof nm !== 'string') return;
        const pnames = (n.value.params || []).map(p => (p.type === 'Identifier' ? p.name : null));
        for (const p of pnames) if (p) params.add(p);
        funcs.push({
          name: nm, file: rel, node: n.value, kind: 'literal',
          startLine: n.value.loc.start.line, endLine: n.value.loc.end.line, params: pnames,
        });
      },
      AssignmentExpression(n) {
        if (n.left.type === 'Identifier') {
          if (!defs.has(n.left.name)) defs.set(n.left.name, []);
          defs.get(n.left.name).push(n.right);
        }
        // module.exports.foo = function(...) 也登记
        if (n.right && /FunctionExpression|ArrowFunctionExpression/.test(n.right.type)) {
          const nm = n.left.type === 'MemberExpression' && (n.left.property.name || n.left.property.value);
          if (nm) {
            const pnames = (n.right.params || []).map(p => (p.type === 'Identifier' ? p.name : null));
            for (const p of pnames) if (p) params.add(p);
            funcs.push({ name: nm, file: rel, node: n.right,
              startLine: n.right.loc.start.line, endLine: n.right.loc.end.line, params: pnames });
          }
        }
      },
      CallExpression(n) {
        // 记录「作为实参传入的函数」——它们的形参由调用方（如 lodash.each）填充，
        // 不是从同名函数的调用点来的。不区分这点，_.each(columns, (columnKey)=>...) 里的
        // columnKey 会被当成某个 each() 函数的第 0 个实参，直接把数据库列名误判成 HTTP 输入。
        for (const a of n.arguments) {
          if (a && /Function(Expression)?$|ArrowFunctionExpression/.test(a.type)) {
            callbackStarts.add(rel + '#' + a.loc.start.line);
          }
        }
        let nm = null;
        if (n.callee.type === 'Identifier') nm = n.callee.name;
        else if (n.callee.type === 'MemberExpression') {
          const p = n.callee.property && (n.callee.property.name || n.callee.property.value);
          if (typeof p === 'string') nm = p;
        }
        if (!nm) return;
        if (!calls.has(nm)) calls.set(nm, []);
        calls.get(nm).push({ file: rel, line: n.loc.start.line, args: n.arguments, node: n });
      },
    });

    defsByFile.set(rel, { defs, params });
  }

  return { files, funcs, calls, defsByFile, asts, callbackStarts };
}

// 找包含指定行的所有函数，按范围从小到大排
// 必须返回链而不是单个：`_.map(x => _.get(o, p))` 里 p 属于外层而不是那个箭头函数，
// 只取最小函数会让所有「回调里用外层参数」的命中全部退化成 param。
function enclosingChain(idx, file, line) {
  const out = [];
  for (const f of idx.funcs) {
    if (f.file !== file) continue;
    if (f.startLine <= line && line <= f.endLine) out.push(f);
  }
  out.sort((a, b) => (a.endLine - a.startLine) - (b.endLine - b.startLine));
  return out;
}

function argIdent(node) {
  return node && node.type === 'Identifier' ? node.name : null;
}

// 在指定文件的定义表里回溯一跳，返回信号
function localSignals(idx, file, identName, depth = 0) {
  const rec = idx.defsByFile.get(file);
  if (!rec) return { strong: new Set(), weak: new Set(), isParam: false };
  if (!rec.defs.has(identName) && rec.params.has(identName))
    return { strong: new Set(), weak: new Set(), isParam: true };
  const strong = new Set(), weak = new Set();
  for (const init of (rec.defs.get(identName) || [])) {
    const s = sigOf(init);
    s.strong.forEach(x => strong.add(x));
    s.weak.forEach(x => weak.add(x));
    if (depth < 1 && init && init.type === 'Identifier') {
      const r = localSignals(idx, file, init.name, depth + 1);
      r.strong.forEach(x => strong.add(x));
      r.weak.forEach(x => weak.add(x));
    }
  }
  return { strong, weak, isParam: false };
}

// ---------------------------------------------------------------------------
// 对单条 param 级命中做升级/降级
// ---------------------------------------------------------------------------
function resolveHit(idx, hit, pkgRelRoot) {
  // scan 的 file 是相对包根的，indexPackage 用的是绝对路径，统一一下
  const file = hit.file;
  const chain = enclosingChain(idx, file, hit.line);
  if (!chain.length) return { level: 'param', reason: '未找到包含该行的函数' };

  const argName = hit.arg_ident;
  if (!argName) return { level: 'param', reason: 'path 实参不是裸标识符' };

  // 从内到外找第一个「真的把这个标识符当形参」的函数
  let fn = null, pIdx = -1;
  for (const f of chain) {
    const i = f.params.indexOf(argName);
    if (i >= 0) { fn = f; pIdx = i; break; }
  }
  if (!fn) return { level: 'param', reason: '实参不是任何外层函数的形参' };

  // 回调不是被调用方，是「被传进去的」—— 它的实参由宿主（lodash.each 等）填充，
  // 按同名函数反查调用点必然串到别的 each/map 上去
  if (idx.callbackStarts && idx.callbackStarts.has(file + '#' + fn.startLine))
    return { level: 'param', reason: '形参来自回调宿主，不在本包调用点里' };

  const sites = idx.calls.get(fn.name) || [];
  if (!sites.length) return { level: 'param', reason: '全包无 ' + fn.name + '() 调用点' };

  // 同名函数过多时按名字匹配会串味（get / create / update 这种），宁可不升级
  const defCount = idx.funcs.filter(f => f.name === fn.name).length;
  const ambiguous = defCount > 5;

  const strong = new Set(), weak = new Set();
  let sawHttp = null, sawParam = false;

  for (const s of sites) {
    const a = s.args[pIdx];
    if (!a) { sawParam = true; continue; }
    const sig = sigOf(a);
    if (sig.strong.size) { sawHttp = { file: s.file, line: s.line, sig: [...sig.strong] }; break; }
    sig.weak.forEach(x => weak.add(x));
    const an = argIdent(a);
    if (an) {
      const r = localSignals(idx, s.file, an);
      if (r.strong.size) { sawHttp = { file: s.file, line: s.line, sig: [...r.strong] }; break; }
      r.weak.forEach(x => weak.add(x));
      if (r.isParam) sawParam = true;
    }
  }

  if (sawHttp) return {
    level: ambiguous ? 'param' : 'http',
    reason: '调用点 ' + sawHttp.file + ':' + sawHttp.line + (ambiguous ? '（同名函数 ' + defCount + ' 个，未采信）' : ''),
    sig: sawHttp.sig,
  };
  if (weak.size) return { level: 'maybe', reason: '调用点仅弱信号', sig: [...weak] };
  if (sawParam) return { level: 'param', reason: '调用方仍是形参（需再上一层）' };
  return { level: 'unknown', reason: '调用点实参为常量/字面量' };
}

// ---------------------------------------------------------------------------
function main() {
  const casesPath = process.argv[2];
  const root = process.argv[3];
  const outPath = process.argv[4];
  if (!casesPath || !root) {
    console.error('用法: node propagate.js <cases-apps-trace.json> <pkgs/apps> [out.json]');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(casesPath, 'utf8'));

  const upgraded = [];
  const summary = [];

  for (const r of data.results) {
    const pkgDir = path.join(root, r.pkg);
    if (!fs.existsSync(pkgDir)) { console.error('跳过（无目录）: ' + r.pkg); continue; }

    // indexPackage 现在直接产出「相对包根」的路径，与 scan 的 hit.file 同口径，无需再转换
    const idx = indexPackage(pkgDir);

    const pending = r.hits.filter(h => h.verdict === 'tainted' && h.origin === 'param' && h.arg_ident);
    let up = 0, down = 0, stay = 0;
    for (const h of pending) {
      const res = resolveHit(idx, h, pkgDir);
      h.origin2 = res.level;
      h.origin2_reason = res.reason;
      if (res.level === 'http') { up++; upgraded.push({ pkg: r.pkg, ...h, via_call: res.reason }); }
      else if (res.level === 'unknown') down++;
      else stay++;
    }
    summary.push({ pkg: r.pkg, scanned: r.files_scanned, param_pending: pending.length, upgraded: up, demoted: down, still_param: stay });
    console.log(`${r.pkg.padEnd(18)} param待定 ${String(pending.length).padStart(3)}  → http ${up} / 降为unknown ${down} / 仍param ${stay}`);
  }

  console.log('\n=== 跨过程后升格为 http 的命中 ===');
  for (const u of upgraded) {
    console.log(`${u.pkg}  ${u.file}:${u.line}  _${u.api}  ${u.via_call}`);
    console.log('    ' + u.snippet.slice(0, 150));
  }

  if (outPath) {
    fs.writeFileSync(outPath, JSON.stringify({ summary, upgraded, results: data.results }, null, 1), 'utf8');
    console.log('\nJSON: ' + outPath);
  }
}

main();
