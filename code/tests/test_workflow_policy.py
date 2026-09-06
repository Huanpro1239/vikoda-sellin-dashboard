"""Regression tests for the production workflow architecture and permission contract."""

from __future__ import annotations

import unittest
from pathlib import Path

from code.common.validate_workflow_policy import (
    WorkflowPolicyError,
    validate_workflow_text,
)


PROJECT_ROOT = Path(__file__).resolve().parents[2]
WORKFLOW_PATH = PROJECT_ROOT / ".github/workflows/vikoda_pipeline.yml"


class WorkflowPolicyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.workflow = WORKFLOW_PATH.read_text(encoding="utf-8")

    def test_current_workflow_satisfies_production_contract(self) -> None:
        validate_workflow_text(self.workflow)

    def test_scheduled_sharepoint_polling_is_rejected(self) -> None:
        changed = self.workflow.replace(
            "\npermissions:\n",
            "\n  schedule:\n    - cron: '*/30 * * * *'\n\npermissions:\n",
            1,
        )
        with self.assertRaisesRegex(WorkflowPolicyError, "event-driven"):
            validate_workflow_text(changed)

    def test_repository_dispatch_trigger_is_required(self) -> None:
        changed = self.workflow.replace(
            "  repository_dispatch:\n    types: [sharepoint_changed]\n",
            "",
            1,
        )
        with self.assertRaisesRegex(WorkflowPolicyError, "repository_dispatch"):
            validate_workflow_text(changed)

    def test_repository_dispatch_event_name_is_pinned(self) -> None:
        changed = self.workflow.replace(
            "types: [sharepoint_changed]",
            "types: [unexpected_event]",
            1,
        )
        with self.assertRaisesRegex(WorkflowPolicyError, "sharepoint_changed"):
            validate_workflow_text(changed)

    def test_data_change_event_must_skip_full_source_tests(self) -> None:
        changed = self.workflow.replace(
            "if: github.event_name != 'repository_dispatch'",
            "if: github.event_name != 'push'",
            1,
        )
        with self.assertRaisesRegex(WorkflowPolicyError, "skip the full source test suite"):
            validate_workflow_text(changed)

    def test_cloud_refresh_dependency_requires_always(self) -> None:
        changed = self.workflow.replace(
            "      always() &&\n      (needs.test.result == 'success' || needs.test.result == 'skipped') &&\n",
            "      (needs.test.result == 'success' || needs.test.result == 'skipped') &&\n",
            1,
        )
        with self.assertRaisesRegex(WorkflowPolicyError, "cloud-refresh.*always"):
            validate_workflow_text(changed)

    def test_pages_deploy_must_keep_always(self) -> None:
        deploy_marker = (
            "    if: >-\n"
            "      always() &&\n"
            "      needs.cloud-refresh.result == 'success' &&\n"
        )
        changed = self.workflow.replace(
            deploy_marker,
            "    if: >-\n      needs.cloud-refresh.result == 'success' &&\n",
            1,
        )
        with self.assertRaisesRegex(WorkflowPolicyError, "deploy-dashboard.*always"):
            validate_workflow_text(changed)

    def test_pages_deploy_must_follow_source_changed(self) -> None:
        changed = self.workflow.replace(
            "      needs.cloud-refresh.outputs.source_changed == 'true'",
            "      needs.cloud-refresh.outputs.source_changed == 'false'",
            1,
        )
        with self.assertRaisesRegex(WorkflowPolicyError, "source_changed=true"):
            validate_workflow_text(changed)

    def test_azure_client_secret_is_rejected(self) -> None:
        changed = self.workflow + "\n# AZURE_CLIENT_SECRET\n"
        with self.assertRaisesRegex(WorkflowPolicyError, "AZURE_CLIENT_SECRET"):
            validate_workflow_text(changed)

    def test_id_token_on_read_only_job_is_rejected(self) -> None:
        changed = self.workflow.replace(
            "    permissions:\n      contents: read\n    steps:\n",
            "    permissions:\n      contents: read\n      id-token: write\n    steps:\n",
            1,
        )
        with self.assertRaisesRegex(WorkflowPolicyError, "id-token: write"):
            validate_workflow_text(changed)

    def test_pages_deployment_requires_its_oidc_permission(self) -> None:
        changed = self.workflow.replace(
            "      # Required by actions/deploy-pages for GitHub Pages, not Microsoft Graph.\n"
            "      id-token: write\n",
            "",
            1,
        )
        with self.assertRaisesRegex(WorkflowPolicyError, "id-token: write"):
            validate_workflow_text(changed)

    def test_pages_deployment_cannot_receive_azure_auth(self) -> None:
        changed = self.workflow.replace(
            "    environment:\n      name: github-pages\n",
            "    env:\n      AZURE_CLIENT_ID: forbidden\n"
            "    environment:\n      name: github-pages\n",
            1,
        )
        with self.assertRaisesRegex(WorkflowPolicyError, "Microsoft Entra"):
            validate_workflow_text(changed)


if __name__ == "__main__":
    unittest.main()
