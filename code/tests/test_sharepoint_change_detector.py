from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
COMMON_DIR = PROJECT_ROOT / "code/common"
if str(COMMON_DIR) not in sys.path:
    sys.path.insert(0, str(COMMON_DIR))

import sharepoint_change_detector as detector


class SharePointChangeDetectorTests(unittest.TestCase):
    def test_fingerprint_is_order_independent(self) -> None:
        rows = [
            {"path": "A/b.xlsx", "size": 12, "lastModifiedDateTime": "2026-01-01", "eTag": "2", "cTag": "b"},
            {"path": "A/a.xlsx", "size": 10, "lastModifiedDateTime": "2026-01-01", "eTag": "1", "cTag": "a"},
        ]
        self.assertEqual(detector.compute_fingerprint(rows), detector.compute_fingerprint(reversed(rows)))

    def test_fingerprint_changes_when_graph_metadata_changes(self) -> None:
        base = [{"path": "A/a.xlsx", "size": 10, "lastModifiedDateTime": "2026-01-01", "eTag": "1", "cTag": "a"}]
        changed = [{"path": "A/a.xlsx", "size": 11, "lastModifiedDateTime": "2026-01-02", "eTag": "2", "cTag": "b"}]
        self.assertNotEqual(detector.compute_fingerprint(base), detector.compute_fingerprint(changed))

    def test_missing_state_and_force_require_refresh(self) -> None:
        fingerprint = "a" * 64
        self.assertEqual((True, "state-missing"), detector.detect_change(None, fingerprint))
        self.assertEqual((True, "manual-force"), detector.detect_change({"fingerprint": fingerprint}, fingerprint, force=True))

    def test_matching_state_skips_refresh(self) -> None:
        fingerprint = "b" * 64
        self.assertEqual((False, "no-source-change"), detector.detect_change({"fingerprint": fingerprint}, fingerprint))

    def test_office_lock_files_are_ignored(self) -> None:
        self.assertFalse(detector.is_relevant_workbook("~$Target.xlsx"))
        self.assertFalse(detector.is_relevant_workbook("readme.txt"))
        self.assertTrue(detector.is_relevant_workbook("Target.xlsx"))
        self.assertTrue(detector.is_relevant_workbook("ERP.xlsm"))

    def test_github_output_is_machine_readable(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "github-output.txt"
            detector._write_github_output(
                {"changed": "true", "fingerprint": "c" * 64, "file_count": 4, "reason": "test"},
                {"GITHUB_OUTPUT": str(output)},
            )
            text = output.read_text(encoding="utf-8")
        self.assertIn("changed=true\n", text)
        self.assertIn("file_count=4\n", text)


if __name__ == "__main__":
    unittest.main()
