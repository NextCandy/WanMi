# 域名 CSV 导入

## 唯一数据源

原始附件名：`WanMi.csv`

仓库保留路径：`data/source/WanMi.csv`

生产初始域名不得来自原型数组、测试 Fixture、LocalStorage、README 或人工 Seed。

## 实际验收统计

- 原始记录：859
- 非空域名：859
- 成功解析：859
- 唯一域名：859
- 重复：0
- 无效：0
- CSV Premium：87
- 非空简介：0

主要后缀：`.com` 194、`.org` 154、`.cn` 84、`.net` 83、`.xyz` 60、`.cc` 44、`.pm` 33、`.de` 28、`.im` 23、`.com.cn` 16。

## 表头映射

本次表头为域名、注册日期、到期日期、注册商、后缀、简介、Premium。解析器按名称定位字段，不依赖固定列序。注册日期、到期日期和注册商名称会进入域名生命周期资料；注册商名称只是 `registrar_name` 文字，不关联账户、凭据或外部 API。当前简介均为空。

- 金额保存为安全十进制字符串，不推断币种。
- `Members-only feature` 与 `-` 转为 `NULL`，原始值仍在 JSON 中。
- Date Added 只作为市场添加时间，不作为到期日期。
- 首次新增可使用 CSV 的简介和 Premium；重复导入不会覆盖管理员简介、精品、人工分类和展示状态。
- 标准化通过 `tldts` 转小写、移除协议/路径/查询/末尾点，并正确处理数字域名、多级公共后缀与 IDN/Punycode。

## 命令

```bash
pnpm domains:parse
pnpm domains:validate
pnpm domains:report
pnpm domains:import:local -- --dry-run
pnpm domains:import:local
pnpm domains:verify
```

解析/报告命令会按需生成以下被 Git 忽略的文件：

- `data/generated/domains.normalized.json`
- `data/generated/domains.report.json`
- `data/generated/domains.import.sql`

## 幂等和管理员字段

导入以 `normalized_domain` 唯一索引 UPSERT。后台上传明确使用 `archiveMissing: false`，不会下架文件外域名；命令行权威同步目前会下架 CSV 中不存在的旧业务域名，所以生产库存在历史人工域名时不得把远程导入当作普通发布步骤。重复导入会保留管理员人工修改的分类、精品、简介、展示状态和内部备注。

初次 859 行通过 D1 暂存表和集合式 UPSERT 组成一个不超过 1,000 statement 的 batch。远程使用 D1 HTTP batch；本地使用同一 migration 下的 Wrangler Miniflare SQLite 状态文件和显式事务。

Cloudflare D1 Query API 的批量请求体为 `{ "batch": [{ "sql": "...", "params": [...] }] }`，不能直接发送顶层数组。全新本地库导入后为 859 条公开域名、市场记录 0；生产库的 3 条历史人工域名不属于本次远程导入范围。

## 后台更新 CSV

后台上传先执行 dry-run，显示成功、重复、错误数量。正式导入合法记录；异常行写入 `domain_import_errors`，并提供 UTF-8 BOM 错误 CSV 下载。单次上限 900 条、文件上限 5 MB。

## 错误恢复

如果预期 859 与实际不一致，验证命令会输出行号、域名和原因并退出非零。不得修改预期数量掩盖问题。修复源解析规则后重新执行 validate、dry-run、import、verify。
