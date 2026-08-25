from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from code.common.prepare_pages_dashboard import PagesSanitizationError, build_pages_bundle, sanitize_payload


class PreparePagesDashboardTests(unittest.TestCase):
    def sample_payload(self):
        return {
            "metadata": {"quality_status": "PASS"},
            "dim_customer": {
                "REAL-A": {
                    "code": "KH001",
                    "name": "Khách hàng thật A",
                    "channel": "GT",
                    "type": "NPP",
                    "system_mt": "",
                    "mien": "Miền Trung",
                    "vung": "Vùng 1",
                },
                "REAL-B": {
                    "code": "KH002",
                    "name": "Siêu thị thật B",
                    "channel": "MT",
                    "type": "MT",
                    "system_mt": "Hệ thống thật",
                    "mien": "Miền Nam",
                    "vung": "Vùng 2",
                },
            },
            "dim_product": {"P1": {"name": "Vikoda"}},
            "dim_territory": {"T1": {"mien": "Miền Trung", "vung": "Vùng 1"}},
            "fact_sell_in": [["2026-08-01", "REAL-A", "P1", "T1", 1000, 1, 1, 0]],
            "fact_target": [["2026-08", "T1", "REAL-B", 2000, 1000]],
        }

    def test_customer_identity_is_removed_and_fact_keys_are_remapped(self):
        output = sanitize_payload(self.sample_payload())
        raw = json.dumps(output, ensure_ascii=False)

        self.assertNotIn("KH001", raw)
        self.assertNotIn("KH002", raw)
        self.assertNotIn("Khách hàng thật A", raw)
        self.assertNotIn("Siêu thị thật B", raw)
        self.assertNotIn("Hệ thống thật", raw)
        self.assertEqual(output["fact_sell_in"][0][1], "C000001")
        self.assertEqual(output["fact_target"][0][2], "C000002")
        self.assertEqual(output["dim_customer"]["C000002"]["system_mt"], "MT")
        self.assertEqual(output["metadata"]["data_classification"], "public-sanitized")
        self.assertTrue(output["metadata"]["customer_identity_removed"])

    def test_bundle_keeps_web_assets_but_replaces_data(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "web"
            (source / "data").mkdir(parents=True)
            (source / "css").mkdir()
            (source / "index.html").write_text("<html>dashboard</html>", encoding="utf-8")
            (source / "css" / "app.css").write_text("body{}", encoding="utf-8")
            (source / "login.html").write_text("azure-only", encoding="utf-8")
            (source / "staticwebapp.config.json").write_text("{}", encoding="utf-8")
            payload = self.sample_payload()
            (source / "data" / "dashboard_data.json").write_text(
                json.dumps(payload, ensure_ascii=False), encoding="utf-8"
            )
            (source / "data" / "dashboard_data.js").write_text("private", encoding="utf-8")

            output = root / "pages"
            build_pages_bundle(source, output)

            self.assertTrue((output / "index.html").is_file())
            self.assertTrue((output / "css" / "app.css").is_file())
            self.assertTrue((output / ".nojekyll").is_file())
            self.assertFalse((output / "login.html").exists())
            self.assertFalse((output / "staticwebapp.config.json").exists())
            public_data = (output / "data" / "dashboard_data.json").read_text(encoding="utf-8")
            self.assertNotIn("KH001", public_data)
            self.assertIn("PUBLIC-000001", public_data)

    def test_unknown_customer_reference_fails_closed(self):
        payload = self.sample_payload()
        payload["fact_sell_in"][0][1] = "MISSING"
        with self.assertRaises(PagesSanitizationError):
            sanitize_payload(payload)


if __name__ == "__main__":
    unittest.main()
