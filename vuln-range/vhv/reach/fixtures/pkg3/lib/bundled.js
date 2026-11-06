'use strict';
// 这个 fixture 模拟 tsc / esbuild 的真实产物形态。
// 加它的原因：nocobase 全包 0 命中，查下来是 __toESM + .default 的包装让扫描器失明。
// 没有这条 fixture，修复就无法自证 —— 而"工具静默失效"在本项目已经发生过三次。

var import_lodash = __toESM(require("lodash"));
var import_lodash2 = _interopRequireDefault(require("lodash"));
var import_lodash3 = __importStar(require("lodash"));

// [W1] esbuild 形态，应命中
function w1(obj, p) { return import_lodash.default.get(obj, p); }

// [W2] babel / tsc 形态，应命中
function w2(obj, p) { return import_lodash2.default.omit(obj, p); }

// [W3] __importStar + set，应命中
function w3(obj, p, v) { return import_lodash3.default.set(obj, p, v); }

// [W4] 直接取方法，应命中
const g = require('lodash').get;
function w4(obj, p) { return g(obj, p); }

// [W5] 对照组：字面量 path，不应命中
function w5(obj) { return import_lodash.default.get(obj, 'a.b.c'); }

// [W6] 对照组：不是 lodash 的包装（自定义模块），不应命中
var other = __toESM(require("some-other-lib"));
function w6(obj, p) { return other.default.get(obj, p); }

module.exports = { w1, w2, w3, w4, w5, w6 };
