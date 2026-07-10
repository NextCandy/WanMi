import { assertExpectedReport, readAndParseSource } from "./domain-csv-common";

const result = await readAndParseSource();
assertExpectedReport(result);
console.log(
  `CSV 验证通过：原始 ${result.report.rawRecordCount}，合法 ${result.report.validCount}，唯一 ${result.report.uniqueCount}，重复 ${result.report.duplicateCount}，无效 ${result.report.invalidCount}。`,
);
