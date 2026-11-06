'use strict';
// 第二个打包器 fixture：tsc 的 __importDefault 会把方法塞进 .default 里，
// n8n 全包就是这么写的 —— `get_1.default(obj, p)`。
// 之前的扫描器把弹出来的方法名当成 'default'，于是整个 n8n 报 0 命中。
// 这条 fixture 用来锁住这个回归。

var get_1 = __importDefault(require("lodash/get"));
var pick_1 = __importDefault(require("lodash/pick"));
var set_1 = __importDefault(require("lodash/set"));
var chunk_1 = __importDefault(require("lodash/chunk"));

// [D1] 应命中
function d1(obj, p) { return get_1.default(obj, p); }

// [D2] 应命中
function d2(obj, p) { return pick_1.default(obj, p); }

// [D3] 应命中（写侧）
function d3(obj, p, v) { return set_1.default(obj, p, v); }

// [D4] 对照：chunk 的第二参数是 size 不是 path，必须排除
function d4(arr, n) { return chunk_1.default(arr, n); }

// [D5] 对照：字面量 path
function d5(obj) { return get_1.default(obj, 'x.y'); }

module.exports = { d1, d2, d3, d4, d5 };
