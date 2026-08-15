"""Tự động đồng bộ 2 chiều giữa SharePoint Online và GitHub Actions.

Kịch bản hỗ trợ 2 chế độ:
1. Chế độ Microsoft Graph API (Dùng Client ID / Secret trong GitHub Secrets).
2. Chế độ Power Automate Cloud Webhook (Gửi trực tiếp file từ SharePoint sang GitHub).
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path


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
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        return data["access_token"]


def download_sharepoint_folder(
    token: str, site_id: str, drive_id: str, folder_path: str, local_dest: Path
) -> list[Path]:
    """Tải toàn bộ file từ một thư mục SharePoint về máy chủ GitHub Actions."""
    local_dest.mkdir(parents=True, exist_ok=True)
    encoded_path = urllib.parse.quote(folder_path.strip("/"))
    list_url = f"https://graph.microsoft.com/v1.0/sites/{site_id}/drives/{drive_id}/root:/{encoded_path}:/children"

    req = urllib.request.Request(list_url, method="GET")
    req.add_header("Authorization", f"Bearer {token}")

    downloaded = []
    with urllib.request.urlopen(req) as resp:
        items = json.loads(resp.read().decode("utf-8")).get("value", [])
        for item in items:
            if "file" in item:
                file_name = item["name"]
                download_url = item["@microsoft.graph.downloadUrl"]
                local_file = local_dest / file_name
                print(f"  -> Dang tai tu SharePoint: {file_name}")
                with urllib.request.urlopen(download_url) as file_resp, open(local_file, "wb") as f:
                    f.write(file_resp.read())
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

    with urllib.request.urlopen(req) as resp:
        if resp.status in [200, 201]:
            print(f"  -> Da tai len SharePoint thanh cong: {local_file.name}")


def upload_via_webhook(webhook_url: str, local_file: Path) -> None:
    """Tải file lên SharePoint thông qua Power Automate HTTP Webhook."""
    content_b64 = base64.b64encode(local_file.read_bytes()).decode("utf-8")
    payload = json.dumps({
        "filename": local_file.name,
        "content": content_b64,
        "folder": "Data_Goc"
    }).encode("utf-8")
    req = urllib.request.Request(webhook_url, data=payload, method="POST")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as resp:
            print(f"  -> Da chuyen file {local_file.name} vao SharePoint Data_Goc qua Webhook (status {resp.status})")
    except Exception as e:
        print(f"  -> Loi chuyen file qua webhook: {e}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Dong bo SharePoint <-> GitHub Actions")
    parser.add_argument("--action", choices=["download", "upload"], required=True)
    parser.add_argument("--folder", required=True, help="Ten thu muc tren SharePoint (Data ERP hoac Data_Goc)")
    parser.add_argument("--local-dir", required=True, help="Thu muc cuc bo")
    args = parser.parse_args()

    local_path = Path(args.local_dir).resolve()

    # Kiem tra neu co Webhook cua Power Automate de upload file
    webhook_url = os.environ.get("POWER_AUTOMATE_UPLOAD_WEBHOOK")
    if webhook_url and args.action == "upload":
        print(f"=== DANG TAI FILE LEN SHAREPOINT '{args.folder}' QUA POWER AUTOMATE WEBHOOK ===")
        for f in local_path.glob("*.xlsx"):
            upload_via_webhook(webhook_url, f)
        return

    tenant_id = os.environ.get("AZURE_TENANT_ID")
    client_id = os.environ.get("AZURE_CLIENT_ID")
    client_secret = os.environ.get("AZURE_CLIENT_SECRET")
    site_id = os.environ.get("SHAREPOINT_SITE_ID")
    drive_id = os.environ.get("SHAREPOINT_DRIVE_ID")

    if not all([tenant_id, client_id, client_secret, site_id, drive_id]):
        print("Chua cau hinh day du Azure/SharePoint Secrets. Bo qua buoc dong bo Graph API.")
        return

    token = get_graph_access_token(tenant_id, client_id, client_secret)

    if args.action == "download":
        print(f"=== DANG TAI DU LIEU TU SHAREPOINT '{args.folder}' VE GITHUB ACTIONS ===")
        files = download_sharepoint_folder(token, site_id, drive_id, args.folder, local_path)
        print(f"Da tai xong {len(files)} file.")
    elif args.action == "upload":
        print(f"=== DANG TAI FILE TU GITHUB ACTIONS LEN SHAREPOINT '{args.folder}' ===")
        for f in local_path.glob("*.xlsx"):
            upload_file_to_sharepoint(token, site_id, drive_id, args.folder, f)


if __name__ == "__main__":
    main()
