// pkg1/lib/should-hit.js —— 全部是「应当被标为 tainted」的写法
const _ = require('lodash');

function a(req, row) {
  return _.get(row, req.query.field);                 // [1] 成员表达式
}

function b(row, field) {
  return _.get(row, field);                           // [2] 标识符
}

function c(row, a1, b1) {
  return _.get(row, a1 + '.' + b1);                   // [3] 字符串拼接
}

function d(row, ns) {
  return _.get(row, `${ns}.x`);                       // [4] 带插值的模板
}

function e(row, parts) {
  return _.get(row, [parts.k, 'b']);                  // [5] 数组含非字面量
}

function f(row, p) {
  return _.invoke(row, p, 1);                         // [6] invoke
}

function g(row, p) {
  return _.at(row, p);                                // [7] at
}
