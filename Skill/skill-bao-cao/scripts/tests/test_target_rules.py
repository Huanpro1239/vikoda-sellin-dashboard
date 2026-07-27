"""Khóa các quy tắc Target của báo cáo Sell In.

Phần dễ vỡ nhất của skill này là ánh xạ khách hàng vào Miền/Vùng và cách nhóm
MT/KA theo VBA Final V6. Sai một bước là số ra vẫn "đẹp" nhưng cộng nhầm vùng,
nên khóa lại bằng test thay vì chỉ soi mắt thường trên PIVOT.
"""

from __future__ import annotations

import sys
import unittest
from decimal import Decimal
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_DIR))
sys.path.insert(0, str(SCRIPT_DIR / "vendor"))

from extract_targets import (  # noqa: E402
    MONTHS,
    REPORTING_REGIONS,
    TARGET_SOURCE_POLICY,
    as_decimal,
    exact_period_value,
    millions_to_vnd,
    normalize_reporting_pair,
    normalized_key,
    parse_year_from_name,
    vnd_value,
)


class ReportingRegionTest(unittest.TestCase):
    def test_du_20_vung_ban_hang(self) -> None:
        pairs = set(REPORTING_REGIONS.values())
        self.assertEqual(len(pairs), 20)

    def test_b2c_khong_bao_gio_roi_vao_other(self) -> None:
        """SKILL.md: luôn ánh xạ mã hoặc tên B2C vào Miền/Vùng B2C."""
        self.assertEqual(normalize_reporting_pair("B2C", ""), ("B2C", "B2C"))
        self.assertEqual(normalize_reporting_pair("", "B2C"), ("B2C", "B2C"))
        self.assertEqual(normalize_reporting_pair("b2c", "b2c"), ("B2C", "B2C"))

    def test_dong_other_giu_nguyen_vung_other(self) -> None:
        self.assertEqual(normalize_reporting_pair("Other", ""), ("Other", "Other"))
        self.assertEqual(normalize_reporting_pair("XK", ""), ("Other", "Other"))

    def test_khong_nhan_dien_duoc_thi_ve_other(self) -> None:
        self.assertEqual(
            normalize_reporting_pair("Vùng lạ", "Khu vực lạ"),
            ("Other", "Other"),
        )

    def test_ka_duoc_tach_theo_mien(self) -> None:
        """KA + Miền Trung 1 phải thành vùng KA riêng, không lẫn vùng NPP."""
        self.assertEqual(
            normalize_reporting_pair("KA", "Miền Trung 1"),
            ("KA", "KA Miền Trung 1"),
        )
        self.assertEqual(
            normalize_reporting_pair("KA", "Miền Trung 2A"),
            ("KA", "KA Miền Trung 2"),
        )
        self.assertEqual(
            normalize_reporting_pair("KA", "Miền Bắc"),
            ("KA", "KA Miền Bắc"),
        )
        self.assertEqual(
            normalize_reporting_pair("KA", "Miền Nam"),
            ("KA", "KA Miền Nam"),
        )

    def test_npp_mien_trung_1_khong_bi_hut_sang_ka(self) -> None:
        self.assertEqual(
            normalize_reporting_pair("Miền Trung 1", "Miền Trung 1A"),
            ("Miền Trung 1", "Miền Trung 1A"),
        )

    def test_bo_dau_va_khoang_trang_thua(self) -> None:
        self.assertEqual(
            normalize_reporting_pair("", "  Hà   Nội "),
            ("Miền Bắc", "Hà Nội"),
        )
        self.assertEqual(
            normalize_reporting_pair("", "TP HCM 1"),
            ("Miền Nam", "TP. HCM 1"),
        )
        self.assertEqual(
            normalize_reporting_pair("", "TP. HCM 1"),
            ("Miền Nam", "TP. HCM 1"),
        )


class NormalizedKeyTest(unittest.TestCase):
    def test_bo_dau_tieng_viet_va_chuyen_hoa(self) -> None:
        self.assertEqual(normalized_key("Miền Đông"), "MIEN DONG")
        self.assertEqual(normalized_key("Đơn hàng bán"), "DON HANG BAN")

    def test_gop_khoang_trang_va_nbsp(self) -> None:
        self.assertEqual(normalized_key("  Hà  Nội  "), "HA NOI")

    def test_none_thanh_chuoi_rong(self) -> None:
        self.assertEqual(normalized_key(None), "")


class TargetValueTest(unittest.TestCase):
    def test_o_trong_la_khong(self) -> None:
        self.assertEqual(as_decimal(""), Decimal(0))
        self.assertEqual(as_decimal(None), Decimal(0))

    def test_o_trong_khi_bat_buoc_thi_bao_loi(self) -> None:
        with self.assertRaises(ValueError):
            vnd_value("")

    def test_loi_excel_bi_chan(self) -> None:
        for text in ("#REF!", "#DIV/0!", "#N/A"):
            with self.assertRaises(ValueError):
                as_decimal(text)

    def test_boolean_bi_chan(self) -> None:
        with self.assertRaises(ValueError):
            as_decimal(True)

    def test_chuoi_khong_phai_so_bi_chan(self) -> None:
        with self.assertRaises(ValueError):
            as_decimal("chua co so lieu")

    def test_doi_trieu_sang_vnd(self) -> None:
        self.assertEqual(millions_to_vnd(1), 1_000_000)
        self.assertEqual(millions_to_vnd("1,5"), 15_000_000)
        self.assertEqual(millions_to_vnd(0), 0)

    def test_lam_tron_nua_len(self) -> None:
        self.assertEqual(vnd_value(Decimal("0.5")), 1)
        self.assertEqual(vnd_value(Decimal("1.5")), 2)


class PeriodTest(unittest.TestCase):
    def test_du_12_thang(self) -> None:
        self.assertEqual(len(MONTHS), 12)
        self.assertEqual(MONTHS["JAN"], 1)
        self.assertEqual(MONTHS["DEC"], 12)

    def test_doc_nam_tu_ten_file(self) -> None:
        self.assertEqual(parse_year_from_name(Path("Target sellin 2026.xlsx")), 2026)
        self.assertEqual(parse_year_from_name(Path("Target MT KA.xlsx")), None)

    def test_ky_dang_yyyymm(self) -> None:
        self.assertEqual(exact_period_value("202607"), "202607")
        self.assertEqual(exact_period_value(202607), "202607")

    def test_ky_khong_hop_le_tra_none(self) -> None:
        self.assertIsNone(exact_period_value(""))
        self.assertIsNone(exact_period_value(None))
        self.assertIsNone(exact_period_value("thang 7"))


class PolicyTest(unittest.TestCase):
    def test_chinh_sach_hai_nguon_nam(self) -> None:
        self.assertEqual(TARGET_SOURCE_POLICY, "ANNUAL_TWO_SOURCE_VBA_MTKA")


if __name__ == "__main__":
    unittest.main()
