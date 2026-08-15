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
from pathlib import Path

# Đảm bảo in tiếng Việt không bị lỗi encoding trên Windows console
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("VikodaPipeline")


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


def run_pipeline(project_root: Path) -> None:
    start_time = time.time()
    scripts_sellin = project_root / "code/Skill/sell-in-monthly/scripts"
    scripts_baocao = project_root / "code/Skill/skill-bao-cao/scripts"
    common_dir = project_root / "code/common"

    # Tự động tìm thư mục nguồn ERP (SharePoint OneDrive, Data_ERP, Data ERP)
    onedrive_env = os.environ.get("VIKODA_ONEDRIVE_PATH")
    onedrive_base = Path(onedrive_env) if onedrive_env else Path("D:/onedrive/Vikoda/Planning - Vikoda_Sales_Data")
    
    source_candidates = [
        onedrive_base / "Data ERP",
        onedrive_base / "Data_ERP",
        project_root / "Data/Data_ERP",
        project_root / "Data/DataERP",
        project_root / "Data/Data ERP",
        project_root / "Data/Data_Goc",
        project_root / "Data/Data Goc",
        project_root / "Data/Nguon",
    ]
    source_dir = project_root / "Data/Data_ERP"
    for cand in source_candidates:
        if cand.exists() and any(f.suffix.lower() in [".xlsm", ".xlsx"] for f in cand.iterdir() if f.is_file()):
            source_dir = cand
            break

    staging_dir = project_root / "Data/Work/bao_cao/data/staging"
    output_dir = project_root / "Data/File bao cao/Sell In Thang"
    web_dir = project_root / "web/data"

    logger.info("============================================================")
    logger.info(f" 1/5 - TÁCH DỮ LIỆU SELL IN TỪ ERP ({source_dir})")
    logger.info("============================================================")
    has_sources = source_dir.exists() and any(
        f.suffix.lower() in [".xlsm", ".xlsx"] for f in source_dir.iterdir() if f.is_file()
    )
    if has_sources:
        run_command([
            sys.executable,
            str(scripts_sellin / "extract_sources.py"),
            "--source-dir", str(source_dir),
            "--staging-dir", str(staging_dir),
        ], cwd=project_root)

        audit_file = staging_dir / "audit.json"
        if audit_file.exists():
            audit = json.loads(audit_file.read_text(encoding="utf-8"))
            preview_dir = project_root / "Data/Work/bao_cao/data/preview"
            preview_dir.mkdir(parents=True, exist_ok=True)
            logger.info("============================================================")
            logger.info(" 2/5 - XUẤT FILE WORKBOOK SELL IN HÀNG THÁNG (BUILD OUTPUTS)")
            logger.info("============================================================")
            for monthly_file in audit.get("monthly_files", []):
                period_key = f"{monthly_file['year']}-{monthly_file['month']:02d}"
                logger.info(f"  * Xử lý kỳ: {period_key}")
                run_command([
                    sys.executable,
                    str(scripts_sellin / "build_outputs.py"),
                    "--staging-dir", str(staging_dir),
                    "--output-dir", str(output_dir),
                    "--report-dir", str(preview_dir),
                    "--period", period_key,
                ], cwd=project_root)

            # Sao chép các file tháng đã tách vào thư mục Data_Goc
            dest_dirs = [project_root / "Data/Data_Goc"]
            if onedrive_base.exists():
                dest_dirs.append(onedrive_base / "Data_Goc")

            for d in dest_dirs:
                d.mkdir(parents=True, exist_ok=True)
                for out_f in output_dir.glob("*.xlsx"):
                    import shutil
                    shutil.copy2(out_f, d / out_f.name)
                logger.info(f"  -> Đã sao chép toàn bộ file Sell In Tháng vào: {d}")
    else:
        logger.info("Không có file mới trong Data/Nguon/ hoặc đã có staging data sẵn.")

    logger.info("============================================================")
    logger.info(" 3/5 - CHUẨN HÓA TARGET, DMKH VÀ TẠO BÁO CÁO WORKBOOK")
    logger.info("============================================================")
    target_src = project_root / "Data/Target"
    dmkh_src = project_root / "Data/Danh muc KH"
    target_staging = project_root / "Data/Work/bao_cao/target/staging"
    dmkh_staging = project_root / "Data/Work/bao_cao/dmkh/staging"
    target_staging.mkdir(parents=True, exist_ok=True)
    dmkh_staging.mkdir(parents=True, exist_ok=True)

    # 3.1 - Chuẩn hóa Target
    if target_src.exists():
        run_command([
            sys.executable,
            str(scripts_baocao / "extract_targets.py"),
            "--source-dir", str(target_src),
            "--staging-dir", str(target_staging),
        ], cwd=project_root)

    # 3.2 - Chuẩn hóa Danh mục Khách hàng
    if dmkh_src.exists():
        run_command([
            sys.executable,
            str(scripts_baocao / "extract_customers.py"),
            "--source-dir", str(dmkh_src),
            "--staging-dir", str(dmkh_staging),
        ], cwd=project_root)

    # 3.3 - Chuẩn hóa dữ liệu Sell In đã tách sang staging
    if output_dir.exists() and any(output_dir.glob("*.xlsx")):
        run_command([
            sys.executable,
            str(scripts_baocao / "extract_sell_in_data.py"),
            "--source-dir", str(output_dir),
            "--staging-dir", str(staging_dir),
        ], cwd=project_root)

    # 3.4 - Tạo file báo cáo Tổng hợp Excel Bao_Cao_Sell_in.xlsx
    master_report_xlsx = project_root / "Data/File bao cao/Bao_Cao_Sell_in.xlsx"
    target_data_file = target_staging / "target_records.json"
    sell_in_data_file = staging_dir / "sell_in_data.json"
    dmkh_data_file = dmkh_staging / "dmkh_data.json"

    if target_data_file.exists() and sell_in_data_file.exists() and dmkh_data_file.exists():
        run_command([
            sys.executable,
            str(scripts_baocao / "build_report_workbook.py"),
            "--target-data-file", str(target_data_file),
            "--sell-in-data-file", str(sell_in_data_file),
            "--dmkh-data-file", str(dmkh_data_file),
            "--output-file", str(master_report_xlsx),
        ], cwd=project_root)

    logger.info("============================================================")
    logger.info(" 4/5 - ĐỐI SOÁT & KIỂM TRA CHẤT LƯỢNG (VALIDATION & RECONCILIATION)")
    logger.info("============================================================")
    # 4.1 - Chạy module validation độc lập
    validation_script = common_dir / "validation.py"
    if validation_script.exists():
        run_command([
            sys.executable,
            str(validation_script),
            "--project-root", str(project_root),
        ], cwd=project_root)

    # 4.2 - Xuất dữ liệu Looker Studio
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
    if sell_in_data_file.exists() and target_data_file.exists() and dmkh_data_file.exists():
        run_command([
            sys.executable,
            str(scripts_baocao / "export_web_data.py"),
            "--project-root", str(project_root),
        ], cwd=project_root)

    elapsed = time.time() - start_time
    
    # Đọc kết quả đối soát để in banner tổng kết
    report_file = project_root / "Data/Work/data_quality_report.json"
    qrep = {}
    if report_file.exists():
        try:
            qrep = json.loads(report_file.read_text(encoding="utf-8"))
        except Exception:
            pass

    summary = qrep.get("summary", {})
    output_rows = summary.get("output_records", 0)
    rev_vnd = summary.get("total_sell_in_revenue_vnd", 0)
    status = qrep.get("status", "PASS")

    logger.info("============================================================")
    logger.info(" VIKODA SELL-IN PIPELINE SUMMARY")
    logger.info(f" STATUS: {status}")
    logger.info(f" OUTPUT ROWS: {output_rows:,}")
    logger.info(f" TOTAL REVENUE: {rev_vnd / 1e9:,.2f} Tỷ VNĐ")
    logger.info(f" DURATION: {elapsed:.1f}s")
    logger.info("============================================================")


def main() -> None:
    parser = argparse.ArgumentParser(description="Chạy pipeline Tách data và Web Dashboard trên Cloud")
    parser.add_argument("--project-root", default=".")
    args = parser.parse_args()

    root = Path(args.project_root).resolve()
    run_pipeline(root)


if __name__ == "__main__":
    main()
