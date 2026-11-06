#!/usr/bin/env node
/**
 * guardcov.js —— 「守卫存在但覆盖不足」检测器  v3
 *
 * 回答的问题：
 *   这个库有没有一个**正确**的键守卫？它到底护住了几个点？没护住的那几个能不能真打穿？
 *
 * 为什么需要它（motivation 来自 lodash）：
 *   静态扫描器（CodeQL/Semgrep 自定义规则、多数论文的判据）看到
 *   `function safeGet(o,k){ if(k==='__proto__') return; ... }` 就认为库安全了。
 *   lodash 反例：safeGet 存在 8 年，只被 baseMerge/baseMergeDeep 调用 3 次，
 *   baseGet / parent / baseInvoke 一次都没用过 —— 锁造好了，只装在一扇门上。
 *   所以「守卫的定义」与「守卫的覆盖」必须是两个数。
 *
 * v3 支持四种守卫形态（v1/v2 只认第一种，导致 dot-prop / set-value / dot-object
 * 三个已实测能拦的库被误报成 NO_GUARD —— 误报比漏报更危险，会毁掉整批结论）：
 *   block      if (<含危险键判据>) return/throw/break        lodash baseSet
 *   switch     switch(k){ case '__proto__': return }         jsonpointer
 *   predicate  返回布尔值的谓词函数                           set-value isUnsafeKey
 *              `key => key === '__proto__' || ...`
 *   filter     守卫作为回调传入（不直接调用）                  dot-object blacklistFilter
 *              `parts.filter(blacklistFilter)` + `if (check.length !== parts.length) throw`
 *
 * 第五种写法 v3 仍**不认**，必须靠人读：
 *   判据里既无键字面量、也无守卫调用，纯靠"结果长度不等"推断 —— dot-object 之所以
 *   能被覆盖，是因为它同时有 filter 那条边。若某库连 filter 都不用，只能人工看。
 *
 * 两类汇点分开统计（语义完全不同，混在一起会得出错误结论）：
 *   path    ：沿 path/keys/segments 形参逐段下钻     —— lodash baseGet、dot-prop get
 *   merge   ：for..in 遍历源对象 + target[key]=       —— deep-extend、旧版 merge
 *
 * 用法：
 *   node guardcov.js <file.js>
 *   node guardcov.js --batch <dir>
 *   node guardcov.js <file.js> --json out.json
 */

const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const FN_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const DANGER_KEYS = ['__proto__', 'prototype', 'constructor'];
// 完整防护必须同时挡 __proto__ 与 constructor：前者挡直接污染，
// 后者挡 constructor.constructor 拿到 Function 的那条链。
const KEY_FULL = ['__proto__', 'constructor'];

// 数组下标 / 长度类标识符，不是「沿对象图取键」
const NON_KEY_IDENTS = new Set([
  'i', 'j', 'k', 'n', 'p', 'c', 'idx', 'index', 'pos', 'offset', 'cursor',
  'length', 'len', 'size', 'count', 'it', 'iter', 'l', 'm', 'q', 'v', 'x',
]);

function nameOf(fnNode, parent, grand) {
  if (fnNode.id && fnNode.id.name) return fnNode.id.name;
  const pair = (p) => {
    if (!p) return null;
    if (p.type === 'VariableDeclarator' && p.id && p.id.type === 'Identifier') return p.id.name;
    if (p.type === 'AssignmentExpression' && p.left) {
      const L = p.left;
      if (L.type === 'MemberExpression' && !L.computed && L.property.name) return L.property.name;
      if (L.type === 'Identifier') return L.name;
    }
    if (p.type === 'Property' && p.key && !p.computed) {
      if (p.key.type === 'Identifier') return p.key.name;
      if (p.key.type === 'Literal') return String(p.key.value);
    }
    return null;
  };
  return pair(parent) || pair(grand);
}

function paramNames(fn) {
  return (fn.params || []).map((p) => {
    if (p.type === 'Identifier') return p.name;
    if (p.type === 'AssignmentPattern' && p.left.type === 'Identifier') return p.left.name;
    if (p.type === 'RestElement' && p.argument.type === 'Identifier') return '...' + p.argument.name;
    if (p.type === 'ObjectPattern') return '{..}';
    return '?';
  });
}

/** 判据表达式分类。只看文本，不判阻塞性 —— 阻塞性由调用方决定。 */
function classifyTest(t) {
  const quoted = DANGER_KEYS.filter((k) => t.includes(`'${k}'`) || t.includes(`"${k}"`));
  if (quoted.length && (/(===|==|!==|!=|case\b|switch\b)/.test(t) || /\.(indexOf|includes)\s*\(/.test(t))) {
    return quoted.length >= 2 ? 'blacklist' : 'blacklist-one';
  }
  if (/\b(hasOwnProperty|Object\.hasOwn|propertyIsEnumerable)\b/.test(t)) return 'ownkey';
  if (/\w+\.(has|includes|indexOf)\s*\(\s*[\w.$]+\s*\)/.test(t) &&
      !/\.(length|push|pop|slice|filter|map)\b/.test(t)) return 'lookup';
  if (/\w+\.test\s*\(/.test(t)) return 'regex';
  return null;
}

function keysIn(t) {
  return DANGER_KEYS.filter((k) => t.includes(`'${k}'`) || t.includes(`"${k}"`));
}

/** 形态 block / switch：if+return|throw|break，或 switch+case。 */
function blockingTest(fn, code) {
  // 注意：一个函数里可能有**多处**独立判据（lodash baseUnset 就是
  // `__proto__` 一处、`constructor`/`prototype` 一处）。只取第一处会把
  // 完整防护误判成半修复 —— 这个错误一度让 100 个站点被标成 keys 不全。
  let hit = null;
  const accKeys = new Set();
  let accKind = null;
  const rec = (n) => {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'IfStatement') {
      const cons = n.consequent ? code.slice(n.consequent.start, n.consequent.end) : '';
      if (/\b(return|throw|break|continue)\b/.test(cons)) {
        const t = code.slice(n.test.start, n.test.end);
        const kind = classifyTest(t);
        if (kind) {
          keysIn(t).forEach((k) => accKeys.add(k));
          if (!accKind) accKind = kind;
          if (!hit) hit = { kind, test: t.replace(/\s+/g, ' ').slice(0, 70), keys: [], shape: 'block' };
        }
      }
    }
    if (n.type === 'SwitchStatement') {
      for (const cs of n.cases || []) {
        if (!cs.test) continue;
        const body = (cs.consequent || []).map((c) => code.slice(c.start, c.end)).join(' ');
        if (!/\b(return|throw|break)\b/.test(body)) continue;
        const t = code.slice(cs.test.start, cs.test.end);
        const kind = classifyTest(t);
        if (kind) {
          keysIn(t).forEach((k) => accKeys.add(k));
          if (!accKind) accKind = kind;
          if (!hit) hit = { kind, test: `switch ${t}`.slice(0, 70), keys: [], shape: 'switch' };
        }
      }
    }
    for (const k of Object.keys(n)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue;
      const val = n[k];
      if (Array.isArray(val)) { for (const c of val) if (c && typeof c.type === 'string') rec(c); }
      else if (val && typeof val.type === 'string') rec(val);
    }
  };
  rec(fn.body);
  if (hit) { hit.keys = [...accKeys]; hit.kind = accKind || hit.kind; }
  return hit;
}

/**
 * 形态 predicate：
 *   `const isUnsafeKey = key => { return key === '__proto__' || ... }`
 *   `var blacklistFilter = function (part) { return blacklist.indexOf(part) === -1 }`
 * 判据：函数体够小（≤3 条语句，或简洁体），且恰有一条 return 返回判据表达式。
 */
function predicateTest(fn, code) {
  const stmts = fn.body && fn.body.type === 'BlockStatement' ? fn.body.body : null;
  let expr = null;
  if (!stmts) expr = fn.body;                            // 简洁箭头体
  else if (stmts.length <= 3) {
    const rets = stmts.filter((s) => s.type === 'ReturnStatement' && s.argument);
    if (rets.length === 1) expr = rets[0].argument;
  }
  if (!expr) return null;
  const t = code.slice(expr.start, expr.end);
  const kind = classifyTest(t);
  if (!kind) return null;
  return { kind, test: t.replace(/\s+/g, ' ').slice(0, 70), keys: keysIn(t), shape: 'predicate' };
}

function probeFileBlacklist(code) {
  const res = { exists: false, form: null, keys: [] };
  const setM = code.match(/new\s+(?:Set|Map)\s*\(\s*\[[^\]]{0,240}\]\s*\)/);
  const arrM = code.match(/(?:const|let|var)\s+\w+\s*=\s*\[[^\]]{0,240}\]/);
  const keysOf = (m) => {
    if (!m) return null;
    const kk = DANGER_KEYS.filter((k) => m[0].includes(`'${k}'`) || m[0].includes(`"${k}"`));
    return kk.length ? kk : null;
  };
  const s = keysOf(setM), a = keysOf(arrM);
  if (s) { res.exists = true; res.form = 'set'; res.keys = s; }
  else if (a) { res.exists = true; res.form = 'array'; res.keys = a; }
  return res;
}

function isDynamicKey(node) {
  if (!node.computed) return false;
  const p = node.property;
  if (!p) return false;
  if (p.type === 'Literal') return false;
  if (p.type === 'TemplateLiteral' && p.expressions.length === 0) return false;
  if (p.type === 'UpdateExpression') return false;
  if (p.type === 'UnaryExpression') return false;
  if (p.type === 'Identifier' && NON_KEY_IDENTS.has(p.name)) return false;
  return true;
}

function pathWalker(fn, code) {
  const params = paramNames(fn).join(',');
  const body = fn.body ? code.slice(fn.body.start, fn.body.end) : '';
  const named = /\b(paths?|propPaths?|keys|segments?|parts?|props|chain|pointer|fields|names)\b/i.test(params);
  const looped = /\b(while|for)\s*\(/.test(body);
  const segmenting = /\.(shift|pop|splice)\s*\(/.test(body);
  return { named, looped, segmenting, isPath: named || (looped && segmenting) };
}

function hasForIn(fn, code) {
  const b = fn.body ? code.slice(fn.body.start, fn.body.end) : '';
  return /\bfor\s*\(\s*(?:var|let|const)?\s*\w+\s+in\b/.test(b);
}

function calleeName(c) {
  if (!c) return null;
  if (c.type === 'Identifier') return c.name;
  if (c.type === 'MemberExpression') {
    if (!c.computed && c.property.name) return c.property.name;
    if (c.computed && c.property.type === 'Literal') return String(c.property.value);
  }
  return null;
}

// ── 主分析 ──────────────────────────────────────────────────────────────
function analyze(file) {
  const code = fs.readFileSync(file, 'utf8');
  const base = {
    ecmaVersion: 'latest', locations: true, ranges: true,
    allowReturnOutsideFunction: true, allowHashBang: true, allowAwaitOutsideFunction: true,
  };
  let ast;
  try { ast = acorn.parse(code, { ...base, sourceType: 'script' }); }
  catch (e) { ast = acorn.parse(code, { ...base, sourceType: 'module' }); }

  const allFns = [];
  const calls = [];   // 直接调用 { name, line, owner }
  const refs = [];    // 作为实参传递（.filter(guard)） { name, line, owner }
  const sites = [];
  const exportsMap = [];

  function visit(node, parent, grand, stack) {
    if (!node || typeof node.type !== 'string') return;
    let cur = stack;

    if (FN_TYPES.has(node.type)) {
      const nm = nameOf(node, parent, grand);
      const rec = {
        name: nm, node, line: node.loc.start.line,
        params: paramNames(node),
        body: node.body ? code.slice(node.body.start, node.body.end) : '',
        guard: null, walk: null, ownerSites: 0, forin: false,
      };
      rec.guard = blockingTest(node, code) || predicateTest(node, code);
      rec.walk = pathWalker(node, code);
      rec.forin = hasForIn(node, code);
      allFns.push(rec);
      cur = stack.concat(rec);
    }

    const ownerRec = cur.length ? cur[cur.length - 1] : null;
    const ownerName = ownerRec ? (ownerRec.name || `anon@${ownerRec.line}`) : '(top-level)';

    if (node.type === 'CallExpression') {
      const nm = calleeName(node.callee);
      if (nm) calls.push({ name: nm, line: node.loc.start.line, owner: ownerName });
      for (const a of node.arguments || []) {
        if (a.type === 'Identifier') refs.push({ name: a.name, line: node.loc.start.line, owner: ownerName });
      }
    }

    if (node.type === 'MemberExpression' && isDynamicKey(node)) {
      const isWrite = parent && parent.type === 'AssignmentExpression' && parent.left === node;
      sites.push({
        line: node.loc.start.line, owner: ownerName, write: !!isWrite, ownerRec,
        expr: code.slice(node.start, Math.min(node.end, node.start + 56)).replace(/\s+/g, ' '),
      });
      if (ownerRec) ownerRec.ownerSites++;
    }

    if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression' && !node.left.computed) {
      const L = node.left;
      const holder = L.object.type === 'Identifier' ? L.object.name
        : (L.object.type === 'MemberExpression' && L.object.property.name === 'exports' ? 'module.exports' : '?');
      if (['exports', 'module.exports', 'lodash', '_'].includes(holder) && node.right.type === 'Identifier') {
        exportsMap.push({ api: L.property.name, target: node.right.name });
      }
      if (L.object.type === 'Identifier' && L.object.name === 'module' && L.property.name === 'exports' &&
          node.right.type === 'ObjectExpression') {
        for (const pr of node.right.properties || []) {
          if (pr.type !== 'Property' || !pr.key) continue;
          const api = pr.key.type === 'Identifier' ? pr.key.name : String(pr.key.value);
          if (pr.value.type === 'Identifier') exportsMap.push({ api, target: pr.value.name });
          else if (FN_TYPES.has(pr.value.type)) exportsMap.push({ api, target: 'inline@' + pr.value.loc.start.line });
        }
      }
    }

    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue;
      const v = node[k];
      if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') visit(c, node, parent, cur); }
      else if (v && typeof v.type === 'string') visit(v, node, parent, cur);
    }
  }
  visit(ast, null, null, []);

  const fileBL = probeFileBlacklist(code);
  const exported = new Set(exportsMap.map((e) => e.target).filter((t) => !t.startsWith('inline@')));

  // 守卫登记。lookup/regex 若自身没写出键，用文件级黑名单补 keys
  const guards = [];
  for (const r of allFns) {
    const g = r.guard;
    if (!g) continue;
    if ((g.kind === 'lookup' || g.kind === 'regex') && !g.keys.length && !fileBL.exists) continue;
    const keys = g.keys.length ? g.keys.slice() : (fileBL.exists ? fileBL.keys.slice() : []);
    guards.push({
      name: r.name || `anon@${r.line}`, line: r.line, kind: g.kind, shape: g.shape,
      test: g.test, keys, calls: 0, refs: 0, callers: [],
      owner_sites: r.ownerSites, type: 'helper',
    });
  }
  const guardMap = new Map(guards.map((g) => [g.name, g]));

  // 调用边：直接调用 + 实参引用（后者专为 dot-object 的 .filter(guard) 加）
  const callEdges = new Map();
  const addEdge = (owner, name) => {
    if (!callEdges.has(owner)) callEdges.set(owner, new Set());
    callEdges.get(owner).add(name);
  };
  for (const c of calls) addEdge(c.owner, c.name);
  for (const r of refs) addEdge(r.owner, r.name);

  for (const c of calls) {
    const g = guardMap.get(c.name);
    if (!g) continue;
    g.calls++;
    if (!g.callers.includes(c.owner)) g.callers.push(c.owner);
  }
  for (const r of refs) {
    const g = guardMap.get(r.name);
    if (!g) continue;
    g.refs++;
    if (!g.callers.includes(r.owner)) g.callers.push(r.owner);
  }

  for (const g of guards) {
    const reachable = exported.has(g.name) || g.calls + g.refs > 0;
    g.type = g.owner_sites > 0
      ? (g.calls + g.refs > 0 ? 'helper+sink' : (reachable ? 'inline' : 'inline?unreachable'))
      : (g.calls + g.refs > 0 ? 'helper' : (reachable ? 'inline' : 'dead'));
  }

  /** 从某函数出发可达的守卫集合（深度 3：dot-object 是 str→parsePath→blacklistFilter）。 */
  function guardsReached(name, depth = 3, seen = new Set()) {
    const out = new Map();
    if (depth <= 0 || seen.has(name)) return out;
    seen.add(name);
    const cs = callEdges.get(name);
    if (!cs) return out;
    for (const c of cs) {
      if (guardMap.has(c)) out.set(c, guardMap.get(c));
      else if (depth > 1) for (const [k, v] of guardsReached(c, depth - 1, seen)) out.set(k, v);
    }
    return out;
  }

  for (const s of sites) {
    const r = s.ownerRec;
    const reached = r ? [...guardsReached(s.owner).values()] : [];
    const guarding = (r && r.guard ? [r.guard] : []).concat(reached.map((g) => ({ kind: g.kind, keys: g.keys })));
    const keySet = new Set();
    for (const g of guarding) for (const k of (g.keys || [])) keySet.add(k);
    s.path_like = r ? r.walk.isPath : false;
    s.merge_like = r ? (r.forin && s.write) : false;
    s.guarded = guarding.length > 0;
    s.keys_checked = [...keySet];
    s.key_full = KEY_FULL.every((k) => keySet.has(k));
    s.guard_kind = guarding.length ? guarding[0].kind : null;
  }

  const pathSites = sites.filter((s) => s.path_like);
  const mergeSites = sites.filter((s) => s.merge_like);
  const pUn = pathSites.filter((s) => !s.guarded);
  const mUn = mergeSites.filter((s) => !s.guarded);
  const pPart = pathSites.filter((s) => s.guarded && !s.key_full);
  const mPart = mergeSites.filter((s) => s.guarded && !s.key_full);

  const blGuards = guards.filter((g) => g.kind !== 'ownkey');
  const ownGuards = guards.filter((g) => g.kind === 'ownkey');
  const blCalls = blGuards.reduce((a, g) => a + g.calls + g.refs, 0);

  const totalSites = pathSites.length + mergeSites.length;
  const totalUn = pUn.length + mUn.length;
  const totalPart = pPart.length + mPart.length;

  let signal = 'OK';
  if (!totalSites) signal = 'NO_SINK';
  else if (!totalUn && !totalPart) signal = blGuards.length ? 'COVERED' : 'COVERED_BY_OWNKEY';
  else if (!blGuards.length && !ownGuards.length) signal = 'NO_GUARD';
  else if (totalUn) signal = 'UNGUARDED_SITES';
  else signal = 'PARTIAL_KEYS';

  return {
    file: path.resolve(file),
    lines: code.split('\n').length,
    fn_count: allFns.length,
    export_count: exportsMap.length,
    file_blacklist: fileBL,
    guards: guards.sort((a, b) => (b.calls + b.refs) - (a.calls + a.refs)),
    counts: {
      G_blacklist: blGuards.length,
      G_ownkey: ownGuards.length,
      bl_call_sites: blCalls,
      S_path: pathSites.length, C_path: pathSites.length - pUn.length, U_path: pUn.length,
      S_merge: mergeSites.length, C_merge: mergeSites.length - mUn.length, U_merge: mUn.length,
      partial_keys: totalPart,
    },
    unguarded: [...pUn.map((s) => ({ ...s, family: 'path' })),
                ...mUn.map((s) => ({ ...s, family: 'merge' }))],
    partial: [...pPart, ...mPart].slice(0, 10),
    signal,
  };
}

function render(rep) {
  const bar = '─'.repeat(84);
  console.log(`文件: ${path.basename(rep.file)}  (${rep.lines} 行, 函数 ${rep.fn_count}, 导出 ${rep.export_count})`);
  console.log('文件黑名单: ' + (rep.file_blacklist.exists
    ? `${rep.file_blacklist.form} ${JSON.stringify(rep.file_blacklist.keys)}` : '无'));
  console.log(bar);
  console.log(`守卫 G: blacklist=${rep.counts.G_blacklist} ownkey=${rep.counts.G_ownkey} | 黑名单型调用点=${rep.counts.bl_call_sites}`);
  for (const g of rep.guards.filter((x) => x.kind !== 'ownkey').slice(0, 10)) {
    const n = g.calls + g.refs;
    const tail = (g.type === 'helper' && n === 0) ? '   <-- 定义了但没人用'
      : g.type === 'dead' ? '   <-- 不可达' : '';
    console.log(`  ${g.name.padEnd(18)} L${String(g.line).padEnd(5)} ${g.kind.padEnd(13)} ${g.shape.padEnd(9)} ` +
      `${g.type.padEnd(12)} 调用=${String(n).padEnd(3)} keys=${JSON.stringify(g.keys)}${tail}`);
  }
  console.log(bar);
  console.log(`path  汇点 S=${rep.counts.S_path} 覆盖=${rep.counts.C_path} 未覆盖=${rep.counts.U_path}`);
  console.log(`merge 汇点 S=${rep.counts.S_merge} 覆盖=${rep.counts.C_merge} 未覆盖=${rep.counts.U_merge}`);
  console.log(`键覆盖不完整=${rep.counts.partial_keys} | 信号 ${rep.signal}`);
  if (rep.unguarded.length) {
    console.log(`\n未覆盖（${rep.unguarded.length}）:`);
    for (const s of rep.unguarded.slice(0, 18)) {
      console.log(`  [${s.family.padEnd(5)}] L${String(s.line).padEnd(6)} ${s.owner.padEnd(18)} ${s.expr.slice(0, 40)}`);
    }
  }
}

function main() {
  const argv = process.argv.slice(2);
  const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const batch = flag('--batch');
  const jsonOut = flag('--json');
  const files = batch
    ? fs.readdirSync(batch).filter((f) => /\.(c|m)?js$/.test(f)).map((f) => path.join(batch, f))
    : argv.filter((a) => !a.startsWith('--') && a !== jsonOut && a !== batch);

  if (!files.length) { console.error('用法: node guardcov.js <file.js> [--json out] | --batch <dir>'); process.exit(1); }

  const reports = [];
  for (const f of files) {
    try {
      const rep = analyze(f);
      reports.push(rep);
      if (batch) {
        const c = rep.counts;
        console.log(`${path.basename(f).padEnd(24)} Gb=${String(c.G_blacklist).padEnd(2)} Go=${String(c.G_ownkey).padEnd(2)} ` +
          `blC=${String(c.bl_call_sites).padEnd(3)} S=${String(c.S_path).padEnd(3)}/${String(c.S_merge).padEnd(3)} ` +
          `U=${String(c.U_path).padEnd(2)}/${String(c.U_merge).padEnd(2)} P=${String(c.partial_keys).padEnd(2)} ${rep.signal}`);
      } else render(rep);
    } catch (e) {
      console.log(`${path.basename(f).padEnd(24)} 解析失败: ${e.message.slice(0, 44)}`);
      reports.push({ file: path.resolve(f), error: e.message });
    }
  }
  if (jsonOut) {
    fs.writeFileSync(jsonOut, JSON.stringify(batch ? reports : reports[0], null, 2), 'utf8');
    console.log('\nJSON -> ' + jsonOut);
  }
}

if (require.main === module) main();
module.exports = { analyze, isDynamicKey, classifyTest, probeFileBlacklist, blockingTest, predicateTest };
