from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

from extraction import (
    OUTPUT_COLUMNS,
    extract_file,
    is_candidate_source,
    iso_invoice_date,
    parse_source_name,
    sort_key,
)


# Giữ lại tên cũ để script và test đang import từ module này không vỡ.
__all__ = ["OUTPUT_COLUMNS", "main"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", required=True)
    parser.add_argument("--staging-dir", required=True)
    parser.add_argument(
        "--plan-file",
        help="Khi có, chỉ tách các tháng REBUILD trong kế hoạch tăng dần.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source_dir = Path(args.source_dir).resolve()
    staging_dir = Path(args.staging_dir).resolve()
    staging_dir.mkdir(parents=True, exist_ok=True)
    rebuild_periods: set[str] | None = None
    if args.plan_file:
        plan = json.loads(Path(args.plan_file).read_text(encoding="utf-8"))
        rebuild_periods = set(plan["rebuild_periods"])

    grouped: dict[tuple[int, int], list[dict]] = defaultdict(list)
    audits: list[dict] = []
    ignored_files: list[str] = []
    skipped_source_files: list[str] = []

    for file_path in sorted(source_dir.iterdir(), key=lambda p: p.name.lower()):
        if not is_candidate_source(file_path):
            continue
        parsed = parse_source_name(file_path.name)
        if parsed is None:
            ignored_files.append(file_path.name)
            continue
        company, month, year = parsed
        period = f"{year}-{month:02d}"
        if rebuild_periods is not None and period not in rebuild_periods:
            skipped_source_files.append(file_path.name)
            continue
        rows, audit = extract_file(file_path, company, month, year)
        grouped[(year, month)].extend(rows)
        audits.append(audit)

    if not audits and (rebuild_periods is None or rebuild_periods):
        raise RuntimeError("Không tìm thấy file ERP hợp lệ để xử lý.")

    monthly_files: list[dict] = []
    for (year, month), rows in sorted(grouped.items()):
        rows.sort(key=sort_key)
        for row in rows:
            row["NgayHoaDon"] = iso_invoice_date(row["NgayHoaDon"])
        staging_file = staging_dir / f"sell_in_{year}_{month:02d}.json"
        staging_file.write_text(
            json.dumps(
                {
                    "columns": OUTPUT_COLUMNS,
                    "year": year,
                    "month": month,
                    "rows": rows,
                },
                ensure_ascii=False,
                separators=(",", ":"),
            ),
            encoding="utf-8",
        )
        monthly_files.append({
            "year": year,
            "month": month,
            "staging_file": str(staging_file),
            "output_rows": len(rows),
        })

    audit_payload = {
        "source_dir": str(source_dir),
        "monthly_files": monthly_files,
        "source_audits": audits,
        "ignored_files": ignored_files,
        "skipped_source_files": skipped_source_files,
        "rebuild_periods": sorted(rebuild_periods or []),
    }
    audit_file = staging_dir / "audit.json"
    audit_file.write_text(
        json.dumps(audit_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(str(audit_file))


if __name__ == "__main__":
    main()
