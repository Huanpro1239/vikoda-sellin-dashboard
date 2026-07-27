"""Tạo workbook Sell In của các tháng REBUILD từ staging JSON.

Thay cho `build_outputs.mjs`: dựng file bằng openpyxl nên luồng chính không còn
cần Node và `@oai/artifact-tool`. Định dạng nằm trong `workbook_builder.py`,
dùng chung với luồng chuyển giao, nên hai luồng ra file giống hệt nhau.

Ảnh preview PNG là bước riêng và không bắt buộc; xem `render_previews.mjs`.
"""

from __future__ import annotations

import argparse
import json
from datetime import date, datetime
from pathlib import Path

from workbook_builder import write_monthly_workbook


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--staging-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--report-dir", required=True)
    parser.add_argument(
        "--period",
        default="",
        help="Chỉ dựng một tháng dạng YYYY-MM. Bỏ trống để dựng mọi tháng "
             "có trong audit.json.",
    )
    return parser.parse_args()


def parse_iso_date(value: str | None) -> date | None:
    if not value:
        return None
    return datetime.strptime(value, "%Y-%m-%d").date()


def load_rows(staging_file: Path) -> list[dict]:
    payload = json.loads(staging_file.read_text(encoding="utf-8"))
    rows = payload["rows"]
    for row in rows:
        row["NgayHoaDon"] = parse_iso_date(row["NgayHoaDon"])
    return rows


def main() -> None:
    args = parse_args()
    staging_dir = Path(args.staging_dir).resolve()
    output_dir = Path(args.output_dir).resolve()
    report_dir = Path(args.report_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    report_dir.mkdir(parents=True, exist_ok=True)

    audit = json.loads(
        (staging_dir / "audit.json").read_text(encoding="utf-8")
    )
    monthly_files = audit["monthly_files"]
    if args.period:
        monthly_files = [
            monthly
            for monthly in monthly_files
            if f"{monthly['year']}-{monthly['month']:02d}" == args.period
        ]
        if not monthly_files:
            raise SystemExit(
                f"Không tìm thấy dữ liệu tháng được yêu cầu: {args.period}"
            )

    reports: list[dict] = []
    for monthly in monthly_files:
        year = monthly["year"]
        month = monthly["month"]
        rows = load_rows(Path(monthly["staging_file"]))
        # write_monthly_workbook ghi ra file tạm, kiểm tra rồi mới thay thế
        # file thật, nên workbook cũ không bị hỏng khi có lỗi giữa chừng.
        verification = write_monthly_workbook(output_dir, rows, month, year)
        reports.append(
            {
                "period": f"{year}-{month:02d}",
                "outputPath": verification["file"],
                "outputRows": len(rows),
                "verification": verification,
            }
        )
        print(f"{year}-{month:02d} | {verification['file']} | {len(rows):,} dòng")

    report_name = (
        f"build_report_{args.period}.json" if args.period else "build_report.json"
    )
    report_path = report_dir / report_name
    report_path.write_text(
        json.dumps(reports, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(str(report_path))


if __name__ == "__main__":
    main()
