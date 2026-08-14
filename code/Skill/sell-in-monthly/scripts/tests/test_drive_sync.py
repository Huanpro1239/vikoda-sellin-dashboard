"""Khóa hợp đồng của bước tải file lên Google Drive bằng rclone.

Không test được với Drive thật (cần tài khoản và mạng), nên chiến lược là: tách
phần dựng lệnh thành hàm thuần rồi khóa nội dung lệnh, và giả lập `subprocess` để
kiểm tra luồng xử lý. Cách này bắt được đúng những lỗi đắt nhất:

* Dùng `sync` thay vì `copy` — sẽ **xóa** Google Sheet và file người khác trong
  thư mục Drive dùng chung. Đây là lỗi không thể phát hiện bằng mắt cho tới khi
  mất dữ liệu.
* Sai folder ID — file lên đúng Drive nhưng sai thư mục, Looker không thấy.
* Thiếu rclone làm đổ cả lần tách data, trong khi file cục bộ đã xong.
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


SCRIPT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

import drive_sync  # noqa: E402
from drive_sync import (  # noqa: E402
    DEFAULT_FOLDER_ID,
    DEFAULT_REMOTE,
    ENV_FOLDER_ID,
    ENV_REMOTE,
    RcloneNotFound,
    build_copy_command,
    build_verify_command,
    collect_workbooks,
    extract_folder_id,
    find_rclone,
    resolve_settings,
    upload,
)


class ExtractFolderIdTests(unittest.TestCase):
    def test_accepts_bare_id(self) -> None:
        self.assertEqual(extract_folder_id(DEFAULT_FOLDER_ID), DEFAULT_FOLDER_ID)

    def test_accepts_full_share_url(self) -> None:
        """Người dùng hay dán nguyên URL từ thanh địa chỉ."""
        for url in (
            f"https://drive.google.com/drive/folders/{DEFAULT_FOLDER_ID}",
            f"https://drive.google.com/drive/u/0/folders/{DEFAULT_FOLDER_ID}",
            f"https://drive.google.com/drive/folders/{DEFAULT_FOLDER_ID}?usp=sharing",
            f'  "https://drive.google.com/drive/folders/{DEFAULT_FOLDER_ID}/"  ',
        ):
            self.assertEqual(extract_folder_id(url), DEFAULT_FOLDER_ID, url)


class BuildCommandTests(unittest.TestCase):
    def setUp(self) -> None:
        self.rclone = Path("/usr/bin/rclone")
        self.command = build_copy_command(
            self.rclone,
            Path("/du an/Data/out put"),
            "vikoda-drive",
            DEFAULT_FOLDER_ID,
            ["Sell in T*.xlsx"],
        )

    def test_uses_copy_never_sync(self) -> None:
        """`sync` xóa file trong Drive mà local không có, kể cả Google Sheet."""
        self.assertEqual(self.command[1], "copy")
        self.assertNotIn("sync", self.command)
        self.assertNotIn("--delete-during", self.command)
        self.assertNotIn("--delete-after", self.command)
        self.assertNotIn("--delete-excluded", self.command)

    def test_targets_folder_by_id(self) -> None:
        index = self.command.index("--drive-root-folder-id")
        self.assertEqual(self.command[index + 1], DEFAULT_FOLDER_ID)
        self.assertIn("vikoda-drive:", self.command)

    def test_passes_every_include_pattern(self) -> None:
        command = build_copy_command(
            self.rclone,
            Path("/x"),
            "r",
            "ID",
            ["a.csv", "b.csv"],
        )
        includes = [
            command[i + 1] for i, part in enumerate(command) if part == "--include"
        ]
        self.assertEqual(includes, ["a.csv", "b.csv"])

    def test_does_not_recurse_into_subfolders(self) -> None:
        index = self.command.index("--max-depth")
        self.assertEqual(self.command[index + 1], "1")

    def test_verify_command_lists_the_same_folder(self) -> None:
        command = build_verify_command(self.rclone, "vikoda-drive", DEFAULT_FOLDER_ID)
        self.assertEqual(command[1], "lsjson")
        index = command.index("--drive-root-folder-id")
        self.assertEqual(command[index + 1], DEFAULT_FOLDER_ID)


class ResolveSettingsTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp = tempfile.TemporaryDirectory()
        self.root = Path(self._temp.name)
        (self.root / "Chay CT").mkdir()
        self.addCleanup(self._temp.cleanup)
        patcher = mock.patch.dict("os.environ", {}, clear=False)
        patcher.start()
        self.addCleanup(patcher.stop)
        import os

        os.environ.pop(ENV_FOLDER_ID, None)
        os.environ.pop(ENV_REMOTE, None)

    def write_config(self, text: str) -> None:
        (self.root / "Chay CT" / "drive.conf").write_text(text, encoding="utf-8")

    def test_falls_back_to_project_default(self) -> None:
        """Không cấu hình gì thì vẫn phải ra thư mục dùng chung của dự án."""
        settings = resolve_settings(self.root)
        self.assertEqual(settings["folder_id"], DEFAULT_FOLDER_ID)
        self.assertEqual(settings["remote"], DEFAULT_REMOTE)

    def test_argument_beats_env_beats_config(self) -> None:
        import os

        self.write_config("folder_id = TU_CONFIG\nremote = r-config\n")
        os.environ[ENV_FOLDER_ID] = "TU_ENV"
        os.environ[ENV_REMOTE] = "r-env"

        self.assertEqual(resolve_settings(self.root)["folder_id"], "TU_ENV")
        self.assertEqual(
            resolve_settings(self.root, folder_id="TU_ARG")["folder_id"], "TU_ARG"
        )
        self.assertEqual(resolve_settings(self.root)["remote"], "r-env")
        self.assertEqual(
            resolve_settings(self.root, remote="r-arg")["remote"], "r-arg"
        )

    def test_config_skips_comments_and_normalises_url(self) -> None:
        self.write_config(
            "# ghi chu\n"
            "\n"
            f"folder_id = https://drive.google.com/drive/folders/{DEFAULT_FOLDER_ID}\n"
            'remote = "vikoda-drive"\n'
        )
        settings = resolve_settings(self.root)
        self.assertEqual(settings["folder_id"], DEFAULT_FOLDER_ID)
        self.assertEqual(settings["remote"], "vikoda-drive")
        self.assertIn("drive.conf", settings["config_source"])


class FindRcloneTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp = tempfile.TemporaryDirectory()
        self.root = Path(self._temp.name)
        self.addCleanup(self._temp.cleanup)

    def test_prefers_project_runtime_copy(self) -> None:
        runtime = self.root / ".runtime" / "rclone"
        runtime.mkdir(parents=True)
        exe = runtime / "rclone"
        exe.write_text("#!/bin/sh\n", encoding="utf-8")
        self.assertEqual(find_rclone(self.root), exe)

    def test_explicit_path_wins(self) -> None:
        exe = self.root / "rclone-rieng"
        exe.write_text("", encoding="utf-8")
        self.assertEqual(find_rclone(self.root, str(exe)), exe)

    def test_missing_rclone_explains_how_to_install(self) -> None:
        with mock.patch("shutil.which", return_value=None):
            with self.assertRaises(RcloneNotFound) as caught:
                find_rclone(self.root)
        message = str(caught.exception)
        self.assertIn("rclone config", message)
        self.assertIn(DEFAULT_REMOTE, message)


class UploadTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp = tempfile.TemporaryDirectory()
        self.root = Path(self._temp.name)
        self.output_dir = self.root / "output"
        self.looker_dir = self.root / "looker"
        self.output_dir.mkdir()
        self.looker_dir.mkdir()
        self.rclone = self.root / "rclone"
        self.rclone.write_text("", encoding="utf-8")
        self.addCleanup(self._temp.cleanup)

    def make(self, directory: Path, name: str) -> Path:
        path = directory / name
        path.write_bytes(b"noi dung gia")
        return path

    def fake_run(self, listing: list[dict] | None = None, returncode: int = 0):
        """Ghi lại mọi lệnh rclone được gọi thay vì chạy thật."""
        calls: list[list[str]] = []

        def runner(command: list[str], timeout: int = 1800):
            calls.append(command)
            stdout = ""
            if "lsjson" in command:
                stdout = json.dumps(listing if listing is not None else [])
            return subprocess.CompletedProcess(command, returncode, stdout, "")

        return calls, runner

    def test_collect_skips_lock_and_temp_files(self) -> None:
        self.make(self.output_dir, "Sell in T01_2025.xlsx")
        self.make(self.output_dir, "~$Sell in T01_2025.xlsx")
        self.make(self.output_dir, ".Sell in T01_2025.9.tmp.xlsx")
        names = [path.name for path in collect_workbooks(self.output_dir)]
        self.assertEqual(names, ["Sell in T01_2025.xlsx"])

    def test_one_job_for_workbooks_and_one_per_extra_directory(self) -> None:
        self.make(self.output_dir, "Sell in T01_2025.xlsx")
        self.make(self.output_dir, "Sell in T02_2025.xlsx")
        csv_file = self.make(self.looker_dir, "Sell in tong hop.csv")

        calls, runner = self.fake_run(
            listing=[{"Name": "x", "Size": 1, "IsDir": False}]
        )
        with mock.patch.object(drive_sync, "run_command", runner):
            report = upload(
                project_root=self.root,
                output_dir=self.output_dir,
                extra_files=[csv_file],
                rclone_path=str(self.rclone),
                log=lambda *a: None,
            )

        copies = [c for c in calls if c[1] == "copy"]
        self.assertEqual(len(copies), 2, "mot job cho xlsx, mot job cho CSV")
        self.assertEqual(report["expected_count"], 3)
        self.assertEqual(report["failed_jobs"], [])
        # Ca hai job phai tro vao cung mot folder ID.
        for command in copies:
            index = command.index("--drive-root-folder-id")
            self.assertEqual(command[index + 1], DEFAULT_FOLDER_ID)

    def test_verify_reads_remote_listing(self) -> None:
        self.make(self.output_dir, "Sell in T01_2025.xlsx")
        listing = [
            {"Name": "Sell in T01_2025.xlsx", "Size": 12, "IsDir": False},
            {"Name": "thu muc con", "IsDir": True},
        ]
        calls, runner = self.fake_run(listing=listing)
        with mock.patch.object(drive_sync, "run_command", runner):
            report = upload(
                project_root=self.root,
                output_dir=self.output_dir,
                rclone_path=str(self.rclone),
                log=lambda *a: None,
            )

        self.assertTrue(any("lsjson" in c for c in calls))
        remote = report["remote_listing"]
        self.assertTrue(remote["ok"])
        # Thu muc khong duoc tinh la file.
        self.assertEqual(remote["file_count"], 1)

    def test_failed_job_is_reported_not_raised(self) -> None:
        self.make(self.output_dir, "Sell in T01_2025.xlsx")
        _, runner = self.fake_run(returncode=1)
        with mock.patch.object(drive_sync, "run_command", runner):
            report = upload(
                project_root=self.root,
                output_dir=self.output_dir,
                rclone_path=str(self.rclone),
                verify=False,
                log=lambda *a: None,
            )
        self.assertEqual(len(report["failed_jobs"]), 1)

    def test_no_file_means_no_rclone_call(self) -> None:
        calls, runner = self.fake_run()
        with mock.patch.object(drive_sync, "run_command", runner):
            report = upload(
                project_root=self.root,
                output_dir=self.output_dir,
                rclone_path=str(self.rclone),
                log=lambda *a: None,
            )
        self.assertTrue(report["skipped"])
        self.assertEqual(report["reason"], "no_files")
        self.assertEqual(calls, [])


if __name__ == "__main__":
    unittest.main()
