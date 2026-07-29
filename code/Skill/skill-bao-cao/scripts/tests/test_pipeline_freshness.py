"""Test cho pipeline_freshness.py — logic quyết định chặng nào phải chạy lại."""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent.parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import pipeline_freshness  # noqa: E402


BASE_TIME = 1_700_000_000.0
STEP = 3600.0


def touch(path: Path, offset_steps: float, content: str = "x") -> Path:
    """Tạo file với mốc thời gian xác định, tính theo bội số của STEP."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    stamp = BASE_TIME + offset_steps * STEP
    os.utime(path, (stamp, stamp))
    return path


class PipelineFreshnessTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp = tempfile.TemporaryDirectory()
        self.root = Path(self._temp.name)
        self.addCleanup(self._temp.cleanup)

    def build_tree(
        self,
        erp_offset: float = 0,
        monthly_offset: float = 1,
        staging_offset: float = 2,
        excel_offset: float = 3,
        powerbi_offset: float = 3,
        reference_offset: float = 0,
    ) -> None:
        """Dựng một cây thư mục tối thiểu nhưng đúng hình dạng dự án thật."""
        root = self.root
        for name in ("Vikoda", "VKD"):
            touch(root / "Data" / "Data ERP" / f"BCDonHangBanTrongKyNPP_{name}_T7_2026.xlsm", erp_offset)
            # Kỳ T06 đã chốt từ lâu: cả ERP lẫn workbook đều mang mốc rất cũ.
            touch(root / "Data" / "Data ERP" / f"BCDonHangBanTrongKyNPP_{name}_T6_2026.xlsm", erp_offset - 51)

        monthly = root / "Data" / "out put" / "Sell in hang  thang"
        touch(monthly / "Sell in T07_2026.xlsx", monthly_offset)
        # Workbook T06 cũ hơn workbook T07 rất nhiều. Tách data chạy tăng dần
        # nên đây là trạng thái bình thường, không được coi là "cũ".
        touch(monthly / "Sell in T06_2026.xlsx", monthly_offset - 50)

        touch(root / "Data" / "Target" / "Target sellin 2026.xlsx", reference_offset)
        touch(root / "Data" / "Danh muc KH" / "Thong tin khach hang.xlsx", reference_offset)
        touch(root / "Data" / "Danh muc SP" / "Danh Muc San Pham.xlsx", reference_offset)

        work = root / "Data" / "Work" / "bao_cao"
        touch(work / "data" / "staging" / "sell_in_data.json", staging_offset)
        touch(work / "target" / "staging" / "target_records.json", staging_offset)
        touch(work / "dmkh" / "staging" / "dmkh_data.json", staging_offset)

        touch(root / "Data" / "File bao cao" / "Excel" / "Bao_Cao_Sell_in.xlsx", excel_offset)

        powerbi = root / "Data" / "File bao cao" / "PowerBI"
        for name in (
            "DimDate",
            "DimCustomer",
            "DimProduct",
            "DimTerritory",
            "FactSellIn",
            "FactTarget",
        ):
            touch(powerbi / "Data" / f"{name}.csv", powerbi_offset)
        touch(powerbi / "Vikoda_SellIn_PowerBI.pbip", powerbi_offset)
        touch(
            powerbi / "Vikoda_SellIn_PowerBI.SemanticModel" / "definition" / "model.tmdl",
            powerbi_offset,
        )

    def test_chuoi_dong_bo_thi_khong_can_chay_lai(self) -> None:
        self.build_tree()
        report = pipeline_freshness.build_report(self.root)
        self.assertTrue(report["up_to_date"], report["stale_stages"])
        self.assertEqual(report["stale_stages"], [])

    def test_ky_cu_co_moc_thoi_gian_cu_khong_bi_bao_nham(self) -> None:
        """Sell in T06 cũ hơn ERP T07 rất nhiều nhưng không phải là lỗi."""
        self.build_tree()
        report = pipeline_freshness.build_report(self.root)
        self.assertFalse(report["needs_tach_data"])
        self.assertEqual(report["stages"]["tach_data"]["stale_periods"], [])

    def test_erp_moi_hon_thi_can_tach_lai_dung_ky(self) -> None:
        self.build_tree()
        touch(
            self.root / "Data" / "Data ERP" / "BCDonHangBanTrongKyNPP_Vikoda_T7_2026.xlsm",
            10,
        )
        report = pipeline_freshness.build_report(self.root)
        self.assertTrue(report["needs_tach_data"])
        self.assertTrue(report["needs_staging"])
        self.assertTrue(report["needs_powerbi"])
        periods = [item["period"] for item in report["stages"]["tach_data"]["stale_periods"]]
        self.assertIn("T07/2026", periods)
        self.assertNotIn("T06/2026", periods)

    def test_erp_them_ky_moi_chua_co_workbook(self) -> None:
        self.build_tree()
        touch(
            self.root / "Data" / "Data ERP" / "BCDonHangBanTrongKyNPP_Vikoda_T8_2026.xlsm",
            1,
        )
        report = pipeline_freshness.build_report(self.root)
        self.assertTrue(report["needs_tach_data"])
        periods = [item["period"] for item in report["stages"]["tach_data"]["stale_periods"]]
        self.assertIn("T08/2026", periods)

    def test_target_moi_hon_chi_can_dung_lai_staging(self) -> None:
        self.build_tree()
        touch(self.root / "Data" / "Target" / "Target sellin 2026.xlsx", 10)
        report = pipeline_freshness.build_report(self.root)
        self.assertFalse(report["needs_tach_data"])
        self.assertTrue(report["needs_staging"])
        self.assertTrue(report["needs_powerbi"])

    def test_thieu_csv_thi_can_dung_lai_goi_power_bi(self) -> None:
        self.build_tree()
        (self.root / "Data" / "File bao cao" / "PowerBI" / "Data" / "FactSellIn.csv").unlink()
        report = pipeline_freshness.build_report(self.root)
        self.assertFalse(report["needs_staging"])
        self.assertTrue(report["needs_powerbi"])

    def test_staging_cu_keo_theo_ca_excel_va_power_bi(self) -> None:
        """Chặng sau phải chạy lại kể cả khi mốc riêng của nó còn mới."""
        self.build_tree(staging_offset=2, excel_offset=30, powerbi_offset=30)
        touch(
            self.root / "Data" / "out put" / "Sell in hang  thang" / "Sell in T07_2026.xlsx",
            20,
        )
        report = pipeline_freshness.build_report(self.root)
        self.assertTrue(report["needs_staging"])
        self.assertTrue(report["needs_excel"])
        self.assertTrue(report["needs_powerbi"])

    def test_bo_qua_file_tam_cua_excel(self) -> None:
        """File `~$...` sinh ra khi mở workbook không được tính là nguồn mới."""
        self.build_tree()
        touch(self.root / "Data" / "Target" / "~$Target sellin 2026.xlsx", 99)
        report = pipeline_freshness.build_report(self.root)
        self.assertTrue(report["up_to_date"], report["stale_stages"])

    def test_sai_so_nho_khong_bi_coi_la_cu(self) -> None:
        self.build_tree()
        target = self.root / "Data" / "Target" / "Target sellin 2026.xlsx"
        stamp = BASE_TIME + 2 * STEP + 1.0  # muộn hơn staging 1 giây
        os.utime(target, (stamp, stamp))
        report = pipeline_freshness.build_report(self.root)
        self.assertFalse(report["needs_staging"])


if __name__ == "__main__":
    unittest.main()
