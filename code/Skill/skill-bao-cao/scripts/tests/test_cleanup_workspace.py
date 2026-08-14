"""Test cho cleanup_workspace.py.

Trọng tâm là hàng rào bảo vệ: script này xóa file thật, nên phần phải chắc chắn
nhất không phải "xóa đúng rác" mà là "không bao giờ đụng dữ liệu nguồn".
"""

from __future__ import annotations

import contextlib
import io
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent.parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import cleanup_workspace  # noqa: E402


def write(path: Path, content: str = "noi dung") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path


class CleanupWorkspaceTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp = tempfile.TemporaryDirectory()
        self.root = Path(self._temp.name)
        self.addCleanup(self._temp.cleanup)
        self.build_project()

    def build_project(self) -> None:
        root = self.root

        # Rác
        write(root / "Data/Work/bao_cao/powerbi_sandbox_20260729/Data/FactSellIn.csv")
        write(root / "Data/Work/bao_cao/powerbi_issue.png")
        write(root / "Data/Work/bao_cao/powerbi_redesign.png")
        write(root / "code/Skill/skill-bao-cao/scripts/__pycache__/build.cpython-312.pyc")
        write(root / "code/Skill/skill-bao-cao/scripts/__pycache__/mo_coi.cpython-312.pyc")
        write(root / "Data/Target/~$Target sellin 2026.xlsx")
        write(root / "Data/File bao cao/PowerBI/Vikoda_SellIn_PowerBI.pbix")
        (root / "Data/File bao cao/Power bi").mkdir(parents=True, exist_ok=True)

        # Dữ liệu và mã nguồn phải còn nguyên
        write(root / "Data/Logs/Tach data logs/incremental_state.json", '{"mốc": 1}')
        write(root / "Data/Work/sell_in/new_customers/Khach hang moi T07_2026.xlsx")
        write(root / "Data/Data ERP/BCDonHangBanTrongKyNPP_VKD_T7_2026.xlsm")
        write(root / "Data/Target/Target sellin 2026.xlsx")
        write(root / "Data/out put/Sell in hang  thang/Sell in T07_2026.xlsx")
        write(root / "Data/File bao cao/PowerBI/Data/FactSellIn.csv")
        write(root / "Data/Work/bao_cao/data/staging/sell_in_data.json")
        write(root / "code/Skill/skill-bao-cao/scripts/build_powerbi_package.py")
        write(root / "Chay CT/drive.conf", "folder_id = ABC\nremote = vikoda-drive\n")
        write(root / "Data/Work/sell_in/staging/audit.json", "{}")

        # Rác tái tạo được nhưng lại có đuôi .csv/.json: chỉ xóa được nhờ cờ
        # allow_data_suffix, nên phải có mẫu để khóa đúng ranh giới đó.
        write(root / "Data/Work/sell_in/looker/Sell in tong hop.csv", "KyBaoCao\n")
        write(root / "Data/Work/sell_in/staging/sell_in_2026_07.json", "[]")
        write(root / "Data/Work/sell_in/previews/Sell_in_T07_2026.png")
        write(root / "Data/Work/sell_in/verification/looker_report.json", "{}")
        write(
            root / "Data/Work/sell_in/verification/verification_report_canonical.json",
            "{}",
        )

    def paths_of(self, report) -> set[str]:
        return {item.path.relative_to(self.root).as_posix() for item in report.candidates}

    def run_main(self, *args: str) -> int:
        """Gọi main() nhưng nuốt stdout, tránh báo cáo lấn át ket qua test."""
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            return cleanup_workspace.main(list(args))

    # --- Hàng rào bảo vệ -------------------------------------------------

    def test_khong_bao_gio_dung_incremental_state(self) -> None:
        report = cleanup_workspace.collect(self.root)
        self.assertNotIn("Data/Logs/Tach data logs/incremental_state.json", self.paths_of(report))

    def test_khong_bao_gio_dung_new_customers(self) -> None:
        report = cleanup_workspace.collect(self.root)
        for path in self.paths_of(report):
            self.assertNotIn("new_customers", path)

    def test_khong_dung_du_lieu_nguon(self) -> None:
        report = cleanup_workspace.collect(self.root)
        selected = self.paths_of(report)
        for protected in (
            "Data/Data ERP/BCDonHangBanTrongKyNPP_VKD_T7_2026.xlsm",
            "Data/Target/Target sellin 2026.xlsx",
            "Data/out put/Sell in hang  thang/Sell in T07_2026.xlsx",
            "Data/File bao cao/PowerBI/Data/FactSellIn.csv",
            "Data/Work/bao_cao/data/staging/sell_in_data.json",
            "code/Skill/skill-bao-cao/scripts/build_powerbi_package.py",
        ):
            self.assertNotIn(protected, selected, f"Khong duoc chon xoa {protected}")

    def test_file_tam_excel_trong_vung_bao_ve_bi_tu_choi(self) -> None:
        """`~$...` nằm trong Data/Target: hàng rào thắng, dù quy tắc có khớp."""
        report = cleanup_workspace.collect(self.root)
        self.assertNotIn("Data/Target/~$Target sellin 2026.xlsx", self.paths_of(report))
        self.assertTrue(any("~$" in str(path) for path, _ in report.refused))

    # --- Chọn đúng rác ---------------------------------------------------

    def test_chon_dung_cac_nhom_rac(self) -> None:
        selected = self.paths_of(cleanup_workspace.collect(self.root))
        for junk in (
            "Data/Work/bao_cao/powerbi_sandbox_20260729",
            "Data/Work/bao_cao/powerbi_issue.png",
            "code/Skill/skill-bao-cao/scripts/__pycache__",
            "Data/File bao cao/PowerBI/Vikoda_SellIn_PowerBI.pbix",
            "Data/File bao cao/Power bi",
        ):
            self.assertIn(junk, selected)

    def test_chon_rac_tai_tao_duoc_co_duoi_du_lieu(self) -> None:
        """Cờ `allow_data_suffix` phải mở đúng các mục đã khai báo."""
        selected = self.paths_of(cleanup_workspace.collect(self.root))
        for junk in (
            "Data/Work/sell_in/looker/Sell in tong hop.csv",
            "Data/Work/sell_in/staging/sell_in_2026_07.json",
            "Data/Work/sell_in/previews/Sell_in_T07_2026.png",
            "Data/Work/sell_in/verification/looker_report.json",
            "Data/Work/sell_in/verification/verification_report_canonical.json",
        ):
            self.assertIn(junk, selected)

    def test_co_allow_data_suffix_khong_lam_ro_ri_sang_cho_khac(self) -> None:
        """Mở cờ cho vài mẫu không được kéo theo file dữ liệu lân cận.

        `audit.json` nằm cùng thư mục staging nhưng `verify_outputs.py` còn đọc;
        staging của pipeline báo cáo là đầu vào thật, không phải rác.
        """
        selected = self.paths_of(cleanup_workspace.collect(self.root))
        for protected in (
            "Data/Work/sell_in/staging/audit.json",
            "Data/Work/bao_cao/data/staging/sell_in_data.json",
        ):
            self.assertNotIn(protected, selected)

    def test_khong_dung_cau_hinh_dich_drive(self) -> None:
        """Xóa drive.conf thì lần chạy sau tải file lên sai thư mục Drive."""
        report = cleanup_workspace.collect(self.root)
        self.assertNotIn("Chay CT/drive.conf", self.paths_of(report))

    def test_khong_liet_ke_file_nam_trong_thu_muc_da_chon(self) -> None:
        """.pyc bên trong __pycache__ đã chọn thì không được đếm lần nữa."""
        selected = self.paths_of(cleanup_workspace.collect(self.root))
        self.assertIn("code/Skill/skill-bao-cao/scripts/__pycache__", selected)
        for path in selected:
            self.assertFalse(
                path.endswith(".pyc"),
                f"{path} da nam trong __pycache__ duoc chon, khong nen liet ke rieng",
            )

    # --- Hành vi chạy thử / xóa thật -------------------------------------

    def test_chay_thu_khong_xoa_gi(self) -> None:
        exit_code = self.run_main("--project-root", str(self.root))
        self.assertEqual(exit_code, 0)
        self.assertTrue((self.root / "Data/Work/bao_cao/powerbi_issue.png").exists())
        self.assertTrue((self.root / "Data/Work/bao_cao/powerbi_sandbox_20260729").is_dir())

    def test_confirm_xoa_rac_va_giu_du_lieu(self) -> None:
        exit_code = self.run_main("--project-root", str(self.root), "--confirm")
        self.assertEqual(exit_code, 0)

        self.assertFalse((self.root / "Data/Work/bao_cao/powerbi_sandbox_20260729").exists())
        self.assertFalse((self.root / "Data/Work/bao_cao/powerbi_issue.png").exists())
        self.assertFalse((self.root / "code/Skill/skill-bao-cao/scripts/__pycache__").exists())
        self.assertFalse(
            (self.root / "Data/File bao cao/PowerBI/Vikoda_SellIn_PowerBI.pbix").exists()
        )
        self.assertFalse((self.root / "Data/File bao cao/Power bi").exists())

        self.assertTrue((self.root / "Data/Logs/Tach data logs/incremental_state.json").exists())
        self.assertTrue(
            (self.root / "Data/Work/sell_in/new_customers/Khach hang moi T07_2026.xlsx").exists()
        )
        self.assertTrue((self.root / "Data/Data ERP/BCDonHangBanTrongKyNPP_VKD_T7_2026.xlsm").exists())
        self.assertTrue((self.root / "Data/File bao cao/PowerBI/Data/FactSellIn.csv").exists())
        self.assertTrue((self.root / "Data/Work/bao_cao/data/staging/sell_in_data.json").exists())
        self.assertTrue(
            (self.root / "code/Skill/skill-bao-cao/scripts/build_powerbi_package.py").exists()
        )

    def test_chay_hai_lan_van_an_toan(self) -> None:
        self.run_main("--project-root", str(self.root), "--confirm")
        self.assertEqual(self.run_main("--project-root", str(self.root), "--confirm"), 0)

    def test_tu_choi_thu_muc_khong_phai_du_an(self) -> None:
        """Chạy nhầm chỗ thì phải dừng, không được quét bừa."""
        with tempfile.TemporaryDirectory() as other:
            (Path(other) / "linh tinh").mkdir()
            self.assertEqual(self.run_main("--project-root", other), 2)


if __name__ == "__main__":
    unittest.main()
