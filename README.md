<div align="center">

# VIKODA SELL-IN DATA PLATFORM

**SharePoint → Microsoft Graph → GitHub Actions OIDC → Incremental ETL → Data_Goc → GitHub Pages Dashboard**

[![Vikoda Sell-In Pipeline](https://github.com/Huanpro1239/vikoda-sellin-dashboard/actions/workflows/vikoda_pipeline.yml/badge.svg)](https://github.com/Huanpro1239/vikoda-sellin-dashboard/actions/workflows/vikoda_pipeline.yml)

</div>

Hệ thống tự phát hiện dữ liệu nguồn thay đổi trên SharePoint, chỉ rebuild tháng `Data_Goc` bị ảnh hưởng, build lại dashboard và tự deploy bản web lên GitHub Pages.

## Kiến trúc production

```text
SharePoint
   ↓ Microsoft Graph + GitHub OIDC
Metadata watcher mỗi 30 phút
   ↓
Có thay đổi?
├─ Không → STOP
└─ Có
    ↓
Download Data_Goc baseline + source
    ↓
Incremental planner
    ↓
Chỉ rebuild tháng ERP bị ảnh hưởng
    ↓
Upload Data_Goc delta + checkpoint
    ↓
Build web/data/dashboard_data.json
    ↓
Python/Web validation
    ↓
GitHub Pages deploy
```

## Incremental Data_Goc

Nếu chỉ ERP tháng 08 thay đổi:

```text
T01–T07 → giữ nguyên
T08     → REBUILD
T09...  → giữ nguyên
```

Pipeline chỉ upload workbook tháng thay đổi và `_vikoda_incremental_state.json`. Toàn bộ lịch sử vẫn được dùng để build dashboard.

## Dashboard

Dashboard có 6 màn hình:

```text
01. Tổng quan
02. Vùng - Miền
03. Khách hàng
04. Sale quản lý
05. Sản phẩm
06. Chênh lệch
```

KPI toàn cục:

```text
Actual | Cùng kỳ | Target | % Đạt Target | Tăng trưởng
```

Web runtime được tạo tại:

```text
web/data/dashboard_data.json
web/data/dashboard_data.js
```

Các file runtime này **không commit vào Git**. Workflow tạo chúng trong GitHub runner rồi publish trực tiếp lên GitHub Pages.

## GitHub Pages

Theo cấu hình hiện tại, GitHub Pages publish **toàn bộ dữ liệu dashboard** được tạo từ pipeline, gồm dữ liệu cấp khách hàng nếu payload có trường đó. Không có bước ẩn danh, mã hóa hoặc sanitize trước khi deploy.

GitHub Pages là public static hosting. URL dashboard có thể được truy cập công khai.

Để bật Pages lần đầu:

```text
Repository → Settings → Pages
Source → GitHub Actions
```

Sau đó chạy:

```text
Actions → Vikoda Sell-In Pipeline → Run workflow
run_cloud_refresh = true
```

Khi SharePoint có dữ liệu mới, schedule 30 phút sẽ tự phát hiện, rebuild và deploy lại dashboard.

## SharePoint contract

```text
Shared Documents/
└── Vikoda_Sales_Data/
    ├── Data ERP/
    ├── Target/
    ├── DanhMuc_KH/
    ├── DanhMuc_SP/
    └── Data_Goc/
        ├── Sell in Txx_yyyy.xlsx
        ├── _vikoda_pipeline_state.json
        └── _vikoda_incremental_state.json
```

## GitHub configuration

Repository Variables bắt buộc:

```text
AZURE_TENANT_ID
AZURE_CLIENT_ID
```

Các giá trị mặc định:

```text
SHAREPOINT_HOSTNAME=vikodacomvn.sharepoint.com
SHAREPOINT_SITE_PATH=/sites/Planning
SHAREPOINT_BASE_FOLDER=Vikoda_Sales_Data
SHAREPOINT_PIPELINE_STATE_FILE=_vikoda_pipeline_state.json
SHAREPOINT_INCREMENTAL_STATE_FILE=_vikoda_incremental_state.json
```

Production dùng GitHub OIDC + Microsoft Entra Federated Credential, không dùng `AZURE_CLIENT_SECRET`.

Graph authorization khuyến nghị:

```text
Application permission: Sites.Selected
Planning site role: write
```

## Trigger

| Trigger | Hành vi |
|---|---|
| Pull request | Python/Web regression + hygiene |
| Push `main` | Read-only CI |
| Schedule `*/30 * * * *` | Check metadata SharePoint |
| Không thay đổi | Dừng trước ETL |
| Có thay đổi | Incremental build + deploy Pages |
| Manual dispatch | Force refresh + deploy Pages |

## Kiểm tra local

```bash
python -m pip install -r requirements.txt
python code/run_all_tests.py --quiet
npm run verify:web
```

## Các file chính

```text
.github/workflows/vikoda_pipeline.yml
code/common/sharepoint_change_detector_v2.py
code/common/incremental_cloud_pipeline.py
code/common/sharepoint_bootstrap.py
code/Skill/skill-bao-cao/scripts/export_web_data.py
web/index.html
web/css/executive-dashboard.css
web/css/vikoda-powerbi-theme.css
web/js/data-engine.js
web/js/charts.js
web/js/executive-ui.js
web/js/app.js
```

Hướng dẫn vận hành chi tiết: [`HUONG_DAN_SHAREPOINT_GITHUB_ACTIONS.md`](HUONG_DAN_SHAREPOINT_GITHUB_ACTIONS.md).
