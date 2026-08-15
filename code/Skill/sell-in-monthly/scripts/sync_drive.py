"""CLI tải workbook Sell In và CSV Looker lên thư mục Google Drive dùng chung.

Bọc `drive_sync.py` để `run_sell_in.ps1` gọi được. Nhờ vậy cách tìm rclone, cách
giải folder ID và nội dung lệnh rclone chỉ có một bản, dùng chung với luồng chuyển
giao (`portable_sell_in.py` import thẳng `drive_sync`), và hai luồng không thể lệch
hành vi.

Mã thoát:
  0  tải xong, hoặc không có rclone / không có file để tải (chỉ cảnh báo).
  1  tham số sai, hoặc rclone chạy nhưng có job lỗi.

Thiếu rclone không làm đổ lần tách data: file cục bộ đã tạo đầy đủ, chỉ là chưa
lên Drive. Nhưng rclone chạy mà báo lỗi thì phải để người vận hành biết.

Ví dụ:
    python sync_drive.py \
        --project-root . \
        --output-dir "Data/out put/Sell in hang  thang" \
        --extra-file "Data/Work/sell_in/looker/Sell in tong hop.csv" \
        --report-file "Data/Work/sell_in/verification/drive_sync_report.json"
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path

from drive_sync import (
    DriveConfigurationMissing,
    RcloneNotFound,
    RcloneRemoteMissing,
    upload,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", required=True)
    parser.add_argument(
        "--output-dir",
        required=True,
        help="Thư mục chứa các workbook Sell in T<MM>_<YYYY>.xlsx cần tải lên.",
    )
    parser.add_argument(
        "--extra-file",
        action="append",
        default=[],
        help="File khác cần tải kèm, ví dụ CSV Looker. Dùng nhiều lần được.",
    )
    parser.add_argument(
        "--folder-id",
        default="",
        help="Folder ID hoặc URL thư mục Drive đích. Bỏ trống để dùng mặc định.",
    )
    parser.add_argument(
        "--remote",
        default="",
        help="Tên remote trong cấu hình rclone. Bỏ trống để dùng vikoda-drive.",
    )
    parser.add_argument(
        "--rclone",
        default="",
        help="Đường dẫn rclone.exe. Bỏ trống để tự tìm.",
    )
    parser.add_argument(
        "--no-verify",
        action="store_true",
        help="Không liệt kê lại thư mục Drive để đối soát sau khi tải.",
    )
    parser.add_argument("--report-file", default="")
    return parser.parse_args()


def write_report(report_file: str, report: dict) -> None:
    if not report_file:
        return
    path = Path(report_file)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def main() -> int:
    args = parse_args()
    project_root = Path(args.project_root).resolve()
    output_dir = Path(args.output_dir)

    if not output_dir.is_dir():
        print(f"Khong tim thay thu muc output: {output_dir}")
        return 1

    base_report: dict = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "output_dir": str(output_dir),
    }

    try:
        report = upload(
            project_root=project_root,
            output_dir=output_dir,
            extra_files=[Path(item) for item in args.extra_file],
            folder_id=args.folder_id,
            remote=args.remote,
            rclone_path=args.rclone,
            verify=not args.no_verify,
        )
    except (DriveConfigurationMissing, RcloneNotFound, RcloneRemoteMissing) as error:
        # Chua cai/cau hinh rclone la viec setup mot lan, khong phai loi du lieu.
        print(str(error))
        base_report.update({"skipped": True, "reason": "rclone_not_ready"})
        write_report(args.report_file, base_report)
        return 0

    base_report.update(report)
    write_report(args.report_file, base_report)

    if report.get("skipped"):
        print(f"Khong co file nao can tai len ({report.get('reason')}).")
        return 0

    listing = report.get("remote_listing") or {}
    print(
        "Google Drive: da tai len thu muc {0} (remote '{1}')".format(
            report["folder_id"], report["remote"]
        )
    )
    if listing.get("ok"):
        print(
            "  Doi soat: thu muc Drive hien co {0} file, mong doi it nhat {1}.".format(
                listing["file_count"], report["expected_count"]
            )
        )
        if listing["file_count"] < report["expected_count"]:
            print(
                "  CANH BAO: it hon mong doi. Xem danh sach trong report de biet "
                "thieu file nao."
            )
    elif listing:
        print(f"  Khong doi soat duoc: {listing.get('error')}")

    if report["failed_jobs"]:
        for job in report["failed_jobs"]:
            print(f"  Loi khi tai {job['source_dir']}: {job['stderr']}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
