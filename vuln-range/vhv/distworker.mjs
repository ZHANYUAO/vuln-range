#!/usr/bin/env node
/**
 * distworker.mjs —— 单个「分发形态 × 载荷集」的隔离执行器
 *
 * 为什么单独一个进程：原型污染是全局副作用，同一进程里跑完一个格再跑下一个，
 * 前一个格的污染会污染后一个格。唯一 marker 只能避免误判，不能避免状态串扰。
 * 一格一进程，启动成本 ~50ms，168 格约 8 秒，完全可接受。
 *
 * 输入（argv[2] = JSON）：
 *   { dist: {...}, payloads: [...], api: "invoke" }
 * 输出（stdout 一行 JSON）：
 *   { dist_id, loaded, cells: [{id, verdict, detail}] }
 *
 * verdict 四值（这是本工具最重要的设计，不能合并）：
 *   HIT   —— 载荷真的打穿了（产出唯一 marker / 拿到 Function）
 *   MISS  —— probe 通过但攻击载荷没打穿 → 形态支持该签名，且确实被挡住
 *   SHAPE —— probe 就失败 → 形态的调用签名不兼容，**这个载荷在此形态上无法判定**
 *   ERR   —— 加载失败 / 装置异常 → 不可判定，不是安全
 *
 * 为什么必须有 SHAPE：lodash/fp 是柯里化的，`f(obj, path, args)` 直接调用会报
 * "not a function"。如果把它记成 MISS，就等于把「我没测到」写成了「它是安全的」。
 * 这正是过去几轮反复踩的坑（unset 假阴性 22/22、merge 家族 false 当 fixed）。
 */
import { createRequire } from 'module';
import { pathToFileURL } from 'url';

const cfg = JSON.parse(process.argv[2]);
const { dist, payloads } = cfg;
const out = { dist_id: dist.id, spec: dist.spec, version: dist.version, loaded: false, load_error: null, cells: [] };

const emit = () => {
  process.stdout.write(JSON.stringify(out) + '\n');
};

// ---------------------------------------------------------------------------
// 加载
// ---------------------------------------------------------------------------
let mod = null;
try {
  if (dist.kind === 'esm') {
    mod = await import(pathToFileURL(dist.resolved).href);
  } else {
    const require = createRequire(import.meta.url);
    mod = require(dist.resolved);
  }
  out.loaded = true;
} catch (e) {
  out.load_error = e.constructor.name + ': ' + e.message.slice(0, 120);
  emit();
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 从模块里取出该 API 的调用器
// ---------------------------------------------------------------------------
function pickApi(m, d, name) {
  if (m == null) return null;
  // 1) 对象上直接有该 API（主包 / 命名空间 / ESM barrel）
  if (typeof m === 'object' || typeof m === 'function') {
    if (typeof m[name] === 'function') return m[name];
    // ESM 与 CJS 互操作：import() 一个 CJS 包时，导出挂在 default 上
    if (m.default && typeof m.default[name] === 'function') return m.default[name];
  }
  // 2) 模块本身就是该函数（单方法包 / 子路径文件）
  if (typeof m === 'function') {
    const lastSeg = d.spec.split('/').pop();
    const lastName = lastSeg.split('.').pop();
    if (lastName === name) return m;
    if (d.spec.endsWith('/' + name)) return m;
  }
  // 3) 有 default 函数（get-value 的 {default} / dset 的 {dset}）
  if (m && typeof m.default === 'function') {
    const lastSeg = d.spec.split('/').pop();
    const lastName = lastSeg.split('.').pop();
    if (lastName === name) return m.default;
  }
  return null;
}

// ---------------------------------------------------------------------------
// fp 形态识别
// ---------------------------------------------------------------------------
// lodash/fp 不是「同一个函数的另一个入口」，它是**参数重写过的另一套 API**：
//   1. data-last：`_.get(obj, path)` → `fp.get(path, obj)`
//   2. 变参打包：`_.invoke(obj, path, ...args)` → `fp.invokeArgs(path, [...args], obj)`
//      （`_.invoke(obj, path)` 无参版在 fp 里叫 `invoke`，走 aryMethod['2']）
// 如果不做这两件事就往 fp 上打载荷，得到的是 "not a function" 的 SHAPE，
// 而不是「fp 安全」——这正是上一轮把 fp 记成 ineffective 的原因。
const IS_FP = /\/fp\//.test(dist.spec) || /(^|\/)lodash-fp\b/.test(dist.spec) || /-fp$/.test(dist.spec);
const FP_ALIAS = { invoke: 'invokeArgs', invokeMap: 'invokeArgsMap' };

function apiFor(p) {
  if (IS_FP && FP_ALIAS[p.api] && dist.spec.indexOf('/fp/') >= 0) return FP_ALIAS[p.api];
  return p.api;
}

const bindingCache = new Map();
function bindingFor(name) {
  if (!bindingCache.has(name)) bindingCache.set(name, pickApi(mod, dist, name));
  return bindingCache.get(name);
}

// 先检查：这个形态是否至少提供一个载荷所需的 api。一个都不提供 → 整行 SKIP。
const usable = payloads.filter((p) => bindingFor(apiFor(p)));
if (!usable.length) {
  const need = [...new Set(payloads.map((p) => p.api))].join('/');
  out.cells = payloads.map((p) => ({
    id: p.id, api: p.api, verdict: 'SKIP', detail: '该形态不提供 ' + p.api + '（需要 ' + need + '）',
  }));
  emit();
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 执行
// ---------------------------------------------------------------------------
const DANGER_PATH = ['__proto__', 'constructor', 'constructor'];

function run(expr, marker, binding, api) {
  const body = 'return (' + expr + ');';
  // 变量：f=该 API 调用器 / _=整个模块 / M=唯一 marker / P=危险 path / api=当前 api 名
  const fn = new Function('f', '_', 'M', 'P', 'api', body);
  return fn(binding, mod, marker, DANGER_PATH, api);
}

function isFn(v) { return typeof v === 'function'; }

for (const p of payloads) {
  // fp 形态若有专用变体就用它；没有则退回原式（大概率 SHAPE，如实记录）
  const shape = (IS_FP && p.fp) ? p.fp : p;
  const apiName = apiFor(p);
  const f = bindingFor(apiName);
  if (!f) {
    out.cells.push({ id: p.id, api: p.api, verdict: 'SKIP', detail: '该形态不提供 ' + p.api });
    continue;
  }
  const marker = 'VHV_' + p.id.replace(/[^a-zA-Z0-9]/g, '') + '_' +
    Math.random().toString(36).slice(2, 8);

  // --- 前置：签名探针。探针不过 = 形态不支持，不是安全 ---
  if (shape.probe) {
    let probeOk = false, probeErr = null, probeVal;
    try {
      probeVal = run(shape.probe, marker, f, p.api);
      probeOk = (probeVal === true);
    } catch (e) {
      probeErr = e.constructor.name + ': ' + e.message.slice(0, 80);
    }
    if (!probeOk) {
      out.cells.push({
        id: p.id, api: p.api, verdict: 'SHAPE',
        detail: probeErr || ('probe 返回 ' + String(probeVal) + '，签名不兼容'),
      });
      continue;
    }
  }

  // --- 攻击载荷 ---
  let verdict = 'MISS', detail = '';
  try {
    const r = run(shape.expr, marker, f, p.api);
    const gotMarker = (typeof r === 'string' && r.indexOf(marker) >= 0);
    if (p.expect === 'no_hole') {
      // 对照组：expr 在「正常功能可用」时返回 M。
      //   gotMarker = 功能正常 → MISS（安全，符合预期）
      //   !gotMarker = 连正常功能都跑不通 → ERR（装置故障，**不是 HIT**）
      // 这里的方向极易写反：把「功能可用」判成 HIT，会让已修好的库看起来千疮百孔。
      verdict = gotMarker ? 'MISS' : 'ERR';
      detail = gotMarker ? '对照组通过（正常功能可用）' : '对照组失败：连正常路径都跑不通，装置可疑';
    } else if (p.expect === 'function') {
      verdict = isFn(r) ? 'HIT' : 'MISS';
      detail = isFn(r) ? '拿到函数对象' : '未拿到函数';
    } else {
      verdict = gotMarker ? 'HIT' : 'MISS';
      detail = gotMarker ? '产出 marker' : '未产出 marker';
    }
  } catch (e) {
    // probe 已通过 → 签名是对的 → 这里的错多半来自「取到 undefined 再调用」，即已被拦住。
    verdict = 'MISS';
    detail = '抛错(视为拦截): ' + e.constructor.name + ': ' + e.message.slice(0, 70);
  }

  out.cells.push({ id: p.id, api: p.api, verdict, detail });
}

emit();
