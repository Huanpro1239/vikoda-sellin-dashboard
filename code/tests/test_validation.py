"""Unit tests for Data Validation & Reconciliation module."""

import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

# Đảm bảo import được code.common
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

try:
    from code.common.validation import (
        validate_sell_in_staging,
        validate_target_staging,
        reconcile_data,
    )
except ImportError:
    from common.validation import (
        validate_sell_in_staging,
        validate_target_staging,
        reconcile_data,
    )


class TestValidationModule(unittest.TestCase):
    def setUp(self):
        self.test_dir = Path(tempfile.mkdtemp(prefix="vikoda_test_val_"))

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_valid_sell_in_staging(self):
        staging_file = self.test_dir / "sell_in_data.json"
        data = {
            "columns": [
                "Vung", "KhuVuc", "NgayHoaDon", "MaKhachHangMoi",
                "TenKhachHang", "MaSanPhamMoi", "TenSanPham", "SoLuong",
                "DonGia", "ThanhTien", "LoaiDonHang", "GhiChu", "Thang", "Nam"
            ],
            "rows": [
                ["MT", "MT", "2026-08-01", "CUST001", "KH 1", "PROD001", "SP 1", 100, 1000, 100000, "Đơn hàng bán", "", 8, 2026],
                ["MT", "MT", "2026-08-02", "CUST002", "KH 2", "PROD002", "SP 2", 50, 2000, 100000, "Đơn hàng bán", "", 8, 2026],
            ]
        }
        staging_file.write_text(json.dumps(data), encoding="utf-8")
        res = validate_sell_in_staging(staging_file)
        self.assertEqual(res["record_count"], 2)
        self.assertEqual(res["total_revenue_vnd"], 200000)
        self.assertEqual(res["invalid_rows"], 0)

    def test_invalid_sell_in_missing_fields(self):
        staging_file = self.test_dir / "sell_in_invalid.json"
        data = {
            "columns": ["NgayHoaDon", "MaKhachHangMoi", "MaSanPhamMoi", "SoLuong", "ThanhTien", "LoaiDonHang"],
            "rows": [
                ["", "", "PROD001", 10, 1000, "Đơn hàng bán"], # Missing date and customer
            ]
        }
        staging_file.write_text(json.dumps(data), encoding="utf-8")
        res = validate_sell_in_staging(staging_file)
        self.assertEqual(res["invalid_rows"], 1)
        self.assertEqual(res["missing_customer_rows"], 1)

    def test_target_validation(self):
        target_file = self.test_dir / "target_records.json"
        data = {
            "records": [
                {"PeriodKey": "202608", "TerritoryKey": "MT", "CustomerKey": "CUST001", "TargetTotalVND": 150000000, "TargetVikodaVND": 100000000},
                {"PeriodKey": "202608", "TerritoryKey": "MN", "CustomerKey": "CUST002", "TargetTotalVND": 200000000, "TargetVikodaVND": 120000000},
            ]
        }
        target_file.write_text(json.dumps(data), encoding="utf-8")
        res = validate_target_staging(target_file)
        self.assertEqual(res["record_count"], 2)
        self.assertEqual(res["total_target_vnd"], 350000000)
        self.assertEqual(res["invalid_target_rows"], 0)


if __name__ == "__main__":
    unittest.main()
