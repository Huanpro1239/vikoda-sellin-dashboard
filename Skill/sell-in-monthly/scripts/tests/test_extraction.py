"""Khóa hợp đồng của module `extraction.py` dùng chung.

Luồng chính và luồng chuyển giao cùng gọi các hàm này, nên mọi thay đổi quy tắc
lọc hoặc kiểu dữ liệu `NgayHoaDon` phải làm vỡ test ở đây trước khi ra sản phẩm.
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

from openpyxl import Workbook


SCRIPT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

from extraction import (  # noqa: E402
    OUTPUT_COLUMNS,
    clean_id,
    extract_file,
    is_candidate_source,
    iso_invoice_date,
    parse_source_name,
    sort_key,
)
from incremental import scan_source_file  # noqa: E402


HEADERS = OUTPUT_COLUMNS[:12]


def write_source(path: Path, rows: list[list]) -> None:
    workbook = Workbook()
    ws = workbook.active
    ws.append(HEADERS)
    for row in rows:
        ws.append(row)
    workbook.save(path)


def source_row(
    *,
    customer: str = "KH-001",
    product: str = "130100001",
    invoice_date: date = date(2026, 7, 10),
    quantity: float = 10,
) -> list:
    return [
        "MT",
        "MT",
        invoice_date,
        customer,
        "KHACH HANG",
        product,
        "SAN PHAM",
        quantity,
        100,
        1000,
        "Don hang ban",
        "",
    ]


class ExtractionRulesTest(unittest.TestCase):
    def extract(self, rows: list[list], company: str) -> tuple[list[dict], dict]:
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / f"BCDonHangBanTrongKyNPP_{company}_T7_2026.xlsm"
            write_source(path, rows)
            return extract_file(path, company, 7, 2026)

    def test_vikoda_loai_khach_hang_vkd3(self) -> None:
        rows, audit = self.extract(
            [source_row(customer="VKD3"), source_row(customer="kh-002")],
            "Vikoda",
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(audit["excluded_customer_vkd3"], 1)

    def test_vkd_khong_loai_vkd3(self) -> None:
        rows, audit = self.extract([source_row(customer="VKD3")], "VKD")
        self.assertEqual(len(rows), 1)
        self.assertEqual(audit["excluded_customer_vkd3"], 0)

    def test_chi_giu_ma_san_pham_bat_dau_1_hoac_2(self) -> None:
        rows, audit = self.extract(
            [
                source_row(product="130100001"),
                source_row(product="230100001"),
                source_row(product="330100001"),
                source_row(product=""),
            ],
            "Vikoda",
        )
        self.assertEqual(len(rows), 2)
        self.assertEqual(audit["excluded_product_prefix"], 2)

    def test_vkd_doi_ky_tu_dau_2_thanh_1(self) -> None:
        rows, audit = self.extract([source_row(product="230100001")], "VKD")
        self.assertEqual(rows[0]["MaSanPhamMoi"], "130100001")
        self.assertEqual(audit["transformed_product_prefix"], 1)

    def test_vikoda_giu_nguyen_ma_bat_dau_2(self) -> None:
        rows, audit = self.extract([source_row(product="230100001")], "Vikoda")
        self.assertEqual(rows[0]["MaSanPhamMoi"], "230100001")
        self.assertEqual(audit["transformed_product_prefix"], 0)

    def test_thang_nam_lay_tu_ten_file(self) -> None:
        rows, _ = self.extract(
            [source_row(invoice_date=date(2025, 1, 5))],
            "Vikoda",
        )
        self.assertEqual((rows[0]["Thang"], rows[0]["Nam"]), (7, 2026))

    def test_ngay_hoa_don_tra_ve_kieu_date(self) -> None:
        """Luồng chuyển giao ghi thẳng giá trị này vào Excel."""
        rows, _ = self.extract([source_row()], "Vikoda")
        self.assertIsInstance(rows[0]["NgayHoaDon"], date)


class InvoiceDateContractTest(unittest.TestCase):
    def test_iso_invoice_date(self) -> None:
        self.assertEqual(iso_invoice_date(date(2026, 7, 10)), "2026-07-10")
        self.assertIsNone(iso_invoice_date(None))

    def test_date_counts_trong_incremental_la_chuoi_iso(self) -> None:
        """Khóa `date_counts` phải là chuỗi ISO để so khớp với output và ghi
        được vào incremental_state.json."""
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "BCDonHangBanTrongKyNPP_VKD_T7_2026.xlsm"
            write_source(path, [source_row(invoice_date=date(2026, 7, 10))])
            scan = scan_source_file(
                path,
                {"file": path.name, "company": "VKD", "month": 7, "year": 2026},
            )
        for key in scan["date_counts"]:
            self.assertIsInstance(key, str)
        self.assertIn("2026-07-10", scan["date_counts"])

    def test_sort_key_xep_dong_thieu_ngay_len_dau(self) -> None:
        rows = [
            {"NgayHoaDon": date(2026, 7, 2), "MaKhachHangMoi": "A", "MaSanPhamMoi": "1"},
            {"NgayHoaDon": None, "MaKhachHangMoi": "B", "MaSanPhamMoi": "1"},
            {"NgayHoaDon": date(2026, 7, 1), "MaKhachHangMoi": "A", "MaSanPhamMoi": "1"},
        ]
        rows.sort(key=sort_key)
        self.assertEqual(
            [row["NgayHoaDon"] for row in rows],
            [None, date(2026, 7, 1), date(2026, 7, 2)],
        )


class SourceNameTest(unittest.TestCase):
    def test_doc_cong_ty_thang_nam(self) -> None:
        self.assertEqual(
            parse_source_name("BCDonHangBanTrongKyNPP_Vikoda_T7_2026.xlsm"),
            ("Vikoda", 7, 2026),
        )
        self.assertEqual(
            parse_source_name("BCDonHangBanTrongKyNPP_VKD_T12_2025.xlsx"),
            ("VKD", 12, 2025),
        )

    def test_vkoda_viet_thieu_van_nhan_dien(self) -> None:
        self.assertEqual(
            parse_source_name("BCDonHangBanTrongKyNPP_Vkoda_T1_2026.xlsm"),
            ("Vikoda", 1, 2026),
        )

    def test_thang_ngoai_khoang_bi_bo(self) -> None:
        self.assertIsNone(
            parse_source_name("BCDonHangBanTrongKyNPP_VKD_T13_2026.xlsm")
        )

    def test_ten_khong_khop_bi_bo(self) -> None:
        self.assertIsNone(parse_source_name("Bao cao khac.xlsx"))

    def test_bo_file_tam_cua_excel(self) -> None:
        self.assertFalse(
            is_candidate_source(Path("~$BCDonHangBanTrongKyNPP_VKD_T7_2026.xlsm"))
        )
        self.assertFalse(is_candidate_source(Path("ghi chu.txt")))
        self.assertTrue(
            is_candidate_source(Path("BCDonHangBanTrongKyNPP_VKD_T7_2026.xlsm"))
        )


class CleanIdTest(unittest.TestCase):
    def test_khong_sinh_duoi_chan_thap_phan(self) -> None:
        self.assertEqual(clean_id(130100001.0), "130100001")
        self.assertEqual(clean_id(130100001), "130100001")
        self.assertEqual(clean_id(" 130100001 "), "130100001")
        self.assertEqual(clean_id(None), "")


if __name__ == "__main__":
    unittest.main()
