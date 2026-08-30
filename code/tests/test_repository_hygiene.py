"""Repository-level regression tests for architecture cleanup and documentation hygiene."""

from __future__ import annotations

import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]


class RepositoryHygieneTests(unittest.TestCase):
    def test_legacy_detector_is_replaced_by_core_and_v2_entrypoint(self) -> None:
        self.assertTrue((PROJECT_ROOT / "code/common/sharepoint_change_detector_core.py").is_file())
        self.assertTrue((PROJECT_ROOT / "code/common/sharepoint_change_detector_v2.py").is_file())
        self.assertFalse((PROJECT_ROOT / "code/common/sharepoint_change_detector.py").exists())

    def test_obsolete_local_sharepoint_watchers_are_removed(self) -> None:
        obsolete = (
            "code/Skill/skill-bao-cao/scripts/auto_watch_sharepoint.ps1",
            "Chay CT/Tu dong chay khi SharePoint cap nhat.cmd",
        )
        for relative in obsolete:
            with self.subTest(path=relative):
                self.assertFalse((PROJECT_ROOT / relative).exists())

    def test_event_driven_runbook_is_consolidated(self) -> None:
        self.assertFalse((PROJECT_ROOT / "HUONG_DAN_EVENT_DRIVEN_SHAREPOINT.md").exists())
        runbook = (PROJECT_ROOT / "HUONG_DAN_SHAREPOINT_GITHUB_ACTIONS.md").read_text(
            encoding="utf-8"
        )
        self.assertIn("repository_dispatch: sharepoint_changed", runbook)
        self.assertIn("Production **không polling SharePoint theo cron**", runbook)

    def test_required_architecture_documents_exist(self) -> None:
        required = (
            "README.md",
            "AGENTS.md",
            "SECURITY.md",
            "PROJECT_AUDIT.md",
            "HUONG_DAN_SHAREPOINT_GITHUB_ACTIONS.md",
        )
        for relative in required:
            with self.subTest(path=relative):
                self.assertTrue((PROJECT_ROOT / relative).is_file())


if __name__ == "__main__":
    unittest.main()
