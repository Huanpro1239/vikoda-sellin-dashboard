"""Khóa quy tắc lọc và phạm vi kỳ của sheet `Data` trong báo cáo Sell In.

Bộ lọc `LoaiDonHang` quyết định doanh thu vào báo cáo. Lọt một loại chứng từ
khác vào là toàn bộ Actual, YoY và MoM đều sai mà nhìn PIVOT không thấy.
"""

from __future__ import annotations

import sys
import unittest
from datetime import date, datetime
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_DIR))
sys.path.insert(0, str(SCRIPT_DIR / "vendor"))

from extract_sell_in_data import (  # noqa: E402
    COLUMNS,
    FILE_PATTERN,
    date_value,
    derive_as_of,
    expected_periods,
    is_revenue_invoice_type,
    numeric_value,
    parse_as_of,
)


class InvoiceTypeFilterTest(unittest.TestCase):
    def test_giu_don_hang_ban_va_don_tra_hang(self) -> None:
        for value in ("Đơn hàng bán", "Đơn trả hàng"):
            self.assertTrue(is_revenue_invoice_type(value), value)

    def test_giu_ca_ten_nghiep_vu_tuong_duong(self) -> None:
        for value in ("Hóa đơn bán", "Hóa đơn trả hàng", "Nhập hóa đơn trả hàng"):
            self.assertTrue(is_revenue_invoice_type(value), value)

    def test_khong_phan_biet_dau_va_hoa_thuong(self) -> None:
        for value in ("DON HANG BAN", "don hang ban", "  Đơn  hàng   bán  "):
            self.assertTrue(is_revenue_invoice_type(value), value)

    def test_loai_moi_chung_tu_khac(self) -> None:
        for value in (
            "Phiếu xuất kho",
            "Đơn đặt hàng",
            "Hóa đơn dịch vụ",
            "Xuất hàng khuyến mãi",
            "",
            None,
        ):
            self.assertFalse(is_revenue_invoice_type(value), repr(value))


class NumericValueTest(unittest.TestCase):
    def test_o_trong_thanh_khong(self) -> None:
        self.assertEqual(numeric_value(None, field="ThanhTien", location="A1"), 0)
        self.assertEqual(numeric_value("", field="ThanhTien", location="A1"), 0)

    def test_boolean_bi_chan(self) -> None:
        with self.assertRaises(ValueError):
            numeric_value(True, field="SoLuong", location="A1")

    def test_cong_thuc_bi_chan(self) -> None:
        with self.assertRaises(ValueError):
            numeric_value("=SUM(A1:A2)", field="ThanhTien", location="A1")

    def test_chuoi_khong_phai_so_bi_chan(self) -> None:
        with self.assertRaises(ValueError):
            numeric_value("khong co", field="ThanhTien", location="A1")

    def test_so_nguyen_giu_kieu_int(self) -> None:
        self.assertIsInstance(
            numeric_value("240", field="SoLuong", location="A1"), int
        )

    def test_so_le_giu_kieu_float(self) -> None:
        self.assertEqual(
            numeric_value("1.92", field="SoLuong", location="A1"), 1.92
        )


class DateValueTest(unittest.TestCase):
    def test_nhan_ngay_excel_that(self) -> None:
        self.assertEqual(
            date_value(date(2026, 7, 10), location="C2"), "2026-07-10"
        )
        self.assertEqual(
            date_value(datetime(2026, 7, 10, 8, 30), location="C2"), "2026-07-10"
        )

    def test_chan_ngay_dang_chu(self) -> None:
        """Ngày lưu dạng chữ là lỗi nguồn, không được im lặng bỏ qua."""
        with self.assertRaises(ValueError):
            date_value("10/07/2026", location="C2")


class PeriodScopeTest(unittest.TestCase):
    def test_lay_tu_dau_nam_den_thang_hien_tai_va_cung_ky(self) -> None:
        periods = expected_periods(date(2026, 7, 27))
        self.assertEqual(len(periods), 14)
        self.assertEqual(periods[0], (2025, 1))
        self.assertEqual(periods[6], (2025, 7))
        self.assertEqual(periods[7], (2026, 1))
        self.assertEqual(periods[-1], (2026, 7))

    def test_thang_1_chi_co_hai_ky(self) -> None:
        periods = expected_periods(date(2026, 1, 5))
        self.assertEqual(periods, [(2025, 1), (2026, 1)])

    def test_parse_as_of(self) -> None:
        self.assertEqual(parse_as_of("2026-07-27"), date(2026, 7, 27))
        self.assertIsNone(parse_as_of(None))

    def test_derive_as_of_with_explicit_date(self) -> None:
        self.assertEqual(
            derive_as_of(Path("non_existent"), date(2026, 7, 27)),
            date(2026, 7, 27),
        )

    def test_derive_as_of_from_workbooks_on_month_rollover(self) -> None:
        import tempfile
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            for m in range(1, 9):
                (temp_path / f"Sell in T{m:02d}_2026.xlsx").touch()
            # Month 8 is latest available; should derive last day of August 2026
            derived = derive_as_of(temp_path)
            self.assertEqual(derived, date(2026, 8, 31))


class FileNameTest(unittest.TestCase):
    def test_nhan_dien_ten_file_sell_in(self) -> None:
        match = FILE_PATTERN.match("Sell in T07_2026.xlsx")
        self.assertIsNotNone(match)
        self.assertEqual((int(match.group(1)), int(match.group(2))), (7, 2026))

    def test_bo_ten_file_khac(self) -> None:
        for name in (
            "Sell in T07_2026.xlsm",
            "Bao_Cao_Sell_in.xlsx",
            "~$Sell in T07_2026.xlsx",
        ):
            self.assertIsNone(FILE_PATTERN.match(name), name)


class ColumnTest(unittest.TestCase):
    def test_du_14_cot_dung_thu_tu(self) -> None:
        self.assertEqual(len(COLUMNS), 14)
        self.assertEqual(COLUMNS[2], "NgayHoaDon")
        self.assertEqual(COLUMNS[10], "LoaiDonHang")


if __name__ == "__main__":
    unittest.main()
