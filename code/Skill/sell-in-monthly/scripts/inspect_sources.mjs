import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workspace = process.argv[2];
const sourceDir = path.join(workspace, "Data", "Data ERP");
const entries = (await fs.readdir(sourceDir))
  .filter((name) => /\.(xlsx|xlsm)$/i.test(name))
  .sort((a, b) => a.localeCompare(b, "vi"));

for (const name of entries) {
  const filePath = path.join(sourceDir, name);
  const input = await FileBlob.load(filePath);
  const workbook = await SpreadsheetFile.importXlsx(input);
  const summary = await workbook.inspect({
    kind: "workbook,sheet",
    include: "id,name",
    maxChars: 3000,
  });
  const firstSheet = workbook.worksheets.getItemAt(0);
  const region = await workbook.inspect({
    kind: "region",
    sheetId: firstSheet.name,
    range: "A1:AZ18",
    include: "values,formulas",
    maxChars: 9000,
    tableMaxRows: 18,
    tableMaxCols: 52,
    tableMaxCellChars: 120,
  });
  console.log(JSON.stringify({
    file: name,
    summary: summary.ndjson,
    firstSheet: firstSheet.name,
    region: region.ndjson,
  }));
}
