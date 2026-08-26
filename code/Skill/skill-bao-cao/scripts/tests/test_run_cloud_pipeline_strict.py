from __future__ import annotations

import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

SCRIPT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

import run_cloud_pipeline as pipeline


class StrictPipelineFixture:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.skip: set[str] = set()
        self.commands: list[list[str]] = []
        self.quality_status = "PASS"
        self.generated_at: str | None = None
        self._write_bytes("Data/Data_ERP/source.xlsx")
        self._write_bytes("Data/Target/target.xlsx")
        self._write_bytes("Data/Danh muc KH/customers.xlsx")
        self._write_bytes("Data/Danh muc SP/Danh Muc San Pham.xlsx")
        self._write_text("code/common/validation.py", "# test marker\n")

    def _path(self, relative: str) -> Path:
        return self.root / relative

    def _write_bytes(self, relative: str, data: bytes = b"test workbook") -> Path:
        path = self._path(relative)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path

    def _write_text(self, relative: str, data: str) -> Path:
        path = self._path(relative)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(data, encoding="utf-8")
        return path

    @staticmethod
    def _argument(cmd: list[str], name: str) -> Path:
        return Path(cmd[cmd.index(name) + 1])

    def command(self, cmd: list[str], cwd: Path) -> None:
        del cwd
        self.commands.append(cmd)
        script_name = Path(cmd[1]).name
        if script_name in self.skip:
            return

        if script_name == "extract_sources.py":
            staging_dir = self._argument(cmd, "--staging-dir")
            staging_file = staging_dir / "sell_in_2026_01.json"
            staging_file.parent.mkdir(parents=True, exist_ok=True)
            staging_file.write_text('{"rows":[]}', encoding="utf-8")
            (staging_dir / "audit.json").write_text(
                json.dumps(
                    {
                        "monthly_files": [
                            {
                                "year": 2026,
                                "month": 1,
                                "staging_file": str(staging_file),
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )
        elif script_name == "build_outputs.py":
            self._write_bytes("Data/File bao cao/Sell In Thang/Sell in T01_2026.xlsx")
        elif script_name == "extract_targets.py":
            self._write_text("Data/Work/bao_cao/target/staging/target_records.json", "{}")
        elif script_name == "extract_customers.py":
            self._write_text("Data/Work/bao_cao/dmkh/staging/dmkh_data.json", "{}")
        elif script_name == "extract_sell_in_data.py":
            self._write_text("Data/Work/bao_cao/data/staging/sell_in_data.json", "{}")
        elif script_name == "build_report_workbook.py":
            self._write_bytes("Data/File bao cao/Bao_Cao_Sell_in.xlsx")
        elif script_name == "validation.py":
            self._write_text(
                "Data/Work/data_quality_report.json",
                json.dumps({"status": self.quality_status, "summary": {}}),
            )
        elif script_name == "export_web_data.py":
            generated_at = self.generated_at or datetime.now(timezone.utc).isoformat()
            self._write_text(
                "web/data/dashboard_data.json",
                json.dumps(
                    {
                        "metadata": {
                            "generated_at": generated_at,
                            "quality_status": "PASS",
                        }
                    }
                ),
            )
            self._write_text("web/data/dashboard_data.js", "window.VIKODA_DATA = {};\n")


class RunCloudPipelineStrictTests(unittest.TestCase):
    def setUp(self) -> None:
        self._logger_was_disabled = pipeline.logger.disabled
        pipeline.logger.disabled = True

    def tearDown(self) -> None:
        pipeline.logger.disabled = self._logger_was_disabled

    def _run(
        self,
        fixture: StrictPipelineFixture,
        *,
        strict: bool = True,
        **pipeline_kwargs: object,
    ) -> None:
        isolated_onedrive = fixture.root / "unconfigured-onedrive"
        with mock.patch.dict(
            pipeline.os.environ,
            {"VIKODA_ONEDRIVE_PATH": str(isolated_onedrive)},
        ), mock.patch.object(pipeline, "run_command", side_effect=fixture.command):
            pipeline.run_pipeline(fixture.root, strict=strict, **pipeline_kwargs)

    def test_local_default_still_allows_missing_cloud_inputs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with mock.patch.dict(
                pipeline.os.environ,
                {"VIKODA_ONEDRIVE_PATH": str(root / "unconfigured-onedrive")},
            ), mock.patch.object(pipeline, "run_command") as run_command:
                pipeline.run_pipeline(root)
            run_command.assert_not_called()

    def test_strict_requires_every_cloud_input(self) -> None:
        required_paths = (
            "Data/Data_ERP/source.xlsx",
            "Data/Target/target.xlsx",
            "Data/Danh muc KH/customers.xlsx",
            "Data/Danh muc SP/Danh Muc San Pham.xlsx",
        )
        for relative in required_paths:
            with self.subTest(relative=relative), tempfile.TemporaryDirectory() as tmp:
                fixture = StrictPipelineFixture(Path(tmp))
                fixture._path(relative).unlink()
                with self.assertRaises(pipeline.PipelineValidationError):
                    self._run(fixture)

    def test_explicit_cloud_input_paths_override_legacy_data_paths(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fixture = StrictPipelineFixture(Path(tmp))
            explicit = {
                "erp_source_dir": "Data/CloudInputs/ERP",
                "target_source_dir": "Data/CloudInputs/Target",
                "dmkh_source_dir": "Data/CloudInputs/DMKH",
                "product_catalog_path": "Data/CloudInputs/DMSP/Danh Muc San Pham.xlsx",
            }
            fixture._write_bytes("Data/CloudInputs/ERP/source.xlsx")
            fixture._write_bytes("Data/CloudInputs/Target/target.xlsx")
            fixture._write_bytes("Data/CloudInputs/DMKH/customers.xlsx")
            fixture._write_bytes("Data/CloudInputs/DMSP/Danh Muc San Pham.xlsx")

            self._run(fixture, **explicit)

            commands = {Path(cmd[1]).name: cmd for cmd in fixture.commands}
            expected_sources = {
                "extract_sources.py": fixture._path("Data/CloudInputs/ERP"),
                "extract_targets.py": fixture._path("Data/CloudInputs/Target"),
                "extract_customers.py": fixture._path("Data/CloudInputs/DMKH"),
            }
            for script_name, expected in expected_sources.items():
                command = commands[script_name]
                self.assertEqual(str(expected), command[command.index("--source-dir") + 1])
            export_command = commands["export_web_data.py"]
            self.assertEqual(
                str(fixture._path("Data/CloudInputs/DMSP/Danh Muc San Pham.xlsx")),
                export_command[export_command.index("--product-catalog") + 1],
            )

    def test_missing_explicit_erp_path_does_not_fall_back_to_legacy_data(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fixture = StrictPipelineFixture(Path(tmp))
            fixture._write_bytes("Data/CloudInputs/Target/target.xlsx")
            fixture._write_bytes("Data/CloudInputs/DMKH/customers.xlsx")
            fixture._write_bytes("Data/CloudInputs/DMSP/Danh Muc San Pham.xlsx")

            with self.assertRaisesRegex(pipeline.PipelineValidationError, "CloudInputs.*ERP"):
                self._run(
                    fixture,
                    erp_source_dir="Data/CloudInputs/ERP",
                    target_source_dir="Data/CloudInputs/Target",
                    dmkh_source_dir="Data/CloudInputs/DMKH",
                    product_catalog_path="Data/CloudInputs/DMSP/Danh Muc San Pham.xlsx",
                )

    def test_strict_rejects_missing_erp_audit(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fixture = StrictPipelineFixture(Path(tmp))
            fixture.skip.add("extract_sources.py")
            with self.assertRaisesRegex(pipeline.PipelineValidationError, "audit.json"):
                self._run(fixture)

    def test_strict_rejects_missing_monthly_staging_output(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fixture = StrictPipelineFixture(Path(tmp))

            def write_audit_without_staging(cmd: list[str], cwd: Path) -> None:
                if Path(cmd[1]).name != "extract_sources.py":
                    fixture.command(cmd, cwd)
                    return
                staging_dir = fixture._argument(cmd, "--staging-dir")
                staging_dir.mkdir(parents=True, exist_ok=True)
                (staging_dir / "audit.json").write_text(
                    json.dumps(
                        {
                            "monthly_files": [
                                {
                                    "year": 2026,
                                    "month": 1,
                                    "staging_file": str(staging_dir / "missing.json"),
                                }
                            ]
                        }
                    ),
                    encoding="utf-8",
                )

            with mock.patch.dict(
                pipeline.os.environ,
                {"VIKODA_ONEDRIVE_PATH": str(fixture.root / "unconfigured-onedrive")},
            ), mock.patch.object(pipeline, "run_command", side_effect=write_audit_without_staging):
                with self.assertRaisesRegex(pipeline.PipelineValidationError, "monthly staging"):
                    pipeline.run_pipeline(fixture.root, strict=True)

    def test_strict_rejects_missing_monthly_workbook(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fixture = StrictPipelineFixture(Path(tmp))
            fixture.skip.add("build_outputs.py")
            with self.assertRaisesRegex(pipeline.PipelineValidationError, "workbook tháng"):
                self._run(fixture)

    def test_strict_requires_each_normalized_json(self) -> None:
        scripts = (
            "extract_targets.py",
            "extract_customers.py",
            "extract_sell_in_data.py",
        )
        for script_name in scripts:
            with self.subTest(script=script_name), tempfile.TemporaryDirectory() as tmp:
                fixture = StrictPipelineFixture(Path(tmp))
                fixture.skip.add(script_name)
                with self.assertRaises(pipeline.PipelineValidationError):
                    self._run(fixture)

    def test_strict_requires_fresh_quality_report(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fixture = StrictPipelineFixture(Path(tmp))
            fixture.skip.add("validation.py")
            with self.assertRaisesRegex(pipeline.PipelineValidationError, "data_quality_report.json"):
                self._run(fixture)

    def test_strict_rejects_non_pass_quality_status(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fixture = StrictPipelineFixture(Path(tmp))
            fixture.quality_status = "FAIL"
            with self.assertRaisesRegex(pipeline.PipelineValidationError, "không phải PASS"):
                self._run(fixture)

    def test_strict_rejects_stale_web_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fixture = StrictPipelineFixture(Path(tmp))
            fixture._write_text(
                "web/data/dashboard_data.json",
                '{"metadata":{"generated_at":"2000-01-01T00:00:00+00:00","quality_status":"PASS"}}',
            )
            fixture._write_text("web/data/dashboard_data.js", "window.VIKODA_DATA = {};\n")
            fixture.skip.add("export_web_data.py")
            # This test targets the web-artifact refresh contract. Pinning the
            # nanosecond start marker prevents filesystem mtime granularity on
            # hosted runners from making the unrelated monthly-staging guard
            # fail first and turning this focused assertion into a flaky test.
            with mock.patch.object(pipeline.time, "time_ns", return_value=0):
                with self.assertRaisesRegex(pipeline.PipelineValidationError, "lượt chạy này"):
                    self._run(fixture)

    def test_strict_rejects_old_generated_at_even_after_rewrite(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fixture = StrictPipelineFixture(Path(tmp))
            fixture.generated_at = "2000-01-01T00:00:00+00:00"
            with self.assertRaisesRegex(pipeline.PipelineValidationError, "generated_at cũ"):
                self._run(fixture)

    def test_strict_happy_path_creates_fresh_web_data(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fixture = StrictPipelineFixture(Path(tmp))
            self._run(fixture)
            payload = json.loads(
                fixture._path("web/data/dashboard_data.json").read_text(encoding="utf-8")
            )
            self.assertEqual("PASS", payload["metadata"]["quality_status"])


if __name__ == "__main__":
    unittest.main()
