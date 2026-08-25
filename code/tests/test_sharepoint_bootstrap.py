from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest import mock

PROJECT_ROOT = Path(__file__).resolve().parents[2]
COMMON_DIR = PROJECT_ROOT / "code/common"
if str(COMMON_DIR) not in sys.path:
    sys.path.insert(0, str(COMMON_DIR))

import sharepoint_bootstrap as bootstrap


VALID_OIDC_ENV = {
    "AZURE_TENANT_ID": "tenant",
    "AZURE_CLIENT_ID": "client",
}


class SharePointBootstrapTests(unittest.TestCase):
    def test_missing_oidc_configuration_reports_exact_names(self) -> None:
        with self.assertRaises(bootstrap.BootstrapError) as context:
            bootstrap.bootstrap({"AZURE_TENANT_ID": "tenant"})
        message = str(context.exception)
        self.assertIn("AZURE_CLIENT_ID", message)
        self.assertNotIn("AZURE_CLIENT_SECRET", message)

    @mock.patch.object(bootstrap, "get_graph_access_token", return_value="token")
    def test_existing_site_and_drive_ids_are_reused(self, token: mock.Mock) -> None:
        env = {
            **VALID_OIDC_ENV,
            "SHAREPOINT_SITE_ID": "site-id",
            "SHAREPOINT_DRIVE_ID": "drive-id",
        }
        with mock.patch.object(bootstrap, "_graph_json") as graph:
            site_id, drive_id = bootstrap.bootstrap(env)
        self.assertEqual("site-id", site_id)
        self.assertEqual("drive-id", drive_id)
        graph.assert_not_called()
        token.assert_called_once_with()

    @mock.patch.object(bootstrap, "get_graph_access_token", return_value="token")
    def test_missing_site_and_drive_ids_are_resolved(self, _token: mock.Mock) -> None:
        with mock.patch.object(
            bootstrap,
            "_graph_json",
            side_effect=[{"id": "resolved-site"}, {"id": "resolved-drive"}],
        ) as graph:
            site_id, drive_id = bootstrap.bootstrap(VALID_OIDC_ENV)
        self.assertEqual("resolved-site", site_id)
        self.assertEqual("resolved-drive", drive_id)
        first_url = graph.call_args_list[0].args[1]
        second_url = graph.call_args_list[1].args[1]
        self.assertIn("vikodacomvn.sharepoint.com:/sites/Planning", first_url)
        self.assertTrue(second_url.endswith("/sites/resolved-site/drive"))


if __name__ == "__main__":
    unittest.main()
