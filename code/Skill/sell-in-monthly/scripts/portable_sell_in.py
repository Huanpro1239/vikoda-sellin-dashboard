from __future__ import annotations

import argparse
import json
import sys
import traceback
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from build_looker_dataset import build_looker_csv
from drive_sync import (
    DriveConfigurationMissing,
    RcloneNotFound,
    RcloneRemoteMissing,
    upload as upload_to_drive,
)
from extraction import (
    extract_file,
    is_candidate_source,
    parse_source_name,
    sort_key,
)
from incremental import (
    build_incremental_plan,
    commit_incremental_plan,
    write_plan,
)
from master_data import (
    analyze_master_data,
    apply_approved_customers_portable,
    build_approval_plan,
    verify_master_data_artifacts,
    write_json,
    write_review_workbook_portable,
)
from workbook_builder import write_monthly_workbook

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")


def default_project_root() -> Path:
    start = (
        Path(sys.executable).resolve().parent
        if getattr(sys, "frozen", False)
        else Path(__file__).resolve().parent
    )
    for candidate in (start, *start.parents):
        if (candidate / "Data" / "Data ERP").is_dir():
            return candidate
    return start


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Portable monthly Sell In processor. Dong bo Google Drive va CSV "
            "nguon Looker chay giong luong chinh."
        )
    )
    parser.add_argument("--project-root", default=str(default_project_root()))
    parser.add_argument("--source-dir")
    parser.add_argument("--output-dir")
    parser.add_argument("--log-dir")
    parser.add_argument(
        "--force-period",
        action="append",
        default=[],
        help="Làm lại một tháng theo dạng YYYY-MM; có thể dùng nhiều lần.",
    )
    parser.add_argument(
        "--force-all",
        action="store_true",
        help="Làm lại toàn bộ các tháng.",
    )
    parser.add_argument(
        "--drive-folder-id",
        default="",
        help=(
            "Folder ID hoặc URL thư mục Drive đích. Bỏ trống thì lấy biến môi "
            "trường TACH_DATA_DRIVE_FOLDER_ID, rồi Chay CT/drive.conf. Thiếu "
            "cấu hình thì bỏ qua đồng bộ Drive an toàn."
        ),
    )
    parser.add_argument(
        "--rclone-remote",
        default="",
        help="Tên remote trong cấu hình rclone. Bỏ trống dùng vikoda-drive.",
    )
    parser.add_argument(
        "--rclone",
        default="",
        help="Đường dẫn rclone.exe. Bỏ trống để tự tìm.",
    )
    parser.add_argument(
        "--skip-google-drive",
        action="store_true",
        help="Chỉ tạo file cục bộ, không tải lên Google Drive.",
    )
    parser.add_argument(
        "--skip-looker-dataset",
        action="store_true",
        help="Không dựng CSV gộp làm nguồn Looker.",
    )
    parser.add_argument(
        "--looker-csv-name",
        default="Sell in tong hop.csv",
        help="Tên file CSV gộp.",
    )
    return parser.parse_args()


def run(args: argparse.Namespace) -> dict:
    project_root = Path(args.project_root).resolve()
    source_dir = (
        Path(args.source_dir).resolve()
        if args.source_dir
        else project_root / "Data" / "Data ERP"
    )
    output_dir = (
        Path(args.output_dir).resolve()
        if args.output_dir
        else project_root
        / "Data"
        / "out put"
        / "Sell in hang  thang"
    )
    log_dir = (
        Path(args.log_dir).resolve()
        if args.log_dir
        else project_root / "Data" / "Logs" / "Tach data logs"
    )
    customer_master = (
        project_root
        / "Data"
        / "Danh muc KH"
        / "Thong tin khach hang.xlsx"
    )
    product_master = (
        project_root
        / "Data"
        / "Danh muc SP"
        / "Danh Muc San Pham.xlsx"
    )
    candidate_dir = (
        project_root
        / "Data"
        / "Work"
        / "sell_in"
        / "new_customers"
    )
    master_data_dir = (
        project_root
        / "Data"
        / "Work"
        / "sell_in"
        / "master_data"
    )
    master_verification_dir = (
        project_root
        / "Data"
        / "Work"
        / "sell_in"
        / "verification"
    )
    staging_dir = (
        project_root
        / "Data"
        / "Work"
        / "sell_in"
        / "staging"
    )
    looker_dir = (
        project_root
        / "Data"
        / "Work"
        / "sell_in"
        / "looker"
    )
    customer_backup_dir = (
        project_root / "Data" / "Logs" / "Danh muc KH backups"
    )
    state_file = log_dir / "incremental_state.json"
    incremental_plan_path = staging_dir / "incremental_plan.json"

    if not source_dir.is_dir():
        raise FileNotFoundError(f"Source folder not found: {source_dir}")
    for required_file in (customer_master, product_master):
        if not required_file.is_file():
            raise FileNotFoundError(
                f"Required master workbook not found: {required_file}"
            )
    output_dir.mkdir(parents=True, exist_ok=True)
    log_dir.mkdir(parents=True, exist_ok=True)
    candidate_dir.mkdir(parents=True, exist_ok=True)
    master_data_dir.mkdir(parents=True, exist_ok=True)
    master_verification_dir.mkdir(parents=True, exist_ok=True)
    staging_dir.mkdir(parents=True, exist_ok=True)
    looker_dir.mkdir(parents=True, exist_ok=True)

    plan = build_incremental_plan(
        source_dir,
        output_dir,
        state_file,
        force_periods=args.force_period,
        force_all=args.force_all,
    )
    write_plan(plan, incremental_plan_path)
    for item in plan["periods"]:
        print(
            f"{item['period']} | {item['action']} | "
            + "; ".join(item["reasons"])
        )
    if plan["problems"]:
        raise RuntimeError(
            "Incremental planning failed: " + "; ".join(plan["problems"])
        )
    rebuild_periods = set(plan["rebuild_periods"])

    grouped: dict[tuple[int, int], list[dict]] = defaultdict(list)
    audits: list[dict] = []
    ignored_files: list[str] = []

    source_files = sorted(source_dir.iterdir(), key=lambda p: p.name.lower())
    for file_path in source_files:
        if not is_candidate_source(file_path):
            continue
        parsed = parse_source_name(file_path.name)
        if parsed is None:
            ignored_files.append(file_path.name)
            continue
        company, month, year = parsed
        period = f"{year}-{month:02d}"
        if period not in rebuild_periods:
            continue
        print(f"Reading {file_path.name}")
        rows, audit = extract_file(file_path, company, month, year)
        grouped[(year, month)].extend(rows)
        audits.append(audit)

    if rebuild_periods and not audits:
        raise RuntimeError("No valid ERP workbooks were found.")

    verification_reports: list[dict] = []
    monthly_outputs: list[dict] = []
    for (year, month), rows in sorted(grouped.items()):
        rows.sort(key=sort_key)
        print(
            f"Writing Sell in T{month:02d}_{year}.xlsx "
            f"({len(rows):,} rows)"
        )
        verification = write_monthly_workbook(
            output_dir,
            rows,
            month,
            year,
        )
        verification_reports.append(verification)
        monthly_outputs.append(
            {
                "year": year,
                "month": month,
                "file": verification["file"],
                "output_rows": len(rows),
            }
        )

    print("Checking approved customers")
    approval_plan = build_approval_plan(
        customer_master,
        candidate_dir,
    )
    approval_plan_path = master_data_dir / "approved_customers_plan.json"
    write_json(approval_plan_path, approval_plan)
    if approval_plan["errors"]:
        raise RuntimeError(
            "Approved-customer rows contain errors. Review: "
            f"{approval_plan_path}"
        )
    apply_report_path = (
        master_data_dir / "approved_customers_apply_report.json"
    )
    master_analysis_path = master_data_dir / "master_data_analysis.json"
    master_verification_path = (
        master_verification_dir / "master_data_report.json"
    )
    needs_master_data = bool(rebuild_periods) or bool(
        approval_plan["approved_count"]
    )
    if needs_master_data:
        print("Processing customer and product master-data review")
        apply_report = apply_approved_customers_portable(
            approval_plan,
            customer_backup_dir,
        )
        write_json(apply_report_path, apply_report)

        master_analysis = analyze_master_data(
            output_dir,
            source_dir,
            customer_master,
            product_master,
            candidate_dir,
        )
        write_json(master_analysis_path, master_analysis)
        write_review_workbook_portable(master_analysis)
        master_verification = verify_master_data_artifacts(
            master_analysis,
            apply_report,
        )
        write_json(master_verification_path, master_verification)
        if not master_verification["ok"]:
            raise RuntimeError(
                "Master-data verification failed. Review: "
                f"{master_verification_path}"
            )
        master_data_payload = {
            "skipped": False,
            "approval_plan": str(approval_plan_path),
            "apply_report": apply_report,
            "analysis_file": str(master_analysis_path),
            "candidate_file": master_analysis["candidate_file"],
            "candidate_count": master_analysis["candidate_count"],
            "missing_product_count": master_analysis[
                "missing_product_count"
            ],
            "verification_file": str(master_verification_path),
            "verification": master_verification,
        }
    else:
        print(
            "Master-data review skipped: no changed month or approved customer."
        )
        master_verification = {"ok": True, "skipped": True}
        master_data_payload = {
            "skipped": True,
            "reason": "no_changed_month_or_approved_customer",
            "approval_plan": str(approval_plan_path),
        }

    # Looker Studio khong doc duoc .xlsx tren Drive (chi Google Sheets, CSV
    # File Upload hoac BigQuery), nen gop them mot CSV phang tat ca cac thang.
    looker_payload: dict = {"skipped": True, "reason": "disabled_by_flag"}
    looker_csv_path: Path | None = None
    if not args.skip_looker_dataset:
        print("Building consolidated CSV dataset for Looker")
        looker_csv_path = looker_dir / args.looker_csv_name
        looker_report = build_looker_csv(
            output_dir=output_dir,
            csv_file=looker_csv_path,
            report_file=(
                master_verification_dir / "looker_dataset_report.json"
            ),
        )
        looker_payload = {"skipped": False, **looker_report}

    # Tai toan bo workbook cung CSV Looker len thu muc Drive dung chung bang
    # rclone. May chuyen giao khong can cai Google Drive for Desktop nua, chi can
    # rclone.exe va mot lan `rclone config`.
    if args.skip_google_drive:
        drive_payload: dict = {"skipped": True, "reason": "disabled_by_flag"}
        print("Google Drive: skipped by flag")
    else:
        extra_files = []
        if looker_csv_path is not None and looker_csv_path.is_file():
            extra_files.append(looker_csv_path)
        try:
            print("Uploading to shared Google Drive folder (rclone)")
            drive_payload = {
                "skipped": False,
                **upload_to_drive(
                    project_root=project_root,
                    output_dir=output_dir,
                    extra_files=extra_files,
                    folder_id=args.drive_folder_id,
                    remote=args.rclone_remote,
                    rclone_path=args.rclone,
                ),
            }
            listing = drive_payload.get("remote_listing") or {}
            if listing.get("ok"):
                print(
                    "  Doi soat: thu muc Drive co {0} file, mong doi it nhat "
                    "{1}.".format(
                        listing["file_count"], drive_payload["expected_count"]
                    )
                )
            for job in drive_payload.get("failed_jobs", []):
                print(f"  Loi khi tai {job['source_dir']}: {job['stderr']}")
        except (DriveConfigurationMissing, RcloneNotFound, RcloneRemoteMissing) as error:
            # Chua cai/cau hinh rclone la viec setup mot lan, khong phai loi du
            # lieu, nen khong lam do lan tach data.
            drive_payload = {"skipped": True, "reason": "rclone_not_ready"}
            print(str(error))

    commit_incremental_plan(plan, state_file)

    payload = {
        "portable_flow": True,
        "google_drive": drive_payload,
        "looker_dataset": looker_payload,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "project_root": str(project_root),
        "source_dir": str(source_dir),
        "output_dir": str(output_dir),
        "monthly_outputs": monthly_outputs,
        "incremental": {
            "plan_file": str(incremental_plan_path),
            "state_file": str(state_file),
            "rebuild_periods": plan["rebuild_periods"],
            "skipped_periods": plan["skipped_periods"],
        },
        "source_audits": audits,
        "ignored_files": ignored_files,
        "verification": verification_reports,
        "master_data": master_data_payload,
        "problems": [
            report for report in verification_reports if not report["ok"]
        ]
        + ([] if master_verification["ok"] else [master_verification]),
    }
    audit_path = log_dir / "audit_portable.json"
    audit_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8",
    )
    return payload


def main() -> int:
    args = parse_args()
    try:
        payload = run(args)
    except Exception:
        traceback.print_exc()
        return 1

    total_rows = sum(
        item["output_rows"] for item in payload["monthly_outputs"]
    )
    print()
    print(
        f"Completed: {len(payload['monthly_outputs'])} rebuilt files, "
        f"{total_rows:,} rebuilt rows; "
        f"{len(payload['incremental']['skipped_periods'])} skipped months."
    )
    print(f"Output: {payload['output_dir']}")

    looker = payload["looker_dataset"]
    if looker.get("skipped"):
        print("Looker dataset: skipped")
    else:
        print(
            f"Looker dataset: {looker['csv_file']} "
            f"({looker['row_count']:,} rows)"
        )

    drive = payload["google_drive"]
    if drive.get("skipped"):
        print(f"Google Drive: skipped ({drive.get('reason')})")
    else:
        listing = drive.get("remote_listing") or {}
        count = listing.get("file_count", "?") if listing.get("ok") else "?"
        print(
            "Google Drive: thu muc {0} hien co {1} file (mong doi it nhat {2})".format(
                drive["folder_id"], count, drive["expected_count"]
            )
        )
        if drive.get("failed_jobs"):
            print("Google Drive: con job loi, xem audit_portable.json.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
