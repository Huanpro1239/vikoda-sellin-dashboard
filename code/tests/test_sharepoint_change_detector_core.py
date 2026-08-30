from __future__ import annotations

import sys
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
COMMON_DIR = PROJECT_ROOT / "code/common"
if str(COMMON_DIR) not in sys.path:
    sys.path.insert(0, str(COMMON_DIR))

import sharepoint_change_detector_core as core


class SharePointChangeDetectorCoreTests(unittest.TestCase):
    def test_workbook_filter_ignores_temp_and_non_excel_files(self) -> None:
        self.assertTrue(core.is_relevant_workbook("ERP.xlsx"))
        self.assertTrue(core.is_relevant_workbook("ERP.XLSM"))
        self.assertFalse(core.is_relevant_workbook("~$ERP.xlsx"))
        self.assertFalse(core.is_relevant_workbook("README.md"))
        self.assertFalse(core.is_relevant_workbook(""))

    def test_fingerprint_is_deterministic_and_order_independent(self) -> None:
        first = {
            "path": "root/b.xlsx",
            "size": 20,
            "lastModifiedDateTime": "2026-08-30T01:00:00Z",
            "eTag": "b",
            "cTag": "b",
        }
        second = {
            "path": "root/a.xlsx",
            "size": 10,
            "lastModifiedDateTime": "2026-08-30T00:00:00Z",
            "eTag": "a",
            "cTag": "a",
        }
        self.assertEqual(
            core.compute_fingerprint([first, second]),
            core.compute_fingerprint([second, first]),
        )

    def test_detect_change_covers_first_run_force_and_matching_state(self) -> None:
        fingerprint = "a" * 64
        self.assertEqual((True, "manual-force"), core.detect_change({}, fingerprint, force=True))
        self.assertEqual((True, "state-missing"), core.detect_change(None, fingerprint))
        self.assertEqual(
            (True, "state-invalid"),
            core.detect_change({"version": 1}, fingerprint),
        )
        self.assertEqual(
            (True, "source-fingerprint-changed"),
            core.detect_change({"fingerprint": "b" * 64}, fingerprint),
        )
        self.assertEqual(
            (False, "no-source-change"),
            core.detect_change({"fingerprint": fingerprint}, fingerprint),
        )

    def test_build_state_records_github_run_identity(self) -> None:
        state = core.build_state(
            "f" * 64,
            file_count=7,
            env={
                "GITHUB_RUN_ID": "123",
                "GITHUB_RUN_ATTEMPT": "2",
                "GITHUB_SHA": "abc123",
            },
        )
        self.assertEqual(1, state["version"])
        self.assertEqual("f" * 64, state["fingerprint"])
        self.assertEqual(7, state["file_count"])
        self.assertEqual("123", state["github_run_id"])
        self.assertEqual("2", state["github_run_attempt"])
        self.assertEqual("abc123", state["github_sha"])
        self.assertIn("committed_at", state)


if __name__ == "__main__":
    unittest.main()
