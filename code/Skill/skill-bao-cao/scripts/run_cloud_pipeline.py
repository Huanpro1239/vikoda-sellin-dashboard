"""Kịch bản chạy chuỗi Tách Data và Cập nhật Web Dashboard tự động trên Cloud (Hardened).

Chạy thuần Python, không phụ thuộc PowerShell Windows, phù hợp cho GitHub Actions,
máy chủ Linux/Docker hoặc môi trường Serverless.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("VikodaPipeline")

WORKBOOK_SUFFIXES = {".xlsm", ".xlsx"}


class PipelineValidationError(RuntimeError):
    """Raised when strict cloud-pipeline preconditions or artifacts are missing."""


def _configure_console_encoding() -> None:
    """Use UTF-8 for the CLI without mutating streams when imported by tests."""
    if sys.platform != "win32":
        return
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass


def _input_path(project_root: Path, configured: str | Path | None, default: Path) -> Path:
    if configured is None:
        return default
    path = Path(configured)
    return path if path.is_absolute() else project_root / path


def _workbooks(directory: Path) -> list[Path]:
    if not directory.is_dir():
        return []
    return sorted(
        path
        for path in directory.iterdir()
        if path.is_file()
        and path.suffix.lower() in WORKBOOK_SUFFIXES
        and path.stat().st_size > 0
    )


def _signature(path: Path) -> tuple[int, int] | None:
    try:
        stat = path.stat()
    except FileNotFoundError:
        return None
    return stat.st_mtime_ns, stat.st_size


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise PipelineValidationError(message)


def _require_refreshed(path: Path, before: tuple[int, int] | None, label: str) -> None:
    after = _signature(path)
    _require(after is not None and after[1] > 0, f"Thiếu hoặc rỗng {label}: {path}")
    _require(after != before, f"{label} không được tạo/cập nhật trong lượt chạy này: {path}")


def _load_json(path: Path, label: str) -> Any:
    _require(path.is_file() and path.stat().st_size > 0, f"Thiếu hoặc rỗng {label}: {path}")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise PipelineValidationError(f"{label} không phải JSON hợp lệ: {path}") from exc


def _require_web_export_fresh(
    json_path: Path,
    js_path: Path,
    before_json: tuple[int, int] | None,
    before_js: tuple[int, int] | None,
    run_started_at: datetime,
) -> dict[str, Any]:
    """Prove both web artifacts were rewritten and carry this run's timestamp."""
    _require_refreshed(json_path, before_json, "dashboard_data.json")
    _require_refreshed(js_path, before_js, "dashboard_data.js")
    payload = _load_json(json_path, "dashboard_data.json")
    _require(isinstance(payload, dict), "dashboard_data.json phải là một JSON object")
    metadata = payload.get("metadata")
    _require(isinstance(metadata, dict), "dashboard_data.json thiếu metadata")
    generated_at = metadata.get("generated_at")
    _require(isinstance(generated_at, str) and generated_at.strip() != "", "Web data thiếu metadata.generated_at")
    try:
        generated = datetime.fromisoformat(generated_at.replace("Z", "+00:00"))
    except ValueError as exc:
        raise PipelineValidationError("metadata.generated_at không phải ISO-8601 hợp lệ") from exc
    _require(generated.tzinfo is not None, "metadata.generated_at phải có múi giờ")
    _require(
        generated.astimezone(timezone.utc) >= run_started_at,
        "Web data có generated_at cũ; không được tạo trong lượt chạy này",
    )
    _require(metadata.get("quality_status") == "PASS", "Web data không mang quality_status=PASS")
    return payload


def run_command(cmd: list[str], cwd: Path) -> None:
    logger.info(f"-> Chạy: {' '.join(cmd)}")
    res = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True, encoding="utf-8", errors="replace")
    if res.stdout:
        for line in res.stdout.strip().splitlines():
            logger.info(f"   {line}")
    if res.returncode != 0:
        if res.stderr:
            logger.error(f"Lỗi: {res.stderr.strip()}")
        raise RuntimeError(f"Lệnh thất bại với mã lỗi {res.returncode}: {' '.join(cmd)}")


def run_pipeline(
    project_root: Path,
    *,
    strict: bool = False,
    erp_source_dir: str | Path | None = None,
    target_source_dir: str | Path | None = None,
    dmkh_source_dir: str | Path | None = None,
    product_catalog_path: str | Path | None = None,
) -> None:
    start_time = time.time()
    run_started_ns = time.time_ns()
    run_started_at = datetime.now(timezone.utc)
    scripts_sellin = project_root / "code/Skill/sell-in-monthly/scripts"
    scripts_baocao = project_root / "code/Skill/skill-bao-cao/scripts"
    common_dir = project_root / "code/common"

    # Cloud strict mode only accepts actual ERP-source locations. Local mode keeps
    # legacy derived folders as convenient fallbacks for operator runs.
    onedrive_env = os.environ.get("VIKODA_ONEDRIVE_PATH")
    onedrive_base = Path(onedrive_env) if onedrive_env else Path("D:/onedrive/Vikoda/Planning - Vikoda_Sales_Data")
    primary_source_candidates = [
        onedrive_base / "Data ERP",
        onedrive_base / "Data_ERP",
        project_root / "Data/Data_ERP",
        project_root / "Data/DataERP",
        project_root / "Data/Data ERP",
    ]
    source_candidates = primary_source_candidates + [
        project_root / "Data/Data_Goc",
        project_root / "Data/Data Goc",
        project_root / "Data/Nguon",
    ]
    if erp_source_dir is not None:
        source_candidates = [
            _input_path(project_root, erp_source_dir, project_root / "Data/Data_ERP")
        ]
    elif strict:
        source_candidates = primary_source_candidates
    source_dir = next(
        (candidate for candidate in source_candidates if _workbooks(candidate)),
        source_candidates[0],
    )

    staging_dir = project_root / "Data/Work/bao_cao/data/staging"
    output_dir = project_root / "Data/File bao cao/Sell In Thang"
    web_dir = project_root / "web/data"
    target_src = _input_path(project_root, target_source_dir, project_root / "Data/Target")
    dmkh_src = _input_path(project_root, dmkh_source_dir, project_root / "Data/Danh muc KH")
    product_catalog = _input_path(
        project_root,
        product_catalog_path,
        project_root / "Data/Danh muc SP/Danh Muc San Pham.xlsx",
    )

    if strict:
        _require(bool(_workbooks(source_dir)), f"Thiếu ERP source workbook trong: {source_dir}")
        _require(bool(_workbooks(target_src)), f"Thiếu Target workbook trong: {target_src}")
        _require(bool(_workbooks(dmkh_src)), f"Thiếu Danh mục KH workbook trong: {dmkh_src}")
        _require(
            product_catalog.is_file() and product_catalog.stat().st_size > 0,
            f"Thiếu product catalog: {product_catalog}",
        )

    logger.info("============================================================")
    logger.info(f" 1/5 - TÁCH DỮ LIỆU SELL IN TỪ ERP ({source_dir})")
    logger.info("============================================================")
    has_sources = bool(_workbooks(source_dir))
    if has_sources:
        audit_file = staging_dir / "audit.json"
        audit_before = _signature(audit_file)
        run_command([
            sys.executable,
            str(scripts_sellin / "extract_sources.py"),
            "--source-dir", str(source_dir),
            "--staging-dir", str(staging_dir),
        ], cwd=project_root)

        if strict:
            _require_refreshed(audit_file, audit_before, "ERP staging audit.json")
        if audit_file.exists():
            audit = _load_json(audit_file, "ERP staging audit.json") if strict else json.loads(audit_file.read_text(encoding="utf-8"))
            monthly_files = audit.get("monthly_files", []) if isinstance(audit, dict) else []
            if strict:
                _require(bool(monthly_files), "ERP staging audit.json không có monthly_files")
                for monthly_file in monthly_files:
                    _require(isinstance(monthly_file, dict), "monthly_files chứa phần tử không hợp lệ")
                    staging_file = Path(str(monthly_file.get("staging_file", "")))
                    if not staging_file.is_absolute():
                        staging_file = project_root / staging_file
                    _require(
                        staging_file.is_file() and staging_file.stat().st_size > 0,
                        f"Thiếu ERP monthly staging output: {staging_file}",
                    )
                    _require(
                        staging_file.stat().st_mtime_ns >= run_started_ns,
                        f"ERP monthly staging output bị stale: {staging_file}",
                    )

            preview_dir = project_root / "Data/Work/bao_cao/data/preview"
            preview_dir.mkdir(parents=True, exist_ok=True)
            logger.info("============================================================")
            logger.info(" 2/5 - XUẤT FILE WORKBOOK SELL IN HÀNG THÁNG (BUILD OUTPUTS)")
            logger.info("============================================================")
            for monthly_file in monthly_files:
                period_key = f"{monthly_file['year']}-{monthly_file['month']:02d}"
                logger.info(f"  * Xử lý kỳ: {period_key}")
                monthly_output = output_dir / f"Sell in T{monthly_file['month']:02d}_{monthly_file['year']}.xlsx"
                monthly_output_before = _signature(monthly_output)
                run_command([
                    sys.executable,
                    str(scripts_sellin / "build_outputs.py"),
                    "--staging-dir", str(staging_dir),
                    "--output-dir", str(output_dir),
                    "--report-dir", str(preview_dir),
                    "--period", period_key,
                ], cwd=project_root)
                if strict:
                    _require_refreshed(monthly_output, monthly_output_before, f"workbook tháng {period_key}")

            # Copying remains a local/operator convenience. The CI checkout has no
            # persisted credentials and never commits these generated workbooks.
            dest_dirs = [project_root / "Data/Data_Goc"]
            if onedrive_base.exists():
                dest_dirs.append(onedrive_base / "Data_Goc")
            for directory in dest_dirs:
                directory.mkdir(parents=True, exist_ok=True)
                for output_file in output_dir.glob("*.xlsx"):
                    import shutil
                    shutil.copy2(output_file, directory / output_file.name)
                logger.info(f"  -> Đã sao chép toàn bộ file Sell In Tháng vào: {directory}")
    else:
        logger.info("Không có file mới trong Data/Nguon/ hoặc đã có staging data sẵn.")

    logger.info("============================================================")
    logger.info(" 3/5 - CHUẨN HÓA TARGET, DMKH VÀ TẠO BÁO CÁO WORKBOOK")
    logger.info("============================================================")
    target_staging = project_root / "Data/Work/bao_cao/target/staging"
    dmkh_staging = project_root / "Data/Work/bao_cao/dmkh/staging"
    target_staging.mkdir(parents=True, exist_ok=True)
    dmkh_staging.mkdir(parents=True, exist_ok=True)
    target_data_file = target_staging / "target_records.json"
    sell_in_data_file = staging_dir / "sell_in_data.json"
    dmkh_data_file = dmkh_staging / "dmkh_data.json"

    if target_src.exists():
        target_before = _signature(target_data_file)
        run_command([
            sys.executable,
            str(scripts_baocao / "extract_targets.py"),
            "--source-dir", str(target_src),
            "--staging-dir", str(target_staging),
        ], cwd=project_root)
        if strict:
            _require_refreshed(target_data_file, target_before, "target_records.json")
            _load_json(target_data_file, "target_records.json")

    if dmkh_src.exists():
        dmkh_before = _signature(dmkh_data_file)
        run_command([
            sys.executable,
            str(scripts_baocao / "extract_customers.py"),
            "--source-dir", str(dmkh_src),
            "--staging-dir", str(dmkh_staging),
        ], cwd=project_root)
        if strict:
            _require_refreshed(dmkh_data_file, dmkh_before, "dmkh_data.json")
            _load_json(dmkh_data_file, "dmkh_data.json")

    if output_dir.exists() and any(output_dir.glob("*.xlsx")):
        sell_in_before = _signature(sell_in_data_file)
        run_command([
            sys.executable,
            str(scripts_baocao / "extract_sell_in_data.py"),
            "--source-dir", str(output_dir),
            "--staging-dir", str(staging_dir),
        ], cwd=project_root)
        if strict:
            _require_refreshed(sell_in_data_file, sell_in_before, "sell_in_data.json")
            _load_json(sell_in_data_file, "sell_in_data.json")

    master_report_xlsx = project_root / "Data/File bao cao/Bao_Cao_Sell_in.xlsx"
    if strict:
        for artifact, label in (
            (target_data_file, "target_records.json"),
            (sell_in_data_file, "sell_in_data.json"),
            (dmkh_data_file, "dmkh_data.json"),
        ):
            _load_json(artifact, label)

    if target_data_file.exists() and sell_in_data_file.exists() and dmkh_data_file.exists():
        master_before = _signature(master_report_xlsx)
        run_command([
            sys.executable,
            str(scripts_baocao / "build_report_workbook.py"),
            "--target-data-file", str(target_data_file),
            "--sell-in-data-file", str(sell_in_data_file),
            "--dmkh-data-file", str(dmkh_data_file),
            "--output-file", str(master_report_xlsx),
        ], cwd=project_root)
        if strict:
            _require_refreshed(master_report_xlsx, master_before, "Bao_Cao_Sell_in.xlsx")

    logger.info("============================================================")
    logger.info(" 4/5 - ĐỐI SOÁT & KIỂM TRA CHẤT LƯỢNG (VALIDATION & RECONCILIATION)")
    logger.info("============================================================")
    validation_script = common_dir / "validation.py"
    report_file = project_root / "Data/Work/data_quality_report.json"
    quality_report_before = _signature(report_file)
    if strict:
        _require(validation_script.is_file(), f"Thiếu validation script: {validation_script}")
    if validation_script.exists():
        run_command([
            sys.executable,
            str(validation_script),
            "--project-root", str(project_root),
        ], cwd=project_root)

    qrep: dict[str, Any] = {}
    if strict:
        _require_refreshed(report_file, quality_report_before, "data_quality_report.json")
        loaded_report = _load_json(report_file, "data_quality_report.json")
        _require(isinstance(loaded_report, dict), "data_quality_report.json phải là một JSON object")
        qrep = loaded_report
        _require(qrep.get("status") == "PASS", "Data quality status không phải PASS")

    looker_csv = project_root / "Data/File bao cao/Sell in tong hop.csv"
    looker_report = project_root / "Data/Work/bao_cao/looker_report.json"
    if output_dir.exists() and any(output_dir.glob("*.xlsx")):
        run_command([
            sys.executable,
            str(scripts_sellin / "build_looker_dataset.py"),
            "--output-dir", str(output_dir),
            "--csv-file", str(looker_csv),
            "--report-file", str(looker_report),
        ], cwd=project_root)

    logger.info("============================================================")
    logger.info(" 5/5 - XUẤT DỮ LIỆU WEB DASHBOARD VIKODA (ATOMIC BUILD)")
    logger.info("============================================================")
    web_json = web_dir / "dashboard_data.json"
    web_js = web_dir / "dashboard_data.js"
    web_json_before = _signature(web_json)
    web_js_before = _signature(web_js)
    if sell_in_data_file.exists() and target_data_file.exists() and dmkh_data_file.exists():
        run_command([
            sys.executable,
            str(scripts_baocao / "export_web_data.py"),
            "--project-root", str(project_root),
            "--product-catalog", str(product_catalog),
        ], cwd=project_root)
    if strict:
        _require_web_export_fresh(
            web_json,
            web_js,
            web_json_before,
            web_js_before,
            run_started_at,
        )

    elapsed = time.time() - start_time
    if not qrep and report_file.exists():
        try:
            qrep = json.loads(report_file.read_text(encoding="utf-8"))
        except Exception:
            pass

    summary = qrep.get("summary", {})
    output_rows = summary.get("output_records", 0)
    rev_vnd = summary.get("total_sell_in_revenue_vnd", 0)
    status = qrep.get("status", "UNKNOWN")

    logger.info("============================================================")
    logger.info(" VIKODA SELL-IN PIPELINE SUMMARY")
    logger.info(f" STATUS: {status}")
    logger.info(f" OUTPUT ROWS: {output_rows:,}")
    logger.info(f" TOTAL REVENUE: {rev_vnd / 1e9:,.2f} Tỷ VNĐ")
    logger.info(f" DURATION: {elapsed:.1f}s")
    logger.info("============================================================")


def main(argv: list[str] | None = None) -> int:
    _configure_console_encoding()
    parser = argparse.ArgumentParser(description="Chạy pipeline Tách data và Web Dashboard trên Cloud")
    parser.add_argument("--project-root", default=".")
    parser.add_argument("--erp-source-dir", help="Thư mục ERP; path tương đối tính từ project root.")
    parser.add_argument("--target-source-dir", help="Thư mục Target; path tương đối tính từ project root.")
    parser.add_argument(
        "--dmkh-source-dir",
        "--customer-source-dir",
        dest="dmkh_source_dir",
        help="Thư mục Danh mục KH; path tương đối tính từ project root.",
    )
    parser.add_argument("--product-catalog", help="File Danh mục SP; path tương đối tính từ project root.")
    parser.add_argument(
        "--strict",
        "--require-fresh-inputs",
        dest="strict",
        action="store_true",
        help="Fail closed nếu thiếu input/output, quality PASS hoặc web artifact mới.",
    )
    args = parser.parse_args(argv)

    root = Path(args.project_root).resolve()
    run_pipeline(
        root,
        strict=args.strict,
        erp_source_dir=args.erp_source_dir,
        target_source_dir=args.target_source_dir,
        dmkh_source_dir=args.dmkh_source_dir,
        product_catalog_path=args.product_catalog,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
