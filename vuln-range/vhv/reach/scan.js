#!/usr/bin/env node
/**
 * scan.js —— 可达性扫描：找出「path 参数非字面量」的 lodash 取值调用
 *
 * 为什么只认"来自 lodash 的绑定"：
 *   直接匹配 `xxx.get(a, b)` 会把 `moment.get`、`Map.get`、本地同名工具函数
 *   全部算进来。误报比漏报更毁结论 —— 上一轮 guardcov 的 v1 就因为这个把
 *   三个已实测能拦的库全报成 NO_GUARD。
 *
 * 判定「非字面量」的规则（保守）：
 *   - 字符串字面量 / 无插值模板 / 全字面量数组  → safe
 *   - 模板里有 ${} / 标识符 / 成员访问 / 函数调用 / 三元 / 拼接 → tainted
 *   - 无法判定（undefined、展开、解构）           → unknown（不计入命中）
 *
 * 用法：
 *   node scan.js <pkgDir> [--json out.json]
 *   node scan.js --batch <dirOfPkgs>        # 批量
 */
'use strict';

const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const walk = require('acorn-walk');

// 走 baseGet / castPath 的「读侧 path API」——第二参数会被切成 path 段
const APIS = new Set([
  'get', 'invoke', 'at', 'result', 'method', 'methodOf',
  'pick', 'omit', 'has', 'hasIn', 'property', 'propertyOf', 'getOr',
  'invokeMap', 'invokeAt',
]);
// 走 baseSet 的「写侧」——第二参数也是 path，但与读侧语义不同，单独记
// 注意：merge / assign / extend / defaultsDeep 的第二参数是「源对象」不是 path，不能算进来
const WRITE_APIS = new Set(['set', 'setWith', 'unset', 'update', 'updateWith']);
// 这些包的默认导出/命名导出都是 path API
const SIBLING_PKGS = new Set([
  'lodash.get', 'lodash.invoke', 'lodash.at', 'lodash.result',
  'lodash.method', 'lodash.methodof', 'lodash.property', 'lodash.propertyof',
  'lodash.pick', 'lodash.omit', 'lodash.has', 'lodash.hasin',
]);
const MULTI_PKGS = new Set(['lodash', 'lodash-es', 'lodash/fp', 'lodash-es/fp']);

const ALL_APIS = new Set([...APIS, ...WRITE_APIS]);
const sideOf = (m) => (APIS.has(m) ? 'read' : (WRITE_APIS.has(m) ? 'write' : null));
const memberOfSubpath = (pkg) => (pkg && pkg.includes('/') ? pkg.split('/').pop() : pkg.replace('lodash.', ''));
const TRACE = process.argv.includes('--trace');

// ---------------------------------------------------------------------------
// 污点来源追踪（--trace）
//
// 为什么必须有这一步：
//   "path 不是字面量" 只说明它由变量算出来，不说明它来自攻击者。
//   ghost 的 has.js 里 prop 来自 Handlebars 模板（开发者写的），directus 的 path
//   来自 GraphQL 查询（攻击者写的）—— 两者的 tainted 判定完全一样，可达性却天差地别。
//   不做这一层，87 处命中里绝大多数都是噪音，人工核不完也没意义。
//
// 判定强度分三档，宁可标低不标高：
//   http     变量初始化表达式里出现 HTTP 源对象（req/ctx/request/args/frame...）
//   param    变量是函数形参 —— 需人工看调用方，标 param 不算命中
//   unknown  其余
// ---------------------------------------------------------------------------
// 强信号：只有「请求对象名」或「明确属于 HTTP 语义的属性」才算 http。
// .data / .fields / .url 这类属性在非 HTTP 上下文里到处都是（frame.data、package.json.data），
// 拿它们当信号会把「字段投影」误判成「攻击者可控」—— 第一版就这么误报了 ghost 的 integrations.js。
const HTTP_OBJ = new Set(['req', 'request', 'ctx', 'context', 'event', 'frame', 'args']);
const HTTP_PROP = new Set(['query', 'body', 'params', 'headers', 'searchParams']);
// 弱信号：只用于打 maybe 标，不作命中
const HTTP_WEAK_PROP = new Set(['data', 'fields', 'url', 'pathname', 'include']);

function httpSignals(node) {
  const sig = new Set();
  if (!node) return sig;
  try {
    walk.simple(node, {
      Identifier(n) { if (HTTP_OBJ.has(n.name)) sig.add('$' + n.name); },
      MemberExpression(n) {
        const p = n.property && (n.property.name || n.property.value);
        if (typeof p === 'string' && HTTP_PROP.has(p)) sig.add('.' + p);
      },
    });
  } catch (e) { /* ignore */ }
  return sig;
}

function weakSignals(node) {
  const sig = new Set();
  if (!node) return sig;
  try {
    walk.simple(node, {
      MemberExpression(n) {
        const p = n.property && (n.property.name || n.property.value);
        if (typeof p === 'string' && HTTP_WEAK_PROP.has(p)) sig.add('~' + p);
      },
    });
  } catch (e) { /* ignore */ }
  return sig;
}

// 建立同文件内的 名字 -> 初始化表达式 映射，用于最多两跳的回溯
function collectDefs(ast) {
  const defs = new Map();   // name -> [initNode]
  const params = new Set();
  const push = (name, node) => {
    if (!defs.has(name)) defs.set(name, []);
    if (node) defs.get(name).push(node);
  };
  walk.simple(ast, {
    VariableDeclarator(n) {
      if (n.id.type === 'Identifier') push(n.id.name, n.init);
    },
    AssignmentExpression(n) {
      if (n.left.type === 'Identifier') push(n.left.name, n.right);
    },
    Function(n) {
      for (const p of (n.params || [])) if (p.type === 'Identifier') params.add(p.name);
    },
  });
  return { defs, params };
}

function traceOrigin(argNode, ctx, depth = 0) {
  if (!argNode) return { level: 'unknown', sig: [] };

  // 直接是 req.query.x / ctx.request.body 这类
  const direct = httpSignals(argNode);
  if (direct.size) return { level: 'http', sig: [...direct] };

  const weak = new Set(weakSignals(argNode));

  if (argNode.type === 'Identifier') {
    if (!ctx.defs.has(argNode.name) && ctx.params.has(argNode.name))
      return { level: 'param', sig: [], param: argNode.name };
    if (depth < 2 && ctx.defs.has(argNode.name)) {
      const inits = ctx.defs.get(argNode.name);
      const all = new Set();
      let sawParam = false;
      for (const init of inits) {
        httpSignals(init).forEach(x => all.add(x));
        weakSignals(init).forEach(x => weak.add(x));
        if (init && init.type === 'CallExpression') {
          // f(x) 里 x 是形参名 → 说明这个值由调用方决定
          for (const a of init.arguments) {
            if (a && a.type === 'Identifier' && ctx.params.has(a.name) && !ctx.defs.has(a.name))
              sawParam = true;
          }
        }
        if (init && init.type === 'Identifier') {
          const r = traceOrigin(init, ctx, depth + 1);
          r.sig.forEach(x => all.add(x));
          if (r.level === 'http') return { level: 'http', sig: [...all] };
          if (r.level === 'param' || r.level === 'maybe') sawParam = true;
        }
      }
      if (all.size) return { level: 'http', sig: [...all] };
      if (sawParam) return { level: 'param', sig: [] };
      if (weak.size) return { level: 'maybe', sig: [...weak] };
      return { level: 'unknown', sig: [] };
    }
  }
  if (weak.size) return { level: 'maybe', sig: [...weak] };
  return { level: 'unknown', sig: [] };
}

// 打包器 wrapper —— 现代 dist 里几乎必然出现，漏掉它们等于对 tsc/esbuild 产物全体失明
//   __toESM(require("lodash"))                        esbuild
//   _interopRequireDefault(require("lodash"))         babel / tsc
//   _interopRequireWildcard(require("lodash"))        babel
//   (0, require)("lodash")                            rollup 间接调用
const WRAPPER_RE = /^_*(toESM|importDefault|importStar|interopRequireDefault|interopRequireWildcard|unwrapExports|toCommonJS|createCommonjsModule)$/;

function requireTarget(node) {
  let n = node, guard = 0;
  while (n && guard++ < 6) {
    if (n.type !== 'CallExpression') return null;
    // require('x')
    if (n.callee.type === 'Identifier' && n.callee.name === 'require' &&
        n.arguments[0] && n.arguments[0].type === 'Literal' &&
        typeof n.arguments[0].value === 'string') {
      return n.arguments[0].value;
    }
    // __toESM(require('x'), 1)
    if (n.callee.type === 'Identifier' && WRAPPER_RE.test(n.callee.name)) {
      n = n.arguments[0]; continue;
    }
    // (0, require)('x')
    if (n.callee.type === 'SequenceExpression' && n.callee.expressions.length) {
      const last = n.callee.expressions[n.callee.expressions.length - 1];
      if (last.type === 'Identifier' && last.name === 'require' &&
          n.arguments[0] && n.arguments[0].type === 'Literal') return n.arguments[0].value;
      return null;
    }
    return null;
  }
  return null;
}

// `require('lodash').get` / `__toESM(require('lodash')).default.get`
function requireMember(node) {
  if (!node || node.type !== 'MemberExpression') return null;
  const mem = node.property && (node.property.name || node.property.value);
  if (typeof mem !== 'string') return null;
  let o = node.object, guard = 0;
  while (o && guard++ < 5 && o.type === 'MemberExpression') {
    const p = o.property && (o.property.name || o.property.value);
    if (p === 'default' || p === '__esModule') o = o.object; else break;
  }
  const pkg = requireTarget(o);
  return pkg ? { pkg, mem } : null;
}

// ---------------------------------------------------------------------------
function listJsFiles(dir, acc = [], depth = 0) {
  if (depth > 12) return acc;
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return acc; }
  for (const e of ents) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'test' ||
        e.name === 'tests' || e.name === '__tests__' || e.name === 'dist' && false) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listJsFiles(p, acc, depth + 1);
    else if (/\.(js|mjs|cjs|jsx)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

function isMinified(src) {
  // 单文件里平均行长 > 400 且总长 > 20KB → 视为打包产物，AST 位置无意义但仍可扫
  const lines = src.split('\n');
  return src.length > 20000 && (src.length / Math.max(1, lines.length)) > 400;
}

// 判定表达式是否 tainted
function classify(expr) {
  if (!expr) return { verdict: 'unknown', why: 'no expr' };
  switch (expr.type) {
    case 'Literal':
      return typeof expr.value === 'string'
        ? { verdict: 'safe', why: 'string literal' }
        : { verdict: 'unknown', why: 'non-string literal' };
    case 'TemplateLiteral':
      return expr.expressions.length === 0
        ? { verdict: 'safe', why: 'template literal, no expr' }
        : { verdict: 'tainted', why: 'template with ${}' };
    case 'ArrayExpression':
      if (expr.elements.every(e => e && e.type === 'Literal' && typeof e.value === 'string'))
        return { verdict: 'safe', why: 'array of string literals' };
      return { verdict: 'tainted', why: 'array with non-literal element' };
    case 'BinaryExpression':
      return { verdict: 'tainted', why: 'concatenation' };
    case 'Identifier':
      return { verdict: 'tainted', why: 'identifier (' + expr.name + ')' };
    case 'MemberExpression':
      return { verdict: 'tainted', why: 'member access' };
    case 'CallExpression':
      return { verdict: 'tainted', why: 'call result' };
    case 'ConditionalExpression':
      return { verdict: 'tainted', why: 'ternary' };
    case 'LogicalExpression':
      return { verdict: 'tainted', why: 'logical expr' };
    case 'UnaryExpression':
    case 'UpdateExpression':
      return { verdict: 'tainted', why: expr.type };
    default:
      return { verdict: 'unknown', why: expr.type };
  }
}

// ---------------------------------------------------------------------------
// pass 1: 建立本地名 → lodash 绑定的映射
// ---------------------------------------------------------------------------
function collectBindings(ast) {
  // localName -> { kind:'module'|'member', pkg, member }
  const bindings = new Map();

  const addModule = (local, pkg) => bindings.set(local, { kind: 'module', pkg });
  const addMember = (local, pkg, member) => bindings.set(local, { kind: 'member', pkg, member });

  const pkgOf = (src) => {
    if (typeof src !== 'string') return null;
    if (MULTI_PKGS.has(src)) return src;
    if (SIBLING_PKGS.has(src)) return src;
    // lodash/get 子路径
    if (/^lodash(-es)?\/(fp\/)?[A-Za-z]+$/.test(src)) return src;
    return null;
  };

  walk.simple(ast, {
    // const _ = require('lodash')  /  const get = require('lodash.get')
    VariableDeclarator(node) {
      if (!node.init) return;
      // a) init 里含 require('lodash...')，可被 __toESM / _interopRequireDefault 包裹
      const reqPkg = requireTarget(node.init);
      if (reqPkg) {
        const pkg = pkgOf(reqPkg);
        if (!pkg) return;
        if (node.id.type === 'Identifier') {
          if (SIBLING_PKGS.has(pkg) || /^lodash(-es)?\/(fp\/)?[A-Za-z]+$/.test(pkg)) {
            // lodash.get / lodash/pick 的默认导出就是对应方法本身
            const m = memberOfSubpath(pkg);
            if (sideOf(m)) addMember(node.id.name, pkg, m);
          } else {
            addModule(node.id.name, pkg);
          }
        } else if (node.id.type === 'ObjectPattern') {
          for (const pr of node.id.properties) {
            if (pr.type !== 'Property') continue;
            const key = pr.key.name || pr.key.value;
            const val = pr.value.type === 'Identifier' ? pr.value.name : null;
            if (val && ALL_APIS.has(key)) addMember(val, pkg, key);
          }
        }
        return;
      }
      // b) init = require('lodash').get  (少见但存在)
      const rm = requireMember(node.init);
      if (rm && node.id.type === 'Identifier' && ALL_APIS.has(rm.mem))
        addMember(node.id.name, rm.pkg, rm.mem);
    },

    // import _ from 'lodash' / import { get } from 'lodash' / import get from 'lodash.get'
    ImportDeclaration(node) {
      const pkg = pkgOf(node.source.value);
      if (!pkg) return;
      for (const s of node.specifiers) {
        if (s.type === 'ImportDefaultSpecifier' || s.type === 'ImportNamespaceSpecifier') {
          if (SIBLING_PKGS.has(pkg)) {
            const m = memberOfSubpath(pkg);
            if (sideOf(m)) addMember(s.local.name, pkg, m);
          } else addModule(s.local.name, pkg);
        } else if (s.type === 'ImportSpecifier') {
          const imported = s.imported.name || s.imported.value;
          if (ALL_APIS.has(imported)) addMember(s.local.name, pkg, imported);
        }
      }
    },
  });

  return bindings;
}

// ---------------------------------------------------------------------------
// pass 2: 找调用点
// ---------------------------------------------------------------------------
function scanFile(file, rel) {
  let src;
  try { src = fs.readFileSync(file, 'utf8'); } catch (e) { return []; }
  if (src.length > 3_000_000) return [];   // 跳过超大 bundled 文件

  let ast;
  try {
    ast = acorn.parse(src, {
      ecmaVersion: 'latest', sourceType: 'module',
      allowHashBang: true, allowAwaitOutsideFunction: true,
      locations: true,
    });
  } catch (e1) {
    try {
      ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script',
        allowHashBang: true, locations: true });
    } catch (e2) { return []; }
  }

  let bindings;
  try {
    bindings = collectBindings(ast);
  } catch (e) { return []; }
  if (bindings.size === 0) return [];

  const traceCtx = TRACE ? collectDefs(ast) : null;
  const hits = [];
  const lines = src.split('\n');

  try {
  walk.simple(ast, {
    CallExpression(node) {
      let api = null, via = null;
      // (0, lodash_1.default.get)(...) —— tsc 编译 ESM import 的标准输出，不剥就等于看不见
      let c = node.callee;
      if (c.type === 'SequenceExpression' && c.expressions.length) {
        c = c.expressions[c.expressions.length - 1];
      }

      if (c.type === 'MemberExpression') {
        const mem = c.property && (c.property.name || c.property.value);
        // 剥掉 .default / .__esModule，兼容 tsc / esbuild 的互操作包装
        let o = c.object, guard = 0;
        while (o && guard++ < 5 && o.type === 'MemberExpression') {
          const p = o.property && (o.property.name || o.property.value);
          if (p === 'default' || p === '__esModule') o = o.object; else break;
        }
        const obj = o && o.type === 'Identifier' ? o.name : null;
        const b = obj ? bindings.get(obj) : null;
        if (b && b.kind === 'module' && typeof mem === 'string' && ALL_APIS.has(mem)) {
          api = mem; via = b.pkg + '.' + obj;
        } else if (b && b.kind === 'member' && (mem === 'default' || mem === '__esModule')) {
          // const get_1 = __importDefault(require('lodash/get'));  get_1.default(obj, p)
          api = b.member; via = b.pkg + '.' + obj + '.default';
        }
      } else if (c.type === 'Identifier') {
        const b = bindings.get(c.name);
        if (b && b.kind === 'member') { api = b.member; via = b.pkg; }
      }
      if (!api) return;

      // set/unset/update 的 path 是第 2 个参数；get/at/result/method/pick/has 也是第 2 个
      const argIdx = 1;
      const arg = node.arguments[argIdx];
      const cls = classify(arg);
      const origin = TRACE ? traceOrigin(arg, traceCtx) : { level: 'off', sig: [] };

      hits.push({
        file: rel,
        line: node.loc.start.line,
        api,
        side: sideOf(api),
        via,
        verdict: cls.verdict,
        origin: origin.level,
        origin_sig: origin.sig,
        arg_ident: arg && arg.type === 'Identifier' ? arg.name : null,
        why: cls.why,
        snippet: (lines[node.loc.start.line - 1] || '').trim().slice(0, 160),
      });
    },
  });
  } catch (e) { /* 单文件 AST 遍历异常不应中断整批 */ }

  return hits;
}

// ---------------------------------------------------------------------------
function scanPackage(pkgDir, pkgName) {
  const files = listJsFiles(pkgDir);
  const all = [];
  let minified = 0;
  for (const f of files) {
    const rel = path.relative(pkgDir, f).replace(/\\/g, '/');
    try {
      const src = fs.readFileSync(f, 'utf8');
      if (isMinified(src)) { minified++; continue; }
    } catch (e) { continue; }
    all.push(...scanFile(f, rel));
  }
  return { pkg: pkgName, files_scanned: files.length, minified_skipped: minified, hits: all };
}

// ---------------------------------------------------------------------------
function main() {
  const argv = process.argv.slice(2);
  const jsonIdx = argv.indexOf('--json');
  const jsonOut = jsonIdx >= 0 ? argv[jsonIdx + 1] : null;
  const target = argv[0];

  if (!target) { console.error('用法: node scan.js <pkgDir>|--batch <dir>'); process.exit(1); }

  const results = [];
  if (target === '--batch') {
    const root = argv[1];
    for (const d of fs.readdirSync(root, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const dir = path.join(root, d.name);
      const r = scanPackage(dir, d.name);
      results.push(r);
    }
  } else {
    results.push(scanPackage(path.resolve(target), path.basename(path.resolve(target))));
  }

  // 汇总
  let tainted = 0, safe = 0, unknown = 0, httpN = 0, paramN = 0, maybeN = 0;
  for (const r of results) {
    for (const h of r.hits) {
      if (h.verdict === 'tainted') {
        tainted++;
        if (h.origin === 'http') httpN++;
        else if (h.origin === 'param') paramN++;
        else if (h.origin === 'maybe') maybeN++;
      } else if (h.verdict === 'safe') safe++;
      else unknown++;
    }
  }

  console.log('包数: ' + results.length + ' | 调用点: ' + (tainted + safe + unknown) +
              ' | tainted: ' + tainted + ' | safe: ' + safe + ' | unknown: ' + unknown);
  if (TRACE) {
    console.log('污点来源: http ' + httpN + ' | param ' + paramN + ' | maybe ' + maybeN +
                ' | 无源 ' + (tainted - httpN - paramN - maybeN));
  }

  // http 级才是「应用可能真的有洞」的候选，排在最前
  const order = (h) => (h.origin === 'http' ? 0 : h.origin === 'param' ? 1 : h.origin === 'maybe' ? 2 : 3);

  for (const r of results) {
    const t = r.hits.filter(h => h.verdict === 'tainted').sort((a, b) => order(a) - order(b));
    if (!t.length) continue;
    const nh = t.filter(h => h.origin === 'http').length;
    console.log('\n### ' + r.pkg + '  (tainted ' + t.length + ' / 总 ' + r.hits.length +
                ', http ' + nh + ', 扫描 ' + r.files_scanned + ' 文件)');
    for (const h of t.slice(0, TRACE ? 20 : 12)) {
      const tag = TRACE ? ' [' + h.origin + (h.origin_sig && h.origin_sig.length ? ':' + h.origin_sig.join(',') : '') + ']' : '';
      console.log('  ' + h.file + ':' + h.line + '  _.' + h.api + ' (' + h.side + ')' + tag + '  [' + h.why + ']');
      console.log('      ' + h.snippet);
    }
    if (t.length > (TRACE ? 20 : 12)) console.log('  ... 另 ' + (t.length - (TRACE ? 20 : 12)) + ' 处');
  }

  if (jsonOut) {
    fs.writeFileSync(jsonOut, JSON.stringify({ results }, null, 1), 'utf8');
    console.log('\nJSON: ' + jsonOut);
  }
}

main();
