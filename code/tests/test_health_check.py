"""Regression tests for the dashboard artifact health gate."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from code.health_check import DASHBOARD_JS_PREFIX, check_dashboard_data


def payload() -> dict:
    return {
        "metadata": {
            "quality_status": "PASS",
            "fact_count": 1,
            "target_count": 1,
            "customer_count": 1,
            "product_count": 1,
        },
        "dim_customer": {"C1": {"name": "Test"}},
        "dim_product": {"P1": {"name": "Test"}},
        "dim_territory": {},
        "fact_sell_in": [["2026-08-01", "C1", "P1", "T1", 1, 1, 1, 0]],
        "fact_target": [["202608", "T1", "C1", 1, 0]],
    }


class DashboardHealthTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp = tempfile.TemporaryDirectory()
        self.root = Path(self._temp.name)
        (self.root / "web/data").mkdir(parents=True)
        self.addCleanup(self._temp.cleanup)

    def write_artifacts(self, json_data: dict, js_data: dict | None = None) -> None:
        compact_json = json.dumps(json_data, ensure_ascii=False, separators=(",", ":"))
        compact_js = json.dumps(
            json_data if js_data is None else js_data,
            ensure_ascii=False,
            separators=(",", ":"),
        )
        (self.root / "web/data/dashboard_data.json").write_text(compact_json, encoding="utf-8")
        (self.root / "web/data/dashboard_data.js").write_text(
            f"{DASHBOARD_JS_PREFIX}{compact_js};\n",
            encoding="utf-8",
        )

    def test_matching_json_and_browser_payload_pass(self) -> None:
        self.write_artifacts(payload())
        self.assertTrue(check_dashboard_data(self.root))

    def test_stale_browser_payload_fails(self) -> None:
        stale = payload()
        stale["fact_sell_in"] = [["2026-08-02", "C1", "P1", "T1", 2, 1, 1, 0]]
        self.write_artifacts(payload(), stale)
        self.assertFalse(check_dashboard_data(self.root))

    def test_metadata_count_mismatch_fails(self) -> None:
        invalid = payload()
        invalid["metadata"]["fact_count"] = 99
        self.write_artifacts(invalid)
        self.assertFalse(check_dashboard_data(self.root))

    def test_non_json_javascript_wrapper_fails(self) -> None:
        self.write_artifacts(payload())
        (self.root / "web/data/dashboard_data.js").write_text(
            "window.VIKODA_DATA = alert('bad');\n",
            encoding="utf-8",
        )
        self.assertFalse(check_dashboard_data(self.root))


if __name__ == "__main__":
    unittest.main()
