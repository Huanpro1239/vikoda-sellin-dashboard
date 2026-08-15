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


def run_command(cmd: list[str], cwd: Path) -> None:
    print(f"-> Chay: {' '.join(cmd)}")
    res = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True, encoding="utf-8")
    if res.stdout:
        print(res.stdout.strip())
    if res.returncode != 0:
        if res.stderr:
            print(f"Loi: {res.stderr.strip()}", file=sys.stderr)
        raise RuntimeError(f"Lenh that bai voi ma loi {res.returncode}: {' '.join(cmd)}")


def run_pipeline(project_root: Path) -> None:
    scripts_sellin = project_root / "code/Skill/sell-in-monthly/scripts"
    scripts_baocao = project_root / "code/Skill/skill-bao-cao/scripts"
    
    # Ưu tiên thư mục Data ERP chuẩn của dự án
    source_dir = project_root / "Data/Data ERP"
    if not source_dir.exists() or not any(source_dir.glob("*.xlsm")):
        if (project_root / "Data/Nguon").exists():
            source_dir = project_root / "Data/Nguon"

    staging_dir = project_root / "Data/Work/bao_cao/data/staging"
    output_dir = project_root / "Data/File bao cao/Sell In Thang"
    web_dir = project_root / "web/data"

    print("============================================================")
    print(f" 1/4 - TACH DU LIEU SELL IN TU ERP ({source_dir.name})")
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
            print("============================================================")
            print(" 2/4 - XUAT FILE WORKBOOK SELL IN HANG THANG (BUILD OUTPUTS)")
            print("============================================================")
            for monthly_file in audit.get("monthly_files", []):
                period_key = f"{monthly_file['year']}-{monthly_file['month']:02d}"
                print(f"  * Xử lý kỳ: {period_key}")
                run_command([
                    sys.executable,
                    str(scripts_sellin / "build_outputs.py"),
                    "--staging-dir", str(staging_dir),
                    "--output-dir", str(output_dir),
                    "--period", period_key,
                ], cwd=project_root)
    else:
        print("Khong co file moi trong Data/Nguon/ hoac da co staging data san.")

    print("============================================================")
    print(" 3/4 - XUAT DU LIEU CONG DONG LOOKER STUDIO (BUILD LOOKER CSV)")
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
    print(" 4/4 - XUAT DU LIEU WEB DASHBOARD VIKODA (EXPORT WEB DATA)")
    print("============================================================")
    run_command([
        sys.executable,
        str(scripts_baocao / "export_web_data.py"),
        "--project-root", str(project_root),
    ], cwd=project_root)

    print("============================================================")
    print(" HOAN TAT TOAN BO CHUOI TACH DATA VA CAP NHAT WEB DASHBOARD!")
    print("============================================================")


def main() -> None:
    parser = argparse.ArgumentParser(description="Chay pipeline Tach data va Web Dashboard tren Cloud")
    parser.add_argument("--project-root", default=".")
    args = parser.parse_args()

    root = Path(args.project_root).resolve()
    run_pipeline(root)


if __name__ == "__main__":
    main()
