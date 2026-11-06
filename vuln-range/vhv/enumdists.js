#!/usr/bin/env node
/**
 * enumdists.js —— 自动枚举一个 npm 包的全部「分发形态」（distribution forms）
 *
 * 为什么需要这个工具：
 *   上一轮发现「lodash 4.18.0 的修复只发布到了 lodash.unset 一个独立包」是手工挖出来的。
 *   手工发现不可复现、不能换目标、也不能定期重跑。这里把它变成枚举器。
 *
 * 核心概念区分（这个区分做错会直接导致误判，见下）：
 *   - 子路径（subpath）  require('lodash/get')
 *       → 是主包内部的转发文件，共享 _baseGet.js。主包修了，它就修了。
 *       → 版本永远跟随主包，**不会**产生版本断层。
 *   - 兄弟包（sibling）  require('lodash.get')
 *       → 是独立发布的 npm 包，有自己的版本号和发布时间。
 *       → **这才是断层发生的地方**：advisory 点名 lodash 主包时，
 *          lodash.get 可能停在 8 年前。
 *
 * 用法：
 *   node enumdists.js lodash --apis get,invoke,set --root .pkgs --json out.json
 *   node enumdists.js lodash --apis get --root .pkgs --install   # 自动装缺失的兄弟包
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}
const has = (n) => process.argv.includes('--' + n);

const PKG = process.argv[2];
if (!PKG) {
  console.error('用法: node enumdists.js <package> [--apis a,b,c] [--root <dir>] [--json out.json] [--install]');
  process.exit(2);
}
const ROOT = path.resolve(String(arg('root', '.pkgs')));
const NM = path.join(ROOT, 'node_modules');
const JSON_OUT = arg('json', null);
const DO_INSTALL = has('install');

if (!fs.existsSync(NM)) {
  console.error('找不到 node_modules: ' + NM);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// 解析：只看路径，不加载模块。
// 不加载是刻意的 —— 某些包在 require 时就有副作用（甚至报错），
// 而枚举阶段不该被任何包的运行时行为影响。
// ---------------------------------------------------------------------------
function resolveSpec(spec) {
  try {
    return require.resolve(spec, { paths: [ROOT] });
  } catch (e) {
    return null;
  }
}

/** 从文件路径往上找最近的 package.json，读出 name/version。 */
function ownerOf(resolvedPath) {
  let d = path.dirname(resolvedPath);
  for (let i = 0; i < 8; i++) {
    const pj = path.join(d, 'package.json');
    if (fs.existsSync(pj)) {
      try {
        const j = JSON.parse(fs.readFileSync(pj, 'utf8'));
        return { name: j.name, version: j.version, dir: d, pkg: j };
      } catch (e) { /* 损坏的 package.json 跳过 */ }
    }
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return { name: null, version: null, dir: null, pkg: null };
}

/** 模块是 ESM 还是 CJS：看最近的 package.json type，或扩展名。 */
function moduleKind(resolvedPath) {
  if (/\.mjs$/.test(resolvedPath)) return 'esm';
  if (/\.cjs$/.test(resolvedPath)) return 'cjs';
  const o = ownerOf(resolvedPath);
  if (o.pkg && o.pkg.type === 'module') return 'esm';
  return 'cjs';
}

const dists = [];
const seen = new Set();

function add(rec) {
  const key = rec.kind + '|' + rec.spec;
  if (seen.has(key)) return;
  seen.add(key);
  dists.push(rec);
}

/**
 * 加一个候选；解析不到就记 missing（不静默丢弃 —— 缺失的兄弟包本身就是证据：
 * 「这个形态根本没装」和「这个形态装了但没洞」是两件事）。
 */
function consider(id, spec, origin, note) {
  const resolved = resolveSpec(spec);
  if (!resolved) {
    add({ id, spec, origin, status: 'missing', note: note || null });
    return;
  }
  const o = ownerOf(resolved);
  add({
    id,
    spec,
    origin,
    status: 'present',
    kind: moduleKind(resolved),
    resolved,
    owner: o.name,
    version: o.version,
    // 版本 != 主包版本 → 这一行就是断层证据
    note: note || null,
  });
}

// ---------------------------------------------------------------------------
// 1. 主包本体
// ---------------------------------------------------------------------------
const mainResolved = resolveSpec(PKG);
if (!mainResolved) {
  console.error('主包解析失败: ' + PKG);
  process.exit(1);
}
const mainOwner = ownerOf(mainResolved);
consider('main', PKG, 'main-entry');

// 主包的其它入口字段（module / browser / unpkg）—— 打包器可能选这些
const mainPkg = mainOwner.pkg || {};
for (const f of ['module', 'browser', 'unpkg', 'jsdelivr']) {
  const v = mainPkg[f];
  if (typeof v === 'string') {
    const abs = path.join(mainOwner.dir, v);
    if (fs.existsSync(abs)) {
      add({
        id: 'entry:' + f,
        spec: PKG,
        origin: 'entry-field:' + f,
        status: 'present',
        kind: moduleKind(abs),
        resolved: abs,
        owner: mainOwner.name,
        version: mainOwner.version,
        note: 'package.json 的 ' + f + ' 字段',
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 2. 兄弟包：<pkg>.<api> / <pkg>-es / <pkg>-fp
//    这是断层真正发生的地方，所以优先枚举。
// ---------------------------------------------------------------------------
const APIS = String(arg('apis', 'get,set,has,invoke,result,at,unset,merge'))
  .split(',').map((s) => s.trim()).filter(Boolean);

for (const api of APIS) {
  consider('sibling:' + PKG + '.' + api, PKG + '.' + api, 'sibling-pkg');
}
consider('sibling:' + PKG + '-es', PKG + '-es', 'sibling-pkg');
consider('sibling:' + PKG + '-fp', PKG + '-fp', 'sibling-pkg');

// ---------------------------------------------------------------------------
// 3. 子路径：<pkg>/<api> 与 <pkg>/fp/<api>
//    注意：这类文件通常只是 require('./_baseX') 的转发，随主包一起修。
//    仍然枚举，因为要靠它证明「子路径不是断层源」—— 否则有人会以为
//    「只引入 lodash/get 就绕过了修复」。
// ---------------------------------------------------------------------------
for (const api of APIS) {
  consider('subpath:' + api, PKG + '/' + api, 'subpath');
  consider('subpath:fp/' + api, PKG + '/fp/' + api, 'subpath-fp');
}

// ---------------------------------------------------------------------------
// 4. 自动安装缺失的兄弟包（可选）
// ---------------------------------------------------------------------------
if (DO_INSTALL) {
  const missing = dists.filter((d) => d.status === 'missing' && d.origin === 'sibling-pkg');
  if (missing.length) {
    const names = missing.map((d) => d.spec);
    console.error('安装缺失兄弟包: ' + names.join(' '));
    try {
      execFileSync(
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['install', ...names, '--no-audit', '--no-fund', '--silent'],
        { cwd: ROOT, stdio: 'inherit', env: { ...process.env, npm_config_registry: 'https://registry.npmmirror.com' } }
      );
    } catch (e) {
      console.error('安装失败（继续，缺失项记为 missing）: ' + e.message);
    }
    // 重解析
    for (let i = 0; i < dists.length; i++) {
      const d = dists[i];
      if (d.status !== 'missing') continue;
      const r = resolveSpec(d.spec);
      if (!r) continue;
      const o = ownerOf(r);
      dists[i] = {
        id: d.id, spec: d.spec, origin: d.origin, status: 'present',
        kind: moduleKind(r), resolved: r, owner: o.name, version: o.version, note: null,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// 输出
// ---------------------------------------------------------------------------
const report = {
  package: PKG,
  main_version: mainOwner.version,
  root: ROOT,
  apis: APIS,
  generated_at: new Date().toISOString(),
  counts: {
    present: dists.filter((d) => d.status === 'present').length,
    missing: dists.filter((d) => d.status === 'missing').length,
  },
  // 版本差异线索（**只是线索，不是结论**）：
  //   同源 = owner 名以主包名开头（lodash.get / lodash-es / lodash-setvalue 这类）。
  //   注意兄弟包有**自己的版本序列**：lodash.get@4.4.2 是它 2016 年的末版，
  //   与主包 4.18.1 本来就不同序列。所以「版本号不同」不能直接当断层，
  //   只能当「这个形态值得实测」的提示。真正的判定必须靠 distcheck 跑载荷。
  version_delta: dists.filter(
    (d) => d.status === 'present' && d.owner && d.owner !== PKG &&
           d.owner.startsWith(PKG) && d.version !== mainOwner.version
  ).map((d) => ({ id: d.id, spec: d.spec, version: d.version, main: mainOwner.version })),
  dists,
};

if (JSON_OUT) {
  fs.mkdirSync(path.dirname(path.resolve(String(JSON_OUT))), { recursive: true });
  fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2), 'utf8');
}

// 控制台表
const w = (s, n) => String(s == null ? '-' : s).padEnd(n).slice(0, n);
console.log('包: %s  主版本: %s', PKG, mainOwner.version);
console.log('形态: %d 个（present %d / missing %d）',
  dists.length, report.counts.present, report.counts.missing);
console.log();
console.log(w('ID', 26) + w('SPEC', 26) + w('KIND', 6) + w('VERSION', 10) + 'ORIGIN');
console.log('-'.repeat(96));
for (const d of dists) {
  const ver = d.status === 'present' ? d.version : '—';
  const flag = d.status === 'missing' ? '  <-- 未安装'
    : (d.owner && d.owner.startsWith(PKG) && d.version !== mainOwner.version)
      ? '  <-- 版本差异（需实测）'
      : d.owner && d.owner !== PKG ? '  <-- 独立包' : '';
  console.log(w(d.id, 26) + w(d.spec, 26) + w(d.status === 'present' ? d.kind : '-', 6) +
    w(ver, 10) + d.origin + flag);
}
console.log('-'.repeat(96));
if (report.version_delta.length) {
  console.log('版本差异线索 %d 处（只是提示，需 distcheck 实测确认）：', report.version_delta.length);
  for (const x of report.version_delta) {
    console.log('  %s (%s) = %s，主包为 %s', x.id, x.spec, x.version, x.main);
  }
} else {
  console.log('无异源版本差异');
}
if (JSON_OUT) console.log('\n已写入: %s', JSON_OUT);
