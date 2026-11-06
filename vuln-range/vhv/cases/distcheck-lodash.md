# 分发形态矩阵 — lodash 4.18.1

生成时间：2026-11-02T10:35:26.915Z
载荷 21 个 / 形态 24 个

图例：**HIT** = 打穿；`.` = 已挡住；`?` = 形态签名不兼容（**未判定**）；`-` = 该形态不提供此 API；`ERR` = 装置故障

## get

| 形态 | 版本 | get_read_function | get_read_strpath | get_exec_via_function | get_control_safe_path |
|---|---|---|---|---|---|
| `main` | 4.18.1 | **HIT** | **HIT** | **HIT** | . |
| `sibling:lodash.get` | 4.4.2 | **HIT** | **HIT** | **HIT** | . |
| `sibling:lodash-es` | 4.18.1 | **HIT** | **HIT** | **HIT** | . |
| `subpath:get` | 4.18.1 | **HIT** | **HIT** | **HIT** | . |
| `subpath:fp/get` | 4.18.1 | **HIT** | **HIT** | **HIT** | . |

**小计**：打穿 5 / 已挡住 0 / 未判定 0（共 5 个形态）

## invoke

| 形态 | 版本 | invoke_rce | invoke_rce_strpath | invoke_getter_write | invoke_control_safe_path |
|---|---|---|---|---|---|
| `main` | 4.18.1 | **HIT** | **HIT** | **HIT** | . |
| `sibling:lodash.invoke` | 4.5.2 | **HIT** | **HIT** | **HIT** | . |
| `sibling:lodash-es` | 4.18.1 | **HIT** | **HIT** | **HIT** | . |
| `subpath:invoke` | 4.18.1 | **HIT** | **HIT** | **HIT** | . |
| `subpath:fp/invokeArgs` | 4.18.1 | **HIT** | **HIT** | **HIT** | . |

**小计**：打穿 5 / 已挡住 0 / 未判定 0（共 5 个形态）

## method

| 形态 | 版本 | method_rce |
|---|---|---|
| `main` | 4.18.1 | **HIT** |
| `sibling:lodash-es` | 4.18.1 | **HIT** |

**小计**：打穿 2 / 已挡住 0 / 未判定 0（共 2 个形态）

## methodOf

| 形态 | 版本 | methodOf_rce |
|---|---|---|
| `main` | 4.18.1 | **HIT** |
| `sibling:lodash-es` | 4.18.1 | **HIT** |

**小计**：打穿 2 / 已挡住 0 / 未判定 0（共 2 个形态）

## at

| 形态 | 版本 | at_read_function | at_read_strpath |
|---|---|---|---|
| `main` | 4.18.1 | **HIT** | **HIT** |
| `sibling:lodash.at` | 4.6.0 | **HIT** | **HIT** |
| `sibling:lodash-es` | 4.18.1 | **HIT** | **HIT** |
| `subpath:at` | 4.18.1 | **HIT** | **HIT** |
| `subpath:fp/at` | 4.18.1 | **HIT** | **HIT** |

**小计**：打穿 5 / 已挡住 0 / 未判定 0（共 5 个形态）

## set

| 形态 | 版本 | set_proto_pollution | set_ctor_proto_pollution | set_control_safe_path |
|---|---|---|---|---|
| `main` | 4.18.1 | . | . | . |
| `sibling:lodash.set` | 4.3.2 | **HIT** | **HIT** | . |
| `sibling:lodash-es` | 4.18.1 | . | . | . |
| `subpath:set` | 4.18.1 | . | . | . |
| `subpath:fp/set` | 4.18.1 | . | . | . |

**小计**：打穿 1 / 已挡住 4 / 未判定 0（共 5 个形态）

> **判定分裂**：同一个 `set`，有的形态打穿、有的形态拦住。
> 打穿：`lodash.set@4.3.2`
> 拦住：`lodash@4.18.1`、`lodash-es@4.18.1`、`lodash/set@4.18.1`、`lodash/fp/set@4.18.1`

## unset

| 形态 | 版本 | unset_delete_proto_prop | unset_control_safe_path |
|---|---|---|---|
| `main` | 4.18.1 | . | . |
| `sibling:lodash.unset` | 4.18.0 | . | . |
| `sibling:lodash-es` | 4.18.1 | . | . |
| `subpath:unset` | 4.18.1 | . | . |
| `subpath:fp/unset` | 4.18.1 | . | . |

**小计**：打穿 0 / 已挡住 5 / 未判定 0（共 5 个形态）

## result

| 形态 | 版本 | result_read_function |
|---|---|---|
| `main` | 4.18.1 | . |
| `sibling:lodash.result` | 4.5.2 | . |
| `sibling:lodash-es` | 4.18.1 | . |
| `subpath:result` | 4.18.1 | . |
| `subpath:fp/result` | 4.18.1 | ? |

**小计**：打穿 0 / 已挡住 4 / 未判定 1（共 5 个形态）

> 未判定：`lodash/fp/result`（签名不兼容，**不能当作安全**）

## has

| 形态 | 版本 | has_probe_proto |
|---|---|---|
| `main` | 4.18.1 | . |
| `sibling:lodash.has` | 4.5.2 | . |
| `sibling:lodash-es` | 4.18.1 | . |
| `subpath:has` | 4.18.1 | . |
| `subpath:fp/has` | 4.18.1 | ? |

**小计**：打穿 0 / 已挡住 4 / 未判定 1（共 5 个形态）

> 未判定：`lodash/fp/has`（签名不兼容，**不能当作安全**）

## invokeArgs

| 形态 | 版本 | invokeArgs_rce | invokeArgs_rce_strpath |
|---|---|---|---|
| `subpath:fp/invokeArgs` | 4.18.1 | **HIT** | **HIT** |

**小计**：打穿 1 / 已挡住 0 / 未判定 0（共 1 个形态）
