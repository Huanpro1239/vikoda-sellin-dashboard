"""Đồng bộ workbook giữa SharePoint Online và GitHub Actions qua Microsoft Graph.

Thiết kế chính thức của project dùng OAuth2 Client Credentials từ Microsoft Entra ID.
Script fail-closed trong CI: thiếu credential, không có workbook nguồn hoặc upload lỗi
đều trả mã thoát khác 0.
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
    value = str(env.get(name, "")).strip().lower()
    return value not in {"", "0", "false", "no", "off"}


def _cloud_credentials(env: Mapping[str, str]) -> dict[str, str]:
    return {name: str(env.get(name, "")) for name in CLOUD_ENV_NAMES}


def http_request_with_retry(
    req: urllib.request.Request,
    max_retries: int = 3,
    initial_delay: float = 2.0,
) -> tuple[bytes, int]:
    """Gọi HTTP với exponential backoff cho 429, 5xx và lỗi mạng tạm thời."""
    delay = initial_delay
    last_error: Exception | None = None

    for attempt in range(1, max_retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read(), resp.status
        except urllib.error.HTTPError as exc:
            last_error = exc
            if exc.code in {401, 403}:
                logger.error("Microsoft Graph từ chối xác thực/phân quyền (HTTP %s).", exc.code)
                raise
            if exc.code in {429, 500, 502, 503, 504} and attempt < max_retries:
                retry_after = exc.headers.get("Retry-After") if exc.headers else None
                wait = float(retry_after) if retry_after and retry_after.isdigit() else delay
                logger.warning(
                    "HTTP %s (lần %s/%s); thử lại sau %.1fs.",
                    exc.code,
                    attempt,
                    max_retries,
                    wait,
                )
                time.sleep(wait)
                delay *= 2
                continue
            raise
        except (urllib.error.URLError, TimeoutError) as exc:
            last_error = exc
            if attempt < max_retries:
                logger.warning(
                    "Lỗi mạng (lần %s/%s): %s; thử lại sau %.1fs.",
                    attempt,
                    max_retries,
                    exc,
                    delay,
                )
                time.sleep(delay)
                delay *= 2
                continue
            raise

    raise RuntimeError(f"Hết lượt retry. Lỗi cuối: {last_error}")


def get_graph_access_token(tenant_id: str, client_id: str, client_secret: str) -> str:
    """Lấy Microsoft Graph access token bằng OAuth2 Client Credentials."""
    token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    payload = urllib.parse.urlencode(
        {
            "client_id": client_id,
            "scope": "https://graph.microsoft.com/.default",
            "client_secret": client_secret,
            "grant_type": "client_credentials",
        }
    ).encode("utf-8")

    req = urllib.request.Request(token_url, data=payload, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    body, _ = http_request_with_retry(req)
    data = json.loads(body.decode("utf-8"))
    token = data.get("access_token")
    if not isinstance(token, str) or not token:
        raise RuntimeError("Entra ID không trả về access_token hợp lệ")
    return token


def download_sharepoint_folder(
    token: str,
    site_id: str,
    drive_id: str,
    folder_path: str,
    local_dest: Path,
) -> list[Path]:
    """Tải toàn bộ file trực tiếp trong một SharePoint folder về local."""
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

    downloaded: list[Path] = []
    downloaded_names: set[str] = set()

    for item in items:
        if "file" not in item:
            continue

        file_name = str(item.get("name") or "")
        if not file_name or file_name in {".", ".."} or "/" in file_name or "\\" in file_name:
            raise RuntimeError("SharePoint trả về tên file không an toàn")

        folded_name = file_name.casefold()
        if folded_name in downloaded_names:
            raise RuntimeError(f"SharePoint trả về tên file trùng lặp: {file_name}")
        downloaded_names.add(folded_name)

        download_url = item.get("@microsoft.graph.downloadUrl")
        if not download_url:
            logger.warning("Bỏ qua file không có downloadUrl: %s", file_name)
            continue

        local_file = local_dest / file_name
        logger.info("Đang tải từ SharePoint: %s", file_name)
        dl_req = urllib.request.Request(str(download_url), method="GET")
        file_data, _ = http_request_with_retry(dl_req)
        local_file.write_bytes(file_data)
        if local_file.stat().st_size <= 0:
            raise RuntimeError(f"File tải về rỗng: {file_name}")
        downloaded.append(local_file)

    return downloaded


def upload_file_to_sharepoint(
    token: str,
    site_id: str,
    drive_id: str,
    folder_path: str,
    local_file: Path,
) -> dict[str, Any]:
    """Upload một file bằng Graph PUT /content và kiểm tra phản hồi."""
    if not local_file.is_file() or local_file.stat().st_size <= 0:
        raise RuntimeError(f"File upload không tồn tại hoặc rỗng: {local_file}")

    encoded_path = urllib.parse.quote(f"{folder_path.strip('/')}/{local_file.name}")
    upload_url = (
        f"https://graph.microsoft.com/v1.0/sites/{site_id}/drives/{drive_id}"
        f"/root:/{encoded_path}:/content"
    )

    data = local_file.read_bytes()
    req = urllib.request.Request(upload_url, data=data, method="PUT")
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/octet-stream")

    body, status = http_request_with_retry(req)
    if status not in {200, 201}:
        raise RuntimeError(f"Upload SharePoint thất bại HTTP {status}: {local_file.name}")

    response: dict[str, Any] = {}
    if body:
        try:
            parsed = json.loads(body.decode("utf-8"))
            if isinstance(parsed, dict):
                response = parsed
        except (UnicodeError, json.JSONDecodeError):
            logger.warning("Graph upload thành công nhưng response không phải JSON")

    remote_name = response.get("name")
    if remote_name and str(remote_name) != local_file.name:
        raise RuntimeError(
            f"Tên file Graph phản hồi không khớp: local={local_file.name}, remote={remote_name}"
        )

    remote_size = response.get("size")
    if isinstance(remote_size, int) and remote_size != len(data):
        raise RuntimeError(
            f"Kích thước file Graph phản hồi không khớp: local={len(data)}, remote={remote_size}"
        )

    logger.info("Đã upload SharePoint: %s (%s bytes)", local_file.name, len(data))
    return response


def main(argv: Sequence[str] | None = None, env: Mapping[str, str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Đồng bộ SharePoint Online qua Microsoft Graph")
    parser.add_argument("--action", choices=["download", "upload"], required=True)
    parser.add_argument("--folder", required=True, help="Tên/path folder trên SharePoint")
    parser.add_argument("--local-dir", required=True, help="Thư mục local")
    parser.add_argument(
        "--require-cloud-auth",
        action="store_true",
        help="Fail nếu thiếu Entra/SharePoint credentials",
    )
    args = parser.parse_args(argv)

    local_path = Path(args.local_dir).resolve()
    active_env = os.environ if env is None else env
    credentials = _cloud_credentials(active_env)
    configured = [name for name, value in credentials.items() if value.strip()]
    cloud_required = args.require_cloud_auth or _env_flag(active_env, "CI")

    if not configured and not cloud_required:
        logger.info("[LOCAL MODE] Không có cloud credentials; không thực hiện Graph sync.")
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

    logger.info("Kết nối Microsoft Graph...")
    token = get_graph_access_token(tenant_id, client_id, client_secret)

    if args.action == "download":
        logger.info("Tải dữ liệu từ SharePoint '%s'", args.folder)
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
                "SharePoint không trả về workbook .xlsm/.xlsx hợp lệ từ '%s'.",
                args.folder,
            )
            return 3
        logger.info("Đã tải %s file, trong đó %s workbook nguồn.", len(files), len(workbooks))
        return 0

    logger.info("Upload dữ liệu lên SharePoint '%s'", args.folder)
    upload_files = sorted(
        path
        for path in local_path.glob("*.xlsx")
        if path.is_file() and path.stat().st_size > 0
    )
    if not upload_files:
        logger.error("Không tìm thấy file .xlsx hợp lệ để upload từ: %s", local_path)
        return 3

    for local_file in upload_files:
        upload_file_to_sharepoint(token, site_id, drive_id, args.folder, local_file)

    logger.info("Hoàn tất upload %s workbook.", len(upload_files))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
