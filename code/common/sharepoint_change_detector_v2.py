"""SharePoint source change detector with per-file manifest and ERP-period diff outputs.

This is the production detector entrypoint. It stays lightweight so an event-driven
SharePoint refresh can verify Graph metadata before installing the full ETL dependency
set. Shared Graph/fingerprint primitives live in ``sharepoint_change_detector_core``.
"""
from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path
from typing import Any, Mapping, Sequence

from sharepoint_change_detector_core import (
    ChangeDetectorError,
    build_state,
    compute_fingerprint,
    detect_change,
    get_graph_access_token,
    list_source_manifest,
    read_remote_state,
    write_remote_state,
)

ERP_FILE_PATTERN = re.compile(
    r"_(?:Vikoda|Vkoda|VKD)_T(?P<month>\d{1,2})_(?P<year>\d{4})\.(?:xlsx|xlsm)$",
    re.IGNORECASE,
)


def parse_erp_period_from_name(name: str) -> str | None:
    """Return YYYY-MM from a valid ERP source filename without opening Excel.

    This intentionally mirrors the Sell-In source naming contract but does not
    import the ETL package (which requires openpyxl). The detector only needs the
    month encoded in the filename to decide which Data_Goc period may be affected.
    """
    match = ERP_FILE_PATTERN.search(str(name or "").strip())
    if not match:
        return None
    month = int(match.group("month"))
    year = int(match.group("year"))
    if not 1 <= month <= 12 or year < 1900:
        return None
    return f"{year:04d}-{month:02d}"


def _manifest_index(items: object) -> dict[str, dict[str, Any]]:
    if not isinstance(items, list):
        return {}
    result: dict[str, dict[str, Any]] = {}
    for raw in items:
        if not isinstance(raw, dict):
            continue
        path = str(raw.get("path") or "").strip()
        if path:
            result[path] = raw
    return result


def changed_manifest_paths(previous_state: Mapping[str, Any] | None, current: list[dict[str, Any]]) -> list[str]:
    """Return added, removed, or metadata-changed source paths.

    Legacy state files did not contain a manifest. In that case return an empty
    list: the incremental planner will reconcile source vs existing Data_Goc and
    the successful run will establish the manifest baseline for future events.
    """
    if not previous_state or not isinstance(previous_state.get("files"), list):
        return []
    previous = _manifest_index(previous_state.get("files"))
    current_map = _manifest_index(current)
    paths = set(previous) | set(current_map)
    changed: list[str] = []
    fields = ("size", "lastModifiedDateTime", "eTag", "cTag")
    for path in paths:
        old = previous.get(path)
        new = current_map.get(path)
        if old is None or new is None:
            changed.append(path)
            continue
        if any(str(old.get(field) or "") != str(new.get(field) or "") for field in fields):
            changed.append(path)
    return sorted(changed, key=str.casefold)


def erp_periods_from_paths(paths: Sequence[str]) -> list[str]:
    periods: set[str] = set()
    for raw in paths:
        normalized = str(raw).replace("\\", "/").strip("/")
        if "/Data ERP/" not in f"/{normalized}":
            continue
        period = parse_erp_period_from_name(Path(normalized).name)
        if period:
            periods.add(period)
    return sorted(periods)


def _write_github_output(values: Mapping[str, Any], env: Mapping[str, str]) -> None:
    output_path = str(env.get("GITHUB_OUTPUT", "")).strip()
    if not output_path:
        return
    with open(output_path, "a", encoding="utf-8") as handle:
        for key, value in values.items():
            handle.write(f"{key}={value}\n")


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Detect SharePoint changes and changed ERP periods")
    parser.add_argument("--action", choices=("check", "commit"), required=True)
    parser.add_argument("--state-path", required=True)
    parser.add_argument("--folder", action="append", default=[])
    parser.add_argument("--fingerprint")
    parser.add_argument("--file-count", type=int, default=0)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--manifest-file", required=True)
    return parser.parse_args(argv)


def _cloud_ids(env: Mapping[str, str]) -> tuple[str, str]:
    site_id = str(env.get("SHAREPOINT_SITE_ID", "")).strip()
    drive_id = str(env.get("SHAREPOINT_DRIVE_ID", "")).strip()
    if not site_id or not drive_id:
        raise ChangeDetectorError("SHAREPOINT_SITE_ID/SHAREPOINT_DRIVE_ID are required after bootstrap")
    return site_id, drive_id


def main(argv: Sequence[str] | None = None, env: Mapping[str, str] | None = None) -> int:
    args = parse_args(argv)
    active_env = os.environ if env is None else env
    site_id, drive_id = _cloud_ids(active_env)
    token = get_graph_access_token()
    manifest_path = Path(args.manifest_file)

    if args.action == "commit":
        fingerprint = str(args.fingerprint or "").strip()
        if len(fingerprint) != 64:
            raise ChangeDetectorError("Commit requires a valid SHA-256 fingerprint")
        if not manifest_path.is_file():
            raise ChangeDetectorError(f"Manifest file missing: {manifest_path}")
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
        files = payload.get("files") if isinstance(payload, dict) else None
        if not isinstance(files, list):
            raise ChangeDetectorError("Manifest file does not contain files[]")
        state = build_state(fingerprint, file_count=args.file_count, env=active_env)
        state["files"] = files
        write_remote_state(token, site_id, drive_id, args.state_path, state)
        print(f"SharePoint source manifest committed: {fingerprint[:12]}… ({len(files)} files)")
        return 0

    folders = [str(folder).strip("/") for folder in args.folder if str(folder).strip("/")]
    if not folders:
        raise ChangeDetectorError("Check action requires at least one --folder")
    manifest = list_source_manifest(token, site_id, drive_id, folders)
    if not manifest:
        raise ChangeDetectorError("No source workbook found in monitored SharePoint folders")
    fingerprint = compute_fingerprint(manifest)
    previous = read_remote_state(token, site_id, drive_id, args.state_path)
    changed, reason = detect_change(previous, fingerprint, force=args.force)
    changed_paths = changed_manifest_paths(previous, manifest)
    erp_periods = erp_periods_from_paths(changed_paths)

    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        json.dumps(
            {
                "fingerprint": fingerprint,
                "file_count": len(manifest),
                "changed": changed,
                "reason": reason,
                "changed_paths": changed_paths,
                "erp_periods": erp_periods,
                "files": manifest,
            },
            ensure_ascii=False,
            indent=2,
        ) + "\n",
        encoding="utf-8",
    )
    outputs = {
        "changed": str(changed).lower(),
        "reason": reason,
        "fingerprint": fingerprint,
        "file_count": len(manifest),
        "changed_path_count": len(changed_paths),
        "erp_periods": ",".join(erp_periods),
    }
    _write_github_output(outputs, active_env)
    print(
        f"SharePoint source check: changed={outputs['changed']} reason={reason} "
        f"files={len(manifest)} changed_paths={len(changed_paths)} erp_periods={outputs['erp_periods'] or '-'}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
