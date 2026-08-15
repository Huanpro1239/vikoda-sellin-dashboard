"""Tải workbook Sell In và CSV Looker lên thư mục Google Drive dùng chung, qua rclone.

Trước đây bước này chép file vào thư mục `G:\\My Drive\\...` do Google Drive for
Desktop mount. Cách đó chỉ chạy được trên máy đã cài Drive for Desktop, nên máy
chuyển giao không cài được là mất luôn bước đồng bộ. Giờ đổi sang gọi Drive API
qua `rclone`: chỉ cần một file `rclone.exe` và một lần đăng nhập, không cần cài
Drive for Desktop, và mọi máy đẩy vào **đúng một thư mục** xác định bằng folder ID
được cấp qua biến môi trường hoặc file cấu hình cục bộ (không lưu trong source).

## Vì sao `rclone copy` chứ không phải `rclone sync`

`sync` làm thư mục đích giống hệt nguồn, nghĩa là **xóa** mọi thứ trong thư mục
Drive mà local không có. Thư mục đó còn chứa Google Sheet nạp từ CSV để vẽ Looker
và có thể chứa file người khác đặt vào. `copy` chỉ thêm và ghi đè, không xóa, nên
không có đường nào làm mất dữ liệu của người khác.

`copy` cũng tự bỏ qua file không đổi (so kích thước và thời gian sửa), nên vẫn
đối chiếu đủ cả thư mục nhưng chỉ truyền phần khác — nhanh hơn chép mù.

## Tách hàm dựng lệnh khỏi hàm chạy

`build_copy_command` và `build_verify_command` là hàm thuần, trả về danh sách
tham số. Nhờ vậy test khóa được nội dung lệnh (nhất là "phải là copy, không được
là sync") mà không cần mạng hay tài khoản Drive thật.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

# Tên remote trong cấu hình rclone, tạo một lần bằng `rclone config`.
DEFAULT_REMOTE = "vikoda-drive"

CONFIG_FILENAME = "drive.conf"
ENV_FOLDER_ID = "TACH_DATA_DRIVE_FOLDER_ID"
ENV_REMOTE = "TACH_DATA_RCLONE_REMOTE"
ENV_RCLONE = "TACH_DATA_RCLONE"

RCLONE_MISSING_HELP = """Khong tim thay rclone.
Buoc dong bo Google Drive can rclone; file cuc bo van duoc tao day du.
Cach xu ly:
  1. Tai rclone cho Windows tai https://rclone.org/downloads/
  2. Giai nen, dat rclone.exe vao .runtime\\rclone\\rclone.exe trong thu muc du an
     (hoac them vao PATH).
  3. Chay mot lan:  rclone config
     Chon "n" (new remote), ten remote la "%s", loai la "drive",
     roi dang nhap bang tai khoan Google co quyen ghi vao thu muc dung chung.
Doc them: code/Skill/sell-in-monthly/references/google-drive-rclone.md""" % (
    DEFAULT_REMOTE,
)


class RcloneNotFound(RuntimeError):
    """rclone không có trên máy. Cảnh báo rồi đi tiếp, không làm đổ lần chạy."""


class RcloneRemoteMissing(RuntimeError):
    """rclone có nhưng chưa cấu hình remote, cần chạy `rclone config` một lần."""


class DriveConfigurationMissing(RuntimeError):
    """Chưa khai báo folder ID; không được đoán hoặc dùng định danh hard-code."""


def config_file_candidates(project_root: Path) -> list[Path]:
    return [
        project_root / "Chay CT" / CONFIG_FILENAME,
        project_root / CONFIG_FILENAME,
    ]


def read_config(project_root: Path) -> dict[str, str]:
    """Đọc `drive.conf` dạng `khoa = gia tri`, bỏ dòng trống và dòng `#`."""
    values: dict[str, str] = {}
    for candidate in config_file_candidates(project_root):
        if not candidate.is_file():
            continue
        try:
            text = candidate.read_text(encoding="utf-8-sig")
        except OSError:
            continue
        for line in text.splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, _, value = stripped.partition("=")
            values[key.strip().lower()] = value.strip().strip('"')
        values["_source"] = str(candidate)
        break
    return values


def resolve_settings(
    project_root: Path,
    folder_id: str = "",
    remote: str = "",
) -> dict[str, str]:
    """Giải folder ID và tên remote theo thứ tự: tham số → env → drive.conf."""
    config = read_config(project_root)

    resolved_folder = (
        (folder_id or "").strip()
        or os.environ.get(ENV_FOLDER_ID, "").strip()
        or config.get("folder_id", "").strip()
    )
    resolved_remote = (
        (remote or "").strip()
        or os.environ.get(ENV_REMOTE, "").strip()
        or config.get("remote", "").strip()
        or DEFAULT_REMOTE
    )
    normalized_folder = extract_folder_id(resolved_folder)
    if not normalized_folder:
        raise DriveConfigurationMissing(
            "Chua cau hinh Google Drive folder ID. Dat bien "
            f"{ENV_FOLDER_ID} hoac tao Chay CT/{CONFIG_FILENAME} tu file example."
        )
    return {
        "folder_id": normalized_folder,
        "remote": resolved_remote,
        "config_source": config.get("_source", ""),
    }


def extract_folder_id(value: str) -> str:
    """Nhận cả folder ID trần và URL Drive đầy đủ.

    Người dùng hay dán nguyên URL từ thanh địa chỉ; bắt lỗi đó ở đây rẻ hơn là để
    rclone báo "thư mục không tồn tại" rồi phải đi tìm nguyên nhân.
    """
    text = value.strip().strip('"')
    if "/folders/" in text:
        text = text.split("/folders/", 1)[1]
    # Cắt phần query/anchor còn sót, ví dụ ?usp=sharing
    for separator in ("?", "#", "/"):
        if separator in text:
            text = text.split(separator, 1)[0]
    return text


def find_rclone(project_root: Path, explicit: str = "") -> Path:
    """Tìm rclone theo thứ tự: tham số → env → .runtime của dự án → PATH."""
    candidates: list[str] = []
    if explicit and explicit.strip():
        candidates.append(explicit.strip().strip('"'))
    env_value = os.environ.get(ENV_RCLONE, "").strip().strip('"')
    if env_value:
        candidates.append(env_value)
    candidates.append(str(project_root / ".runtime" / "rclone" / "rclone.exe"))
    candidates.append(str(project_root / ".runtime" / "rclone" / "rclone"))

    for candidate in candidates:
        path = Path(candidate)
        if path.is_file():
            return path

    found = shutil.which("rclone") or shutil.which("rclone.exe")
    if found:
        return Path(found)

    raise RcloneNotFound(RCLONE_MISSING_HELP)


def build_copy_command(
    rclone: Path,
    source_dir: Path,
    remote: str,
    folder_id: str,
    include: list[str],
) -> list[str]:
    """Lệnh tải một thư mục lên thư mục Drive xác định bằng folder ID.

    Dùng `copy`, tuyệt đối không `sync`: `sync` sẽ xóa file trong Drive mà local
    không có, kể cả Google Sheet đang dùng để vẽ Looker.
    """
    command = [
        str(rclone),
        "copy",
        str(source_dir),
        f"{remote}:",
        "--drive-root-folder-id",
        folder_id,
        # Chi lay dung file can thiet, khong quet thu muc con.
        "--max-depth",
        "1",
        # Bo qua file khong doi de chi truyen phan khac.
        "--checkers",
        "4",
        "--transfers",
        "4",
        "--stats-one-line",
        "--stats",
        "10s",
    ]
    for pattern in include:
        command += ["--include", pattern]
    return command


def build_verify_command(
    rclone: Path,
    remote: str,
    folder_id: str,
) -> list[str]:
    """Lệnh liệt kê thư mục Drive để đối soát sau khi tải lên."""
    return [
        str(rclone),
        "lsjson",
        f"{remote}:",
        "--drive-root-folder-id",
        folder_id,
        "--max-depth",
        "1",
    ]


def run_command(command: list[str], timeout: int = 1800) -> subprocess.CompletedProcess:
    return subprocess.run(
        command,
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def collect_workbooks(output_dir: Path) -> list[Path]:
    """Mọi workbook Sell In trong thư mục output, bỏ file lock tạm của Excel."""
    return sorted(
        path
        for path in output_dir.glob("*.xlsx")
        if not path.name.startswith("~$") and not path.name.startswith(".")
    )


def upload(
    project_root: Path,
    output_dir: Path,
    extra_files: list[Path] | None = None,
    folder_id: str = "",
    remote: str = "",
    rclone_path: str = "",
    verify: bool = True,
    log=print,
) -> dict:
    """Tải toàn bộ workbook và các file kèm lên thư mục Drive dùng chung.

    Trả về báo cáo; ném `RcloneNotFound` khi máy chưa có rclone để phía gọi cảnh
    báo mà vẫn hoàn tất lần tách data.
    """
    extra_files = extra_files or []
    rclone = find_rclone(project_root, rclone_path)
    settings = resolve_settings(project_root, folder_id, remote)
    remote_name = settings["remote"]
    resolved_folder = settings["folder_id"]

    workbooks = collect_workbooks(output_dir)

    # Gom theo thu muc nguon: cac file kem (CSV Looker) nam o thu muc khac
    # output_dir, nen phai goi rclone mot lan cho moi thu muc.
    jobs: list[tuple[Path, list[str]]] = []
    if workbooks:
        jobs.append((output_dir, ["Sell in T*.xlsx"]))
    by_directory: dict[Path, list[str]] = {}
    for path in extra_files:
        if path.is_file():
            by_directory.setdefault(path.parent, []).append(path.name)
    for directory, names in by_directory.items():
        jobs.append((directory, names))

    if not jobs:
        return {
            "skipped": True,
            "reason": "no_files",
            "rclone": str(rclone),
            "remote": remote_name,
            "folder_id": resolved_folder,
        }

    uploads: list[dict] = []
    for source_dir, include in jobs:
        command = build_copy_command(
            rclone, source_dir, remote_name, resolved_folder, include
        )
        log(f"  rclone copy {source_dir} -> {remote_name}: ({', '.join(include)})")
        result = run_command(command)
        entry = {
            "source_dir": str(source_dir),
            "include": include,
            "returncode": result.returncode,
            "stderr": result.stderr.strip()[-2000:],
        }
        uploads.append(entry)
        if result.returncode != 0:
            if "didn't find section in config file" in result.stderr or (
                "not found" in result.stderr and remote_name in result.stderr
            ):
                raise RcloneRemoteMissing(
                    f"rclone chua co remote '{remote_name}'.\n"
                    f"Chay mot lan: {rclone} config\n"
                    "Chon 'n', ten remote dat dung la "
                    f"'{remote_name}', loai 'drive'.\n"
                    "Doc them: references/google-drive-rclone.md"
                )

    report: dict = {
        "skipped": False,
        "rclone": str(rclone),
        "remote": remote_name,
        "folder_id": resolved_folder,
        "config_source": settings["config_source"],
        "expected_count": len(workbooks)
        + sum(len(names) for names in by_directory.values()),
        "uploads": uploads,
        "failed_jobs": [item for item in uploads if item["returncode"] != 0],
    }

    if verify:
        report["remote_listing"] = verify_remote(
            rclone, remote_name, resolved_folder
        )

    return report


def verify_remote(rclone: Path, remote: str, folder_id: str) -> dict:
    """Liệt kê thư mục Drive sau khi tải lên để đối soát tên và kích thước.

    Không xem được thư mục Drive bằng mắt từ trong script, nên bước này là cách
    duy nhất biết file đã thật sự lên hay chưa.
    """
    result = run_command(build_verify_command(rclone, remote, folder_id), timeout=300)
    if result.returncode != 0:
        return {"ok": False, "error": result.stderr.strip()[-2000:]}
    try:
        entries = json.loads(result.stdout or "[]")
    except json.JSONDecodeError as error:
        return {"ok": False, "error": f"Khong doc duoc lsjson: {error}"}

    files = [
        {"name": item.get("Name"), "size": item.get("Size")}
        for item in entries
        if not item.get("IsDir")
    ]
    return {"ok": True, "file_count": len(files), "files": sorted(
        files, key=lambda item: item["name"] or ""
    )}
