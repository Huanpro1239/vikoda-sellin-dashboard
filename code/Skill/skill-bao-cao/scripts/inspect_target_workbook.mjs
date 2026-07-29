import fs from "node:fs/promises";
import path from "node:path";
import {
  FileBlob,
  SpreadsheetFile,
  Workbook,
} from "@oai/artifact-tool";

const outputPath = path.resolve(process.argv[2]);
const previewDir = path.resolve(process.argv[3]);
const sellInDataFile = path.resolve(process.argv[4]);
const targetDataFile = path.resolve(process.argv[5]);
const dmkhDataFile = path.resolve(process.argv[6]);
await fs.mkdir(previewDir, { recursive: true });

const [sellInPayload, targetPayload, dmkhPayload] = await Promise.all([
  fs.readFile(sellInDataFile, "utf8").then(JSON.parse),
  fs.readFile(targetDataFile, "utf8").then(JSON.parse),
  fs.readFile(dmkhDataFile, "utf8").then(JSON.parse),
]);
if (
  !Array.isArray(sellInPayload.rows) ||
  !Array.isArray(targetPayload.records) ||
  !Array.isArray(dmkhPayload.rows)
) {
  throw new Error("Du lieu staging khong hop le de kiem tra workbook.");
}

function parseLocalDate(value) {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function parseLocalDateTime(value) {
  const match = String(value ?? "").match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/,
  );
  if (!match) return null;
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  );
}

function excelColumnName(index) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function styleHeader(sheet, range) {
  sheet.getRange(range).format = {
    fill: "#1F4E78",
    font: { name: "Aptos", bold: true, color: "#FFFFFF", size: 11 },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
    borders: { bottom: { style: "medium", color: "#17365D" } },
  };
  sheet.getRange(range).format.rowHeight = 30;
}

function applyWidths(sheet, widths, lastRow) {
  for (let index = 0; index < widths.length; index += 1) {
    const column = excelColumnName(index);
    sheet.getRange(`${column}1:${column}${lastRow}`).format.columnWidth =
      widths[index];
  }
}

const sourcePreview = Workbook.create();

const targetSheet = sourcePreview.worksheets.add("Target");
targetSheet.showGridLines = false;
targetSheet.freezePanes.freezeRows(1);
targetSheet.getRange("A1:I1").values = [targetPayload.columns];
const targetRows = targetPayload.records.slice(0, 29).map((record) => [
  String(record.Ky),
  Number(record.Nam),
  Number(record.Thang),
  String(record.MaKhachHangMoi),
  String(record.TenKhachHang),
  Number(record.TargetVikoda),
  Number(record.TargetTong),
  parseLocalDateTime(record.NgayCapNhatNguon),
  String(record.NguonFile),
]);
targetSheet.getRangeByIndexes(1, 0, targetRows.length, 9).values = targetRows;
const targetLastRow = targetRows.length + 1;
const targetTable = targetSheet.tables.add(
  `A1:I${targetLastRow}`,
  true,
  "tblTargetPreview",
);
targetTable.style = "TableStyleMedium2";
styleHeader(targetSheet, "A1:I1");
targetSheet.getRange(`A2:A${targetLastRow}`).format.numberFormat = "@";
targetSheet.getRange(`B2:C${targetLastRow}`).format.numberFormat = "0";
targetSheet.getRange(`D2:D${targetLastRow}`).format.numberFormat = "@";
targetSheet.getRange(`F2:G${targetLastRow}`).format.numberFormat = "#,##0";
targetSheet.getRange(`H2:H${targetLastRow}`).format.numberFormat =
  "dd/mm/yyyy hh:mm";
applyWidths(targetSheet, [11, 9, 9, 19, 36, 19, 19, 21, 46], targetLastRow);

const dataSheet = sourcePreview.worksheets.add("Data");
dataSheet.showGridLines = false;
dataSheet.freezePanes.freezeRows(1);
dataSheet.getRange("A1:N1").values = [sellInPayload.columns];
const dataRows = sellInPayload.rows.slice(0, 24).map((row) => [
  String(row[0] ?? ""),
  String(row[1] ?? ""),
  parseLocalDate(row[2]),
  String(row[3] ?? ""),
  String(row[4] ?? ""),
  String(row[5] ?? ""),
  String(row[6] ?? ""),
  Number(row[7]),
  Number(row[8]),
  Number(row[9]),
  String(row[10] ?? ""),
  String(row[11] ?? ""),
  Number(row[12]),
  Number(row[13]),
]);
dataSheet.getRangeByIndexes(1, 0, dataRows.length, 14).values = dataRows;
const dataLastRow = dataRows.length + 1;
const dataTable = dataSheet.tables.add(
  `A1:N${dataLastRow}`,
  true,
  "tblDataSellInPreview",
);
dataTable.style = "TableStyleMedium2";
styleHeader(dataSheet, "A1:N1");
dataSheet.getRange(`C2:C${dataLastRow}`).format.numberFormat = "dd/mm/yyyy";
dataSheet.getRange(`D2:D${dataLastRow}`).format.numberFormat = "@";
dataSheet.getRange(`F2:F${dataLastRow}`).format.numberFormat = "@";
dataSheet.getRange(`H2:J${dataLastRow}`).format.numberFormat = "#,##0";
dataSheet.getRange(`M2:N${dataLastRow}`).format.numberFormat = "0";
applyWidths(
  dataSheet,
  [12, 14, 13, 18, 34, 18, 56, 13, 15, 17, 18, 46, 9, 9],
  dataLastRow,
);

const dmkhSheet = sourcePreview.worksheets.add("DMKH");
dmkhSheet.showGridLines = false;
dmkhSheet.freezePanes.freezeRows(1);
dmkhSheet.getRange("A1:N1").values = [dmkhPayload.columns];
const dmkhRows = dmkhPayload.rows
  .slice(0, 24)
  .map((row) => row.map((value) => String(value ?? "")));
dmkhSheet.getRangeByIndexes(1, 0, dmkhRows.length, 14).values = dmkhRows;
const dmkhLastRow = dmkhRows.length + 1;
const dmkhTable = dmkhSheet.tables.add(
  `A1:N${dmkhLastRow}`,
  true,
  "tblDMKHPreview",
);
dmkhTable.style = "TableStyleMedium2";
styleHeader(dmkhSheet, "A1:N1");
dmkhSheet.getRange(`A2:N${dmkhLastRow}`).format.numberFormat = "@";
applyWidths(
  dmkhSheet,
  [18, 28, 44, 58, 14, 20, 18, 18, 20, 24, 22, 18, 26, 24],
  dmkhLastRow,
);

// PIVOT, PVT_DATA va cac sheet BC_ nam ngay trong workbook bao cao.
const outputBlob = await FileBlob.load(outputPath);
const pivotPreview = await SpreadsheetFile.importXlsx(outputBlob);
const bcSheetNames = pivotPreview.worksheets.items
  .map((sheet) => sheet.name)
  .filter((name) => name.startsWith("BC_"));
const inspections = {};
for (const [workbook, sheetName, range, columns] of [
  [sourcePreview, "Target", "A1:I12", 9],
  [sourcePreview, "Data", "A1:N12", 14],
  [sourcePreview, "DMKH", "A1:N12", 14],
  [pivotPreview, "PIVOT", "A1:S34", 19],
  [pivotPreview, "PVT_DATA", "A1:N12", 14],
  ...bcSheetNames.map((name) => [pivotPreview, name, "A1:J24", 10]),
]) {
  const result = await workbook.inspect({
    kind: "table",
    range: `${sheetName}!${range}`,
    include: "values,formulas",
    tableMaxRows: 40,
    tableMaxCols: columns,
    maxChars: sheetName === "PIVOT" ? 30000 : 14000,
  });
  inspections[sheetName] = result.ndjson;
}

const sourceErrors = await sourcePreview.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "source sheet preview formula error scan",
  maxChars: 4000,
});
const pivotErrors = await pivotPreview.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 200 },
  summary: "pivot preview formula error scan",
  maxChars: 6000,
});

const previewPaths = [];
for (const [workbook, sheetName, range, scale] of [
  [sourcePreview, "Target", `A1:I${targetLastRow}`, 1],
  [sourcePreview, "Data", `A1:N${dataLastRow}`, 1],
  [sourcePreview, "DMKH", `A1:N${dmkhLastRow}`, 1],
  [pivotPreview, "PIVOT", "A1:S34", 1.2],
  [pivotPreview, "PVT_DATA", "A1:N25", 1],
  ...bcSheetNames.map((name) => [pivotPreview, name, "A1:J24", 1]),
]) {
  const preview = await workbook.render({
    sheetName,
    range,
    scale,
    format: "png",
  });
  const previewPath = path.join(previewDir, `${sheetName}.png`);
  await fs.writeFile(
    previewPath,
    new Uint8Array(await preview.arrayBuffer()),
  );
  previewPaths.push(previewPath);
}

const reportPath = path.join(previewDir, "report_final_inspection.json");
await fs.writeFile(
  reportPath,
  JSON.stringify(
    {
      output_path: outputPath,
      bc_sheets: bcSheetNames,
      expected_rows: {
        Target: targetPayload.records.length,
        Data: sellInPayload.rows.length,
        DMKH: dmkhPayload.rows.length,
      },
      inspections,
      error_scan: {
        source_sheets: sourceErrors.ndjson,
        pivot_sheets: pivotErrors.ndjson,
      },
      preview_paths: previewPaths,
    },
    null,
    2,
  ),
  "utf8",
);
console.log(JSON.stringify({ outputPath, reportPath, previewPaths }));
