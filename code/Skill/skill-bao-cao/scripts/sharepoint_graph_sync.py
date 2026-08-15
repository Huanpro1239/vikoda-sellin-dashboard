"""Tự động đồng bộ 2 chiều giữa SharePoint Online và GitHub Actions (Hardened).

Hỗ trợ 2 chế độ:
1. Microsoft Graph API với Exponential Backoff Retry (Dùng Azure AD Secrets).
2. Power Automate Cloud Webhook (Gửi trực tiếp file từ SharePoint sang GitHub).
"""

from __future__ import annotations

import argparse
import base64
import json
import logging
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, List

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("SharePointSync")


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
) -> List[Path]:
    """Tải toàn bộ file từ một thư mục SharePoint về máy chủ."""
    local_dest.mkdir(parents=True, exist_ok=True)
    encoded_path = urllib.parse.quote(folder_path.strip("/"))
    list_url = f"https://graph.microsoft.com/v1.0/sites/{site_id}/drives/{drive_id}/root:/{encoded_path}:/children"

    req = urllib.request.Request(list_url, method="GET")
    req.add_header("Authorization", f"Bearer {token}")

    body, status = http_request_with_retry(req)
    items = json.loads(body.decode("utf-8")).get("value", [])
    downloaded = []

    for item in items:
        if "file" in item:
            file_name = item["name"]
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


def main() -> None:
    parser = argparse.ArgumentParser(description="Đồng bộ SharePoint <-> Local / GitHub Actions")
    parser.add_argument("--action", choices=["download", "upload"], required=True)
    parser.add_argument("--folder", required=True, help="Tên thư mục trên SharePoint")
    parser.add_argument("--local-dir", required=True, help="Thư mục cục bộ")
    parser.add_argument("--require-cloud-auth", action="store_true", help="Bắt buộc xác thực Cloud (fail nếu thiếu secret)")
    args = parser.parse_args()

    local_path = Path(args.local_dir).resolve()

    tenant_id = os.environ.get("AZURE_TENANT_ID")
    client_id = os.environ.get("AZURE_CLIENT_ID")
    client_secret = os.environ.get("AZURE_CLIENT_SECRET")
    site_id = os.environ.get("SHAREPOINT_SITE_ID")
    drive_id = os.environ.get("SHAREPOINT_DRIVE_ID")

    is_cloud_env = any([tenant_id, client_id, client_secret, site_id, drive_id]) or args.require_cloud_auth

    if not is_cloud_env:
        logger.info("[LOCAL MODE] Không có cấu hình Azure Secret. Sử dụng dữ liệu cục bộ.")
        return

    if not all([tenant_id, client_id, client_secret, site_id, drive_id]):
        missing = [k for k, v in [
            ("AZURE_TENANT_ID", tenant_id),
            ("AZURE_CLIENT_ID", client_id),
            ("AZURE_CLIENT_SECRET", client_secret),
            ("SHAREPOINT_SITE_ID", site_id),
            ("SHAREPOINT_DRIVE_ID", drive_id),
        ] if not v]
        err_msg = f"[CLOUD MODE] Thiếu cấu hình Secrets: {', '.join(missing)}"
        logger.error(err_msg)
        if args.require_cloud_auth or os.environ.get("CI"):
            sys.exit(1)
        return

    logger.info("Đang kết nối Microsoft Graph API...")
    token = get_graph_access_token(tenant_id, client_id, client_secret)

    if args.action == "download":
        logger.info(f"=== ĐANG TẢI DỮ LIỆU TỪ SHAREPOINT '{args.folder}' ===")
        files = download_sharepoint_folder(token, site_id, drive_id, args.folder, local_path)
        logger.info(f"Hoàn tất tải {len(files)} file từ SharePoint.")
    elif args.action == "upload":
        logger.info(f"=== ĐANG TẢI FILE LÊN SHAREPOINT '{args.folder}' ===")
        for f in local_path.glob("*.xlsx"):
            upload_file_to_sharepoint(token, site_id, drive_id, args.folder, f)


if __name__ == "__main__":
    main()
