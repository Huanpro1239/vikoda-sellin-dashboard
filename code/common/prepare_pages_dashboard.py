"""Prepare a public-safe GitHub Pages bundle from the generated dashboard.

GitHub Pages is public for this repository. The production dashboard payload may
contain customer identifiers and customer-level revenue, so this builder creates
an isolated deployment bundle where customers are collapsed into business groups
(Channel + Mien + Vung + Type) before publication. Production ``web/data`` stays
untouched and is never committed.
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path
from typing import Any


class PagesSanitizationError(RuntimeError):
    """Raised when a public Pages bundle cannot be proven safe enough to emit."""


def _group_signature(customer: dict[str, Any]) -> tuple[str, str, str, str]:
    return (
        str(customer.get("channel") or "GT").strip(),
        str(customer.get("mien") or "").strip(),
        str(customer.get("vung") or "").strip(),
        str(customer.get("type") or "").strip(),
    )


def sanitize_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Remove customer identity and collapse customer-level rows into groups."""
    if not isinstance(payload, dict):
        raise PagesSanitizationError("dashboard payload phải là JSON object")

    customers = payload.get("dim_customer")
    facts = payload.get("fact_sell_in")
    targets = payload.get("fact_target")
    if not isinstance(customers, dict) or not isinstance(facts, list) or not isinstance(targets, list):
        raise PagesSanitizationError("dashboard payload thiếu dim_customer/fact_sell_in/fact_target")

    result = json.loads(json.dumps(payload, ensure_ascii=False))
    source_customers: dict[str, Any] = result["dim_customer"]

    signatures: dict[tuple[str, str, str, str], str] = {}
    key_map: dict[str, str] = {}
    grouped_customers: dict[str, Any] = {}

    for original_key in sorted(source_customers, key=str):
        customer = source_customers[original_key]
        if not isinstance(customer, dict):
            raise PagesSanitizationError(f"Customer {original_key!r} không phải object")
        signature = _group_signature(customer)
        public_key = signatures.get(signature)
        if public_key is None:
            public_key = f"G{len(signatures) + 1:04d}"
            signatures[signature] = public_key
            channel, mien, vung, customer_type = signature
            parts = [part for part in (channel, mien, vung) if part]
            grouped_customers[public_key] = {
                "code": public_key,
                "name": " · ".join(parts) or "Nhóm khách hàng",
                "channel": channel,
                "type": customer_type,
                "system_mt": "",
                "mien": mien,
                "vung": vung,
            }
        key_map[str(original_key)] = public_key

    def map_key(raw_key: Any, label: str) -> str:
        original_key = str(raw_key)
        if original_key not in key_map:
            raise PagesSanitizationError(
                f"{label} tham chiếu CustomerKey không tồn tại: {original_key}"
            )
        return key_map[original_key]

    def aggregate_sell(rows: list[Any]) -> list[list[Any]]:
        # [date, customer, product, territory, revenue, qty, converted_qty, is_return]
        buckets: dict[tuple[Any, ...], list[Any]] = {}
        for row in rows:
            if not isinstance(row, list) or len(row) < 8:
                raise PagesSanitizationError("fact_sell_in có row không hợp lệ")
            group_key = map_key(row[1], "fact_sell_in")
            bucket_key = (row[0], group_key, row[2], row[3], row[7])
            if bucket_key not in buckets:
                buckets[bucket_key] = [row[0], group_key, row[2], row[3], 0.0, 0.0, 0.0, row[7]]
            target = buckets[bucket_key]
            target[4] += float(row[4] or 0)
            target[5] += float(row[5] or 0)
            if row[6] is not None:
                target[6] += float(row[6] or 0)
        return [
            [r[0], r[1], r[2], r[3], round(r[4], 2), round(r[5], 2), round(r[6], 2), r[7]]
            for r in buckets.values()
        ]

    def aggregate_targets(rows: list[Any]) -> list[list[Any]]:
        # [period, territory, customer, target_total, target_vikoda]
        buckets: dict[tuple[Any, ...], list[Any]] = {}
        for row in rows:
            if not isinstance(row, list) or len(row) < 5:
                raise PagesSanitizationError("fact_target có row không hợp lệ")
            group_key = map_key(row[2], "fact_target")
            bucket_key = (row[0], row[1], group_key)
            if bucket_key not in buckets:
                buckets[bucket_key] = [row[0], row[1], group_key, 0.0, 0.0]
            target = buckets[bucket_key]
            target[3] += float(row[3] or 0)
            target[4] += float(row[4] or 0)
        return [
            [r[0], r[1], r[2], round(r[3], 2), round(r[4], 2)]
            for r in buckets.values()
        ]

    result["dim_customer"] = grouped_customers
    result["fact_sell_in"] = aggregate_sell(result["fact_sell_in"])
    result["fact_target"] = aggregate_targets(result["fact_target"])

    metadata = result.setdefault("metadata", {})
    if not isinstance(metadata, dict):
        raise PagesSanitizationError("metadata phải là JSON object")
    metadata["data_classification"] = "public-sanitized"
    metadata["customer_identity_removed"] = True
    metadata["customer_level_data_removed"] = True
    metadata["public_customer_group_count"] = len(grouped_customers)
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
