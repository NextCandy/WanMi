import { assertExpectedReport, readAndParseSource, writeGenerated } from "./domain-csv-common";

const result = await readAndParseSource();
assertExpectedReport(result);
await writeGenerated(result);
console.log(`CSV 解析完成：${result.report.parsedCount} 条，已生成标准化数据与报告。`);
