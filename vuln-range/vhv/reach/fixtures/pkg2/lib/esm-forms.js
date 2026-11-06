// pkg2/lib/esm-forms.js —— ESM 与 ESM 兄弟包形态
import _ from 'lodash';
import { get as lodashGet, invoke } from 'lodash-es';
import getSibling from 'lodash.get';
import { at } from 'lodash/at';

export function h1(row, p) { return _.get(row, p); }              // [E1] tainted
export function h2(row, p) { return _.get(row, 'a.b'); }          // [E2] safe
export function h3(row, p) { return lodashGet(row, p); }          // [E3] tainted
export function h4(row, p) { return invoke(row, p, 1); }          // [E4] tainted
export function h5(row, p) { return getSibling(row, p); }         // [E5] tainted（兄弟包）
export function h6(row, p) { return at(row, p); }                 // [E6] tainted（子路径）
