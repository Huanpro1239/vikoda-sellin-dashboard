"""Validate the least-privilege contract of the production GitHub workflow.

The validator intentionally uses only the Python standard library so it can run
before project dependencies are installed in CI. It checks the small security
surface that must remain stable; it is not intended to be a general YAML parser.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_WORKFLOW = PROJECT_ROOT / ".github/workflows/vikoda_pipeline.yml"
JOB_PATTERN = re.compile(r"(?m)^  ([A-Za-z0-9_-]+):\s*$")
PERMISSION_PATTERN = re.compile(r"^      ([A-Za-z0-9_-]+):\s*([^#\s]+)", re.MULTILINE)


class WorkflowPolicyError(RuntimeError):
    """Raised when the workflow violates a production security invariant."""


def _job_blocks(workflow_text: str) -> dict[str, str]:
    jobs_match = re.search(r"(?m)^jobs:\s*$", workflow_text)
    if jobs_match is None:
        raise WorkflowPolicyError("Workflow is missing the top-level jobs section")

    jobs_text = workflow_text[jobs_match.end() :]
    matches = list(JOB_PATTERN.finditer(jobs_text))
    if not matches:
        raise WorkflowPolicyError("Workflow does not define any jobs")

    blocks: dict[str, str] = {}
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(jobs_text)
        blocks[match.group(1)] = jobs_text[match.start() : end]
    return blocks


def _permissions(job_name: str, job_block: str) -> dict[str, str]:
    marker = re.search(r"(?m)^    permissions:\s*$", job_block)
    if marker is None:
        raise WorkflowPolicyError(f"Job {job_name!r} must declare explicit permissions")

    tail = job_block[marker.end() :]
    end = re.search(r"(?m)^    [A-Za-z0-9_-]+:\s*", tail)
    permissions_text = tail[: end.start()] if end else tail
    return dict(PERMISSION_PATTERN.findall(permissions_text))


def validate_workflow_text(workflow_text: str) -> None:
    """Raise ``WorkflowPolicyError`` if the workflow breaks the auth contract."""
    if "AZURE_CLIENT_SECRET" in workflow_text:
        raise WorkflowPolicyError("Production workflow must not reference AZURE_CLIENT_SECRET")

    jobs = _job_blocks(workflow_text)
    required_jobs = {"repository-hygiene", "test", "cloud-refresh", "deploy-dashboard"}
    missing = sorted(required_jobs.difference(jobs))
    if missing:
        raise WorkflowPolicyError(f"Workflow is missing required jobs: {', '.join(missing)}")

    permissions = {name: _permissions(name, block) for name, block in jobs.items()}
    id_token_jobs = {
        name for name, values in permissions.items() if values.get("id-token") == "write"
    }
    allowed_id_token_jobs = {"cloud-refresh", "deploy-dashboard"}
    if id_token_jobs != allowed_id_token_jobs:
        raise WorkflowPolicyError(
            "id-token: write must be limited to cloud-refresh and deploy-dashboard; "
            f"found: {', '.join(sorted(id_token_jobs)) or 'none'}"
        )

    for job_name in ("repository-hygiene", "test"):
        if permissions[job_name] != {"contents": "read"}:
            raise WorkflowPolicyError(f"Job {job_name!r} must remain contents: read only")

    if permissions["cloud-refresh"] != {"contents": "read", "id-token": "write"}:
        raise WorkflowPolicyError(
            "Job 'cloud-refresh' must have only contents: read and id-token: write"
        )
    if "uses: azure/login@" not in jobs["cloud-refresh"]:
        raise WorkflowPolicyError("Job 'cloud-refresh' must use Azure OIDC login")

    expected_pages_permissions = {
        "contents": "read",
        "pages": "write",
        "id-token": "write",
    }
    if permissions["deploy-dashboard"] != expected_pages_permissions:
        raise WorkflowPolicyError(
            "Job 'deploy-dashboard' must have only contents: read, pages: write, "
            "and id-token: write"
        )
    if "uses: actions/deploy-pages@" not in jobs["deploy-dashboard"]:
        raise WorkflowPolicyError("Job 'deploy-dashboard' must deploy through actions/deploy-pages")
    forbidden_pages_auth = ("AZURE_TENANT_ID", "AZURE_CLIENT_ID", "uses: azure/login@")
    if any(marker in jobs["deploy-dashboard"] for marker in forbidden_pages_auth):
        raise WorkflowPolicyError(
            "Job 'deploy-dashboard' must not receive Microsoft Entra or Graph authentication"
        )


def validate_workflow_file(path: Path = DEFAULT_WORKFLOW) -> None:
    validate_workflow_text(path.read_text(encoding="utf-8"))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "workflow",
        nargs="?",
        type=Path,
        default=DEFAULT_WORKFLOW,
        help="Workflow YAML to validate (defaults to the production workflow).",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        validate_workflow_file(args.workflow)
    except (OSError, UnicodeError, WorkflowPolicyError) as exc:
        print(f"Workflow policy: FAIL - {exc}")
        return 1
    print(f"Workflow policy: PASS - {args.workflow}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
