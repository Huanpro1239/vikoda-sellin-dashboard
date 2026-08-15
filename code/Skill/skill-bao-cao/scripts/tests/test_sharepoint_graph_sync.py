from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

SCRIPT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

import sharepoint_graph_sync as sync


VALID_CLOUD_ENV = {
    "AZURE_TENANT_ID": "tenant",
    "AZURE_CLIENT_ID": "client",
    "AZURE_CLIENT_SECRET": "secret",
    "SHAREPOINT_SITE_ID": "site",
    "SHAREPOINT_DRIVE_ID": "drive",
}


def download_args(local_dir: Path) -> list[str]:
    return [
        "--action",
        "download",
        "--folder",
        "Data ERP",
        "--local-dir",
        str(local_dir),
    ]


class SharePointGraphSyncTests(unittest.TestCase):
    @mock.patch.object(sync, "http_request_with_retry")
    def test_download_follows_graph_pagination(self, request: mock.Mock) -> None:
        first_page = {
            "value": [
                {
                    "name": "source-1.xlsx",
                    "file": {},
                    "@microsoft.graph.downloadUrl": "https://download/one",
                }
            ],
            "@odata.nextLink": "https://graph/next-page",
        }
        second_page = {
            "value": [
                {
                    "name": "source-2.xlsm",
                    "file": {},
                    "@microsoft.graph.downloadUrl": "https://download/two",
                }
            ]
        }
        request.side_effect = [
            (json.dumps(first_page).encode("utf-8"), 200),
            (json.dumps(second_page).encode("utf-8"), 200),
            (b"one", 200),
            (b"two", 200),
        ]

        with tempfile.TemporaryDirectory() as tmp:
            files = sync.download_sharepoint_folder("token", "site", "drive", "Data ERP", Path(tmp))
            self.assertEqual([path.name for path in files], ["source-1.xlsx", "source-2.xlsm"])
            self.assertEqual(files[0].read_bytes(), b"one")
            self.assertEqual(files[1].read_bytes(), b"two")

        requested_urls = [call.args[0].full_url for call in request.call_args_list]
        self.assertIn("https://graph/next-page", requested_urls)

    @mock.patch.object(sync, "http_request_with_retry")
    def test_download_rejects_unsafe_filename(self, request: mock.Mock) -> None:
        page = {
            "value": [
                {
                    "name": "../outside.xlsx",
                    "file": {},
                    "@microsoft.graph.downloadUrl": "https://download/unsafe",
                }
            ]
        }
        request.return_value = (json.dumps(page).encode("utf-8"), 200)
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(RuntimeError):
                sync.download_sharepoint_folder("token", "site", "drive", "Data ERP", Path(tmp))

    def test_ci_without_any_cloud_credentials_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            result = sync.main(download_args(Path(tmp)), env={"CI": "true"})

        self.assertEqual(2, result)

    def test_explicit_cloud_requirement_without_credentials_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            args = [*download_args(Path(tmp)), "--require-cloud-auth"]
            result = sync.main(args, env={})

        self.assertEqual(2, result)

    def test_partial_credentials_never_fall_back_to_local_data(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            result = sync.main(
                download_args(Path(tmp)),
                env={"AZURE_TENANT_ID": "tenant"},
            )

        self.assertEqual(2, result)

    def test_local_mode_without_cloud_configuration_is_a_noop(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            result = sync.main(download_args(Path(tmp)), env={})

        self.assertEqual(0, result)

    @mock.patch.object(sync, "download_sharepoint_folder", return_value=[])
    @mock.patch.object(sync, "get_graph_access_token", return_value="token")
    def test_zero_downloads_fails_instead_of_using_stale_data(
        self,
        _get_token: mock.Mock,
        _download: mock.Mock,
    ) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            result = sync.main(download_args(Path(tmp)), env=VALID_CLOUD_ENV)

        self.assertEqual(3, result)

    @mock.patch.object(sync, "download_sharepoint_folder")
    @mock.patch.object(sync, "get_graph_access_token", return_value="token")
    def test_download_without_a_source_workbook_fails(
        self,
        _get_token: mock.Mock,
        download: mock.Mock,
    ) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            note = Path(tmp) / "readme.txt"
            note.write_text("not an ERP workbook", encoding="utf-8")
            download.return_value = [note]
            result = sync.main(download_args(Path(tmp)), env=VALID_CLOUD_ENV)

        self.assertEqual(3, result)

    @mock.patch.object(sync, "download_sharepoint_folder")
    @mock.patch.object(sync, "get_graph_access_token", return_value="token")
    def test_nonempty_download_succeeds(
        self,
        _get_token: mock.Mock,
        download: mock.Mock,
    ) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            downloaded = Path(tmp) / "source.xlsm"
            downloaded.write_bytes(b"non-empty test workbook")
            download.return_value = [downloaded]
            result = sync.main(download_args(Path(tmp)), env=VALID_CLOUD_ENV)

        self.assertEqual(0, result)

    @mock.patch.object(sync, "get_graph_access_token", return_value="token")
    def test_upload_without_xlsx_fails_closed(self, _get_token: mock.Mock) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            result = sync.main(
                [
                    "--action",
                    "upload",
                    "--folder",
                    "Data_Goc",
                    "--local-dir",
                    tmp,
                ],
                env=VALID_CLOUD_ENV,
            )

        self.assertEqual(3, result)


if __name__ == "__main__":
    unittest.main()
