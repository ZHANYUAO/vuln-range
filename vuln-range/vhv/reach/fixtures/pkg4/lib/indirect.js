'use strict';
// tsc 把 `import { get } from 'lodash'` 编译成 `(0, lodash_1.get)(...)`。
// n8n 全包都是这个形态 —— 前面两次修复后仍然 0 命中，就是因为它。
const lodash_1 = __importDefault(require("lodash"));

// [I1] 应命中
function i1(obj, p) { return (0, lodash_1.default.get)(obj, p); }

// [I2] 对照：字面量
function i2(obj) { return (0, lodash_1.default.get)(obj, 'a.b'); }
