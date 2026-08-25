"""Bootstrap SharePoint Graph configuration for GitHub Actions OIDC.

Workflow đăng nhập Microsoft Entra bằng azure/login + GitHub OIDC trước khi chạy
helper này. Helper lấy Graph token từ AzureCliCredential, resolve SharePoint
site/drive nếu chưa cấu hình và export ID sang GITHUB_ENV cho các bước sau.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Mapping

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SYNC_DIR = PROJECT_ROOT / "code/Skill/skill-bao-cao/scripts"
if str(SYNC_DIR) not in sys.path:
    sys.path.insert(0, str(SYNC_DIR))

from sharepoint_graph_sync import get_graph_access_token, http_request_with_retry  # noqa: E402

DEFAULT_HOSTNAME = "vikodacomvn.sharepoint.com"
DEFAULT_SITE_PATH = "/sites/Planning"


class BootstrapError(RuntimeError):
    """Raised when the cloud bootstrap cannot prove a usable configuration."""


def _required_oidc_config(env: Mapping[str, str]) -> dict[str, str]:
    return {
        "AZURE_TENANT_ID": str(env.get("AZURE_TENANT_ID", "")).strip(),
        "AZURE_CLIENT_ID": str(env.get("AZURE_CLIENT_ID", "")).strip(),
    }


def _graph_json(token: str, url: str) -> dict:
    request = urllib.request.Request(url, method="GET")
    request.add_header("Authorization", f"Bearer {token}")
    body, _ = http_request_with_retry(request)
    try:
        payload = json.loads(body.decode("utf-8"))
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise BootstrapError("Microsoft Graph returned invalid JSON") from exc
    if not isinstance(payload, dict):
        raise BootstrapError("Microsoft Graph response must be a JSON object")
    return payload


def resolve_site_id(token: str, env: Mapping[str, str]) -> str:
    configured = str(env.get("SHAREPOINT_SITE_ID", "")).strip()
    if configured:
        return configured

    hostname = str(env.get("SHAREPOINT_HOSTNAME", "")).strip() or DEFAULT_HOSTNAME
    site_path = str(env.get("SHAREPOINT_SITE_PATH", "")).strip() or DEFAULT_SITE_PATH
    site_path = "/" + site_path.strip("/")
    encoded_path = urllib.parse.quote(site_path, safe="/")
    url = f"https://graph.microsoft.com/v1.0/sites/{hostname}:{encoded_path}"
    payload = _graph_json(token, url)
    site_id = str(payload.get("id") or "").strip()
    if not site_id:
        raise BootstrapError("Microsoft Graph did not return a SharePoint site id")
    return site_id


def resolve_drive_id(token: str, site_id: str, env: Mapping[str, str]) -> str:
    configured = str(env.get("SHAREPOINT_DRIVE_ID", "")).strip()
    if configured:
        return configured

    encoded_site_id = urllib.parse.quote(site_id, safe=",")
    payload = _graph_json(
        token,
        f"https://graph.microsoft.com/v1.0/sites/{encoded_site_id}/drive",
    )
    drive_id = str(payload.get("id") or "").strip()
    if not drive_id:
        raise BootstrapError("Microsoft Graph did not return the default document drive id")
    return drive_id


def bootstrap(env: Mapping[str, str] | None = None) -> tuple[str, str]:
    active_env = os.environ if env is None else env
    oidc_config = _required_oidc_config(active_env)
    missing = [name for name, value in oidc_config.items() if not value]
    if missing:
        raise BootstrapError("Missing GitHub OIDC configuration: " + ", ".join(missing))

    token = get_graph_access_token()
    site_id = resolve_site_id(token, active_env)
    drive_id = resolve_drive_id(token, site_id, active_env)
    return site_id, drive_id


def _append_github_env(name: str, value: str, env: Mapping[str, str]) -> None:
    github_env = str(env.get("GITHUB_ENV", "")).strip()
    if not github_env:
        raise BootstrapError("GITHUB_ENV is not available")
    with Path(github_env).open("a", encoding="utf-8") as handle:
        handle.write(f"{name}={value}\n")


def main() -> int:
    try:
        site_id, drive_id = bootstrap()
        if not os.environ.get("SHAREPOINT_SITE_ID", "").strip():
            _append_github_env("SHAREPOINT_SITE_ID", site_id, os.environ)
        if not os.environ.get("SHAREPOINT_DRIVE_ID", "").strip():
            _append_github_env("SHAREPOINT_DRIVE_ID", drive_id, os.environ)
        print("SharePoint OIDC bootstrap: PASS")
        return 0
    except BootstrapError as exc:
        print(f"::error::{exc}")
        return 2
    except Exception as exc:
        print(f"::error::SharePoint bootstrap failed: {type(exc).__name__}: {exc}")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
