# RUNBOOK PRODUCTION — SHAREPOINT + GITHUB ACTIONS + GITHUB PAGES

Quy trình production hiện tại:

```text
SharePoint
→ Microsoft Graph / GitHub OIDC
→ metadata watcher
→ incremental Data_Goc
→ dashboard build
→ GitHub Pages
```

Không dùng Power Automate Premium và không dùng Client Secret dài hạn.

## 1. SharePoint contract

```text
Shared Documents/
└── Vikoda_Sales_Data/
    ├── Data ERP/
    ├── Target/
    ├── DanhMuc_KH/
    │   └── Thong tin khach hang.xlsx
    ├── DanhMuc_SP/
    │   └── Danh Muc San Pham.xlsx
    └── Data_Goc/
        ├── Sell in Txx_yyyy.xlsx
        ├── _vikoda_pipeline_state.json
        └── _vikoda_incremental_state.json
```

Không đổi tên folder contract nếu chưa sửa workflow.

## 2. Incremental logic

Watcher kiểm tra metadata `.xlsx/.xlsm` mỗi 30 phút.

```text
Không đổi source
→ STOP
→ không download source
→ không ETL
→ không upload Data_Goc
→ không deploy web
```

Nếu chỉ ERP tháng 08/2026 thay đổi:

```text
2026-08 = REBUILD
các tháng khác = SKIP
```

Pipeline dùng Data_Goc hiện có làm baseline, chỉ tạo lại:

```text
Sell in T08_2026.xlsx
```

Sau đó chỉ upload delta:

```text
Sell in T08_2026.xlsx
_vikoda_incremental_state.json
```

Dashboard vẫn được build từ toàn bộ lịch sử Data_Goc.

## 3. State files

Source manifest:

```text
Data_Goc/_vikoda_pipeline_state.json
```

Lưu path, size, lastModifiedDateTime, eTag, cTag và fingerprint source.

Incremental state:

```text
Data_Goc/_vikoda_incremental_state.json
```

Dùng để planner quyết định `REBUILD/SKIP` theo tháng.

State chỉ cập nhật sau khi pipeline thành công.

## 4. Microsoft Entra / GitHub OIDC

Repository Variables bắt buộc:

```text
AZURE_TENANT_ID
AZURE_CLIENT_ID
```

Production không dùng:

```text
AZURE_CLIENT_SECRET
```

Graph authorization khuyến nghị:

```text
Application permission: Sites.Selected
Planning site role: write
```

Federated identity production:

```text
Repository: Huanpro1239/vikoda-sellin-dashboard
Branch: main
Issuer: https://token.actions.githubusercontent.com
Audience: api://AzureADTokenExchange
```

## 5. Workflow

Production workflow:

```text
.github/workflows/vikoda_pipeline.yml
```

Schedule:

```text
*/30 * * * *
```

Trình tự khi có thay đổi:

```text
Validate OIDC
→ Azure login for Microsoft Graph
→ Resolve SharePoint site/drive
→ Detect changed source + ERP periods
→ Download Data_Goc baseline
→ Download ERP / Target / DanhMuc
→ Incremental planner
→ Rebuild affected Data_Goc periods only
→ Finalize dashboard date
→ Health Check
→ Upload Data_Goc delta
→ npm run verify:web
→ Verify web/data/dashboard_data.json
→ Upload GitHub Pages artifact
→ Commit source manifest
→ Deploy GitHub Pages
```

## 6. GitHub Pages

Dashboard GitHub Pages hiện publish **đầy đủ dữ liệu được tạo trong `web/data`**.

Không có bước:

```text
sanitize
ẩn tên khách hàng
đổi mã khách hàng
mã hóa payload
```

GitHub Pages là public. Người có URL có thể truy cập dashboard và payload web.

Lần đầu cần cấu hình:

```text
Repository
→ Settings
→ Pages
→ Build and deployment
→ Source: GitHub Actions
```

Không cần deployment token, Cloudflare, Azure Static Web Apps hoặc Vercel.

## 7. Chạy manual

```text
GitHub
→ Actions
→ Vikoda Sell-In Pipeline
→ Run workflow
```

Chọn:

```text
Branch: main
run_cloud_refresh = true
```

Manual run force metadata refresh nhưng monthly planner vẫn incremental.

Không rerun run cũ sau khi code vừa thay đổi. Hãy tạo run mới trên `main`.

## 8. Kết quả cần kiểm tra

Cloud summary:

```text
Source change: true/false
ERP periods changed: 2026-08 hoặc baseline/reconcile
Data_Goc periods rebuilt: 2026-08 hoặc none
Data_Goc workbooks rebuilt: 1 hoặc 0
GitHub Pages payload: full dashboard data
```

Nếu chỉ T08 thay đổi, không được upload lại toàn bộ Data_Goc.

Deploy job phải PASS:

```text
Configure GitHub Pages
Deploy GitHub Pages
```

Sau đó environment `github-pages` sẽ có URL dashboard.

## 9. Dashboard runtime

Pipeline tạo:

```text
web/data/dashboard_data.json
web/data/dashboard_data.js
```

Hai file này không commit trực tiếp vào Git. Chúng chỉ tồn tại trong runner và Pages artifact.

Dashboard gồm:

```text
01. Tổng quan
02. Vùng - Miền
03. Khách hàng
04. Sale quản lý
05. Sản phẩm
06. Chênh lệch
```

## 10. Troubleshooting

### AADSTS700213

Federated Credential không khớp GitHub OIDC subject/issuer/audience.

### Graph 403

Kiểm tra `Sites.Selected`, Admin consent và site role `write`.

### Graph 404

Kiểm tra đúng folder:

```text
Vikoda_Sales_Data/Data ERP
Vikoda_Sales_Data/Target
Vikoda_Sales_Data/DanhMuc_KH
Vikoda_Sales_Data/DanhMuc_SP
Vikoda_Sales_Data/Data_Goc
```

### Baseline missing

Incremental pipeline cần Data_Goc baseline hợp lệ trên SharePoint.

### Pages deploy fail

Kiểm tra:

```text
Settings → Pages → Source = GitHub Actions
```

và job `cloud-refresh` phải tạo artifact `github-pages` thành công.

### Dashboard không đổi sau source update

Kiểm tra lần lượt:

```text
Detect SharePoint source changes
Rebuild only changed Data_Goc periods and dashboard data
Validate generated dashboard
Upload full dashboard as GitHub Pages artifact
Deploy GitHub Pages
```

## 11. Test trước release

```bash
python -m pip install -r requirements.txt
python code/run_all_tests.py --quiet
npm run verify:web
```

## 12. Quy tắc vận hành

1. Không commit token hoặc `.env`.
2. Không reintroduce `AZURE_CLIENT_SECRET`.
3. Không commit `Data/` hoặc generated `web/data/`; để workflow publish runtime artifact.
4. Giữ Data_Goc là managed output.
5. Giữ incremental planner khi sửa ETL.
6. Thay đổi folder contract phải cập nhật workflow + README + runbook.
7. Sau thay đổi cloud logic, chạy manual validation trên `main`.
