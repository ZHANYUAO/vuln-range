#!/usr/bin/env node
/**
 * VHV 第 2 阶（自动化版）：从 patch 学到的不变量，反向定位所有同类入口。
 *
 * 为什么不能用 grep（2026-11-02 换掉第一版）
 * -----------------------------------------
 * 第一版 Locate 是 `grep -n "= castPath("`，然后人工看。它的两个硬伤：
 *   1) 只找到**直接**调用 sink 的函数。`var invoke = baseRest(baseInvoke)`
 *      这种包装层 grep 不到，会把 `_.invoke` 从候选里整个漏掉 —— 而它恰好
 *      是唯一真正漏网的那个。
 *   2) guard 是否存在靠人眼在几千行里找，换版本就要重来一遍，不可复现。
 *
 * 这里改成 AST + 调用图：解析 → 建函数索引 → 建调用边 → 从**公开 API**
 * 反向可达 sink → 沿链路收集 guard 证据。输出一张可 diff 的矩阵，
 * 换版本重跑即可看出"修复补丁把 guard 加在了哪一层、哪条链没被覆盖"。
 *
 * guard 的判定只看 sink 函数**自己的函数体**（不跨函数继承）。理由是
 * lodash 的两种 guard 都是内联的：baseSet 的键黑名单、baseUnset 的
 * 位置敏感规则。跨函数继承会把"父函数挡住了"误当成"这个 sink 挡住了"。
 *
 * 用法：
 *   node locate.js <目标文件>                 # 人类可读表
 *   node locate.js <目标文件> --json out.json # 机器可读矩阵
 *   node locate.js <目标文件> --sinks baseSet,baseUnset,baseInvoke
 */
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

// sink 分三档，混在一个列表里会让输出失去可读性（第一版就吃了这个亏：
// 112 个 API 全列出来，其中 90 多个是 clone/isEqual 之类的只读误连）。
//
//   WRITE  : 真的会写对象图，污染成立即持久    ← 攻击面主判据
//   INVOKE : 不写，但会以解析出的对象为 this 调用函数  ← RCE 级，优先看
//   READ   : 只读。单独归类，不参与"无防护"排序，因为只读本身不是漏洞
//
// 刻意**不**把 assignValue / assignMergeValue 列入 WRITE：它们不是 path sink，
// 而是通用属性写入，baseClone 复制对象时也走它们。一旦列进去，clone/keys/max
// 这类纯数据操作会全部冒出来当"攻击面"——第一版就这么误报了 44 个。
// 它们仍有价值，作为 baseAssignValue（真正的安全化点）的调用者留作证据。
const WRITE_SINKS = ['baseSet', 'baseUnset', 'baseAssignValue'];
const INVOKE_SINKS = ['baseInvoke', 'result'];
const READ_SINKS = ['baseGet', 'hasPath', 'parent', 'castPath', 'baseAt'];
const DEFAULT_SINKS = [...WRITE_SINKS, ...INVOKE_SINKS, ...READ_SINKS];

// 自定义 sink（--sinks 指定、不在预设三档里的）标 'custom'：
// 用户明确点名要看的函数，不该因为不在预设表里就被归进"只读背景"而看不见。
const SINK_CLASS = {};
for (const s of WRITE_SINKS) SINK_CLASS[s] = 'write';
for (const s of INVOKE_SINKS) SINK_CLASS[s] = 'invoke';
for (const s of READ_SINKS) SINK_CLASS[s] = 'read';

// rest/ary 包装器：这些函数把参数函数存起来、稍后原样调用，
// AST 静态看不出调用边，必须补一条人工边，否则 `_.invoke` 整条链断掉。
// 只放确定的"纯调用转发"实现（lodash 内部就这 4 个模式）。
// flatRest 是 baseRest + baseFlatten 的变体，`_.at` / `_.over` 走它。
const WRAPPERS = ['baseRest', 'baseAry', 'overRest', 'flatRest'];

// ---------------------------------------------------------------- 解析

function parseFile(file) {
  const code = fs.readFileSync(file, 'utf8');
  return acorn.parse(code, {
    ecmaVersion: 'latest',
    sourceType: 'script',
    locations: true,
    allowReturnOutsideFunction: true,
  });
}

// 通用遍历：不依赖 acorn-walk 的基类，自己走，同时带 parent 与 grandparent。
// 需要 grandparent 的原因：lodash 大量使用
//     var method = baseRest(function(path, args) {...})
// 函数表达式的**直接父节点是 CallExpression**，不是 VariableDeclarator。
// 只看 parent 会得到一个匿名函数，`_.method` 整个从索引里消失 —— 这正是
// 第一版漏掉 invoke 家族的原因（那次是靠 grep 补的，不是靠工具发现的）。
function walk(node, cb, parent, grandparent) {
  if (!node || typeof node.type !== 'string') return;
  cb(node, parent, grandparent);
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue;
    const v = node[k];
    if (Array.isArray(v)) {
      for (const c of v) if (c && typeof c.type === 'string') walk(c, cb, node, parent);
    } else if (v && typeof v.type === 'string') {
      walk(v, cb, node, parent);
    }
  }
}

// ---------------------------------------------------------------- 函数索引

/**
 * 导出识别。第一版只认 `lodash.foo = bar`，那是被 lodash 的写法惯坏了：
 * 换个库（`module.exports = { get, set }`）就什么都认不出来，矩阵直接空。
 *
 * 现在覆盖四种常见形态：
 *   lodash.foo = bar            （lodash UMD）
 *   exports.foo = bar           （CJS 逐项导出）
 *   module.exports.foo = bar    （同上，另一种写法）
 *   module.exports = { get, set }  （对象字面量，含 method shorthand）
 *
 * 注意：`module.exports = { get(object, path) {...} }` 里 value 是
 * FunctionExpression 而不是 Identifier，所以 target 用 key 名 —— 那个
 * FunctionExpression 已被 nameOf(…, Property) 命名为同名函数，能对上。
 */
function collectExports(node, out) {
  if (node.type !== 'AssignmentExpression' || node.left.type !== 'MemberExpression') return;
  const L = node.left;
  if (L.computed) return;
  const objIsNs = (o) => o.type === 'Identifier' && (o.name === 'exports' || o.name === 'module' || o.name === 'lodash');
  const isModuleExports = L.object.type === 'Identifier' && L.object.name === 'module' &&
    L.property.name === 'exports';

  // module.exports = {...}
  if (isModuleExports && node.right.type === 'ObjectExpression') {
    for (const pr of node.right.properties || []) {
      if (pr.type !== 'Property' || pr.computed || !pr.key) continue;
      const api = pr.key.name;
      if (!api) continue;
      const tgt = pr.value.type === 'Identifier' ? pr.value.name : api;
      out.push({ api, target: tgt });
    }
    return;
  }
  // X.foo = bar  （X ∈ {exports, module.exports, lodash}）
  const holderIsOk = objIsNs(L.object) ||
    (L.object.type === 'MemberExpression' && !L.object.computed &&
     L.object.object.name === 'module' && L.object.property.name === 'exports');
  if (!holderIsOk || !node.right || node.right.type !== 'Identifier') return;
  out.push({ api: L.property.name, target: node.right.name });
}

/**
 * 给函数节点取名。函数可能有四种挂法：
 *   function foo(){}                       → 自身 id
 *   var foo = function(){}                 → 变量名
 *   var foo = baseRest(function(){})       → 穿透一层 CallExpression 才能拿到
 *   lodash.foo = function(){}              → 属性名（导出）
 * 匿名且不可命名的直接跳过（IIFE 回调），它们没有独立调用边。
 */
function nameOf(fnNode, parent, grandparent) {
  if (fnNode.id && fnNode.id.name) return fnNode.id.name;
  const holders = [parent, grandparent];
  for (const h of holders) {
    if (!h) continue;
    if (h.type === 'VariableDeclarator' && h.id && h.id.type === 'Identifier') return h.id.name;
    if (h.type === 'AssignmentExpression' && h.left) {
      const L = h.left;
      if (L.type === 'MemberExpression' && !L.computed && L.property.name) return L.property.name;
      if (L.type === 'Identifier') return L.name;
    }
    if (h.type === 'Property' && h.key && !h.computed && h.key.name) return h.key.name;
  }
  return null;
}

const FN_TYPES = new Set([
  'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
]);

/** 函数签名里的参数名列表。自动生成载荷要靠它判断 path 在第几位。 */
function paramNames(fnNode) {
  return (fnNode.params || []).map((p) => {
    if (p.type === 'Identifier') return p.name;
    if (p.type === 'AssignmentPattern' && p.left.type === 'Identifier') return p.left.name;
    if (p.type === 'RestElement' && p.argument.type === 'Identifier') return '...' + p.argument.name;
    return '?';
  });
}

/** 取调用目标名：`foo()` / `this.foo()` / `a.b.foo()` 都归到 foo。 */
function calleeName(call) {
  const c = call.callee;
  if (!c) return null;
  if (c.type === 'Identifier') return c.name;
  if (c.type === 'MemberExpression' && !c.computed && c.property && c.property.name) {
    return c.property.name;
  }
  return null;
}

// ---------------------------------------------------------------- guard 探测

/**
 * 在函数体内找「原型链防护」的证据。刻意分成几种形态而不是一个 bool，
 * 因为不同形态挡的东西不一样，混成一个 true 会把"挡了一半"当成"挡全了"：
 *
 *   protoKey     : 出现 '__proto__' 字面量比较        → 挡 __proto__
 *   ctorKey      : 出现 'constructor' 字面量比较      → 挡 constructor
 *   protoWord    : 出现 'prototype' 字面量比较        → 挡住 prototype 作中间键
 *   ownCheck     : 出现 hasOwnProperty                → 通常是"仅允许自有属性"
 *   isPrototype  : 调用 baseIsPrototype/isPrototype   → 结构性判定而非字符串黑名单
 *   guardReturn  : 在比较之后有 return（拦截而非仅记录）
 */
function probeGuards(fnNode, code) {
  const g = { protoKey: false, ctorKey: false, protoWord: false, ownCheck: false, isPrototype: false, returnsOnBlock: false };
  const body = code.slice(fnNode.start, fnNode.end);

  // 字面量比较：必须出现在比较语境里，否则注释/字符串常量也会命中。
  // 用 `('__proto__')` 前后的 == / === / !== 判断。
  const cmp = (lit) => new RegExp(`['"]${lit}['"]\\s*[!=]==?|[!=]==?\\s*['"]${lit}['"]`).test(body);
  g.protoKey = cmp('__proto__');
  g.ctorKey = cmp('constructor');
  g.protoWord = cmp('prototype');
  g.ownCheck = /\b(hasOwnProperty|Object\.hasOwn)\b/.test(body) &&
               /\b(hasOwnProperty|hasOwn)\s*[.(]/.test(body);
  g.isPrototype = /\b(baseIsPrototype|isPrototype)\s*\(/.test(body);
  // 「安全化」形态：__proto__ 分支里改用 defineProperty 写成自有属性。
  // 这不是拦截，效果等价于拦住全局污染，但语义不同，必须分开记 ——
  // 否则 audit 时会把"改写成自有属性"当成"拒绝了这次调用"。
  g.definePropSafe = /key\s*==\s*['"]__proto__['"][\s\S]{0,120}defineProperty/.test(body);

  // 「比较 → return」的拦截形态：if (...) { return ... } 里带上面任一字面量
  g.returnsOnBlock = /if\s*\([^)]*(__proto__|constructor|prototype)[^)]*\)\s*\{[^}]*return/s.test(body);
  // 把黑名单抽到顶层 Set、函数里只写一句 isValidPath(...) 的写法。
  // 这不是精确数据流，而是"该函数委托给了名字上明确表示校验的函数"。
  // 对 dot-prop / object-path 这类库有效；对把校验叫 `foo()` 的库会漏，
  // 所以它只用来**免于误报**，不用来断言"一定安全"。
  g.callsValidator = /\b(isValid|isSafe|validate|sanitize|assertSafe|checkPath|hasUnsafeKey|isUnsafe)\w*\s*\(/.test(body);
  return g;
}

/**
 * guard 是否对该 sink 构成有效防护。
 *
 * 关键设计：**按 sink 语义分档，不做一刀切**。第一版用「出现 __proto__ 就算有
 * guard」，结果 baseUnset 的 partial 修复（只挡 __proto__ 不挡 constructor）被
 * 判成 full，而实际上 4.17.23 的绕过正好走 constructor.prototype。
 *
 * 跨函数委托单独处理：assignValue / assignMergeValue 自身没有 guard，
 * 但它们把写入委派给 baseAssignValue（那里才有 defineProperty 保护）。
 * 若把"本函数没有 guard"直接报成 no_guard，就会产生大量假阳性 ——
 * 而假阳性比漏报更适合用 `delegated` 这个中性标签表达。
 */
function guardVerdict(sink, g, chain, ctx) {
  const cls = SINK_CLASS[sink] || 'custom';

  // 委托式校验：文件里存在顶层黑名单集合，且本函数/链上调了校验器。
  // 判 'validated' 而不是 'full' —— 它不是我们逐键确认过的拦截逻辑，
  // 是"看起来有校验"。报告里必须能区分这两者，否则 audit 时无法复核。
  if (ctx && ctx.fileProtoGuard) {
    const chainHit = (chain || []).some((n) => ctx.validatorFns && ctx.validatorFns.has(n));
    if (g.callsValidator || chainHit) return 'validated';
  }

  // 写入型 sink
  if (sink === 'baseSet') {
    if (g.protoKey && g.ctorKey && g.protoWord) return 'full';
    if (g.protoKey) return 'partial';
    return 'none';
  }
  if (sink === 'baseUnset') {
    if (g.protoKey && (g.ctorKey || g.protoWord)) return 'full';
    if (g.protoKey) return 'partial';
    return 'none';
  }
  if (cls === 'write' || cls === 'custom') {
    // baseAssignValue 的写法是 `key == '__proto__' ? defineProperty(...) : object[key]=v`。
    // **它只特判 __proto__ 一个键**：`constructor` / `prototype` 走 else 分支直接赋值。
    // 所以 definePropSafe 单独出现不能算 full —— 那是"挡住一个入口，放走另一条链"，
    // 正是 4.17.23 到 4.18.0 那次修 baseUnset 时踩过的同一个坑。
    if (g.definePropSafe) {
      return (g.ctorKey || g.protoWord) ? 'full' : 'partial(define-only-proto)';
    }
    if (g.protoKey) return 'partial';
    // 委派给了链上更深的写 sink？那也是防护
    const deeper = (chain || []).some((n) => n !== sink && WRITE_SINKS.includes(n));
    return deeper ? 'delegated' : 'none';
  }

  // 调用型 sink
  if (cls === 'invoke') {
    if (g.protoKey || g.ctorKey) return 'partial';
    return 'none';
  }

  // 只读型：不构成"防护"问题，标 read 让上层过滤
  return g.protoKey ? 'read-guarded' : 'read';
}

// ---------------------------------------------------------------- 主流程

function analyze(file, opts) {
  const code = fs.readFileSync(file, 'utf8');
  const ast = parseFile(file);
  const sinks = new Set(opts.sinks && opts.sinks.length ? opts.sinks : DEFAULT_SINKS);

  // 文件级 guard：有些库把黑名单放在模块顶层（如 dot-prop 的
  // `const disallowedKeys = new Set(['__proto__','prototype','constructor'])`），
  // 校验函数本身只是一句 `isValidPath(parts)`。只看函数体会漏掉这类——
  // 它们其实防护得比 lodash 更彻底（三个键全挡），漏判会造成假阳性。
  const fileProtoGuard =
    /new Set\(\s*\[[^\]]*['"]__proto__['"]/.test(code) ||
    /\[\s*['"]__proto__['"]\s*,\s*['"](prototype|constructor)['"]/.test(code) ||
    /\[\s*['"]constructor['"]\s*,\s*(['"]prototype['"]|['"]__proto__['"])/.test(code);

  const fns = new Map();       // name -> {node, params, guards, calls, parent, line}
  const virtual = new Map();   // 包装器别名的合成节点（见下方 fillVirtual）
  const exportsMap = [];       // [{api, target}]

  walk(ast, (node, parent, grandparent) => {
    if (FN_TYPES.has(node.type)) {
      const name = nameOf(node, parent, grandparent);
      if (name) {
        fns.set(name, {
          name, node, parent,
          params: paramNames(node),
          line: node.loc.start.line,
          endLine: node.loc.end.line,
          guards: probeGuards(node, code),
          calls: [],
        });
      }
    }
    collectExports(node, exportsMap);
  });

  // 包装器别名：`var invoke = baseRest(baseInvoke)` 里的 invoke 不是一个函数
  // 声明，而是一个调用结果。它没有函数体可扫，但调用边是确定的：
  //   baseRest → 被调用；baseInvoke → 被包装、稍后被调用
  // 不补这一层，`_.invoke` / `_.method` / `_.invokeMap` / `_.at` 全部漏掉。
  walk(ast, (node) => {
    if (node.type !== 'VariableDeclarator' || !node.init) return;
    if (node.init.type !== 'CallExpression') return;
    const nm = node.id && node.id.name;
    if (!nm || fns.has(nm)) return;      // 真函数优先，别名不覆盖
    const cn = calleeName(node.init);
    if (!WRAPPERS.includes(cn)) return;
    const calls = [cn];
    for (const a of node.init.arguments || []) {
      if (a.type === 'Identifier') calls.push(a.name);
    }
    virtual.set(nm, {
      name: nm, virtual: true, node: node.init, parent: null,
      params: [], line: node.loc.start.line, endLine: node.loc.end.line,
      guards: {}, calls,
    });
  });
  for (const [k, v] of virtual) if (!fns.has(k)) fns.set(k, v);

  // 调用边：函数体内出现的 callee 名
  for (const rec of fns.values()) {
    if (rec.virtual) continue;           // 虚拟节点已手工建边
    const seen = new Set();
    walk(rec.node, (n) => {
      if (n.type === 'CallExpression') {
        const nm = calleeName(n);
        if (nm) seen.add(nm);
        // 包装器补边：baseRest(baseInvoke) 真实调用的是 baseInvoke
        for (const a of n.arguments || []) {
          if (a.type === 'Identifier' && WRAPPERS.includes(nm)) seen.add(a.name);
        }
      }
    });
    rec.calls = [...seen].filter((x) => x !== rec.name);
  }

  // 校验函数集合：名字表明它是校验器，且文件里确实有顶层黑名单。
  const validatorFns = new Set();
  for (const rec of fns.values()) {
    if (/^(isValid|isSafe|validate|sanitize|assertSafe|checkPath|hasUnsafeKey|isUnsafe)/.test(rec.name)) {
      validatorFns.add(rec.name);
    }
  }
  const guardCtx = { fileProtoGuard, validatorFns };

  // 从每个公开 API 反向可达 sink
  const results = [];
  for (const { api, target } of exportsMap) {
    if (!fns.has(target)) continue;
    // BFS，记录到每个 sink 的最短链
    const q = [[target, [target]]];
    const visited = new Set([target]);
    const chains = [];
    while (q.length) {
      const [cur, chain] = q.shift();
      if (sinks.has(cur)) {
        chains.push({ sink: cur, chain });
        continue;                     // 到 sink 就停，不继续下钻
      }
      if (chain.length > 5) continue; // 过深的链多半是误连，截断
      const rec = fns.get(cur);
      if (!rec) continue;
      for (const nxt of rec.calls) {
        if (visited.has(nxt) || !fns.has(nxt)) continue;
        visited.add(nxt);
        q.push([nxt, chain.concat(nxt)]);
      }
    }
    if (!chains.length) continue;

    chains.sort((a, b) => a.chain.length - b.chain.length);
    const best = chains[0];
    const sinkRec = fns.get(best.sink);
    const gv = guardVerdict(best.sink, sinkRec.guards, best.chain, guardCtx);
    // path 参数位置：在 sink 之前的直接实现函数里找名叫 path 的形参
    const implRec = fns.get(target);
    const params = implRec ? implRec.params : [];
    const pathPos = params.findIndex((p) => /path|props/i.test(p));
    // path 从哪来：直接形参 / 只能经 iteratee 简写进来。
    // 这两者影响面差一个数量级（前者是 API 契约，后者要求开发者把外部
    // 字符串当 iteratee 传），混在一张表里会让人误判优先级。
    //
    // 判据不能只看 impl 的形参：`_.filter(arr, 'a.b')` 的 impl 是 filter，
    // 形参叫 collection/iteratee，但 path 实际是**第二参数**传进来的。
    // 所以链上出现 getIteratee 也判定为 iteratee 通道 —— getIteratee 是
    // lodash 里"把简写解析成函数"的唯一入口，出现在链上就意味着路径来自简写。
    const viaShorthand = best.chain.includes('getIteratee') ||
      params.some((p) => /iteratee/i.test(p));
    const origin = pathPos >= 0 ? 'direct' : viaShorthand ? 'iteratee' : 'other';

    results.push({
      api,
      impl: target,
      sink: best.sink,
      sink_class: SINK_CLASS[best.sink] || 'custom',
      chain: best.chain,
      guard: gv,
      guard_evidence: sinkRec.guards,
      sink_line: sinkRec.line,
      path_param_pos: pathPos,
      path_origin: origin,
      impl_params: params,
      other_sinks: chains.slice(1).map((c) => c.sink),
    });
  }

  // 排序：先按"是不是真攻击面"，再按 guard 强度
  const guardRank = (x) => ({ none: 0, partial: 1, delegated: 2, 'partial(define-only-proto)': 1, validated: 3, 'full(define)': 3,
                              full: 4, 'read-guarded': 5, read: 6 }[x] ?? 9);
  const classRank = (x) => ({ write: 0, custom: 0, invoke: 1, read: 2 }[x] ?? 3);
  const originRank = (x) => ({ direct: 0, other: 1, iteratee: 2 }[x] ?? 3);
  results.sort((a, b) =>
    classRank(a) - classRank(b) ||
    originRank(a) - originRank(b) ||
    guardRank(a.guard) - guardRank(b.guard) ||
    a.api.localeCompare(b.api));
  return { file, fn_count: fns.size, export_count: exportsMap.length, results };
}

function renderTable(rep) {
  const rows = rep.results;
  console.log('目标: %s', rep.file);
  console.log('函数 %d 个 / 导出 %d 个 / 触达 sink 的 API %d 个',
    rep.fn_count, rep.export_count, rows.length);

  // 三段输出：攻击面主表 / 简写入口 / 只读背景
  const main = rows.filter((r) => r.sink_class !== 'read' && r.path_origin !== 'iteratee');
  const viaShorthand = rows.filter((r) => r.path_origin === 'iteratee');
  const readOnly = rows.filter((r) => r.sink_class === 'read');

  const line = '-'.repeat(104);
  console.log('\n【A】直接 path 参数的写/调用入口  —— 真正的攻击面');
  console.log('API'.padEnd(20) + 'SINK'.padEnd(15) + 'GUARD'.padEnd(14) + 'CHAIN');
  console.log(line);
  for (const r of main) {
    console.log(r.api.padEnd(20) + r.sink.padEnd(15) + r.guard.padEnd(14) +
      r.chain.join(' -> ') + (r.guard === 'none' ? '   <== 无防护' : ''));
  }
  if (!main.length) console.log('（无）');

  console.log('\n【B】经 iteratee 简写间接触达 —— 影响面取决于调用方是否把外部字符串当 iteratee');
  console.log('API'.padEnd(20) + 'SINK'.padEnd(15) + 'GUARD'.padEnd(14) + 'CHAIN');
  console.log(line);
  for (const r of viaShorthand.slice(0, 12)) {
    console.log(r.api.padEnd(20) + r.sink.padEnd(15) + r.guard.padEnd(14) +
      r.chain.join(' -> '));
  }
  if (viaShorthand.length > 12) console.log('... 另有 %d 个同类（多为集合方法，模式相同）',
    viaShorthand.length - 12);

  const counts = {};
  for (const r of main) counts[r.guard] = (counts[r.guard] || 0) + 1;
  console.log('\n' + line);
  console.log('【A】小计: ' + (Object.keys(counts).length
    ? Object.entries(counts).map(([k, v]) => `${k}=${v}`).join('  ')
    : '无') + `   |  【B】${viaShorthand.length}  |  【C】只读 ${readOnly.length}`);

  const bad = main.filter((r) => r.guard === 'none');
  if (bad.length) {
    console.log('\n⚠ 无防护入口 ' + bad.length + ' 个，需逐条转成可执行载荷：');
    for (const r of bad) console.log('    ' + r.api + '(…, path, …)  ->  ' + r.sink + '  @line ' + r.sink_line);
  }
}

function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('用法: node locate.js <目标文件> [--json out.json] [--sinks a,b]');
    return 2;
  }
  const file = path.resolve(args[0]);
  if (!fs.existsSync(file)) {
    console.error('[FAIL] 找不到 ' + file);
    return 2;
  }
  let jsonOut = null;
  let sinks = null;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--json') jsonOut = args[++i];
    else if (args[i] === '--sinks') sinks = args[++i].split(',').map((s) => s.trim());
  }
  const rep = analyze(file, { sinks });
  renderTable(rep);
  if (jsonOut) {
    fs.writeFileSync(jsonOut, JSON.stringify(rep, null, 2), 'utf8');
    console.log('\n矩阵 -> ' + jsonOut);
  }
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { analyze };
