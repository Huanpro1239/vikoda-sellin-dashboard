# RUNBOOK PRODUCTION — SHAREPOINT WATCHER + GITHUB ACTIONS OIDC + WEB DASHBOARD

Tài liệu này mô tả luồng production Vikoda Sell-In v2.4: SharePoint là source of truth, GitHub Actions tự kiểm tra dữ liệu nguồn định kỳ, chỉ chạy ETL khi có thay đổi và build lại Executive Dashboard từ đúng dữ liệu của lượt chạy đó.

Production path **không dùng Power Automate/Flow** và **không dùng Azure Client Secret dài hạn**.

## 1. Luồng vận hành

```text
SharePoint source workbooks
→ Graph metadata watcher (30 phút/lần)
→ SHA-256 fingerprint
→ Có thay đổi?
   ├─ Không: kết thúc nhẹ, không ETL
   └─ Có: OIDC → download → ETL --strict → validation/health
           → Data_Goc + web/data → upload → web regression
           → commit fingerprint → optional gated deploy
```

## 2. SharePoint contract

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
        └── _vikoda_pipeline_state.json
```

Không rename các folder contract nếu chưa sửa workflow và chạy lại end-to-end validation.

## 3. Microsoft Entra / OIDC

App production: `vikoda-sellin-github-actions`.

Microsoft Graph Application permission:

```text
Sites.Selected
```

Site grant:

```text
Site: https://vikodacomvn.sharepoint.com/sites/Planning
Role: write
```

Federated identity production:

```text
Issuer: https://token.actions.githubusercontent.com
Subject: repo:Huanpro1239@213777839/vikoda-sellin-dashboard@1333996723:ref:refs/heads/main
Audience: api://AzureADTokenExchange
```

Không tạo `AZURE_CLIENT_SECRET` cho production workflow.

## 4. Repository Variables

Bắt buộc:

```text
AZURE_TENANT_ID=<Directory tenant ID>
AZURE_CLIENT_ID=<Application client ID>
```

Optional/default:

```text
SHAREPOINT_HOSTNAME=vikodacomvn.sharepoint.com
SHAREPOINT_SITE_PATH=/sites/Planning
SHAREPOINT_BASE_FOLDER=Vikoda_Sales_Data
SHAREPOINT_PIPELINE_STATE_FILE=_vikoda_pipeline_state.json
```

`SHAREPOINT_SITE_ID` / `SHAREPOINT_DRIVE_ID` không cần pin; bootstrap tự resolve.

## 5. Cơ chế phát hiện dữ liệu mới

Schedule:

```text
*/30 * * * *
```

Đây là polling 30 phút, không phải webhook real-time. GitHub cron có thể chậm vài phút.

`code/common/sharepoint_change_detector.py` đọc metadata workbook qua Microsoft Graph và fingerprint:

```text
relative path
size
lastModifiedDateTime
eTag
cTag
```

Watcher theo dõi đệ quy `.xlsx/.xlsm` trong `Data ERP`, `Target`, `DanhMuc_KH`, `DanhMuc_SP`; file lock Office `~$...` được bỏ qua.

Checkpoint của **lần xử lý thành công**:

```text
Vikoda_Sales_Data/Data_Goc/_vikoda_pipeline_state.json
```

Logic:

```text
Không có state          → chạy
Fingerprint khác        → chạy
Manual force refresh    → chạy
Fingerprint giống       → skip ETL
```

State chỉ commit sau `ETL + validation + health + Data_Goc upload + web regression` đều PASS. Job fail không đánh dấu source là đã xử lý.

## 6. Build Executive Dashboard

`run_cloud_pipeline.py --strict` sinh cùng lượt:

```text
web/data/dashboard_data.json
web/data/dashboard_data.js
```

`export_web_data.py` chỉ export khi quality status = `PASS` và ghi atomically.

UI v2.4:

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

Bộ lọc: kỳ báo cáo, Kênh, Miền, Vùng, Group Brand/Nhóm SP. `data-engine.js` vẫn là calculation contract; `executive-ui.js` chỉ quản lý presentation/dynamic controls.

## 7. Web publishing

### Internal dashboard

Customer/revenue-level data là internal. GitHub Pages là public static hosting; password JavaScript không phải access control.

Giữ:

```text
ENABLE_PAGES_DEPLOY=false
WEB_DATA_CLASSIFICATION=internal
```

Pipeline vẫn build + validate dashboard nhưng không public.

### Public/sanitized dashboard

Chỉ khi payload đã sanitize/phê duyệt:

```text
ENABLE_PAGES_DEPLOY=true
WEB_DATA_CLASSIFICATION=public-or-sanitized
```

Scheduled refresh: nếu source đổi và hai gate mở, dashboard auto-deploy sau ETL.

Manual refresh: ngoài hai gate còn cần `publish_dashboard=true`.

## 8. Force refresh manual

```text
GitHub → Actions → Vikoda Sell-In Pipeline → Run workflow
Branch: main
run_cloud_refresh=true
publish_dashboard=false
```

Manual `run_cloud_refresh=true` bỏ qua so sánh fingerprint và chạy full pipeline.

## 9. Khi có dữ liệu mới

Cloud job kỳ vọng:

```text
Validate OIDC                              PASS
Azure login                               PASS
Resolve site/drive                        PASS
Detect SharePoint source changes          PASS · changed=true
Download ERP/Target/DMKH/DMSP             PASS
Strict ETL + web data build               PASS
Finalize + Health Check                   PASS
Data_Goc upload                           PASS
Generated web regression                  PASS
Source fingerprint commit                 PASS
Pages deploy                              PASS hoặc SKIPPED theo security gate
```

## 10. Khi không có dữ liệu mới

Scheduled run kỳ vọng:

```text
OIDC/bootstrap                            PASS
Detect SharePoint source changes          PASS · changed=false
Download/ETL/upload/web build             SKIPPED
Workflow                                  PASS
```

## 11. Troubleshooting

- `state-missing`: chạy một full successful refresh để tạo `_vikoda_pipeline_state.json`.
- `No .xlsx/.xlsm source workbook found`: kiểm tra 4 source path và Graph permission.
- Source vừa upload nhưng chưa chạy: chờ polling hoặc force manual.
- Dashboard build PASS nhưng Pages SKIPPED: kiểm tra security gate; với internal data đây là trạng thái đúng.
- OIDC/403/404: kiểm tra federated subject, `Sites.Selected`, Planning site `write`, và path folder.

## 12. Test local

```bash
python -m pip install -r requirements.txt
python code/run_all_tests.py --quiet
npm run verify:web
```

Graph local:

```bash
az login --tenant <AZURE_TENANT_ID> --allow-no-subscriptions
python code/common/sharepoint_bootstrap.py
```

## 13. Definition of Done

```text
Repository hygiene             PASS
Python suite                   PASS
Web JS/regression              PASS
Manual OIDC                    PASS
Change detector                PASS
All SharePoint downloads       PASS
Strict ETL                     PASS
Health check                   PASS
Data_Goc upload                PASS
Generated dashboard validation PASS
Source fingerprint commit      PASS
```

Security: [`SECURITY.md`](SECURITY.md). Audit: [`PROJECT_AUDIT.md`](PROJECT_AUDIT.md).
