"""Finalize Sell-In dates from actual invoice facts.

The pipeline execution date and the latest business-data date are different
concepts.  This module derives the dashboard ``as_of_date`` from the maximum
valid ``NgayHoaDon`` present in the refreshed Sell-In facts, keeps the pipeline
run date separately, and fails closed on future-dated or inconsistent data.
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterable
from zoneinfo import ZoneInfo

VIETNAM_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


class DataDateValidationError(RuntimeError):
    """Raised when refreshed data cannot prove a trustworthy latest date."""


def _parse_date(value: Any, *, label: str) -> date:
    if not isinstance(value, str) or not value.strip():
        raise DataDateValidationError(f"{label} thiếu ngày ISO hợp lệ")
    try:
        return date.fromisoformat(value.strip())
    except ValueError as exc:
        raise DataDateValidationError(f"{label} không phải ngày ISO: {value!r}") from exc


def latest_business_date(
    values: Iterable[Any],
    *,
    run_date: date,
    label: str,
) -> date:
    """Return MAX(valid date), rejecting empty and future-dated datasets."""
    parsed = [_parse_date(value, label=label) for value in values]
    if not parsed:
        raise DataDateValidationError(f"{label} không có bản ghi để xác định ngày mới nhất")
    future = [value for value in parsed if value > run_date]
    if future:
        raise DataDateValidationError(
            f"{label} có ngày vượt ngày chạy {run_date.isoformat()}: "
            f"{max(future).isoformat()}"
        )
    return max(parsed)


def _read_json(path: Path, *, label: str) -> dict[str, Any]:
    if not path.is_file() or path.stat().st_size <= 0:
        raise DataDateValidationError(f"Thiếu hoặc rỗng {label}: {path}")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise DataDateValidationError(f"{label} không phải JSON hợp lệ: {path}") from exc
    if not isinstance(payload, dict):
        raise DataDateValidationError(f"{label} phải là JSON object")
    return payload


def _sell_in_latest(payload: dict[str, Any], *, run_date: date) -> date:
    columns = payload.get("columns")
    rows = payload.get("rows")
    if not isinstance(columns, list) or "NgayHoaDon" not in columns:
        raise DataDateValidationError("sell_in_data.json thiếu cột NgayHoaDon")
    if not isinstance(rows, list):
        raise DataDateValidationError("sell_in_data.json.rows không hợp lệ")
    date_index = columns.index("NgayHoaDon")
    values = []
    for row_number, row in enumerate(rows, start=1):
        if not isinstance(row, list) or len(row) <= date_index:
            raise DataDateValidationError(
                f"sell_in_data.json row {row_number} thiếu NgayHoaDon"
            )
        values.append(row[date_index])
    return latest_business_date(
        values,
        run_date=run_date,
        label="sell_in_data.NgayHoaDon",
    )


def _web_latest(payload: dict[str, Any], *, run_date: date) -> date:
    facts = payload.get("fact_sell_in")
    if not isinstance(facts, list):
        raise DataDateValidationError("dashboard_data.json.fact_sell_in không hợp lệ")
    values = []
    for row_number, fact in enumerate(facts, start=1):
        if not isinstance(fact, list) or not fact:
            raise DataDateValidationError(
                f"dashboard_data.json fact {row_number} thiếu ngày hóa đơn"
            )
        values.append(fact[0])
    return latest_business_date(
        values,
        run_date=run_date,
        label="dashboard_data.fact_sell_in[date]",
    )


def _atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(content, encoding="utf-8")
    os.replace(tmp, path)


def finalize_dates(project_root: Path, *, run_date: date | None = None) -> date:
    """Synchronize canonical latest-data metadata across staging and web output."""
    root = project_root.resolve()
    effective_run_date = run_date or datetime.now(VIETNAM_TZ).date()

    sell_path = root / "Data/Work/bao_cao/data/staging/sell_in_data.json"
    web_json_path = root / "web/data/dashboard_data.json"
    web_js_path = root / "web/data/dashboard_data.js"

    sell_payload = _read_json(sell_path, label="sell_in_data.json")
    web_payload = _read_json(web_json_path, label="dashboard_data.json")

    sell_latest = _sell_in_latest(sell_payload, run_date=effective_run_date)
    web_latest = _web_latest(web_payload, run_date=effective_run_date)
    if sell_latest != web_latest:
        raise DataDateValidationError(
            "Ngày mới nhất giữa staging và web không khớp: "
            f"sell_in={sell_latest.isoformat()}, web={web_latest.isoformat()}"
        )

    latest_iso = sell_latest.isoformat()
    run_iso = effective_run_date.isoformat()

    sell_payload["run_as_of_date"] = run_iso
    sell_payload["source_latest_date"] = latest_iso
    sell_payload["as_of_date"] = latest_iso
    sell_payload["current_year"] = sell_latest.year
    sell_payload["through_month"] = sell_latest.month

    metadata = web_payload.get("metadata")
    if not isinstance(metadata, dict):
        raise DataDateValidationError("dashboard_data.json thiếu metadata")
    metadata["run_as_of_date"] = run_iso
    metadata["source_latest_date"] = latest_iso
    metadata["as_of_date"] = latest_iso
    metadata["current_year"] = sell_latest.year
    metadata["through_month"] = sell_latest.month
    metadata["date_basis"] = "MAX(NgayHoaDon)"
    metadata["date_finalized_at"] = datetime.now(VIETNAM_TZ).isoformat()

    json_text = json.dumps(web_payload, ensure_ascii=False, separators=(",", ":"))
    _atomic_write(
        sell_path,
        json.dumps(sell_payload, ensure_ascii=False, separators=(",", ":")),
    )
    _atomic_write(web_json_path, json_text)
    _atomic_write(web_js_path, f"window.VIKODA_DATA = {json_text};\n")

    return sell_latest


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Đặt ngày dashboard theo MAX(NgayHoaDon) thực tế"
    )
    parser.add_argument("--project-root", default=".")
    parser.add_argument(
        "--run-date",
        help="Ngày chạy YYYY-MM-DD; mặc định lấy ngày hiện tại Asia/Ho_Chi_Minh.",
    )
    args = parser.parse_args()

    run_date = date.fromisoformat(args.run_date) if args.run_date else None
    latest = finalize_dates(Path(args.project_root), run_date=run_date)
    print(
        json.dumps(
            {
                "status": "PASS",
                "run_date": (run_date or datetime.now(VIETNAM_TZ).date()).isoformat(),
                "source_latest_date": latest.isoformat(),
                "date_basis": "MAX(NgayHoaDon)",
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
