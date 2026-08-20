"""Bộ trích xuất dữ liệu tự động cho Web Dashboard Vikoda.

Đọc dữ liệu staging đã làm sạch và xuất thành gói JSON/JS cho Web Dashboard.
Web export phải fail-closed: chỉ sinh payload khi báo cáo data quality tồn tại,
đọc được và có trạng thái PASS.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from build_powerbi_package import (  # noqa: E402
    build_dimensions,
    load_json,
    load_product_catalog,
)


class WebExportValidationError(RuntimeError):
    """Raised when the web export quality gate cannot prove a PASS result."""


def _load_quality_gate(
    quality_report_path: Path,
    *,
    default_source_row_count: int,
) -> tuple[str, int]:
    """Read and validate the canonical data-quality report.

    The exporter is also callable outside ``run_cloud_pipeline --strict``;
    therefore it must never silently assume PASS when the report is missing,
    malformed or explicitly failed.
    """
    if not quality_report_path.is_file() or quality_report_path.stat().st_size <= 0:
        raise WebExportValidationError(
            f"Thiếu hoặc rỗng data quality report: {quality_report_path}"
        )

    try:
        report = json.loads(quality_report_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise WebExportValidationError(
            f"Data quality report không phải JSON hợp lệ: {quality_report_path}"
        ) from exc

    if not isinstance(report, dict):
        raise WebExportValidationError("Data quality report phải là JSON object")

    status = str(report.get("status") or "").strip().upper()
    if status != "PASS":
        raise WebExportValidationError(
            f"Không được export web khi data quality status={status or 'MISSING'}"
        )

    summary = report.get("summary")
    if summary is None:
        summary = {}
    if not isinstance(summary, dict):
        raise WebExportValidationError("Data quality report.summary phải là JSON object")

    raw_count = summary.get("source_records", default_source_row_count)
    try:
        source_row_count = int(raw_count)
    except (TypeError, ValueError) as exc:
        raise WebExportValidationError("summary.source_records không hợp lệ") from exc
    if source_row_count < 0:
        raise WebExportValidationError("summary.source_records không được âm")

    return status, source_row_count


def export_web_dataset(
    sell_in_path: Path,
    target_path: Path,
    dmkh_path: Path,
    output_dir: Path,
    product_catalog_path: Path | None = None,
    quality_report_path: Path | None = None,
) -> dict[str, Any]:
    sell_in = load_json(sell_in_path)
    target = load_json(target_path)
    dmkh = load_json(dmkh_path)
    product_catalog = load_product_catalog(product_catalog_path)

    dim_date, dim_customer, dim_product, dim_territory, (fact_sell, fact_target) = (
        build_dimensions(sell_in, target, dmkh, product_catalog)
    )

    current_year = int(sell_in.get("current_year", 0))
    through_month = int(sell_in.get("through_month", 0))
    as_of_date = str(sell_in.get("as_of_date") or "")

    cust_map = {}
    for c in dim_customer:
        cust_map[c["CustomerKey"]] = {
            "code": c["CustomerCode"],
            "name": c["CustomerName"],
            "channel": c["Channel"] or "GT",
            "type": c["CustomerType"] or "",
            "system_mt": c["SystemMT"] or "",
            "mien": c["Mien"],
            "vung": c["Vung"],
        }

    prod_map = {}
    for p in dim_product:
        p_name = str(p.get("ProductName") or "")
        p_norm = p_name.upper()

        if "VIKODA" in p_norm:
            group = "Khoáng kiềm Vikoda"
            brand = "Vikoda"
        elif "ĐẢNH THẠNH" in p_norm or "DANH THANH" in p_norm or "KHOÁNG" in p_norm or "KHOANG" in p_norm:
            group = "Khoáng ngọt Đảnh Thạnh"
            brand = "Đảnh Thạnh"
        elif "KDT" in p_norm or p.get("IsKDT"):
            group = "KDT Thương Mại"
            brand = "KDT"
        else:
            group = "Sản phẩm khác"
            brand = p.get("CoBrand") or "Khác"

        prod_map[p["ProductKey"]] = {
            "code": p["ProductCode"],
            "name": p_name,
            "short_name": p["ProductShortName"],
            "group": group,
            "unit": p["PackUnit"],
            "brand": brand,
            "is_vikoda": bool(p.get("IsVikoda")),
            "is_kdt": bool(p.get("IsKDT")),
        }

    terr_map = {}
    for t in dim_territory:
        terr_map[t["TerritoryKey"]] = {
            "mien": t["Mien"],
            "vung": t["Vung"],
        }

    facts_compact = []
    for f in fact_sell:
        facts_compact.append([
            f.get("InvoiceDate") or f["Date"],
            f["CustomerKey"],
            f["ProductKey"],
            f["TerritoryKey"],
            round(float(f["RevenueVND"] or 0), 2),
            round(float(f["Quantity"] or 0), 2),
            round(float(f["ConvertedQuantity"] or 0), 2) if f.get("ConvertedQuantity") is not None else None,
            1 if f.get("IsReturn") else 0,
        ])

    targets_compact = []
    for t in fact_target:
        targets_compact.append([
            t["PeriodKey"],
            t["TerritoryKey"],
            t["CustomerKey"],
            round(float(t["TargetTotalVND"] or 0), 2),
            round(float(t["TargetVikodaVND"] or 0), 2),
        ])

    if quality_report_path is None:
        # Canonical layout: Data/Work/bao_cao/data/staging/sell_in_data.json
        # and Data/Work/data_quality_report.json.
        try:
            quality_report_path = sell_in_path.parents[3] / "data_quality_report.json"
        except IndexError as exc:
            raise WebExportValidationError(
                "Không suy ra được vị trí data_quality_report.json; hãy truyền quality_report_path"
            ) from exc

    quality_status, source_row_count = _load_quality_gate(
        quality_report_path,
        default_source_row_count=len(facts_compact),
    )

    payload = {
        "metadata": {
            "as_of_date": as_of_date,
            "source_latest_date": as_of_date,
            "current_year": current_year,
            "through_month": through_month,
            "generated_at": datetime.now().astimezone().isoformat(),
            "pipeline_version": "2.3.0",
            "quality_status": quality_status,
            "source_row_count": source_row_count,
            "fact_count": len(facts_compact),
            "target_count": len(targets_compact),
            "customer_count": len(cust_map),
            "product_count": len(prod_map),
        },
        "dim_customer": cust_map,
        "dim_product": prod_map,
        "dim_territory": terr_map,
        "fact_sell_in": facts_compact,
        "fact_target": targets_compact,
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "dashboard_data.json"
    js_path = output_dir / "dashboard_data.js"
    json_tmp = output_dir / "dashboard_data.json.tmp"
    js_tmp = output_dir / "dashboard_data.js.tmp"

    json_str = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    js_content = f"window.VIKODA_DATA = {json_str};\n"

    json_tmp.write_text(json_str, encoding="utf-8")
    js_tmp.write_text(js_content, encoding="utf-8")
    json.loads(json_tmp.read_text(encoding="utf-8"))

    os.replace(json_tmp, json_path)
    os.replace(js_tmp, js_path)

    print(f"Da xuat du lieu Web Dashboard (Atomic Build): {json_path} ({len(json_str)/1024:.1f} KB)")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Xuat du lieu Web Dashboard Vikoda")
    parser.add_argument("--project-root", default=".")
    parser.add_argument(
        "--product-catalog",
        help="File danh mục sản phẩm; path tương đối tính từ project root.",
    )
    args = parser.parse_args()

    root = Path(args.project_root).resolve()
    sell_in_path = root / "Data/Work/bao_cao/data/staging/sell_in_data.json"
    target_path = root / "Data/Work/bao_cao/target/staging/target_records.json"
    dmkh_path = root / "Data/Work/bao_cao/dmkh/staging/dmkh_data.json"
    quality_report_path = root / "Data/Work/data_quality_report.json"
    if args.product_catalog:
        configured_catalog = Path(args.product_catalog)
        product_catalog = configured_catalog if configured_catalog.is_absolute() else root / configured_catalog
    else:
        product_catalog = root / "Data/Danh muc SP/Danh Muc San Pham.xlsx"
    output_dir = root / "web/data"

    for path, label in (
        (sell_in_path, "sell-in staging"),
        (target_path, "target staging"),
        (dmkh_path, "customer staging"),
        (quality_report_path, "data quality report"),
    ):
        if not path.is_file() or path.stat().st_size <= 0:
            print(f"Khong tim thay hoac file rong ({label}): {path}")
            sys.exit(1)

    export_web_dataset(
        sell_in_path,
        target_path,
        dmkh_path,
        output_dir,
        product_catalog if product_catalog.exists() else None,
        quality_report_path,
    )


if __name__ == "__main__":
    main()
