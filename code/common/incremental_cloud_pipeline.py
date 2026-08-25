"""Incremental SharePoint cloud pipeline for Vikoda Sell-In.

The existing monthly engine already knows how to decide which period needs a
REBUILD. This orchestrator makes that engine usable in ephemeral GitHub runners:

1. copy the current SharePoint Data_Goc workbooks into the standard output folder,
2. compare ERP sources against those baseline outputs + incremental state,
3. rebuild only changed/missing monthly workbooks,
4. rebuild downstream report/web data from the complete baseline + delta set,
5. create a delta upload directory containing only rebuilt workbooks + state.

Data_Goc is therefore a managed output set: users update ERP/Target/catalog
sources, while the pipeline replaces only the affected monthly workbook.
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SELLIN_DIR = PROJECT_ROOT / "code/Skill/sell-in-monthly/scripts"
REPORT_DIR = PROJECT_ROOT / "code/Skill/skill-bao-cao/scripts"
COMMON_DIR = PROJECT_ROOT / "code/common"
for folder in (SELLIN_DIR, REPORT_DIR, COMMON_DIR):
    if str(folder) not in sys.path:
        sys.path.insert(0, str(folder))

from incremental import build_incremental_plan, commit_incremental_plan, write_plan  # noqa: E402
from run_cloud_pipeline import (  # noqa: E402
    PipelineValidationError,
    _load_json,
    _require,
    _require_refreshed,
    _require_web_export_fresh,
    _signature,
    run_command,
)

WORKBOOK_SUFFIXES = {".xlsx", ".xlsm"}
STATE_NAME = "_vikoda_incremental_state.json"


def _workbooks(directory: Path) -> list[Path]:
    if not directory.is_dir():
        return []
    return sorted(
        path for path in directory.iterdir()
        if path.is_file() and path.suffix.lower() in WORKBOOK_SUFFIXES and path.stat().st_size > 0
    )


def _clean_dir(directory: Path) -> None:
    if directory.exists():
        shutil.rmtree(directory)
    directory.mkdir(parents=True, exist_ok=True)


def _copy_baseline(baseline_dir: Path, output_dir: Path) -> list[Path]:
    baseline = _workbooks(baseline_dir)
    _require(bool(baseline), f"Thiếu baseline Data_Goc workbook trong: {baseline_dir}")
    output_dir.mkdir(parents=True, exist_ok=True)
    for existing in _workbooks(output_dir):
        existing.unlink()
    copied: list[Path] = []
    for source in baseline:
        target = output_dir / source.name
        shutil.copy2(source, target)
        copied.append(target)
    return copied


def _sanitize_sharepoint_state(state_file: Path) -> None:
    """Drop package-level output hashes that SharePoint Office metadata can alter.

    The planner still re-opens every baseline workbook and validates its schema +
    invoice-date counts. Exact months reported by the SharePoint manifest diff are
    additionally force-rebuilt, so source corrections are never skipped merely
    because row counts stayed constant.
    """
    if not state_file.is_file() or state_file.stat().st_size <= 0:
        return
    try:
        state = json.loads(state_file.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return
    outputs = state.get("outputs") if isinstance(state, dict) else None
    if not isinstance(outputs, dict):
        return
    changed = False
    for output in outputs.values():
        if isinstance(output, dict) and "sha256" in output:
            output.pop("sha256", None)
            changed = True
    if changed:
        state_file.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _copy_complete_data_goc(output_dir: Path, data_goc_dir: Path) -> None:
    _clean_dir(data_goc_dir)
    for source in _workbooks(output_dir):
        shutil.copy2(source, data_goc_dir / source.name)


def _run_downstream(
    root: Path,
    *,
    output_dir: Path,
    target_src: Path,
    dmkh_src: Path,
    product_catalog: Path,
    run_started_at: datetime,
) -> None:
    scripts_report = root / "code/Skill/skill-bao-cao/scripts"
    scripts_sellin = root / "code/Skill/sell-in-monthly/scripts"
    common_dir = root / "code/common"
    staging_dir = root / "Data/Work/bao_cao/data/staging"
    target_staging = root / "Data/Work/bao_cao/target/staging"
    dmkh_staging = root / "Data/Work/bao_cao/dmkh/staging"
    target_staging.mkdir(parents=True, exist_ok=True)
    dmkh_staging.mkdir(parents=True, exist_ok=True)
    staging_dir.mkdir(parents=True, exist_ok=True)

    target_data_file = target_staging / "target_records.json"
    sell_in_data_file = staging_dir / "sell_in_data.json"
    dmkh_data_file = dmkh_staging / "dmkh_data.json"

    target_before = _signature(target_data_file)
    run_command([
        sys.executable, str(scripts_report / "extract_targets.py"),
        "--source-dir", str(target_src), "--staging-dir", str(target_staging),
    ], cwd=root)
    _require_refreshed(target_data_file, target_before, "target_records.json")
    _load_json(target_data_file, "target_records.json")

    dmkh_before = _signature(dmkh_data_file)
    run_command([
        sys.executable, str(scripts_report / "extract_customers.py"),
        "--source-dir", str(dmkh_src), "--staging-dir", str(dmkh_staging),
    ], cwd=root)
    _require_refreshed(dmkh_data_file, dmkh_before, "dmkh_data.json")
    _load_json(dmkh_data_file, "dmkh_data.json")

    sell_in_before = _signature(sell_in_data_file)
    run_command([
        sys.executable, str(scripts_report / "extract_sell_in_data.py"),
        "--source-dir", str(output_dir), "--staging-dir", str(staging_dir),
    ], cwd=root)
    _require_refreshed(sell_in_data_file, sell_in_before, "sell_in_data.json")
    _load_json(sell_in_data_file, "sell_in_data.json")

    master_report = root / "Data/File bao cao/Bao_Cao_Sell_in.xlsx"
    master_before = _signature(master_report)
    run_command([
        sys.executable, str(scripts_report / "build_report_workbook.py"),
        "--target-data-file", str(target_data_file),
        "--sell-in-data-file", str(sell_in_data_file),
        "--dmkh-data-file", str(dmkh_data_file),
        "--output-file", str(master_report),
    ], cwd=root)
    _require_refreshed(master_report, master_before, "Bao_Cao_Sell_in.xlsx")

    quality_report = root / "Data/Work/data_quality_report.json"
    quality_before = _signature(quality_report)
    run_command([
        sys.executable, str(common_dir / "validation.py"), "--project-root", str(root),
    ], cwd=root)
    _require_refreshed(quality_report, quality_before, "data_quality_report.json")
    quality = _load_json(quality_report, "data_quality_report.json")
    _require(isinstance(quality, dict) and quality.get("status") == "PASS", "Data quality status không phải PASS")

    looker_csv = root / "Data/File bao cao/Sell in tong hop.csv"
    looker_report = root / "Data/Work/bao_cao/looker_report.json"
    run_command([
        sys.executable, str(scripts_sellin / "build_looker_dataset.py"),
        "--output-dir", str(output_dir),
        "--csv-file", str(looker_csv),
        "--report-file", str(looker_report),
    ], cwd=root)

    web_dir = root / "web/data"
    web_json = web_dir / "dashboard_data.json"
    web_js = web_dir / "dashboard_data.js"
    before_json = _signature(web_json)
    before_js = _signature(web_js)
    run_command([
        sys.executable, str(scripts_report / "export_web_data.py"),
        "--project-root", str(root),
        "--product-catalog", str(product_catalog),
    ], cwd=root)
    _require_web_export_fresh(web_json, web_js, before_json, before_js, run_started_at)


def run_incremental_cloud(
    root: Path,
    *,
    erp_source_dir: Path,
    baseline_data_goc_dir: Path,
    target_source_dir: Path,
    dmkh_source_dir: Path,
    product_catalog: Path,
    incremental_state_file: Path,
    plan_file: Path,
    delta_dir: Path,
    force_periods: Sequence[str],
    summary_file: Path,
) -> dict[str, Any]:
    run_started_at = datetime.now(timezone.utc)
    output_dir = root / "Data/File bao cao/Sell In Thang"
    staging_dir = root / "Data/Work/bao_cao/data/staging"
    preview_dir = root / "Data/Work/bao_cao/data/preview"
    verification_file = root / "Data/Work/bao_cao/incremental_verification.json"

    for path, label in (
        (erp_source_dir, "ERP source"),
        (baseline_data_goc_dir, "Data_Goc baseline"),
        (target_source_dir, "Target source"),
        (dmkh_source_dir, "DanhMuc_KH source"),
    ):
        _require(path.is_dir(), f"Thiếu {label}: {path}")
    _require(product_catalog.is_file() and product_catalog.stat().st_size > 0, f"Thiếu product catalog: {product_catalog}")
    _require(bool(_workbooks(erp_source_dir)), f"Không có ERP workbook: {erp_source_dir}")
    _require(bool(_workbooks(target_source_dir)), f"Không có Target workbook: {target_source_dir}")
    _require(bool(_workbooks(dmkh_source_dir)), f"Không có DanhMuc_KH workbook: {dmkh_source_dir}")

    baseline = _copy_baseline(baseline_data_goc_dir, output_dir)
    incremental_state_file.parent.mkdir(parents=True, exist_ok=True)
    _sanitize_sharepoint_state(incremental_state_file)

    plan = build_incremental_plan(
        erp_source_dir,
        output_dir,
        incremental_state_file,
        force_periods=list(force_periods),
        force_all=False,
    )
    write_plan(plan, plan_file)
    if plan.get("problems"):
        raise PipelineValidationError("Incremental plan có lỗi: " + "; ".join(plan["problems"]))

    rebuild_periods = list(plan.get("rebuild_periods") or [])
    if rebuild_periods:
        audit_file = staging_dir / "audit.json"
        audit_before = _signature(audit_file)
        run_command([
            sys.executable,
            str(root / "code/Skill/sell-in-monthly/scripts/extract_sources.py"),
            "--source-dir", str(erp_source_dir),
            "--staging-dir", str(staging_dir),
            "--plan-file", str(plan_file),
        ], cwd=root)
        _require_refreshed(audit_file, audit_before, "incremental audit.json")
        audit = _load_json(audit_file, "incremental audit.json")
        monthly_files = audit.get("monthly_files", []) if isinstance(audit, dict) else []
        _require(bool(monthly_files), "Incremental plan yêu cầu REBUILD nhưng audit không có monthly_files")
        for monthly in monthly_files:
            period = f"{int(monthly['year']):04d}-{int(monthly['month']):02d}"
            output = output_dir / f"Sell in T{int(monthly['month']):02d}_{int(monthly['year'])}.xlsx"
            before = _signature(output)
            run_command([
                sys.executable,
                str(root / "code/Skill/sell-in-monthly/scripts/build_outputs.py"),
                "--staging-dir", str(staging_dir),
                "--output-dir", str(output_dir),
                "--report-dir", str(preview_dir),
                "--period", period,
            ], cwd=root)
            _require_refreshed(output, before, f"Data_Goc {period}")
        run_command([
            sys.executable,
            str(root / "code/Skill/sell-in-monthly/scripts/verify_outputs.py"),
            "--audit-file", str(audit_file),
            "--output-dir", str(output_dir),
            "--report-file", str(verification_file),
        ], cwd=root)

    _copy_complete_data_goc(output_dir, root / "Data/Data_Goc")
    _run_downstream(
        root,
        output_dir=output_dir,
        target_src=target_source_dir,
        dmkh_src=dmkh_source_dir,
        product_catalog=product_catalog,
        run_started_at=run_started_at,
    )

    commit_incremental_plan(plan, incremental_state_file)
    _clean_dir(delta_dir)
    for period in rebuild_periods:
        year, month = (int(part) for part in period.split("-"))
        source = output_dir / f"Sell in T{month:02d}_{year}.xlsx"
        _require(source.is_file() and source.stat().st_size > 0, f"Thiếu workbook delta: {source}")
        shutil.copy2(source, delta_dir / source.name)
    shutil.copy2(incremental_state_file, delta_dir / STATE_NAME)

    summary = {
        "baseline_workbooks": len(baseline),
        "rebuild_periods": rebuild_periods,
        "rebuild_count": len(rebuild_periods),
        "skipped_periods": list(plan.get("skipped_periods") or []),
        "delta_workbooks": [path.name for path in _workbooks(delta_dir)],
        "delta_file_count": len([path for path in delta_dir.iterdir() if path.is_file()]),
        "incremental_state": str(incremental_state_file),
    }
    summary_file.parent.mkdir(parents=True, exist_ok=True)
    summary_file.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        "Incremental cloud PASS: "
        f"baseline={len(baseline)} rebuild={len(rebuild_periods)} "
        f"periods={','.join(rebuild_periods) or '-'} delta_files={summary['delta_file_count']}"
    )
    return summary


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run incremental Vikoda SharePoint cloud pipeline")
    parser.add_argument("--project-root", default=".")
    parser.add_argument("--erp-source-dir", required=True)
    parser.add_argument("--baseline-data-goc-dir", required=True)
    parser.add_argument("--target-source-dir", required=True)
    parser.add_argument("--dmkh-source-dir", required=True)
    parser.add_argument("--product-catalog", required=True)
    parser.add_argument("--incremental-state-file", required=True)
    parser.add_argument("--plan-file", required=True)
    parser.add_argument("--delta-dir", required=True)
    parser.add_argument("--force-period", action="append", default=[])
    parser.add_argument("--summary-file", required=True)
    return parser.parse_args(argv)


def _resolve(root: Path, value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else root / path


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    root = Path(args.project_root).resolve()
    run_incremental_cloud(
        root,
        erp_source_dir=_resolve(root, args.erp_source_dir),
        baseline_data_goc_dir=_resolve(root, args.baseline_data_goc_dir),
        target_source_dir=_resolve(root, args.target_source_dir),
        dmkh_source_dir=_resolve(root, args.dmkh_source_dir),
        product_catalog=_resolve(root, args.product_catalog),
        incremental_state_file=_resolve(root, args.incremental_state_file),
        plan_file=_resolve(root, args.plan_file),
        delta_dir=_resolve(root, args.delta_dir),
        force_periods=args.force_period,
        summary_file=_resolve(root, args.summary_file),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
