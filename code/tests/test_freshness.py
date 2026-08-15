"""Unit tests for Metadata Freshness & Atomic Build safety."""

import json
import os
import tempfile
import unittest
from pathlib import Path


class TestFreshnessAndAtomicBuild(unittest.TestCase):
    def setUp(self):
        self.temp_dir = Path(tempfile.mkdtemp(prefix="vikoda_freshness_"))

    def tearDown(self):
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_atomic_file_replacement(self):
        target_file = self.temp_dir / "data.json"
        target_file.write_text(json.dumps({"version": 1}), encoding="utf-8")

        tmp_file = self.temp_dir / "data.json.tmp"
        new_payload = {"version": 2, "quality_status": "PASS", "records": 100}
        tmp_file.write_text(json.dumps(new_payload), encoding="utf-8")

        # Test atomic replacement
        os.replace(tmp_file, target_file)
        
        self.assertFalse(tmp_file.exists())
        self.assertTrue(target_file.exists())
        
        loaded = json.loads(target_file.read_text(encoding="utf-8"))
        self.assertEqual(loaded["version"], 2)
        self.assertEqual(loaded["quality_status"], "PASS")


if __name__ == "__main__":
    unittest.main()
