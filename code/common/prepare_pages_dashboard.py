"""Prepare a public-safe GitHub Pages bundle from the generated dashboard.

The production dashboard payload may contain customer identifiers. GitHub Pages
is public for this repository, so this builder copies the web application to a
separate output directory and pseudonymizes customer identities before deploy.
Production ``web/data`` remains untouched and is never committed.
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path
from typing import Any


class PagesSanitizationError(RuntimeError):
    """Raised when a public Pages bundle cannot be proven safe enough to emit."""


def _customer_alias(index: int) -> tuple[str, str, str]:
    public_key = f"C{index:06d}"
    public_code = f"PUBLIC-{index:06d}"
    public_name = f"Khách hàng {index:03d}"
    return public_key, public_code, public_name


def sanitize_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Return a deep-copied payload with customer identities pseudonymized."""
    if not isinstance(payload, dict):
        raise PagesSanitizationError("dashboard payload phải là JSON object")

    customers = payload.get("dim_customer")
    facts = payload.get("fact_sell_in")
    targets = payload.get("fact_target")
    if not isinstance(customers, dict) or not isinstance(facts, list) or not isinstance(targets, list):
        raise PagesSanitizationError("dashboard payload thiếu dim_customer/fact_sell_in/fact_target")

    result = json.loads(json.dumps(payload, ensure_ascii=False))
    source_customers: dict[str, Any] = result["dim_customer"]

    key_map: dict[str, str] = {}
    sanitized_customers: dict[str, Any] = {}
    for index, original_key in enumerate(sorted(source_customers, key=str), start=1):
        public_key, public_code, public_name = _customer_alias(index)
        key_map[str(original_key)] = public_key
        original = source_customers[original_key]
        if not isinstance(original, dict):
            raise PagesSanitizationError(f"Customer {original_key!r} không phải object")
        sanitized_customers[public_key] = {
            "code": public_code,
            "name": public_name,
            "channel": original.get("channel") or "GT",
            "type": original.get("type") or "",
            "system_mt": "MT" if original.get("system_mt") else "",
            "mien": original.get("mien") or "",
            "vung": original.get("vung") or "",
        }

    def remap_rows(rows: list[Any], customer_index: int, label: str) -> list[Any]:
        remapped: list[Any] = []
        for row in rows:
            if not isinstance(row, list) or len(row) <= customer_index:
                raise PagesSanitizationError(f"{label} có row không hợp lệ")
            copied = list(row)
            original_key = str(copied[customer_index])
            if original_key not in key_map:
                raise PagesSanitizationError(
                    f"{label} tham chiếu CustomerKey không tồn tại: {original_key}"
                )
            copied[customer_index] = key_map[original_key]
            remapped.append(copied)
        return remapped

    result["dim_customer"] = sanitized_customers
    result["fact_sell_in"] = remap_rows(result["fact_sell_in"], 1, "fact_sell_in")
    result["fact_target"] = remap_rows(result["fact_target"], 2, "fact_target")

    metadata = result.setdefault("metadata", {})
    if not isinstance(metadata, dict):
        raise PagesSanitizationError("metadata phải là JSON object")
    metadata["data_classification"] = "public-sanitized"
    metadata["customer_identity_removed"] = True
    metadata["public_customer_alias_count"] = len(sanitized_customers)
    return result


def build_pages_bundle(source_dir: Path, output_dir: Path) -> Path:
    source_dir = source_dir.resolve()
    output_dir = output_dir.resolve()
    source_json = source_dir / "data" / "dashboard_data.json"
    if not source_json.is_file() or source_json.stat().st_size <= 0:
        raise PagesSanitizationError(f"Thiếu dashboard data nguồn: {source_json}")

    try:
        payload = json.loads(source_json.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise PagesSanitizationError("dashboard_data.json nguồn không hợp lệ") from exc

    sanitized = sanitize_payload(payload)

    if output_dir.exists():
        shutil.rmtree(output_dir)
    shutil.copytree(
        source_dir,
        output_dir,
        ignore=shutil.ignore_patterns("data", "login.html", "staticwebapp.config.json"),
    )

    data_dir = output_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    compact = json.dumps(sanitized, ensure_ascii=False, separators=(",", ":"))
    (data_dir / "dashboard_data.json").write_text(compact, encoding="utf-8")
    (data_dir / "dashboard_data.js").write_text(
        f"window.VIKODA_DATA = {compact};\n",
        encoding="utf-8",
    )
    (output_dir / ".nojekyll").write_text("", encoding="utf-8")
    return output_dir


def main() -> int:
    parser = argparse.ArgumentParser(description="Build sanitized GitHub Pages dashboard bundle")
    parser.add_argument("--source-dir", default="web")
    parser.add_argument("--output-dir", default="Data/CloudOutputs/GitHubPages")
    args = parser.parse_args()

    bundle = build_pages_bundle(Path(args.source_dir), Path(args.output_dir))
    print(f"GitHub Pages sanitized bundle: {bundle}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
