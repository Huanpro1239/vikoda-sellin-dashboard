"""Khóa hợp đồng của CSV gộp làm nguồn Looker.

Looker Studio phụ thuộc chặt vào hình dạng file: tên cột, kiểu ngày, số thuần và
mã hoá. Test ở đây khoá đúng những điểm đó để lần sửa sau không âm thầm làm vỡ
báo cáo đang chạy.
"""

from __future__ import annotations

import csv
import json
import subprocess
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

from build_looker_dataset import LOOKER_COLUMNS, discover_workbooks  # noqa: E402
from extraction import OUTPUT_COLUMNS  # noqa: E402
from workbook_builder import write_monthly_workbook  # noqa: E402

SCRIPT_PATH = SCRIPT_DIR / "build_looker_dataset.py"


def make_rows(month: int, year: int, count: int = 2) -> list[dict]:
    return [
        {
            "Vung": "MT",
            "KhuVuc": "MT",
            "NgayHoaDon": date(year, month, index + 1),
            "MaKhachHangMoi": f"B-HCMC-{index:04d}",
            "TenKhachHang": "SIEU THI FAMILY",
            "MaSanPhamMoi": "130100011",
            "TenSanPham": "Đảnh Thạnh có gas hương chanh 430ml",
            "SoLuong": 240,
            "DonGia": 7622,
            "ThanhTien": 240 * 7622,
            "LoaiDonHang": "Đơn hàng bán",
            "GhiChu": "Xuất bán theo L0000007433",
            "Thang": month,
            "Nam": year,
        }
        for index in range(count)
    ]


class LookerDatasetTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp = tempfile.TemporaryDirectory()
        self.root = Path(self._temp.name)
        self.output_dir = self.root / "output"
        self.output_dir.mkdir()
        self.csv_file = self.root / "looker" / "Sell in tong hop.csv"
        self.report_file = self.root / "looker_report.json"
        self.addCleanup(self._temp.cleanup)

    def write_month(self, month: int, year: int, count: int = 2) -> None:
        write_monthly_workbook(
            rows=make_rows(month, year, count),
            output_dir=self.output_dir,
            month=month,
            year=year,
        )

    def run_build(self) -> subprocess.CompletedProcess:
        return subprocess.run(
            [
                sys.executable,
                str(SCRIPT_PATH),
                "--output-dir",
                str(self.output_dir),
                "--csv-file",
                str(self.csv_file),
                "--report-file",
                str(self.report_file),
            ],
            capture_output=True,
            text=True,
        )

    def test_columns_are_kybaocao_then_output_columns(self) -> None:
        self.assertEqual(LOOKER_COLUMNS, ["KyBaoCao"] + OUTPUT_COLUMNS)

    def test_discover_sorts_by_period_and_ignores_other_files(self) -> None:
        self.write_month(7, 2026)
        self.write_month(1, 2025)
        self.write_month(12, 2025)
        (self.output_dir / "Ghi chu.xlsx").write_bytes(b"not a workbook")
        (self.output_dir / "~$Sell in T07_2026.xlsx").write_bytes(b"lock file")

        found = [(year, month) for year, month, _ in
                 discover_workbooks(self.output_dir)]
        self.assertEqual(found, [(2025, 1), (2025, 12), (2026, 7)])

    def test_concatenates_every_month_with_period_key(self) -> None:
        self.write_month(1, 2025, count=2)
        self.write_month(7, 2026, count=3)

        result = self.run_build()
        self.assertEqual(result.returncode, 0, result.stderr)

        raw = self.csv_file.read_bytes()
        # Khong duoc co BOM: Looker se dinh ky tu la vao ten cot dau tien.
        self.assertFalse(raw.startswith(b"\xef\xbb\xbf"))

        with self.csv_file.open(encoding="utf-8", newline="") as handle:
            rows = list(csv.DictReader(handle))

        self.assertEqual(list(rows[0].keys()), LOOKER_COLUMNS)
        self.assertEqual(len(rows), 5)
        self.assertEqual([row["KyBaoCao"] for row in rows][:2], ["2025-01"] * 2)
        self.assertEqual([row["KyBaoCao"] for row in rows][2:], ["2026-07"] * 3)
        # KyBaoCao phai khop cap Thang/Nam san co trong workbook.
        for row in rows:
            self.assertEqual(
                row["KyBaoCao"],
                f"{int(row['Nam']):04d}-{int(row['Thang']):02d}",
            )

    def test_date_is_iso_and_numbers_are_plain(self) -> None:
        self.write_month(1, 2025, count=1)

        result = self.run_build()
        self.assertEqual(result.returncode, 0, result.stderr)

        with self.csv_file.open(encoding="utf-8", newline="") as handle:
            row = next(csv.DictReader(handle))

        self.assertEqual(row["NgayHoaDon"], "2025-01-01")
        self.assertEqual(row["SoLuong"], "240")
        self.assertEqual(row["ThanhTien"], str(240 * 7622))
        self.assertEqual(row["TenSanPham"], "Đảnh Thạnh có gas hương chanh 430ml")

    def test_report_totals_match_csv(self) -> None:
        self.write_month(1, 2025, count=2)
        self.write_month(2, 2025, count=4)

        result = self.run_build()
        self.assertEqual(result.returncode, 0, result.stderr)

        report = json.loads(self.report_file.read_text(encoding="utf-8"))
        self.assertEqual(report["workbook_count"], 2)
        self.assertEqual(report["row_count"], 6)
        self.assertEqual(report["amount_total"], 6 * 240 * 7622)
        self.assertEqual(report["quantity_total"], 6 * 240)
        self.assertEqual(
            [period["period"] for period in report["periods"]],
            ["2025-01", "2025-02"],
        )

    def test_empty_output_dir_fails(self) -> None:
        result = self.run_build()
        self.assertNotEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main()
