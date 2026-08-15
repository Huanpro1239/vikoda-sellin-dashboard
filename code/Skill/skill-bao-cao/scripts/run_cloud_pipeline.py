"""Kịch bản chạy chuỗi Tách Data và Cập nhật Web Dashboard tự động trên Cloud.

Chạy thuần Python, không phụ thuộc PowerShell Windows, phù hợp cho GitHub Actions,
máy chủ Linux/Docker hoặc môi trường Serverless.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

# Đảm bảo in tiếng Việt không bị lỗi encoding trên Windows console
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass


def run_command(cmd: list[str], cwd: Path) -> None:
    print(f"-> Chay: {' '.join(cmd)}")
    res = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True, encoding="utf-8", errors="replace")
    if res.stdout:
        print(res.stdout.strip())
    if res.returncode != 0:
        if res.stderr:
            print(f"Loi: {res.stderr.strip()}", file=sys.stderr)
        raise RuntimeError(f"Lenh that bai voi ma loi {res.returncode}: {' '.join(cmd)}")


def run_pipeline(project_root: Path) -> None:
    scripts_sellin = project_root / "code/Skill/sell-in-monthly/scripts"
    scripts_baocao = project_root / "code/Skill/skill-bao-cao/scripts"
    
    # Tự động tìm thư mục nguồn ERP (SharePoint OneDrive, Data_ERP, Data ERP)
    onedrive_base = Path("D:/onedrive/Vikoda/Planning - Vikoda_Sales_Data")
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

    print("============================================================")
    print(f" 1/4 - TACH DU LIEU SELL IN TU ERP ({source_dir})")
    print("============================================================")
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
            print("============================================================")
            print(" 2/4 - XUAT FILE WORKBOOK SELL IN HANG THANG (BUILD OUTPUTS)")
            print("============================================================")
            for monthly_file in audit.get("monthly_files", []):
                period_key = f"{monthly_file['year']}-{monthly_file['month']:02d}"
                print(f"  * Xu ly ky: {period_key}")
                run_command([
                    sys.executable,
                    str(scripts_sellin / "build_outputs.py"),
                    "--staging-dir", str(staging_dir),
                    "--output-dir", str(output_dir),
                    "--report-dir", str(preview_dir),
                    "--period", period_key,
                ], cwd=project_root)

            # Sao chep cac file thang da tach vao thu muc Data_Goc tren he thong va tren SharePoint OneDrive
            dest_dirs = [project_root / "Data/Data_Goc"]
            if onedrive_base.exists():
                dest_dirs.append(onedrive_base / "Data_Goc")

            for d in dest_dirs:
                d.mkdir(parents=True, exist_ok=True)
                for out_f in output_dir.glob("*.xlsx"):
                    import shutil
                    shutil.copy2(out_f, d / out_f.name)
                print(f"  -> Da sao chep toan bo file Sell In Thang vao: {d}")
    else:
        print("Khong co file moi trong Data/Nguon/ hoac da co staging data san.")

    print("============================================================")
    print(" 3/5 - TAO BAO CAO TARGET, DMKH VA PIVOT (TAO BAO CAO)")
    print("============================================================")
    target_src = project_root / "Data/Target"
    dmkh_src = project_root / "Data/Danh muc KH"
    target_staging = project_root / "Data/Work/bao_cao/target/staging"
    dmkh_staging = project_root / "Data/Work/bao_cao/dmkh/staging"
    target_staging.mkdir(parents=True, exist_ok=True)
    dmkh_staging.mkdir(parents=True, exist_ok=True)

    # 3.1 - Chuan hoa Target
    if target_src.exists():
        run_command([
            sys.executable,
            str(scripts_baocao / "extract_targets.py"),
            "--source-dir", str(target_src),
            "--staging-dir", str(target_staging),
        ], cwd=project_root)

    # 3.2 - Chuan hoa Danh muc Khach hang
    if dmkh_src.exists():
        run_command([
            sys.executable,
            str(scripts_baocao / "extract_customers.py"),
            "--source-dir", str(dmkh_src),
            "--staging-dir", str(dmkh_staging),
        ], cwd=project_root)

    # 3.3 - Chuan hoa du lieu Sell In da tach sang staging
    if output_dir.exists() and any(output_dir.glob("*.xlsx")):
        run_command([
            sys.executable,
            str(scripts_baocao / "extract_sell_in_data.py"),
            "--source-dir", str(output_dir),
            "--staging-dir", str(staging_dir),
        ], cwd=project_root)

    # 3.4 - Tao file bao cao Tong hop Excel Bao_Cao_Sell_in.xlsx
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

    print("============================================================")
    print(" 4/5 - XUAT DU LIEU CONG DONG LOOKER STUDIO (BUILD LOOKER CSV)")
    print("============================================================")
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

    print("============================================================")
    print(" 5/5 - XUAT DU LIEU WEB DASHBOARD VIKODA (EXPORT WEB DATA)")
    print("============================================================")
    if sell_in_data_file.exists() and target_data_file.exists() and dmkh_data_file.exists():
        run_command([
            sys.executable,
            str(scripts_baocao / "export_web_data.py"),
            "--project-root", str(project_root),
        ], cwd=project_root)
    else:
        print("Staging data chua day du tren runner. Su dung goi web/data hien tai da dong goi san.")

    print("============================================================")
    print(" HOAN TAT TOAN BO CHUOI TACH DATA VA TAO BAO CAO DASHBOARD!")
    print("============================================================")


def main() -> None:
    parser = argparse.ArgumentParser(description="Chay pipeline Tach data va Web Dashboard tren Cloud")
    parser.add_argument("--project-root", default=".")
    args = parser.parse_args()

    root = Path(args.project_root).resolve()
    run_pipeline(root)


if __name__ == "__main__":
    main()
