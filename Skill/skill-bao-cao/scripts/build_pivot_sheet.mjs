import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const [
  ,
  ,
  workbookArg,
  sellInDataArg,
  targetDataArg,
  dmkhDataArg,
  reportArg,
  previewArg,
] = process.argv;

if (
  !workbookArg ||
  !sellInDataArg ||
  !targetDataArg ||
  !dmkhDataArg ||
  !reportArg ||
  !previewArg
) {
  throw new Error(
    "Usage: build_pivot_sheet.mjs <workbook> <sell-in-json> " +
      "<target-json> <dmkh-json> <report-json> <preview-png>",
  );
}

const workbookPath = path.resolve(workbookArg);
const sellInDataFile = path.resolve(sellInDataArg);
const targetDataFile = path.resolve(targetDataArg);
const dmkhDataFile = path.resolve(dmkhDataArg);
const reportFile = path.resolve(reportArg);
const previewFile = path.resolve(previewArg);

await fs.mkdir(path.dirname(reportFile), { recursive: true });
await fs.mkdir(path.dirname(previewFile), { recursive: true });

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
  throw new Error("Du lieu staging khong hop le de tao PIVOT.");
}

const REPORTING_STRUCTURE = [
  ["Miền Bắc", ["Bắc Miền Trung", "Đông Bắc", "Hà Nội", "Tây Bắc"]],
  ["Miền Nam", ["Miền Đông", "Miền Tây", "TP. HCM 1", "TP. HCM 2"]],
  ["Miền Trung 1", ["Miền Trung 1A", "Miền Trung 1B", "Tây Nguyên"]],
  ["Miền Trung 2", ["Miền Trung 2A", "Miền Trung 2B"]],
  [
    "KA",
    ["KA Miền Bắc", "KA Miền Trung 1", "KA Miền Trung 2", "KA Miền Nam"],
  ],
  ["MT", ["MT"]],
  ["B2C", ["B2C"]],
  ["Other", ["Other"]],
];

const REGION_LOOKUP = new Map();
for (const [area, regions] of REPORTING_STRUCTURE) {
  for (const region of regions) {
    REGION_LOOKUP.set(normalizeKey(region), [area, region]);
  }
}
REGION_LOOKUP.set("XK", ["Other", "Other"]);

function normalizeKey(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[Đđ]/g, "D")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function normalizeReportingPair(areaValue, regionValue) {
  const areaKey = normalizeKey(areaValue);
  let regionKey = normalizeKey(regionValue);

  if (areaKey === "KA") {
    if (["MIEN TRUNG 1", "MIEN TRUNG 1A"].includes(regionKey)) {
      regionKey = "KA MIEN TRUNG 1";
    } else if (["MIEN TRUNG 2", "MIEN TRUNG 2A"].includes(regionKey)) {
      regionKey = "KA MIEN TRUNG 2";
    } else if (regionKey === "MIEN BAC") {
      regionKey = "KA MIEN BAC";
    } else if (regionKey === "MIEN NAM") {
      regionKey = "KA MIEN NAM";
    }
  }

  return (
    REGION_LOOKUP.get(regionKey) ??
    REGION_LOOKUP.get(areaKey) ?? ["Other", "Other"]
  );
}

function periodKey(year, month) {
  return `${Number(year)}${String(Number(month)).padStart(2, "0")}`;
}

function previousPeriod(year, month) {
  if (month > 1) return periodKey(year, month - 1);
  return periodKey(year - 1, 12);
}

function safeNumber(value) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) {
    throw new Error(`Gia tri so khong hop le trong staging: ${value}`);
  }
  return number;
}

function customerLabel(name, code) {
  const cleanName = String(name ?? "").trim();
  const cleanCode = String(code ?? "").trim();
  if (!cleanCode) return cleanName;
  return `${cleanName || "Không rõ tên"} (${cleanCode})`;
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

const currentYear = Number(sellInPayload.current_year);
const currentMonth = Number(sellInPayload.through_month);
if (
  !Number.isInteger(currentYear) ||
  !Number.isInteger(currentMonth) ||
  currentMonth < 1 ||
  currentMonth > 12
) {
  throw new Error("Khong xac dinh duoc ky hien tai tu staging Sell In.");
}
const currentPeriod = periodKey(currentYear, currentMonth);
const lastYearPeriod = periodKey(currentYear - 1, currentMonth);
const priorMonthPeriod = previousPeriod(currentYear, currentMonth);

const duplicateCustomerMappings = [];
const customerMap = new Map();
for (const row of dmkhPayload.rows) {
  const code = String(row[0] ?? "").trim();
  if (!code) continue;
  const pair = normalizeReportingPair(row[7], row[8]);
  const existing = customerMap.get(code);
  if (
    existing &&
    (existing[0] !== pair[0] || existing[1] !== pair[1])
  ) {
    duplicateCustomerMappings.push({
      code,
      first: existing,
      duplicate: pair,
    });
  } else if (!existing) {
    customerMap.set(code, pair);
  }
}
if (duplicateCustomerMappings.length) {
  throw new Error(
    `DMKH con ${duplicateCustomerMappings.length} ma trung co Mien/Vung mau thuan.`,
  );
}

const mappingStats = {
  data_from_dmkh: 0,
  data_fallback_other: 0,
  target_from_special_code: 0,
  target_from_staging: 0,
  target_from_dmkh: 0,
  target_fallback_other: 0,
};
const modelMap = new Map();

function getModelItem({
  area,
  region,
  code,
  customer,
  product,
  kind,
}) {
  const key = [kind, area, region, code, customer, product].join("\u001f");
  if (!modelMap.has(key)) {
    modelMap.set(key, {
      area,
      region,
      code,
      customer,
      product,
      actual: 0,
      lastYear: 0,
      priorMonth: 0,
      vikoda: 0,
      targetTotal: 0,
      targetVikoda: 0,
    });
  }
  return modelMap.get(key);
}

for (const row of sellInPayload.rows) {
  const rowPeriod = periodKey(row[13], row[12]);
  if (
    rowPeriod !== currentPeriod &&
    rowPeriod !== lastYearPeriod &&
    rowPeriod !== priorMonthPeriod
  ) {
    continue;
  }
  const code = String(row[3] ?? "").trim();
  const mappedPair = customerMap.get(code);
  const [area, region] = mappedPair ?? ["Other", "Other"];
  if (mappedPair) mappingStats.data_from_dmkh += 1;
  else mappingStats.data_fallback_other += 1;

  const product = String(row[6] ?? "").trim() || "-";
  const amount = safeNumber(row[9]);
  const item = getModelItem({
    area,
    region,
    code,
    customer: customerLabel(row[4], code),
    product,
    kind: "actual",
  });
  if (rowPeriod === currentPeriod) {
    item.actual += amount;
    if (normalizeKey(product).includes("VIKODA")) {
      item.vikoda += amount;
    }
  } else if (rowPeriod === lastYearPeriod) {
    item.lastYear += amount;
  } else if (rowPeriod === priorMonthPeriod) {
    item.priorMonth += amount;
  }
}

for (const record of targetPayload.records) {
  if (String(record.Ky) !== currentPeriod) continue;
  const code = String(record.MaKhachHangMoi ?? "").trim();
  const targetName = String(record.TenKhachHang ?? "").trim();
  let pair;
  if (normalizeKey(code) === "B2C" || normalizeKey(targetName) === "B2C") {
    pair = ["B2C", "B2C"];
    mappingStats.target_from_special_code += 1;
  } else if (normalizeKey(targetName) === "OTHER") {
    pair = ["Other", "Other"];
    mappingStats.target_from_special_code += 1;
  } else if (record.MienBaoCao || record.VungBaoCao) {
    pair = normalizeReportingPair(record.MienBaoCao, record.VungBaoCao);
    mappingStats.target_from_staging += 1;
  } else if (customerMap.has(code)) {
    pair = customerMap.get(code);
    mappingStats.target_from_dmkh += 1;
  } else {
    pair = ["Other", "Other"];
    mappingStats.target_fallback_other += 1;
  }
  const [area, region] = pair;
  const item = getModelItem({
    area,
    region,
    code,
    customer: customerLabel(targetName, code),
    product: "-",
    kind: "target",
  });
  item.targetTotal += safeNumber(record.TargetTong);
  item.targetVikoda += safeNumber(record.TargetVikoda);
}

const areaOrder = new Map();
const regionOrder = new Map();
REPORTING_STRUCTURE.forEach(([area, regions], areaIndex) => {
  areaOrder.set(area, areaIndex);
  regions.forEach((region, regionIndex) => {
    regionOrder.set(`${area}\u001f${region}`, regionIndex);
  });
});

const modelRows = [...modelMap.values()]
  .sort(
    (left, right) =>
      (areaOrder.get(left.area) ?? 999) -
        (areaOrder.get(right.area) ?? 999) ||
      (regionOrder.get(`${left.area}\u001f${left.region}`) ?? 999) -
        (regionOrder.get(`${right.area}\u001f${right.region}`) ?? 999) ||
      left.code.localeCompare(right.code, "vi") ||
      left.product.localeCompare(right.product, "vi") ||
      left.customer.localeCompare(right.customer, "vi"),
  )
  .map((item) => [
    item.area,
    item.region,
    item.code,
    item.customer,
    item.product,
    item.actual,
    item.lastYear,
    item.priorMonth,
    item.vikoda,
    item.targetTotal,
    item.targetVikoda,
    normalizeKey(item.product).includes("KDT") ? item.actual : 0,
    normalizeKey(item.product).includes("VIKODA") ? item.lastYear : 0,
    normalizeKey(item.product).includes("VIKODA") ? item.priorMonth : 0,
  ]);

const workbook = Workbook.create();
const pivotSheet = workbook.worksheets.add("PIVOT");
const pivotDataSheet = workbook.worksheets.add("PVT_DATA");
pivotSheet.showGridLines = false;
pivotDataSheet.showGridLines = false;

const pvtHeaders = [
  "MIEN",
  "VUNG",
  "MaKH",
  "KhachHang",
  "SanPham",
  "Actual",
  "CungKyLY",
  "ThangTruoc",
  "Vikoda",
  "TargetTong",
  "TargetVikoda",
  "KDT",
  "VikodaLY",
  "VikodaThangTruoc",
];
pivotDataSheet.getRange("A1:N1").values = [pvtHeaders];
if (modelRows.length) {
  pivotDataSheet
    .getRangeByIndexes(1, 0, modelRows.length, pvtHeaders.length)
    .values = modelRows;
}
const pvtLastRow = modelRows.length + 1;
pivotDataSheet.freezePanes.freezeRows(1);
pivotDataSheet.getRange("A1:N1").format = {
  fill: "#595959",
  font: { name: "Aptos", size: 10, bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  wrapText: true,
  borders: { bottom: { style: "medium", color: "#404040" } },
};
pivotDataSheet.getRange("A1:N1").format.rowHeight = 30;
if (pvtLastRow >= 2) {
  pivotDataSheet.getRange(`A2:E${pvtLastRow}`).format = {
    font: { name: "Aptos", size: 10 },
    horizontalAlignment: "left",
    verticalAlignment: "center",
  };
  pivotDataSheet.getRange(`F2:N${pvtLastRow}`).format = {
    font: { name: "Aptos", size: 10 },
    horizontalAlignment: "right",
    verticalAlignment: "center",
    numberFormat: "#,##0;(#,##0);\"-\"",
  };
}
const pvtWidths = [
  18, 22, 18, 40, 58, 16, 16, 16, 16, 18, 18, 16, 16, 18,
];
for (let index = 0; index < pvtWidths.length; index += 1) {
  const column = excelColumnName(index);
  pivotDataSheet.getRange(`${column}1:${column}${pvtLastRow}`).format.columnWidth =
    pvtWidths[index];
}

pivotSheet.freezePanes.freezeRows(4);
pivotSheet.freezePanes.freezeColumns(2);
pivotSheet.mergeCells("B1:T1");
pivotSheet.mergeCells("B2:T2");
pivotSheet.mergeCells("B3:C3");
pivotSheet.mergeCells("D3:E3");
pivotSheet.mergeCells("F3:L3");
pivotSheet.mergeCells("M3:P3");
pivotSheet.mergeCells("Q3:T3");

pivotSheet.getRange("B1:T1").values = [
  ["TỔNG HỢP KẾT QUẢ BÁN HÀNG THEO MIỀN"],
];
const asOfDate = String(sellInPayload.as_of_date ?? "");
pivotSheet.getRange("B2:T2").values = [
  [
    `Kỳ báo cáo: tháng ${String(currentMonth).padStart(2, "0")}/${currentYear}` +
      " | Đơn vị: triệu đồng | Đơn bán + trả hàng" +
      " | Vikoda/KDT phân loại theo tên sản phẩm" +
      (asOfDate ? ` | Cập nhật: ${asOfDate}` : ""),
  ],
];
pivotSheet.getRange("B3").values = [["MARKET STRUCTURE"]];
pivotSheet.getRange("D3").values = [["TARGET"]];
pivotSheet.getRange("F3").values = [["ACTUAL VS TARGET"]];
pivotSheet.getRange("M3").values = [["YEAR-ON-YEAR (YoY)"]];
pivotSheet.getRange("Q3").values = [["MONTH-ON-MONTH (MoM)"]];
pivotSheet.getRange("B4:T4").values = [
  [
    "Area",
    "Sales Region",
    "Total Target (VND mn)",
    "Vikoda Target (VND mn)",
    "Total Actual (VND mn)",
    "Total Attainment (%)",
    "Total Variance (VND mn)",
    "Vikoda Actual (VND mn)",
    "Vikoda Attainment (%)",
    "Vikoda Variance (VND mn)",
    "KDT Actual (VND mn)",
    "Total LY (VND mn)",
    "Total YoY Index (%)",
    "Vikoda LY (VND mn)",
    "Vikoda YoY Index (%)",
    "Total Previous Month (VND mn)",
    "Total MoM Index (%)",
    "Vikoda Previous Month (VND mn)",
    "Vikoda MoM Index (%)",
  ],
];

const helperLastRow = Math.max(2, pvtLastRow);
const detailRows = [];
const subtotalRows = [];
const labelRows = [];
let outputRow = 5;

function sumifsFormula(sumColumn, row) {
  const pairs = [
    `'PVT_DATA'!$A$2:$A$${helperLastRow},$B${row}`,
    `'PVT_DATA'!$B$2:$B$${helperLastRow},$C${row}`,
  ];
  return `=SUMIFS('PVT_DATA'!$${sumColumn}$2:$${sumColumn}$${helperLastRow},${pairs.join(",")})`;
}

function metricFormulas(row, amountFormulas) {
  return [
    amountFormulas.targetTotal,
    amountFormulas.targetVikoda,
    amountFormulas.actual,
    `=IFERROR(F${row}/D${row},0)`,
    `=F${row}-D${row}`,
    amountFormulas.vikodaActual,
    `=IFERROR(I${row}/E${row},0)`,
    `=I${row}-E${row}`,
    amountFormulas.kdtActual,
    amountFormulas.lastYear,
    `=IFERROR(F${row}/M${row},0)`,
    amountFormulas.vikodaLastYear,
    `=IFERROR(I${row}/O${row},0)`,
    amountFormulas.priorMonth,
    `=IFERROR(F${row}/Q${row},0)`,
    amountFormulas.vikodaPriorMonth,
    `=IFERROR(I${row}/S${row},0)`,
  ];
}

for (const [area, regions] of REPORTING_STRUCTURE) {
  const firstDetailRow = outputRow;
  for (const region of regions) {
    pivotSheet.getRange(`B${outputRow}:C${outputRow}`).values = [[area, region]];
    const formulas = metricFormulas(outputRow, {
      targetTotal: sumifsFormula("J", outputRow),
      targetVikoda: sumifsFormula("K", outputRow),
      actual: sumifsFormula("F", outputRow),
      vikodaActual: sumifsFormula("I", outputRow),
      kdtActual: sumifsFormula("L", outputRow),
      lastYear: sumifsFormula("G", outputRow),
      vikodaLastYear: sumifsFormula("M", outputRow),
      priorMonth: sumifsFormula("H", outputRow),
      vikodaPriorMonth: sumifsFormula("N", outputRow),
    });
    pivotSheet.getRange(`D${outputRow}:T${outputRow}`).formulas = [formulas];
    detailRows.push(outputRow);
    outputRow += 1;
  }

  const lastDetailRow = outputRow - 1;
  pivotSheet.getRange(`B${outputRow}:C${outputRow}`).values = [
    [`${area} Total`, null],
  ];
  const subtotalAmountFormula = (column) =>
    `=SUM(${column}${firstDetailRow}:${column}${lastDetailRow})`;
  const subtotalFormulas = metricFormulas(outputRow, {
    targetTotal: subtotalAmountFormula("D"),
    targetVikoda: subtotalAmountFormula("E"),
    actual: subtotalAmountFormula("F"),
    vikodaActual: subtotalAmountFormula("I"),
    kdtActual: subtotalAmountFormula("L"),
    lastYear: subtotalAmountFormula("M"),
    vikodaLastYear: subtotalAmountFormula("O"),
    priorMonth: subtotalAmountFormula("Q"),
    vikodaPriorMonth: subtotalAmountFormula("S"),
  });
  pivotSheet.getRange(`D${outputRow}:T${outputRow}`).formulas = [
    subtotalFormulas,
  ];
  subtotalRows.push(outputRow);
  labelRows.push(outputRow);
  outputRow += 1;
}

const grandTotalRow = outputRow;
pivotSheet.getRange(`B${grandTotalRow}:C${grandTotalRow}`).values = [
  ["Grand Total", null],
];
const totalRowsExpression = (column) =>
  `=SUM(${subtotalRows.map((row) => `${column}${row}`).join(",")})`;
const grandTotalFormulas = metricFormulas(grandTotalRow, {
  targetTotal: totalRowsExpression("D"),
  targetVikoda: totalRowsExpression("E"),
  actual: totalRowsExpression("F"),
  vikodaActual: totalRowsExpression("I"),
  kdtActual: totalRowsExpression("L"),
  lastYear: totalRowsExpression("M"),
  vikodaLastYear: totalRowsExpression("O"),
  priorMonth: totalRowsExpression("Q"),
  vikodaPriorMonth: totalRowsExpression("S"),
});
pivotSheet.getRange(`D${grandTotalRow}:T${grandTotalRow}`).formulas = [
  grandTotalFormulas,
];
labelRows.push(grandTotalRow);

const pivotTable = pivotSheet.tables.add(
  `B4:T${grandTotalRow}`,
  true,
  "tblPivotBaoCao",
);
pivotTable.style = "TableStyleLight1";
pivotTable.showBandedRows = false;
pivotTable.showFilterButton = true;

pivotSheet.getRange("B1:T1").format = {
  fill: "#FFFFFF",
  font: {
    name: "Aptos Display",
    size: 15,
    bold: true,
    color: "#1F3864",
  },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
pivotSheet.getRange("B1:T1").format.rowHeight = 28;
pivotSheet.getRange("B2:T2").format = {
  fill: "#FFFFFF",
  font: { name: "Aptos", size: 10, italic: true, color: "#595959" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
pivotSheet.getRange("B2:T2").format.rowHeight = 22;

const sectionFormats = [
  ["B3:C3", "#595959"],
  ["D3:E3", "#BF9000"],
  ["F3:L3", "#1F4E79"],
  ["M3:P3", "#7030A0"],
  ["Q3:T3", "#007060"],
];
for (const [range, fill] of sectionFormats) {
  pivotSheet.getRange(range).format = {
    fill,
    font: { name: "Aptos", size: 10, bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    borders: { preset: "outside", style: "thin", color: "#FFFFFF" },
  };
}
pivotSheet.getRange("B3:T3").format.rowHeight = 22;

for (const [range, fill] of sectionFormats) {
  const [start, end] = range.split(":");
  const startColumn = start.replace(/\d+/g, "");
  const endColumn = end.replace(/\d+/g, "");
  pivotSheet.getRange(`${startColumn}4:${endColumn}4`).format = {
    fill,
    font: { name: "Aptos", size: 10, bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
    borders: { preset: "all", style: "thin", color: "#D9E1F2" },
  };
}
pivotSheet.getRange("B4:T4").format.rowHeight = 48;

pivotSheet.getRange(`B5:C${grandTotalRow}`).format = {
  font: { name: "Aptos", size: 10 },
  horizontalAlignment: "left",
  verticalAlignment: "center",
  borders: {
    insideHorizontal: { style: "thin", color: "#D9D9D9" },
    insideVertical: { style: "thin", color: "#D9D9D9" },
  },
};
pivotSheet.getRange(`D5:E${grandTotalRow}`).format.fill = "#FFF9E6";
pivotSheet.getRange(`F5:K${grandTotalRow}`).format.fill = "#F2F7FC";
pivotSheet.getRange(`L5:T${grandTotalRow}`).format.fill = "#FFFFFF";
pivotSheet.getRange(`D5:T${grandTotalRow}`).format = {
  font: { name: "Aptos", size: 10 },
  horizontalAlignment: "right",
  verticalAlignment: "center",
  borders: {
    insideHorizontal: { style: "thin", color: "#D9D9D9" },
    insideVertical: { style: "thin", color: "#D9D9D9" },
  },
};

for (const column of ["D", "E", "F", "H", "I", "K", "L", "M", "O", "Q", "S"]) {
  pivotSheet.getRange(`${column}5:${column}${grandTotalRow}`).format.numberFormat =
    "#,##0,,;(#,##0,,);\"-\"";
}
for (const column of ["G", "J", "N", "P", "R", "T"]) {
  pivotSheet.getRange(`${column}5:${column}${grandTotalRow}`).format.numberFormat =
    "0.0%;(0.0%);\"-\"";
}
for (let row = 5; row <= grandTotalRow; row += 1) {
  pivotSheet.getRange(`B${row}:T${row}`).format.rowHeight = 18;
}

for (const row of subtotalRows) {
  pivotSheet.getRange(`B${row}:T${row}`).format = {
    fill: "#D9E2F3",
    font: { name: "Aptos", size: 10, bold: true, color: "#000000" },
    borders: {
      top: { style: "medium", color: "#2F5597" },
      bottom: { style: "thin", color: "#9EADBF" },
    },
  };
}
pivotSheet.getRange(`B${grandTotalRow}:T${grandTotalRow}`).format = {
  fill: "#2F5597",
  font: { name: "Aptos", size: 10, bold: true, color: "#FFFFFF" },
  borders: {
    top: { style: "medium", color: "#1F3864" },
    bottom: { style: "medium", color: "#1F3864" },
  },
};

for (const column of ["G", "J"]) {
  const range = pivotSheet.getRange(`${column}5:${column}${grandTotalRow}`);
  range.conditionalFormats.deleteAll();
  range.conditionalFormats.add("cellIs", {
    operator: "lessThan",
    formula: 0.8,
    format: { fill: "#FFC7CE", font: { color: "#9C0006" } },
  });
  range.conditionalFormats.add("cellIs", {
    operator: "between",
    formula: [0.8, 0.999999],
    format: { fill: "#FFEB9C", font: { color: "#9C6500" } },
  });
  range.conditionalFormats.add("cellIs", {
    operator: "greaterThanOrEqual",
    formula: 1,
    format: { fill: "#C6EFCE", font: { color: "#006100" } },
  });
}
for (const column of ["H", "K"]) {
  const range = pivotSheet.getRange(`${column}5:${column}${grandTotalRow}`);
  range.conditionalFormats.deleteAll();
  range.conditionalFormats.add("cellIs", {
    operator: "lessThan",
    formula: 0,
    format: { font: { color: "#C00000" } },
  });
  range.conditionalFormats.add("cellIs", {
    operator: "greaterThan",
    formula: 0,
    format: { font: { color: "#00703C" } },
  });
}

const pivotWidths = {
  B: 15,
  C: 20,
  D: 14,
  E: 14,
  F: 14,
  G: 13,
  H: 14,
  I: 15,
  J: 14,
  K: 14,
  L: 12,
  M: 14,
  N: 13,
  O: 14,
  P: 13,
  Q: 14,
  R: 14,
  S: 17,
  T: 15,
};
for (const [column, width] of Object.entries(pivotWidths)) {
  pivotSheet.getRange(`${column}1:${column}${grandTotalRow}`).format.columnWidth =
    width;
}

const pivotInspection = await workbook.inspect({
  kind: "table",
  range: `PIVOT!B1:T${grandTotalRow}`,
  include: "values,formulas",
  tableMaxRows: 40,
  tableMaxCols: 19,
  maxChars: 30000,
});
const errorScan = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 200 },
  summary: "PIVOT formula error scan",
  maxChars: 5000,
});

const preview = await workbook.render({
  sheetName: "PIVOT",
  range: `B1:T${grandTotalRow}`,
  scale: 1.2,
  format: "png",
});
await fs.writeFile(previewFile, new Uint8Array(await preview.arrayBuffer()));

const modelTotals = modelRows.reduce(
  (totals, row) => {
    totals.actual += row[5];
    totals.last_year += row[6];
    totals.prior_month += row[7];
    totals.vikoda_actual += row[8];
    totals.target_total += row[9];
    totals.target_vikoda += row[10];
    totals.kdt_actual += row[11];
    totals.vikoda_last_year += row[12];
    totals.vikoda_prior_month += row[13];
    return totals;
  },
  {
    actual: 0,
    last_year: 0,
    prior_month: 0,
    vikoda_actual: 0,
    kdt_actual: 0,
    target_total: 0,
    target_vikoda: 0,
    vikoda_last_year: 0,
    vikoda_prior_month: 0,
  },
);

const report = {
  workbook_path: workbookPath,
  periods: {
    current: currentPeriod,
    last_year: lastYearPeriod,
    prior_month: priorMonthPeriod,
  },
  rows: {
    sell_in_staging: sellInPayload.rows.length,
    target_staging: targetPayload.records.length,
    dmkh_staging: dmkhPayload.rows.length,
    pvt_data: modelRows.length,
    pivot_detail: detailRows.length,
    pivot_subtotals: subtotalRows.length,
  },
  mapping_stats: mappingStats,
  model_totals: modelTotals,
  pivot_inspection: pivotInspection.ndjson,
  error_scan: errorScan.ndjson,
  preview_file: previewFile,
};
await fs.writeFile(reportFile, JSON.stringify(report, null, 2), "utf8");

const exported = await SpreadsheetFile.exportXlsx(workbook);
const temporaryPath = path.join(
  path.dirname(workbookPath),
  `${path.parse(workbookPath).name}.pivot-building.xlsx`,
);
await exported.save(temporaryPath);
await fs.copyFile(temporaryPath, workbookPath);
await fs.rm(temporaryPath, { force: true });
await fs.rm(`${temporaryPath}.inspect.ndjson`, { force: true });

console.log(
  JSON.stringify({
    workbookPath,
    reportFile,
    previewFile,
    pvtDataRows: modelRows.length,
    currentPeriod,
    grandTotalRow,
  }),
);
