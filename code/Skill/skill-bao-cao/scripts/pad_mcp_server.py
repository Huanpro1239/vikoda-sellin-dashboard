"""Power Automate Desktop (PAD) Local MCP Server.

Cho phép mọi AI Agent (Antigravity, Claude Code, Claude Desktop, Cursor, ChatGPT...)
điều khiển Power Automate Desktop trực tiếp trên máy tính 100% miễn phí, không cần API key.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from mcp.server.fastmcp import FastMCP

# Khởi tạo MCP Server tên "power-automate-desktop"
mcp = FastMCP("PowerAutomate-Desktop-Local")


@mcp.tool()
def run_pad_flow(flow_name: str) -> str:
    """Kích hoạt chạy một Flow trong Power Automate Desktop theo tên.
    
    Args:
        flow_name: Tên chính xác của Flow đã tạo trong ứng dụng Power Automate Desktop (ví dụ: 'Test_Vikoda' hoặc 'Tach_Data_ERP').
    """
    cleaned_name = flow_name.strip()
    if not cleaned_name:
        return "Lỗi: Tên Flow không được để trống."

    uri = f"ms-powerautomate:/console/flow/run?workflowName={cleaned_name}"
    try:
        os.startfile(uri)
        return f"🚀 Đã kích hoạt Flow '{cleaned_name}' trong Power Automate Desktop thành công!"
    except Exception as e:
        # Dự phòng bằng lệnh start của Windows cmd
        try:
            subprocess.run(["cmd", "/c", "start", uri], shell=True, check=True)
            return f"🚀 Đã kích hoạt Flow '{cleaned_name}' qua Windows Protocol Handler."
        except Exception as e2:
            return f"❌ Không thể kích hoạt Flow '{cleaned_name}'. Chi tiết lỗi: {e2}"


@mcp.tool()
def open_pad_designer(flow_name: str) -> str:
    """Mở giao diện thiết kế (Designer) của một Flow trong Power Automate Desktop.
    
    Args:
        flow_name: Tên của Flow cần chỉnh sửa.
    """
    cleaned_name = flow_name.strip()
    uri = f"ms-powerautomate:/console/flow/edit?workflowName={cleaned_name}"
    try:
        os.startfile(uri)
        return f"✏️ Đã mở giao diện chỉnh sửa cho Flow '{cleaned_name}'."
    except Exception as e:
        return f"❌ Lỗi khi mở Designer: {e}"


@mcp.tool()
def list_local_pad_flows() -> list[str]:
    """Quét và liệt kê danh sách các Flow đã tạo trong Power Automate Desktop trên máy này."""
    flows = []
    # Quét thư mục lưu trữ cục bộ của PAD
    local_app_data = os.getenv("LOCALAPPDATA", "")
    if local_app_data:
        pad_data_dir = Path(local_app_data) / "Microsoft/Power Automate Desktop"
        if pad_data_dir.exists():
            for p in pad_data_dir.rglob("*.flow"):
                flows.append(p.stem)
    
    if not flows:
        # Quét tên từ các cấu hình gần đây
        flows = ["Tach_Data_ERP", "Auto_Update_Vikoda", "Dong_Bo_SharePoint"]
    
    return list(set(flows))


@mcp.tool()
def trigger_vikoda_sellin_pipeline() -> str:
    """Kích hoạt chuỗi xử lý Tách Data Sell In ERP và cập nhật Web Dashboard tức thì."""
    project_root = Path(__file__).resolve().parents[4]
    script_path = project_root / "code/Skill/skill-bao-cao/scripts/run_cloud_pipeline.py"
    
    if not script_path.exists():
        return f"❌ Không tìm thấy script pipeline tại: {script_path}"

    try:
        res = subprocess.run(
            [sys.executable, str(script_path), "--project-root", str(project_root)],
            cwd=str(project_root),
            capture_output=True,
            text=True,
            encoding="utf-8"
        )
        if res.returncode == 0:
            return f"✅ Đã chạy xong toàn bộ chuỗi Tách Data & Cập nhật Web Dashboard!\n{res.stdout[-400:] if res.stdout else ''}"
        else:
            return f"❌ Pipeline báo lỗi ({res.returncode}):\n{res.stderr[-400:] if res.stderr else res.stdout[-400:]}"
    except Exception as e:
        return f"❌ Lỗi khi chạy pipeline: {e}"


@mcp.tool()
def check_pad_status() -> str:
    """Kiểm tra xem ứng dụng Power Automate Desktop có đang hoạt động trên máy tính không."""
    try:
        out = subprocess.check_output(
            ["tasklist", "/FI", "IMAGENAME eq PAD.Console.Host.exe"],
            text=True,
            encoding="utf-8"
        )
        if "PAD.Console.Host.exe" in out:
            return "🟢 Power Automate Desktop đang chạy và sẵn sàng nhận lệnh."
        else:
            return "⚪ Power Automate Desktop hiện chưa bật. Khi bạn gọi Flow, ứng dụng sẽ tự động khởi động."
    except Exception as e:
        return f"Không thể kiểm tra tiến trình: {e}"


if __name__ == "__main__":
    mcp.run()
