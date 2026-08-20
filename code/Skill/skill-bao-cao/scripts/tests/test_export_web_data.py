from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from export_web_data import WebExportValidationError, _load_quality_gate


class QualityGateTests(unittest.TestCase):
    def test_missing_quality_report_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            missing = Path(tmp) / 'data_quality_report.json'
            with self.assertRaises(WebExportValidationError):
                _load_quality_gate(missing, default_source_row_count=12)

    def test_malformed_quality_report_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            report = Path(tmp) / 'data_quality_report.json'
            report.write_text('{not-json', encoding='utf-8')
            with self.assertRaises(WebExportValidationError):
                _load_quality_gate(report, default_source_row_count=12)

    def test_failed_quality_status_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            report = Path(tmp) / 'data_quality_report.json'
            report.write_text(json.dumps({'status': 'FAIL'}), encoding='utf-8')
            with self.assertRaises(WebExportValidationError):
                _load_quality_gate(report, default_source_row_count=12)

    def test_pass_quality_status_returns_canonical_source_count(self):
        with tempfile.TemporaryDirectory() as tmp:
            report = Path(tmp) / 'data_quality_report.json'
            report.write_text(
                json.dumps({'status': 'PASS', 'summary': {'source_records': 321}}),
                encoding='utf-8',
            )
            self.assertEqual(
                _load_quality_gate(report, default_source_row_count=12),
                ('PASS', 321),
            )

    def test_invalid_source_count_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            report = Path(tmp) / 'data_quality_report.json'
            report.write_text(
                json.dumps({'status': 'PASS', 'summary': {'source_records': 'bad'}}),
                encoding='utf-8',
            )
            with self.assertRaises(WebExportValidationError):
                _load_quality_gate(report, default_source_row_count=12)


if __name__ == '__main__':
    unittest.main()
