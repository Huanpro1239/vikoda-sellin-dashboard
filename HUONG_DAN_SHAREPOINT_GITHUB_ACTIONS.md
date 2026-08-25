# RUNBOOK PRODUCTION — SHAREPOINT + GITHUB ACTIONS OIDC + INCREMENTAL DATA_GOC

Tài liệu này là quy trình vận hành chuẩn của Vikoda Sell-In. Mục tiêu: người mới đọc một lần có thể hiểu dữ liệu ở đâu, pipeline phát hiện thay đổi thế nào, tháng nào được rebuild, Data_Goc được upload ra sao và dashboard được build như thế nào.

Production path không dùng Power Automate Premium, không dùng Client Secret dài hạn và không commit dữ liệu production vào Git.

## 1. Luồng production

```text
ERP / Target / Danh mục trên SharePoint
                ↓
       Microsoft Graph metadata check
                ↓
          Source changed?
          ├─ Không → STOP
          └─ Có
                ↓
      Download Data_Goc baseline
                ↓
      Incremental monthly planner
                ↓
       REBUILD / SKIP từng tháng
                ↓
   Chỉ rebuild tháng ERP bị ảnh hưởng
                ↓
   Full Data_Goc = baseline + delta
                ↓
 Validation + Health Check + Web build
                ↓
 Chỉ upload Data_Goc delta lên SharePoint
                ↓
 Commit source manifest + incremental state
```

## 2. Cấu trúc SharePoint

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

Mapping:

| Thành phần | SharePoint path |
|---|---|
| ERP | `Vikoda_Sales_Data/Data ERP` |
| Target | `Vikoda_Sales_Data/Target` |
| Khách hàng | `Vikoda_Sales_Data/DanhMuc_KH` |
| Sản phẩm | `Vikoda_Sales_Data/DanhMuc_SP` |
| Data_Goc | `Vikoda_Sales_Data/Data_Goc` |

Không đổi tên folder/file contract nếu chưa sửa workflow tương ứng.

## 3. Nguyên tắc incremental

### 3.1 Không có source mới

Graph fingerprint không đổi:

```text
Metadata check → no-source-change → STOP
```

Không download source, không ETL, không build workbook, không upload Data_Goc, không build web.

### 3.2 Một tháng ERP thay đổi

Ví dụ chỉ file tháng 08/2026 thay đổi:

```text
Data ERP/..._Vikoda_T08_2026.xlsx
```

Kết quả:

```text
2026-08 = REBUILD
các tháng khác = SKIP
```

Pipeline dùng Data_Goc hiện có làm baseline, rebuild `Sell in T08_2026.xlsx`, build dashboard từ full history rồi upload chỉ delta:

```text
Sell in T08_2026.xlsx
_vikoda_incremental_state.json
```

Không upload lại các workbook tháng khác.

### 3.3 Target hoặc danh mục thay đổi

Pipeline vẫn rebuild report/web từ full Data_Goc baseline. Monthly planner chỉ rebuild workbook khi ERP/source-output reconciliation yêu cầu.

### 3.4 Data_Goc là managed output

Không sửa tay Data_Goc trong vận hành thường ngày. Input nghiệp vụ phải thay đổi ở ERP/Target/DanhMuc. Điều này giúp incremental state đáng tin cậy.

## 4. Hai lớp state

### Source manifest

```text
Data_Goc/_vikoda_pipeline_state.json
```

Lưu fingerprint + manifest của source sau lượt chạy thành công. Manifest dùng:

```text
path
size
lastModifiedDateTime
eTag
cTag
```

Nhờ đó pipeline biết chính xác file ERP nào thay đổi và suy ra period `YYYY-MM`.

### Monthly incremental state

```text
Data_Goc/_vikoda_incremental_state.json
```

Lưu trạng thái source/output theo tháng cho engine `build_incremental_plan()`.

State chỉ commit sau pipeline thành công. Nếu run fail, lượt poll kế tiếp vẫn phát hiện thay đổi và retry.

## 5. Microsoft Entra / OIDC

App Registration production dùng GitHub OIDC + Federated Credential.

Graph permission khuyến nghị:

```text
Application permission: Sites.Selected
Planning site role: write
```

Không dùng `Sites.ReadWrite.All` nếu không có yêu cầu bắt buộc.

Federated identity hiện tại:

```text
Organization: Huanpro1239
Organization / Owner ID: 213777839
Repository: vikoda-sellin-dashboard
Repository ID: 1333996723
Branch: main
Issuer: https://token.actions.githubusercontent.com
Audience: api://AzureADTokenExchange
Subject: repo:Huanpro1239@213777839/vikoda-sellin-dashboard@1333996723:ref:refs/heads/main
```

Production workflow không dùng `AZURE_CLIENT_SECRET`.

## 6. GitHub Repository Variables

Bắt buộc:

```text
AZURE_TENANT_ID
AZURE_CLIENT_ID
```

Optional/default:

```text
SHAREPOINT_HOSTNAME=vikodacomvn.sharepoint.com
SHAREPOINT_SITE_PATH=/sites/Planning
SHAREPOINT_BASE_FOLDER=Vikoda_Sales_Data
SHAREPOINT_PIPELINE_STATE_FILE=_vikoda_pipeline_state.json
SHAREPOINT_INCREMENTAL_STATE_FILE=_vikoda_incremental_state.json
```

Không cần pin `SHAREPOINT_SITE_ID` / `SHAREPOINT_DRIVE_ID`; bootstrap tự resolve.

## 7. Workflow production

File duy nhất:

```text
.github/workflows/vikoda_pipeline.yml
```

Schedule:

```text
*/30 * * * *
```

Đây là metadata polling 30 phút. Heavy ETL chỉ chạy khi source fingerprint thay đổi.

### Trình tự cloud job

```text
Validate OIDC
→ Azure login
→ Resolve SharePoint site/drive
→ Detect source change + changed ERP periods
→ nếu không đổi: STOP
→ Download Data_Goc baseline
→ Download ERP / Target / DanhMuc
→ Incremental planner
→ Rebuild only affected Data_Goc months
→ Rebuild downstream report + web data
→ Finalize dashboard date
→ Health Check
→ Inspect Data_Goc delta
→ Upload only delta
→ Web regression
→ Optional web deploy gate
→ Commit source manifest
```

## 8. Các file code chính

```text
code/common/sharepoint_change_detector.py
```
Graph fingerprint primitives.

```text
code/common/sharepoint_change_detector_v2.py
```
Per-file manifest diff + xác định ERP period thay đổi.

```text
code/Skill/sell-in-monthly/scripts/incremental.py
```
Planner `REBUILD/SKIP` theo tháng.

```text
code/Skill/sell-in-monthly/scripts/extract_sources.py --plan-file
```
Chỉ extract periods được planner đánh dấu REBUILD.

```text
code/common/incremental_cloud_pipeline.py
```
Orchestrator cho GitHub runner: baseline → planner → delta → downstream web.

## 9. Chạy manual

Vào:

```text
GitHub → Actions → Vikoda Sell-In Pipeline → Run workflow
```

Chọn:

```text
Branch: main
run_cloud_refresh = true
publish_dashboard = false
```

Manual run force metadata check nhưng monthly planner vẫn dùng incremental logic; không mặc định rebuild tất cả tháng.

Không dùng rerun run cũ sau khi code/config vừa đổi. Tạo workflow run mới trên `main`.

## 10. Kết quả thành công cần kiểm tra

Cloud summary phải thể hiện:

```text
Source change: true/false
ERP periods changed by manifest: 2026-08 hoặc baseline/reconcile
Data_Goc periods rebuilt: 2026-08 hoặc none
Data_Goc workbooks rebuilt: 1 hoặc 0
```

Nếu chỉ T08 thay đổi, không được thấy 20 workbook bị upload lại.

Sau run thành công kiểm tra SharePoint Data_Goc:

- workbook tháng thay đổi có Modified mới;
- workbook không đổi giữ Modified cũ;
- `_vikoda_incremental_state.json` được cập nhật;
- `_vikoda_pipeline_state.json` được cập nhật sau cùng.

## 11. Dashboard web

Dashboard luôn build từ **full Data_Goc set**, không chỉ delta. Vì vậy incremental Excel không làm mất lịch sử trên dashboard.

Runtime artifacts:

```text
web/data/dashboard_data.json
web/data/dashboard_data.js
```

Health/data-quality gate phải PASS trước khi web được coi là hợp lệ.

## 12. Web publishing security

Production customer/revenue data là internal. GitHub Pages là public static hosting; JavaScript password không phải access control.

Giữ production:

```text
ENABLE_PAGES_DEPLOY=false
WEB_DATA_CLASSIFICATION=internal
```

Chỉ bật public khi payload đã sanitize và được phê duyệt:

```text
ENABLE_PAGES_DEPLOY=true
WEB_DATA_CLASSIFICATION=public-or-sanitized
```

Manual publish còn yêu cầu:

```text
publish_dashboard=true
```

## 13. Troubleshooting

### `AADSTS700213`

Federated Credential không khớp GitHub OIDC subject. Đối chiếu subject/issuer/audience ở mục 5.

### Graph 403

Kiểm tra `Sites.Selected`, Admin consent và site role `write`.

### Graph 404 folder

Đối chiếu đúng:

```text
Vikoda_Sales_Data/Data ERP
Vikoda_Sales_Data/Target
Vikoda_Sales_Data/DanhMuc_KH
Vikoda_Sales_Data/DanhMuc_SP
Vikoda_Sales_Data/Data_Goc
```

### Baseline Data_Goc missing

Incremental cloud fail-closed. Cần có Data_Goc hợp lệ từ một lượt full/baseline trước đó.

### Planner rebuild nhiều tháng ngoài dự kiến

Xem:

```text
Data/Work/incremental_cloud_plan.json
```

Mỗi period có `action` và `reasons`. Các lý do thường gặp:

```text
force_period
output_missing
output_invalid
new_invoice_dates
invoice_date_counts_changed
source_files_added
source_files_removed
```

### SharePoint Office size khác local

Đã xử lý: `.xlsx/.xlsm` có thể thay package metadata sau upload. Incremental cloud không dùng package SHA remote để buộc rebuild tháng cũ; nó re-open workbook và đối soát cấu trúc/date-count, còn period thực sự thay đổi được force bằng source manifest.

## 14. Test trước khi release

```bash
python -m pip install -r requirements.txt
python code/run_all_tests.py --quiet
npm run verify:web
```

Push/PR chỉ chạy read-only CI và repository hygiene. Production cloud chỉ chạy schedule/manual.

## 15. Quy tắc thay đổi hệ thống

1. Không commit `Data/` hoặc `web/data/` production.
2. Không reintroduce `AZURE_CLIENT_SECRET`.
3. Không dùng Power Automate làm production dependency.
4. Giữ `Sites.Selected` nếu có thể.
5. Data_Goc là managed output.
6. Thay đổi folder contract phải cập nhật workflow + README + runbook.
7. Mọi thay đổi incremental phải có regression test.
8. Sau thay đổi cloud logic, chạy một manual production validation trên `main`.
9. Xác nhận chỉ workbook period thay đổi có Modified mới trên SharePoint.

Guardrails: [`AGENTS.md`](AGENTS.md). Security: [`SECURITY.md`](SECURITY.md).
