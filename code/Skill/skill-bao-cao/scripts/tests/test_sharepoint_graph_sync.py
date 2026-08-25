from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

SCRIPT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

import sharepoint_graph_sync as sync


VALID_CLOUD_ENV = {
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


def upload_args(local_dir: Path) -> list[str]:
    return [
        "--action",
        "upload",
        "--folder",
        "Data_Goc",
        "--local-dir",
        str(local_dir),
    ]


class SharePointGraphSyncTests(unittest.TestCase):
    def test_graph_token_uses_azure_cli_credential(self) -> None:
        credential = mock.Mock()
        credential.get_token.return_value = SimpleNamespace(token="oidc-token")
        token = sync.get_graph_access_token(credential)
        self.assertEqual("oidc-token", token)
        credential.get_token.assert_called_once_with("https://graph.microsoft.com/.default")

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

    def test_ci_without_sharepoint_ids_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            result = sync.main(download_args(Path(tmp)), env={"CI": "true"})
        self.assertEqual(2, result)

    def test_explicit_cloud_requirement_without_sharepoint_ids_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            args = [*download_args(Path(tmp)), "--require-cloud-auth"]
            result = sync.main(args, env={})
        self.assertEqual(2, result)

    def test_partial_sharepoint_configuration_never_falls_back_to_local_data(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            result = sync.main(
                download_args(Path(tmp)),
                env={"SHAREPOINT_SITE_ID": "site"},
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
            result = sync.main(upload_args(Path(tmp)), env=VALID_CLOUD_ENV)
        self.assertEqual(3, result)

    @mock.patch.object(sync, "upload_file_to_sharepoint")
    @mock.patch.object(sync, "get_graph_access_token", return_value="token")
    def test_upload_with_xlsx_uses_resolved_cloud_target(
        self,
        _get_token: mock.Mock,
        upload: mock.Mock,
    ) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workbook = Path(tmp) / "Sell in T08_2026.xlsx"
            workbook.write_bytes(b"test-workbook")
            result = sync.main(upload_args(Path(tmp)), env=VALID_CLOUD_ENV)

        self.assertEqual(0, result)
        upload.assert_called_once()
        token, site_id, drive_id, folder, uploaded_file = upload.call_args.args
        self.assertEqual("token", token)
        self.assertEqual("site", site_id)
        self.assertEqual("drive", drive_id)
        self.assertEqual("Data_Goc", folder)
        self.assertEqual("Sell in T08_2026.xlsx", uploaded_file.name)

    @mock.patch.object(sync, "http_request_with_retry", return_value=(b"{}", 201))
    def test_upload_file_uses_graph_put_content_endpoint(self, request: mock.Mock) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workbook = Path(tmp) / "Sell in T08_2026.xlsx"
            workbook.write_bytes(b"test-workbook")
            sync.upload_file_to_sharepoint(
                "token",
                "site-id",
                "drive-id",
                "Data_Goc",
                workbook,
            )

        request.assert_called_once()
        graph_request = request.call_args.args[0]
        self.assertEqual("PUT", graph_request.get_method())
        self.assertIn("/sites/site-id/drives/drive-id/root:/Data_Goc/", graph_request.full_url)
        self.assertTrue(graph_request.full_url.endswith("Sell%20in%20T08_2026.xlsx:/content"))
        self.assertEqual(b"test-workbook", graph_request.data)

    @mock.patch.object(sync, "http_request_with_retry")
    def test_upload_office_workbook_allows_remote_size_change(self, request: mock.Mock) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workbook = Path(tmp) / "Sell in T08_2026.xlsx"
            workbook.write_bytes(b"test-workbook")
            response = {
                "name": workbook.name,
                "size": len(b"test-workbook") + 128,
                "file": {},
            }
            request.return_value = (json.dumps(response).encode("utf-8"), 200)

            result = sync.upload_file_to_sharepoint(
                "token",
                "site-id",
                "drive-id",
                "Data_Goc",
                workbook,
            )

        self.assertEqual(workbook.name, result["name"])
        self.assertGreater(result["size"], len(b"test-workbook"))

    @mock.patch.object(sync, "http_request_with_retry")
    def test_upload_non_office_file_rejects_remote_size_change(self, request: mock.Mock) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            payload = Path(tmp) / "payload.bin"
            payload.write_bytes(b"payload")
            response = {
                "name": payload.name,
                "size": len(b"payload") + 1,
                "file": {},
            }
            request.return_value = (json.dumps(response).encode("utf-8"), 200)

            with self.assertRaises(RuntimeError):
                sync.upload_file_to_sharepoint(
                    "token",
                    "site-id",
                    "drive-id",
                    "Data_Goc",
                    payload,
                )

    @mock.patch.object(sync, "http_request_with_retry")
    def test_upload_rejects_zero_remote_size(self, request: mock.Mock) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workbook = Path(tmp) / "Sell in T08_2026.xlsx"
            workbook.write_bytes(b"test-workbook")
            response = {"name": workbook.name, "size": 0, "file": {}}
            request.return_value = (json.dumps(response).encode("utf-8"), 200)

            with self.assertRaises(RuntimeError):
                sync.upload_file_to_sharepoint(
                    "token",
                    "site-id",
                    "drive-id",
                    "Data_Goc",
                    workbook,
                )


if __name__ == "__main__":
    unittest.main()
