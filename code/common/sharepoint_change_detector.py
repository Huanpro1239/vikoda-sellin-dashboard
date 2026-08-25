"""Detect SharePoint workbook changes before running the expensive Sell-In pipeline.

The detector fingerprints source workbooks with Microsoft Graph metadata and compares
that fingerprint with the last successful state stored on SharePoint. The state is
committed only after ETL + validation + uploads succeed, so a failed run is retried
on the next poll instead of being marked as processed.

Authentication is secretless: GitHub Actions first runs azure/login with OIDC and
this script obtains a Graph token through AzureCliCredential.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

GRAPH_SCOPE = "https://graph.microsoft.com/.default"
WORKBOOK_SUFFIXES = {".xlsx", ".xlsm"}
STATE_VERSION = 1


class ChangeDetectorError(RuntimeError):
    """Raised when the detector cannot prove a valid SharePoint state."""


def _request_with_retry(
    request: urllib.request.Request,
    *,
    max_retries: int = 3,
    initial_delay: float = 1.0,
) -> tuple[bytes, int]:
    delay = initial_delay
    last_error: Exception | None = None
    for attempt in range(1, max_retries + 1):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.read(), response.status
        except urllib.error.HTTPError as exc:
            last_error = exc
            if exc.code == 404:
                raise
            if exc.code in {429, 500, 502, 503, 504} and attempt < max_retries:
                retry_after = exc.headers.get("Retry-After") if exc.headers else None
                wait = float(retry_after) if retry_after and retry_after.isdigit() else delay
                time.sleep(wait)
                delay *= 2
                continue
            raise
        except (urllib.error.URLError, TimeoutError) as exc:
            last_error = exc
            if attempt < max_retries:
                time.sleep(delay)
                delay *= 2
                continue
            raise
    raise ChangeDetectorError(f"Microsoft Graph retry exhausted: {last_error}")


def get_graph_access_token(credential: Any | None = None) -> str:
    if credential is None:
        try:
            from azure.identity import AzureCliCredential
        except ImportError as exc:
            raise ChangeDetectorError("azure-identity is required for Graph authentication") from exc
        credential = AzureCliCredential()
    access_token = credential.get_token(GRAPH_SCOPE)
    token = str(getattr(access_token, "token", "") or "").strip()
    if not token:
        raise ChangeDetectorError("AzureCliCredential did not return a Graph token")
    return token


def _graph_json(token: str, url: str) -> dict[str, Any]:
    request = urllib.request.Request(url, method="GET")
    request.add_header("Authorization", f"Bearer {token}")
    body, status = _request_with_retry(request)
    if status != 200:
        raise ChangeDetectorError(f"Unexpected Graph HTTP {status}: {url}")
    try:
        payload = json.loads(body.decode("utf-8"))
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise ChangeDetectorError("Microsoft Graph returned invalid JSON") from exc
    if not isinstance(payload, dict):
        raise ChangeDetectorError("Microsoft Graph response must be a JSON object")
    return payload


def _safe_child_name(value: Any) -> str:
    name = str(value or "").strip()
    if not name or name in {".", ".."} or "/" in name or "\\" in name:
        raise ChangeDetectorError(f"Unsafe SharePoint child name: {name!r}")
    return name


def is_relevant_workbook(name: str) -> bool:
    normalized = str(name or "").strip()
    if not normalized or normalized.startswith("~$"):
        return False
    return Path(normalized).suffix.lower() in WORKBOOK_SUFFIXES


def _children_url(site_id: str, drive_id: str, folder_path: str) -> str:
    encoded = urllib.parse.quote(folder_path.strip("/"), safe="/")
    select = urllib.parse.quote("name,size,lastModifiedDateTime,eTag,cTag,file,folder", safe=",")
    return (
        f"https://graph.microsoft.com/v1.0/sites/{site_id}/drives/{drive_id}"
        f"/root:/{encoded}:/children?$select={select}"
    )


def list_source_manifest(
    token: str,
    site_id: str,
    drive_id: str,
    folders: Sequence[str],
) -> list[dict[str, Any]]:
    manifest: list[dict[str, Any]] = []
    queue = [folder.strip("/") for folder in folders if folder.strip("/")]
    visited: set[str] = set()

    while queue:
        folder = queue.pop(0)
        if folder in visited:
            continue
        visited.add(folder)
        next_url: str | None = _children_url(site_id, drive_id, folder)
        seen_pages: set[str] = set()

        while next_url:
            if next_url in seen_pages:
                raise ChangeDetectorError(f"Graph pagination loop detected at {folder}")
            seen_pages.add(next_url)
            page = _graph_json(token, next_url)
            values = page.get("value")
            if not isinstance(values, list):
                raise ChangeDetectorError(f"Graph children payload invalid for {folder}")

            for raw in values:
                if not isinstance(raw, dict):
                    continue
                name = _safe_child_name(raw.get("name"))
                child_path = f"{folder}/{name}"
                if "folder" in raw:
                    queue.append(child_path)
                    continue
                if "file" not in raw or not is_relevant_workbook(name):
                    continue
                manifest.append(
                    {
                        "path": child_path,
                        "size": int(raw.get("size") or 0),
                        "lastModifiedDateTime": str(raw.get("lastModifiedDateTime") or ""),
                        "eTag": str(raw.get("eTag") or ""),
                        "cTag": str(raw.get("cTag") or ""),
                    }
                )

            candidate = page.get("@odata.nextLink")
            next_url = str(candidate) if candidate else None

    manifest.sort(key=lambda item: item["path"].casefold())
    return manifest


def compute_fingerprint(manifest: Iterable[Mapping[str, Any]]) -> str:
    normalized = [
        {
            "path": str(item.get("path") or ""),
            "size": int(item.get("size") or 0),
            "lastModifiedDateTime": str(item.get("lastModifiedDateTime") or ""),
            "eTag": str(item.get("eTag") or ""),
            "cTag": str(item.get("cTag") or ""),
        }
        for item in manifest
    ]
    normalized.sort(key=lambda item: item["path"].casefold())
    canonical = json.dumps(normalized, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def read_remote_state(token: str, site_id: str, drive_id: str, state_path: str) -> dict[str, Any] | None:
    encoded = urllib.parse.quote(state_path.strip("/"), safe="/")
    url = (
        f"https://graph.microsoft.com/v1.0/sites/{site_id}/drives/{drive_id}"
        f"/root:/{encoded}:/content"
    )
    request = urllib.request.Request(url, method="GET")
    request.add_header("Authorization", f"Bearer {token}")
    try:
        body, status = _request_with_retry(request)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise
    if status != 200:
        raise ChangeDetectorError(f"Unexpected state read HTTP {status}")
    try:
        payload = json.loads(body.decode("utf-8"))
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise ChangeDetectorError("Remote pipeline state is not valid JSON") from exc
    return payload if isinstance(payload, dict) else None


def detect_change(previous_state: Mapping[str, Any] | None, fingerprint: str, *, force: bool = False) -> tuple[bool, str]:
    if force:
        return True, "manual-force"
    if not previous_state:
        return True, "state-missing"
    previous = str(previous_state.get("fingerprint") or "")
    if not previous:
        return True, "state-invalid"
    if previous != fingerprint:
        return True, "source-fingerprint-changed"
    return False, "no-source-change"


def build_state(fingerprint: str, *, file_count: int, env: Mapping[str, str]) -> dict[str, Any]:
    return {
        "version": STATE_VERSION,
        "fingerprint": fingerprint,
        "file_count": int(file_count),
        "committed_at": datetime.now(timezone.utc).isoformat(),
        "github_run_id": str(env.get("GITHUB_RUN_ID", "")),
        "github_run_attempt": str(env.get("GITHUB_RUN_ATTEMPT", "")),
        "github_sha": str(env.get("GITHUB_SHA", "")),
    }


def write_remote_state(
    token: str,
    site_id: str,
    drive_id: str,
    state_path: str,
    state: Mapping[str, Any],
) -> None:
    encoded = urllib.parse.quote(state_path.strip("/"), safe="/")
    url = (
        f"https://graph.microsoft.com/v1.0/sites/{site_id}/drives/{drive_id}"
        f"/root:/{encoded}:/content"
    )
    data = (json.dumps(dict(state), ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    request = urllib.request.Request(url, data=data, method="PUT")
    request.add_header("Authorization", f"Bearer {token}")
    request.add_header("Content-Type", "application/json; charset=utf-8")
    body, status = _request_with_retry(request)
    if status not in {200, 201}:
        raise ChangeDetectorError(f"State upload failed with HTTP {status}")
    if body:
        try:
            response = json.loads(body.decode("utf-8"))
        except (UnicodeError, json.JSONDecodeError):
            response = {}
        if isinstance(response, dict) and int(response.get("size") or len(data)) <= 0:
            raise ChangeDetectorError("Graph returned an empty state file after upload")


def _required_cloud_ids(env: Mapping[str, str]) -> tuple[str, str]:
    site_id = str(env.get("SHAREPOINT_SITE_ID", "")).strip()
    drive_id = str(env.get("SHAREPOINT_DRIVE_ID", "")).strip()
    missing = [name for name, value in (("SHAREPOINT_SITE_ID", site_id), ("SHAREPOINT_DRIVE_ID", drive_id)) if not value]
    if missing:
        raise ChangeDetectorError(f"Missing cloud configuration: {', '.join(missing)}")
    return site_id, drive_id


def _write_github_output(values: Mapping[str, Any], env: Mapping[str, str]) -> None:
    output_path = str(env.get("GITHUB_OUTPUT", "")).strip()
    if not output_path:
        return
    with open(output_path, "a", encoding="utf-8") as handle:
        for key, value in values.items():
            handle.write(f"{key}={value}\n")


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Detect SharePoint source workbook changes")
    parser.add_argument("--action", choices=("check", "commit"), required=True)
    parser.add_argument("--state-path", required=True, help="SharePoint path to the state JSON file")
    parser.add_argument("--folder", action="append", default=[], help="Source folder; repeat for each source")
    parser.add_argument("--fingerprint", help="Fingerprint from the successful check step (commit action)")
    parser.add_argument("--file-count", type=int, default=0)
    parser.add_argument("--force", action="store_true", help="Treat this run as changed even if fingerprint matches")
    parser.add_argument("--manifest-file", help="Optional local manifest JSON output")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None, env: Mapping[str, str] | None = None) -> int:
    args = parse_args(argv)
    active_env = os.environ if env is None else env
    site_id, drive_id = _required_cloud_ids(active_env)
    token = get_graph_access_token()

    if args.action == "commit":
        fingerprint = str(args.fingerprint or "").strip()
        if len(fingerprint) != 64:
            raise ChangeDetectorError("Commit requires a valid SHA-256 fingerprint")
        state = build_state(fingerprint, file_count=args.file_count, env=active_env)
        write_remote_state(token, site_id, drive_id, args.state_path, state)
        print(f"SharePoint source state committed: {fingerprint[:12]}…")
        return 0

    folders = [str(folder).strip("/") for folder in args.folder if str(folder).strip("/")]
    if not folders:
        raise ChangeDetectorError("Check action requires at least one --folder")

    manifest = list_source_manifest(token, site_id, drive_id, folders)
    if not manifest:
        raise ChangeDetectorError("No .xlsx/.xlsm source workbook found in monitored SharePoint folders")
    fingerprint = compute_fingerprint(manifest)
    previous = read_remote_state(token, site_id, drive_id, args.state_path)
    changed, reason = detect_change(previous, fingerprint, force=args.force)

    if args.manifest_file:
        manifest_path = Path(args.manifest_file)
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(
            json.dumps(
                {
                    "fingerprint": fingerprint,
                    "file_count": len(manifest),
                    "changed": changed,
                    "reason": reason,
                    "files": manifest,
                },
                ensure_ascii=False,
                indent=2,
            ) + "\n",
            encoding="utf-8",
        )

    outputs = {
        "changed": str(changed).lower(),
        "fingerprint": fingerprint,
        "file_count": len(manifest),
        "reason": reason,
    }
    _write_github_output(outputs, active_env)
    print(
        f"SharePoint change check: changed={str(changed).lower()} "
        f"reason={reason} files={len(manifest)} fingerprint={fingerprint[:12]}…"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
