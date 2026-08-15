"""Bộ trích xuất dữ liệu tự động cho Web Dashboard Vikoda.

Đọc dữ liệu staging đã làm sạch và xuất thành gói JSON/JS siêu nhẹ (<1MB)
cho Web Dashboard chạy độc lập, cực nhanh, tương thích mọi trình duyệt và cloud.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

# Thêm thư mục scripts hiện tại vào sys.path để import build_powerbi_package
CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from build_powerbi_package import (  # noqa: E402
    build_dimensions,
    load_json,
    load_product_catalog,
)


def export_web_dataset(
    sell_in_path: Path,
    target_path: Path,
    dmkh_path: Path,
    output_dir: Path,
    product_catalog_path: Path | None = None,
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

    # Rút gọn danh mục khách hàng thành từ điển tra cứu nhẹ
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

    # Rút gọn danh mục sản phẩm với phân nhóm rõ ràng (Vikoda, Đảnh Thạnh, KDT)
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

    # Rút gọn danh mục địa bàn
    terr_map = {}
    for t in dim_territory:
        terr_map[t["TerritoryKey"]] = {
            "mien": t["Mien"],
            "vung": t["Vung"],
        }

    # Rút gọn fact sell in thành mảng gọn nhẹ: [date, cust_key, prod_key, terr_key, rev_vnd, qty, conv_qty, is_return]
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

    # Rút gọn fact target thành mảng: [period_key, terr_key, cust_key, target_total_vnd, target_vikoda_vnd]
    targets_compact = []
    for t in fact_target:
        targets_compact.append([
            t["PeriodKey"],
            t["TerritoryKey"],
            t["CustomerKey"],
            round(float(t["TargetTotalVND"] or 0), 2),
            round(float(t["TargetVikodaVND"] or 0), 2),
        ])

    quality_report_path = sell_in_path.parent.parent.parent / "data_quality_report.json"
    quality_status = "PASS"
    source_row_count = len(facts_compact)
    if quality_report_path.exists():
        try:
            qrep = json.loads(quality_report_path.read_text(encoding="utf-8"))
            quality_status = qrep.get("status", "PASS")
            source_row_count = qrep.get("summary", {}).get("source_records", source_row_count)
        except Exception:
            pass

    payload = {
        "metadata": {
            "as_of_date": as_of_date,
            "source_latest_date": as_of_date,
            "current_year": current_year,
            "through_month": through_month,
            "generated_at": datetime.now().astimezone().isoformat(),
            "pipeline_version": "2.1.0",
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

    # Atomic write: Ghi ra file tạm và kiểm chứng trước khi thay thế file production
    json_tmp.write_text(json_str, encoding="utf-8")
    js_tmp.write_text(js_content, encoding="utf-8")

    # Kiểm tra tính hợp lệ của JSON tạm
    json.loads(json_tmp.read_text(encoding="utf-8"))

    # Thay thế nguyên tử (Atomic replace)
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
    if args.product_catalog:
        configured_catalog = Path(args.product_catalog)
        product_catalog = (
            configured_catalog
            if configured_catalog.is_absolute()
            else root / configured_catalog
        )
    else:
        product_catalog = root / "Data/Danh muc SP/Danh Muc San Pham.xlsx"
    output_dir = root / "web/data"

    if not sell_in_path.exists():
        print(f"Khong tim thay file: {sell_in_path}")
        sys.exit(1)

    export_web_dataset(
        sell_in_path,
        target_path,
        dmkh_path,
        output_dir,
        product_catalog if product_catalog.exists() else None,
    )


if __name__ == "__main__":
    main()
