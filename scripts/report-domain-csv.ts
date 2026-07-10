import { assertExpectedReport, readAndParseSource, writeGenerated } from "./domain-csv-common";

const result = await readAndParseSource();
assertExpectedReport(result);
await writeGenerated(result);
console.log(
  JSON.stringify(
    {
      source: result.report.sourceFile,
      records: result.report.rawRecordCount,
      parsed: result.report.parsedCount,
      unique: result.report.uniqueCount,
      duplicates: result.report.duplicateCount,
      invalid: result.report.invalidCount,
      hidden: result.report.hiddenDistribution,
      listingStatus: result.report.listingStatusDistribution,
      tlds: result.report.tldDistribution,
    },
    null,
    2,
  ),
);
