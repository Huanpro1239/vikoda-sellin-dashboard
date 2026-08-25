from __future__ import annotations

import sys
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
COMMON_DIR = PROJECT_ROOT / "code/common"
SELLIN_DIR = PROJECT_ROOT / "code/Skill/sell-in-monthly/scripts"
for folder in (COMMON_DIR, SELLIN_DIR):
    if str(folder) not in sys.path:
        sys.path.insert(0, str(folder))

import sharepoint_change_detector_v2 as detector


class SharePointChangeDetectorV2Tests(unittest.TestCase):
    def test_legacy_state_without_files_uses_incremental_baseline_reconciliation(self) -> None:
        current = [{"path": "Vikoda_Sales_Data/Data ERP/ERP_Vikoda_T8_2026.xlsx", "size": 10}]
        self.assertEqual([], detector.changed_manifest_paths({"fingerprint": "x"}, current))

    def test_manifest_diff_detects_added_removed_and_metadata_changes(self) -> None:
        previous = {
            "files": [
                {"path": "root/a.xlsx", "size": 10, "lastModifiedDateTime": "1", "eTag": "a", "cTag": "a"},
                {"path": "root/b.xlsx", "size": 20, "lastModifiedDateTime": "1", "eTag": "b", "cTag": "b"},
            ]
        }
        current = [
            {"path": "root/a.xlsx", "size": 11, "lastModifiedDateTime": "2", "eTag": "a2", "cTag": "a2"},
            {"path": "root/c.xlsx", "size": 30, "lastModifiedDateTime": "1", "eTag": "c", "cTag": "c"},
        ]
        self.assertEqual(
            ["root/a.xlsx", "root/b.xlsx", "root/c.xlsx"],
            detector.changed_manifest_paths(previous, current),
        )

    def test_erp_periods_are_derived_from_changed_erp_filenames_only(self) -> None:
        paths = [
            "Vikoda_Sales_Data/Data ERP/Sell_Vikoda_T8_2026.xlsx",
            "Vikoda_Sales_Data/Data ERP/Sell_VKD_T08_2026.xlsm",
            "Vikoda_Sales_Data/Data ERP/Sell_Vikoda_T7_2026.xlsx",
            "Vikoda_Sales_Data/Target/Target_Vikoda_T8_2026.xlsx",
            "Vikoda_Sales_Data/Data ERP/readme.xlsx",
        ]
        self.assertEqual(["2026-07", "2026-08"], detector.erp_periods_from_paths(paths))


if __name__ == "__main__":
    unittest.main()
