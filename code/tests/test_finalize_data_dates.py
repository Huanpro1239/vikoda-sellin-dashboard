from __future__ import annotations

import json
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

COMMON_DIR = Path(__file__).resolve().parents[1] / "common"
if str(COMMON_DIR) not in sys.path:
    sys.path.insert(0, str(COMMON_DIR))

from finalize_data_dates import (  # noqa: E402
    DataDateValidationError,
    finalize_dates,
    latest_business_date,
)


class LatestBusinessDateTest(unittest.TestCase):
    def test_uses_max_invoice_date_not_run_date(self) -> None:
        latest = latest_business_date(
            ["2026-08-18", "2026-08-20", "2026-08-19"],
            run_date=date(2026, 8, 21),
            label="invoice",
        )
        self.assertEqual(latest, date(2026, 8, 20))

    def test_rejects_future_invoice_date(self) -> None:
        with self.assertRaises(DataDateValidationError):
            latest_business_date(
                ["2026-08-20", "2026-08-22"],
                run_date=date(2026, 8, 21),
                label="invoice",
            )

    def test_rejects_empty_dataset(self) -> None:
        with self.assertRaises(DataDateValidationError):
            latest_business_date([], run_date=date(2026, 8, 21), label="invoice")


class FinalizeDatesIntegrationTest(unittest.TestCase):
    def _write_fixture(
        self,
        root: Path,
        *,
        sell_dates: list[str],
        web_dates: list[str] | None = None,
    ) -> None:
        staging = root / "Data/Work/bao_cao/data/staging"
        web = root / "web/data"
        staging.mkdir(parents=True)
        web.mkdir(parents=True)

        sell_payload = {
            "schema_version": 1,
            "generated_at": "2026-08-21T10:00:00+07:00",
            "as_of_date": "2026-08-21",
            "current_year": 2026,
            "through_month": 8,
            "columns": ["NgayHoaDon", "ThanhTien"],
            "rows": [[value, 100] for value in sell_dates],
        }
        web_payload = {
            "metadata": {
                "as_of_date": "2026-08-21",
                "source_latest_date": "2026-08-21",
                "current_year": 2026,
                "through_month": 8,
                "quality_status": "PASS",
            },
            "fact_sell_in": [
                [value, "C1", "P1", "T1", 100, 1, 1, 0]
                for value in (web_dates if web_dates is not None else sell_dates)
            ],
        }
        (staging / "sell_in_data.json").write_text(
            json.dumps(sell_payload, ensure_ascii=False), encoding="utf-8"
        )
        (web / "dashboard_data.json").write_text(
            json.dumps(web_payload, ensure_ascii=False), encoding="utf-8"
        )
        (web / "dashboard_data.js").write_text(
            f"window.VIKODA_DATA = {json.dumps(web_payload, ensure_ascii=False)};\n",
            encoding="utf-8",
        )

    def test_finalizes_staging_and_web_to_actual_latest_date(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_fixture(root, sell_dates=["2026-08-18", "2026-08-20"])

            latest = finalize_dates(root, run_date=date(2026, 8, 21))

            self.assertEqual(latest, date(2026, 8, 20))
            sell = json.loads(
                (root / "Data/Work/bao_cao/data/staging/sell_in_data.json").read_text(
                    encoding="utf-8"
                )
            )
            web = json.loads(
                (root / "web/data/dashboard_data.json").read_text(encoding="utf-8")
            )
            self.assertEqual(sell["as_of_date"], "2026-08-20")
            self.assertEqual(sell["source_latest_date"], "2026-08-20")
            self.assertEqual(sell["run_as_of_date"], "2026-08-21")
            self.assertEqual(web["metadata"]["as_of_date"], "2026-08-20")
            self.assertEqual(web["metadata"]["source_latest_date"], "2026-08-20")
            self.assertEqual(web["metadata"]["run_as_of_date"], "2026-08-21")
            self.assertEqual(web["metadata"]["date_basis"], "MAX(NgayHoaDon)")
            js = (root / "web/data/dashboard_data.js").read_text(encoding="utf-8")
            self.assertIn('"as_of_date":"2026-08-20"', js)

    def test_rejects_staging_web_date_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_fixture(
                root,
                sell_dates=["2026-08-20"],
                web_dates=["2026-08-19"],
            )
            with self.assertRaises(DataDateValidationError):
                finalize_dates(root, run_date=date(2026, 8, 21))


if __name__ == "__main__":
    unittest.main()
