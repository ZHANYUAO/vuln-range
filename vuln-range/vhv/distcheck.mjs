#!/usr/bin/env node
/**
 * distcheck.mjs —— 分发形态 × 载荷 矩阵编排器
 *
 * 输入：enumdists.js 产出的形态清单 + payloads-dist.json 载荷集
 * 输出：每个 API 一张「形态 × 载荷」矩阵 + 断层摘要
 *
 * 用法：
 *   node distcheck.mjs --dists cases/dists-lodash.json --json cases/dc.json --md cases/dc.md
 *
 * 判定四值（同 distworker）：HIT / MISS / SHAPE / SKIP
 *   只有 MISS 才能写「该形态已修复」；SHAPE 和 SKIP 都必须写「未判定」。
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

const DISTS = arg('dists', 'cases/dists-lodash.json');
const PAYLOADS = arg('payloads', 'payloads-dist.json');
const JSON_OUT = arg('json', null);
const MD_OUT = arg('md', null);

const distsRep = JSON.parse(fs.readFileSync(DISTS, 'utf8'));
const payloadGroups = JSON.parse(fs.readFileSync(PAYLOADS, 'utf8'));

// 展平载荷：每项带上自己的 api（来自分组键）
const allPayloads = [];
for (const [api, arr] of Object.entries(payloadGroups)) {
  if (api.startsWith('_')) continue;
  for (const p of arr) allPayloads.push({ ...p, api });
}

const WORKER = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'distworker.mjs');

// ---------------------------------------------------------------------------
// 逐形态执行（一格一进程，隔离原型污染这种全局副作用）
// ---------------------------------------------------------------------------
const results = [];
const present = distsRep.dists.filter((d) => d.status === 'present');

process.stderr.write('执行 ' + present.length + ' 个形态 × ' + allPayloads.length + ' 个载荷…\n');

for (const d of present) {
  const cfg = JSON.stringify({
    dist: { id: d.id, spec: d.spec, resolved: d.resolved, kind: d.kind, version: d.version },
    payloads: allPayloads,
  });
  let parsed = null;
  try {
    const stdout = execFileSync(process.execPath, [WORKER, cfg], {
      encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024,
    });
    parsed = JSON.parse(stdout.trim().split('\n').pop());
  } catch (e) {
    parsed = {
      dist_id: d.id, spec: d.spec, version: d.version, loaded: false,
      load_error: 'worker 崩溃: ' + e.message.slice(0, 100),
      cells: allPayloads.map((p) => ({ id: p.id, api: p.api, verdict: 'ERR', detail: 'worker 崩溃' })),
    };
  }
  // 附上形态元信息
  parsed.owner = d.owner;
  parsed.origin = d.origin;
  results.push(parsed);
  process.stderr.write('  ' + d.id.padEnd(24) + (parsed.loaded ? 'loaded' : 'LOAD-FAIL') + '\n');
}

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------
function tally(cells) {
  const t = { HIT: 0, MISS: 0, SHAPE: 0, SKIP: 0, ERR: 0 };
  for (const c of cells) t[c.verdict] = (t[c.verdict] || 0) + 1;
  return t;
}

const report = {
  package: distsRep.package,
  main_version: distsRep.main_version,
  generated_at: new Date().toISOString(),
  payload_count: allPayloads.length,
  dists: results.map((r) => ({
    id: r.dist_id, spec: r.spec, version: r.version, owner: r.owner, origin: r.origin,
    loaded: r.loaded, load_error: r.load_error || null,
    tally: tally(r.cells),
    cells: r.cells,
  })),
};

// 每个 api 的矩阵
const apis = [...new Set(allPayloads.map((p) => p.api))];
const matrix = {};
for (const api of apis) {
  const pls = allPayloads.filter((p) => p.api === api);
  matrix[api] = results.map((r) => {
    const row = { dist: r.dist_id, spec: r.spec, version: r.version, cells: {} };
    for (const p of pls) {
      const c = r.cells.find((x) => x.id === p.id);
      row.cells[p.id] = c ? c.verdict : 'ERR';
    }
    return row;
  });
}
report.matrix = matrix;

if (JSON_OUT) {
  fs.mkdirSync(path.dirname(path.resolve(String(JSON_OUT))), { recursive: true });
  fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// Markdown 输出
// ---------------------------------------------------------------------------
const ICON = { HIT: '**HIT**', MISS: '.', SHAPE: '?', SKIP: '-', ERR: 'ERR' };
const md = [];
md.push('# 分发形态矩阵 — ' + report.package + ' ' + report.main_version);
md.push('');
md.push('生成时间：' + report.generated_at);
md.push('载荷 ' + report.payload_count + ' 个 / 形态 ' + results.length + ' 个');
md.push('');
md.push('图例：**HIT** = 打穿；`.` = 已挡住；`?` = 形态签名不兼容（**未判定**）；`-` = 该形态不提供此 API；`ERR` = 装置故障');
md.push('');

for (const api of apis) {
  const pls = allPayloads.filter((p) => p.api === api);
  const rows = matrix[api];
  // 只保留至少有一格的形态（全 `-` 的形态对这个 api 无意义）
  const active = rows.filter((r) => Object.values(r.cells).some((v) => v !== 'SKIP'));
  if (!active.length) continue;

  md.push('## ' + api);
  md.push('');
  md.push('| 形态 | 版本 | ' + pls.map((p) => p.id.replace('_' + api, '')).join(' | ') + ' |');
  md.push('|---|' + '---|'.repeat(pls.length + 1));
  for (const r of active) {
    md.push('| `' + r.dist + '` | ' + (r.version || '-') + ' | ' +
      pls.map((p) => ICON[r.cells[p.id]] || '.').join(' | ') + ' |');
  }
  md.push('');

  // 断层摘要：同一个 api，不同形态结论不同
  const hits = active.filter((r) => Object.values(r.cells).includes('HIT'));
  const clean = active.filter((r) =>
    Object.values(r.cells).every((v) => v === 'MISS' || v === 'SKIP'));
  // 未判定 = 既没打穿、也没有一个明确 MISS 的形态（全是 SHAPE/SKIP/ERR）。
  // 不能用 "some(SHAPE)" —— 打穿的形态里只要有一个 SHAPE 格就会同时计入两边，
  // 小计会出现「打穿 4 / 未判定 5 / 共 5」这种自相矛盾的数字。
  const unknown = active.filter((r) => {
    const vs = Object.values(r.cells);
    return !vs.includes('HIT') && !vs.includes('MISS');
  });
  md.push('**小计**：打穿 ' + hits.length + ' / 已挡住 ' + clean.length + ' / 未判定 ' + unknown.length + '（共 ' + active.length + ' 个形态）');
  if (hits.length && clean.length) {
    md.push('');
    md.push('> **判定分裂**：同一个 `' + api + '`，有的形态打穿、有的形态拦住。');
    md.push('> 打穿：' + hits.map((r) => '`' + r.spec + '@' + (r.version || '?') + '`').join('、'));
    md.push('> 拦住：' + clean.map((r) => '`' + r.spec + '@' + (r.version || '?') + '`').join('、'));
  }
  if (unknown.length) {
    md.push('');
    md.push('> 未判定：' + unknown.map((r) => '`' + r.spec + '`').join('、') +
      '（签名不兼容，**不能当作安全**）');
  }
  md.push('');
}

if (MD_OUT) {
  fs.mkdirSync(path.dirname(path.resolve(String(MD_OUT))), { recursive: true });
  fs.writeFileSync(MD_OUT, md.join('\n'), 'utf8');
}

// ---------------------------------------------------------------------------
// 控制台摘要
// ---------------------------------------------------------------------------
console.log('包: %s %s', report.package, report.main_version);
console.log('形态 %d / 载荷 %d', results.length, allPayloads.length);
console.log();
for (const api of apis) {
  const active = matrix[api].filter((r) => Object.values(r.cells).some((v) => v !== 'SKIP'));
  if (!active.length) continue;
  const hits = active.filter((r) => Object.values(r.cells).includes('HIT'));
  console.log('  %s: 打穿 %d / 共 %d 个形态', api.padEnd(10), hits.length, active.length);
  for (const r of hits) {
    console.log('      HIT  %s (%s)', r.dist.padEnd(24), r.version || '?');
  }
}
console.log();
if (MD_OUT) console.log('矩阵: %s', MD_OUT);
if (JSON_OUT) console.log('数据: %s', JSON_OUT);
