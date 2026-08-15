"""Module Kiểm tra & Đối soát Chất lượng Dữ liệu (Data Validation & Reconciliation)

Đảm bảo dữ liệu Sell-In, Target và Danh mục Khách hàng đáp ứng 100% tiêu chuẩn
chính xác, không thất thoát doanh thu, không silent corruption.
"""

from __future__ import annotations

import argparse
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Tuple

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("VikodaValidation")


def load_json(path: Path) -> Any:
    if not path.exists():
        raise FileNotFoundError(f"Không tìm thấy tệp: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def validate_sell_in_staging(staging_file: Path) -> Dict[str, Any]:
    """Kiểm tra tính toàn vẹn của tệp dữ liệu Sell-In staging."""
    data = load_json(staging_file)
    cols = data.get("columns", [])
    rows = data.get("rows", [])
    
    # Hỗ trợ cả định dạng list of dicts (records) và columnar rows
    if not rows and "records" in data:
        records = data["records"]
        return validate_sell_in_dict_records(records, staging_file.name)

    if not rows:
        raise ValueError(f"Tệp {staging_file.name} không có dữ liệu (0 rows).")

    idx_date = cols.index("NgayHoaDon") if "NgayHoaDon" in cols else 2
    idx_cust = cols.index("MaKhachHangMoi") if "MaKhachHangMoi" in cols else 3
    idx_prod = cols.index("MaSanPhamMoi") if "MaSanPhamMoi" in cols else 5
    idx_qty = cols.index("SoLuong") if "SoLuong" in cols else 7
    idx_rev = cols.index("ThanhTien") if "ThanhTien" in cols else 9
    idx_type = cols.index("LoaiDonHang") if "LoaiDonHang" in cols else 10

    invalid_rows = 0
    negative_revenue = 0
    missing_customer = 0
    missing_product = 0
    total_rev = 0.0
    total_qty = 0.0

    for r in rows:
        rev = float(r[idx_rev] or 0)
        qty = float(r[idx_qty] or 0)
        cust = str(r[idx_cust] or "").strip()
        prod = str(r[idx_prod] or "").strip()
        inv_date = str(r[idx_date] or "").strip()

        if not inv_date or not cust or not prod:
            invalid_rows += 1
            if not cust:
                missing_customer += 1
            if not prod:
                missing_product += 1

        loai_don = str(r[idx_type] or "").upper()
        if "TRA HANG" not in loai_don and rev < 0:
            negative_revenue += 1

        total_rev += rev
        total_qty += qty

    return {
        "record_count": len(rows),
        "total_revenue_vnd": round(total_rev, 2),
        "total_quantity": round(total_qty, 2),
        "invalid_rows": invalid_rows,
        "negative_revenue_rows": negative_revenue,
        "missing_customer_rows": missing_customer,
        "missing_product_rows": missing_product,
    }


def validate_sell_in_dict_records(records: List[Dict[str, Any]], filename: str) -> Dict[str, Any]:
    invalid_rows = 0
    negative_revenue = 0
    missing_customer = 0
    missing_product = 0
    total_rev = 0.0
    total_qty = 0.0

    for r in records:
        rev = float(r.get("ThanhTien") or 0)
        qty = float(r.get("SoLuong") or 0)
        cust = str(r.get("MaKhachHangMoi") or "").strip()
        prod = str(r.get("MaSanPhamMoi") or "").strip()
        inv_date = str(r.get("NgayHoaDon") or "").strip()

        if not inv_date or not cust or not prod:
            invalid_rows += 1
            if not cust:
                missing_customer += 1
            if not prod:
                missing_product += 1

        loai_don = str(r.get("LoaiDonHang") or "").upper()
        if "TRA HANG" not in loai_don and rev < 0:
            negative_revenue += 1

        total_rev += rev
        total_qty += qty

    return {
        "record_count": len(records),
        "total_revenue_vnd": round(total_rev, 2),
        "total_quantity": round(total_qty, 2),
        "invalid_rows": invalid_rows,
        "negative_revenue_rows": negative_revenue,
        "missing_customer_rows": missing_customer,
        "missing_product_rows": missing_product,
    }


def validate_target_staging(target_file: Path) -> Dict[str, Any]:
    """Kiểm tra tính toàn vẹn của tệp Target staging."""
    data = load_json(target_file)
    records = data.get("records", [])

    if not records:
        raise ValueError(f"Tệp {target_file.name} không có dữ liệu Target.")

    total_target = 0.0
    total_vikoda = 0.0
    invalid_targets = 0

    for r in records:
        t_total = float(r.get("TargetTong") or r.get("TargetTotalVND") or 0)
        t_vikoda = float(r.get("TargetVikoda") or r.get("TargetVikodaVND") or 0)

        if t_total < 0 or t_vikoda < 0:
            invalid_targets += 1

        total_target += t_total
        total_vikoda += t_vikoda

    return {
        "record_count": len(records),
        "total_target_vnd": round(total_target, 2),
        "total_vikoda_target_vnd": round(total_vikoda, 2),
        "invalid_target_rows": invalid_targets,
    }


def reconcile_data(
    source_audit_file: Path,
    staging_file: Path,
    target_file: Path,
    dmkh_file: Path,
    output_report_file: Path,
) -> Dict[str, Any]:
    """Thực hiện đối soát tổng thể Source -> Staging -> Output."""
    logger.info("Bắt đầu đối soát dữ liệu (Reconciliation)...")

    sell_in_audit = load_json(source_audit_file) if source_audit_file.exists() else {}
    sell_in_metrics = validate_sell_in_staging(staging_file)
    target_metrics = validate_target_staging(target_file)
    dmkh_data = load_json(dmkh_file) if dmkh_file.exists() else {}
    total_customers = len(dmkh_data.get("rows", [])) or len(dmkh_data.get("records", []))

    source_records = sell_in_audit.get("source_records", sell_in_metrics["record_count"])
    excluded_records = sell_in_audit.get("excluded_records", 0)
    excluded_amount = sell_in_audit.get("excluded_amount", 0)

    # Đối soát dòng: Source - Excluded = Output
    expected_output_rows = source_records - excluded_records
    actual_output_rows = sell_in_metrics["record_count"]
    row_diff = actual_output_rows - expected_output_rows

    is_row_reconciled = (row_diff == 0)
    is_valid = (sell_in_metrics["invalid_rows"] == 0 and target_metrics["invalid_target_rows"] == 0)

    status = "PASS" if (is_row_reconciled and is_valid) else "FAIL"

    report = {
        "status": status,
        "timestamp": datetime.now().astimezone().isoformat(),
        "summary": {
            "source_records": source_records,
            "excluded_records": excluded_records,
            "excluded_amount_vnd": excluded_amount,
            "output_records": actual_output_rows,
            "row_variance": row_diff,
            "total_sell_in_revenue_vnd": sell_in_metrics["total_revenue_vnd"],
            "total_sell_in_quantity": sell_in_metrics["total_quantity"],
            "total_target_vnd": target_metrics["total_target_vnd"],
            "total_customers": total_customers,
        },
        "quality_checks": {
            "missing_customer_mapping": sell_in_metrics["missing_customer_rows"],
            "missing_product_mapping": sell_in_metrics["missing_product_rows"],
            "invalid_sell_in_rows": sell_in_metrics["invalid_rows"],
            "invalid_target_rows": target_metrics["invalid_target_rows"],
            "row_reconciliation_pass": is_row_reconciled,
        }
    }

    output_report_file.parent.mkdir(parents=True, exist_ok=True)
    output_report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    logger.info(f"Kết quả đối soát: {status} (Output rows: {actual_output_rows:,}, Doanh thu: {sell_in_metrics['total_revenue_vnd'] / 1e9:,.2f} Tỷ VNĐ, Khách hàng: {total_customers:,})")
    if status != "PASS":
        logger.error(f"Đối soát thất bại! Lệch dòng: {row_diff}, Lỗi: {sell_in_metrics['invalid_rows']}")
        raise ValueError(f"Data Reconciliation FAIL: {report}")

    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Vikoda Data Validation & Reconciliation")
    parser.add_argument("--project-root", default=".", help="Đường dẫn thư mục gốc dự án")
    args = parser.parse_args()

    root = Path(args.project_root).resolve()
    staging_dir = root / "Data/Work/bao_cao/data/staging"
    target_dir = root / "Data/Work/bao_cao/target/staging"
    dmkh_dir = root / "Data/Work/bao_cao/dmkh/staging"

    audit_file = staging_dir / "sell_in_audit.json"
    sell_in_file = staging_dir / "sell_in_data.json"
    target_file = target_dir / "target_records.json"
    dmkh_file = dmkh_dir / "dmkh_data.json"
    report_file = root / "Data/Work/data_quality_report.json"

    reconcile_data(
        source_audit_file=audit_file,
        staging_file=sell_in_file,
        target_file=target_file,
        dmkh_file=dmkh_file,
        output_report_file=report_file,
    )


if __name__ == "__main__":
    main()
