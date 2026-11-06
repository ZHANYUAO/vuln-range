// pkg1/lib/should-not-hit.js —— 全部是「不应被标 tainted」的写法
const _ = require('lodash');

function a(row) {
  return _.get(row, 'a.b.c');                          // [N1] 纯字面量
}

function b(row) {
  return _.get(row, ['a', 'b']);                       // [N2] 字面量数组
}

function c(row) {
  return _.get(row, `a.b`);                            // [N3] 无插值模板
}

function d(row) {
  return _.get(row);                                   // [N4] 缺少 path 参数
}

// 本地同名函数，不是 lodash —— 不应命中
function get(o, k) { return o[k]; }
function e(row, p) {
  return get(row, p);                                  // [N5] 本地 get
}

// 其他库的 get
const moment = { get: (x, y) => y };
function f(row, p) {
  return moment.get(row, p);                           // [N6] 非 lodash 对象
}

// 解构但别名带下划线，容易误认
const { get: _g } = require('lodash');
function g(row) {
  return _g(row, 'x.y');                               // [N7] 别名 + 字面量
}
