"""Tự động đồng bộ 2 chiều giữa SharePoint Online và GitHub Actions (Hardened).

Hỗ trợ 2 chế độ:
1. Microsoft Graph API với Exponential Backoff Retry (Dùng Azure AD Secrets).
2. Power Automate Cloud Webhook (Gửi trực tiếp file từ SharePoint sang GitHub).
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Mapping, Sequence

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("SharePointSync")

CLOUD_ENV_NAMES = (
    "AZURE_TENANT_ID",
    "AZURE_CLIENT_ID",
    "AZURE_CLIENT_SECRET",
    "SHAREPOINT_SITE_ID",
    "SHAREPOINT_DRIVE_ID",
)
SOURCE_WORKBOOK_SUFFIXES = {".xlsm", ".xlsx"}


def _env_flag(env: Mapping[str, str], name: str) -> bool:
    """Đọc cờ môi trường theo cách fail-closed, nhưng vẫn hiểu CI=false/0."""
    value = str(env.get(name, "")).strip().lower()
    return value not in {"", "0", "false", "no", "off"}


def _cloud_credentials(env: Mapping[str, str]) -> dict[str, str]:
    """Lấy cấu hình cloud mà không ghi giá trị bí mật ra log."""
    return {name: str(env.get(name, "")) for name in CLOUD_ENV_NAMES}


def http_request_with_retry(
    req: urllib.request.Request,
    max_retries: int = 3,
    initial_delay: float = 2.0,
) -> Any:
    """Thực hiện HTTP Request với cơ chế Exponential Backoff Retry (cho 429 & 5xx)."""
    delay = initial_delay
    last_err = None

    for attempt in range(1, max_retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read(), resp.status
        except urllib.error.HTTPError as e:
            last_err = e
            # Lỗi 401/403 là sai quyền/token, không retry vô hạn
            if e.code in [401, 403]:
                logger.error(f"Lỗi xác thực Microsoft Graph API (HTTP {e.code}): Không thể tiếp tục.")
                raise
            # Lỗi 429 (Rate limit) hoặc 5xx (Server error) -> Retry
            if e.code in [429, 500, 502, 503, 504] and attempt < max_retries:
                logger.warning(f"Lỗi HTTP {e.code} (Lần {attempt}/{max_retries}). Thử lại sau {delay:.1f}s...")
                time.sleep(delay)
                delay *= 2
            else:
                raise
        except (urllib.error.URLError, TimeoutError) as e:
            last_err = e
            if attempt < max_retries:
                logger.warning(f"Lỗi kết nối mạng: {e} (Lần {attempt}/{max_retries}). Thử lại sau {delay:.1f}s...")
                time.sleep(delay)
                delay *= 2
            else:
                raise

    raise RuntimeError(f"Hết lượt thử lại ({max_retries} lần). Lỗi cuối cùng: {last_err}")


def get_graph_access_token(tenant_id: str, client_id: str, client_secret: str) -> str:
    """Lấy OAuth2 Bearer Token từ Microsoft Azure AD / Entra ID."""
    token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    payload = urllib.parse.urlencode({
        "client_id": client_id,
        "scope": "https://graph.microsoft.com/.default",
        "client_secret": client_secret,
        "grant_type": "client_credentials",
    }).encode("utf-8")

    req = urllib.request.Request(token_url, data=payload, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    
    body, status = http_request_with_retry(req)
    data = json.loads(body.decode("utf-8"))
    return data["access_token"]


def download_sharepoint_folder(
    token: str, site_id: str, drive_id: str, folder_path: str, local_dest: Path
) -> list[Path]:
    """Tải toàn bộ file từ một thư mục SharePoint về máy chủ."""
    local_dest.mkdir(parents=True, exist_ok=True)
    encoded_path = urllib.parse.quote(folder_path.strip("/"))
    next_url: str | None = (
        f"https://graph.microsoft.com/v1.0/sites/{site_id}/drives/{drive_id}"
        f"/root:/{encoded_path}:/children"
    )
    items: list[dict[str, Any]] = []
    visited_pages: set[str] = set()
    while next_url:
        if next_url in visited_pages:
            raise RuntimeError("Microsoft Graph trả về vòng lặp phân trang không hợp lệ")
        visited_pages.add(next_url)

        req = urllib.request.Request(next_url, method="GET")
        req.add_header("Authorization", f"Bearer {token}")
        body, _ = http_request_with_retry(req)
        page = json.loads(body.decode("utf-8"))
        page_items = page.get("value", [])
        if not isinstance(page_items, list):
            raise RuntimeError("Microsoft Graph trả về trường 'value' không hợp lệ")
        items.extend(item for item in page_items if isinstance(item, dict))
        candidate = page.get("@odata.nextLink")
        next_url = str(candidate) if candidate else None

    downloaded = []
    downloaded_names: set[str] = set()

    for item in items:
        if "file" in item:
            file_name = str(item.get("name") or "")
            if not file_name or file_name in {".", ".."} or "/" in file_name or "\\" in file_name:
                raise RuntimeError("SharePoint trả về tên file không an toàn")
            folded_name = file_name.casefold()
            if folded_name in downloaded_names:
                raise RuntimeError(f"SharePoint trả về tên file trùng lặp: {file_name}")
            downloaded_names.add(folded_name)
            download_url = item.get("@microsoft.graph.downloadUrl")
            if not download_url:
                continue
            local_file = local_dest / file_name
            logger.info(f"  -> Đang tải từ SharePoint: {file_name}")
            
            dl_req = urllib.request.Request(download_url, method="GET")
            file_data, _ = http_request_with_retry(dl_req)
            local_file.write_bytes(file_data)
            downloaded.append(local_file)

    return downloaded


def upload_file_to_sharepoint(
    token: str, site_id: str, drive_id: str, folder_path: str, local_file: Path
) -> None:
    """Tải file đã xử lý từ GitHub Actions lên thư mục SharePoint (ví dụ: Data_Goc)."""
    encoded_path = urllib.parse.quote(f"{folder_path.strip('/')}/{local_file.name}")
    upload_url = f"https://graph.microsoft.com/v1.0/sites/{site_id}/drives/{drive_id}/root:/{encoded_path}:/content"

    data = local_file.read_bytes()
    req = urllib.request.Request(upload_url, data=data, method="PUT")
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/octet-stream")

    _, status = http_request_with_retry(req)
    if status in [200, 201]:
        logger.info(f"  -> Đã tải lên SharePoint thành công: {local_file.name}")


def main(argv: Sequence[str] | None = None, env: Mapping[str, str] | None = None) -> int:
    """Chạy đồng bộ và trả mã thoát; CI luôn yêu cầu cloud auth đầy đủ."""
    parser = argparse.ArgumentParser(description="Đồng bộ SharePoint <-> Local / GitHub Actions")
    parser.add_argument("--action", choices=["download", "upload"], required=True)
    parser.add_argument("--folder", required=True, help="Tên thư mục trên SharePoint")
    parser.add_argument("--local-dir", required=True, help="Thư mục cục bộ")
    parser.add_argument("--require-cloud-auth", action="store_true", help="Bắt buộc xác thực Cloud (fail nếu thiếu secret)")
    args = parser.parse_args(argv)

    local_path = Path(args.local_dir).resolve()
    active_env = os.environ if env is None else env
    credentials = _cloud_credentials(active_env)
    configured = [name for name, value in credentials.items() if value.strip()]
    cloud_required = args.require_cloud_auth or _env_flag(active_env, "CI")

    if not configured and not cloud_required:
        logger.info("[LOCAL MODE] Không có cấu hình Azure Secret. Sử dụng dữ liệu cục bộ.")
        return 0

    missing = [name for name, value in credentials.items() if not value.strip()]
    if missing:
        logger.error("[CLOUD MODE] Thiếu cấu hình bắt buộc: %s", ", ".join(missing))
        return 2

    tenant_id = credentials["AZURE_TENANT_ID"]
    client_id = credentials["AZURE_CLIENT_ID"]
    client_secret = credentials["AZURE_CLIENT_SECRET"]
    site_id = credentials["SHAREPOINT_SITE_ID"]
    drive_id = credentials["SHAREPOINT_DRIVE_ID"]

    logger.info("Đang kết nối Microsoft Graph API...")
    token = get_graph_access_token(tenant_id, client_id, client_secret)

    if args.action == "download":
        logger.info(f"=== ĐANG TẢI DỮ LIỆU TỪ SHAREPOINT '{args.folder}' ===")
        files = download_sharepoint_folder(token, site_id, drive_id, args.folder, local_path)
        workbooks = [
            path
            for path in files
            if path.suffix.lower() in SOURCE_WORKBOOK_SUFFIXES
            and path.is_file()
            and path.stat().st_size > 0
        ]
        if not workbooks:
            logger.error(
                "SharePoint không trả về workbook .xlsm/.xlsx hợp lệ từ '%s'; "
                "dừng để tránh dùng dữ liệu cũ.",
                args.folder,
            )
            return 3
        logger.info(
            "Hoàn tất tải %s file từ SharePoint (%s workbook nguồn).",
            len(files),
            len(workbooks),
        )
    elif args.action == "upload":
        logger.info(f"=== ĐANG TẢI FILE LÊN SHAREPOINT '{args.folder}' ===")
        upload_files = sorted(local_path.glob("*.xlsx"))
        if not upload_files:
            logger.error("Không tìm thấy file .xlsx để tải lên từ: %s", local_path)
            return 3
        for f in upload_files:
            upload_file_to_sharepoint(token, site_id, drive_id, args.folder, f)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
