// Render ảnh PNG preview cho workbook Sell In đã dựng.
//
// Bước này KHÔNG bắt buộc. File Sell In do build_outputs.py tạo và đã được
// verify_outputs.py kiểm tra trước khi bàn giao; preview chỉ để mắt thường soi
// lại khi đổi định dạng. Script cần Node kèm @oai/artifact-tool, nên
// run_sell_in.ps1 chỉ gọi khi tìm thấy Node và bỏ qua nếu không có.
//
// Dùng: node render_previews.mjs <outputDir> <previewDir> [period YYYY-MM]

import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const outputDir = path.resolve(process.argv[2]);
const previewDir = path.resolve(process.argv[3]);
const filterKey = process.argv[4] ?? "";

await fs.mkdir(previewDir, { recursive: true });

const namePattern = /^Sell in T(\d{2})_(\d{4})\.xlsx$/;
const entries = (await fs.readdir(outputDir))
  .map((name) => {
    const match = namePattern.exec(name);
    if (!match) return null;
    const month = Number(match[1]);
    const year = Number(match[2]);
    return { name, month, year, period: `${year}-${match[1]}` };
  })
  .filter((entry) => entry !== null)
  .filter((entry) => !filterKey || entry.period === filterKey)
  .sort((a, b) => a.name.localeCompare(b.name));

if (entries.length === 0) {
  console.log("Khong co workbook nao de render preview.");
  process.exit(0);
}

const rendered = [];
for (const entry of entries) {
  const filePath = path.join(outputDir, entry.name);
  const input = await FileBlob.load(filePath);
  const workbook = await SpreadsheetFile.importXlsx(input);
  const sheet = workbook.worksheets.getItemAt(0);

  const errors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 100 },
    summary: "final formula error scan",
    maxChars: 2000,
  });

  const preview = await workbook.render({
    sheetName: sheet.name,
    range: "A1:N20",
    scale: 1,
    format: "png",
  });
  const previewName =
    `Sell_in_T${String(entry.month).padStart(2, "0")}_${entry.year}.png`;
  const previewPath = path.join(previewDir, previewName);
  await fs.writeFile(
    previewPath,
    new Uint8Array(await preview.arrayBuffer()),
  );
  await fs.rm(`${filePath}.inspect.ndjson`, { force: true });

  rendered.push({
    period: entry.period,
    file: filePath,
    previewPath,
    errorScan: errors.ndjson,
  });
  console.log(`${entry.period} | ${previewPath}`);
}

const reportPath = path.join(
  previewDir,
  filterKey ? `preview_report_${filterKey}.json` : "preview_report.json",
);
await fs.writeFile(reportPath, JSON.stringify(rendered, null, 2), "utf8");
console.log(reportPath);
process.exit(0);
