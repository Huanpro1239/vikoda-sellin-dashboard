# RUNBOOK PRODUCTION — SHAREPOINT + GITHUB ACTIONS OIDC

Tài liệu này là **quy trình vận hành chuẩn** của hệ thống Vikoda Sell-In. Mục tiêu là để một quản trị viên mới có thể đọc từ đầu đến cuối và hiểu rõ: dữ liệu nằm ở đâu, GitHub xác thực thế nào, pipeline chạy theo thứ tự nào, khi nào được publish dashboard và xử lý lỗi ra sao.

Production path không dùng Power Automate/Flow/webhook trung gian và không dùng Azure Client Secret dài hạn.

## 1. Luồng chuẩn

```text
ERP / Target / Danh mục
          ↓
SharePoint Online · site Planning
          ↓
Microsoft Graph
          ↓
GitHub Actions
          ↓ OIDC
Microsoft Entra ID
          ↓ short-lived token
Python ETL --strict
          ↓
Validation + Health Check
          ↓
Data/Data_Goc
          ↓
Microsoft Graph Upload
          ↓
SharePoint/Vikoda_Sales_Data/Data_Goc
```

## 2. Cấu trúc SharePoint production

Đây là cấu trúc đã được xác nhận bằng end-to-end run. Không đổi tên các folder con nếu chưa sửa workflow tương ứng.

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
```

Mapping trong cloud pipeline:

| Nguồn/đích | SharePoint path |
|---|---|
| ERP | `Vikoda_Sales_Data/Data ERP` |
| Target | `Vikoda_Sales_Data/Target` |
| Danh mục khách hàng | `Vikoda_Sales_Data/DanhMuc_KH` |
| Danh mục sản phẩm | `Vikoda_Sales_Data/DanhMuc_SP` |
| Output | `Vikoda_Sales_Data/Data_Goc` |

## 3. Thiết lập Microsoft Entra một lần

### 3.1 App Registration

App production:

```text
vikoda-sellin-github-actions
```

Supported account type:

```text
Accounts in this organizational directory only (Single tenant)
```

### 3.2 Microsoft Graph permission

Dùng Application permission:

```text
Sites.Selected
```

Sau khi **Admin consent**, cấp riêng app role:

```text
Site: https://vikodacomvn.sharepoint.com/sites/Planning
Role: write
```

Không cấp quyền tenant-wide như `Sites.ReadWrite.All` nếu không có yêu cầu nghiệp vụ bắt buộc.

### 3.3 Federated Credential

Trong Entra:

```text
App registrations
→ vikoda-sellin-github-actions
→ Certificates & secrets
→ Federated credentials
→ Add credential
→ GitHub Actions deploying Azure resources
```

Cấu hình hiện tại:

```text
Organization: Huanpro1239
Organization / Owner ID: 213777839
Repository: vikoda-sellin-dashboard
Repository ID: 1333996723
Entity type: Branch
GitHub branch name: main
Name: github-main-vikoda-sellin-v2
```

OIDC identity phải khớp chính xác:

```text
Issuer: https://token.actions.githubusercontent.com
Subject: repo:Huanpro1239@213777839/vikoda-sellin-dashboard@1333996723:ref:refs/heads/main
Audience: api://AzureADTokenExchange
```

Nếu repository được rename, transfer owner hoặc GitHub thay đổi identity claim, lấy `subject claim` trực tiếp từ log bước `Azure login with GitHub OIDC` rồi cập nhật Federated Credential.

**Không tạo `AZURE_CLIENT_SECRET` cho production workflow.**

## 4. GitHub Repository Variables

Vào:

```text
Repository
→ Settings
→ Secrets and variables
→ Actions
→ Variables
```

### Bắt buộc

```text
AZURE_TENANT_ID = <Directory tenant ID>
AZURE_CLIENT_ID = <Application client ID>
```

### Tùy chọn

Workflow đã có default; chỉ tạo khi cần override:

```text
SHAREPOINT_HOSTNAME = vikodacomvn.sharepoint.com
SHAREPOINT_SITE_PATH = /sites/Planning
SHAREPOINT_BASE_FOLDER = Vikoda_Sales_Data
```

Không cần Repository Variables cho `SHAREPOINT_SITE_ID` hoặc `SHAREPOINT_DRIVE_ID`; bootstrap tự resolve mỗi cloud run.

Các biến legacy sau không còn được production workflow đọc và có thể xóa khỏi GitHub Settings nếu còn tồn tại:

```text
SHAREPOINT_ERP_FOLDER
SHAREPOINT_TARGET_FOLDER
SHAREPOINT_CUSTOMER_FOLDER
SHAREPOINT_PRODUCT_FOLDER
SHAREPOINT_DATA_GOC_FOLDER
AZURE_CLIENT_SECRET
```

## 5. Workflow production

File duy nhất:

```text
.github/workflows/vikoda_pipeline.yml
```

### Quyền

Toàn workflow mặc định:

```yaml
permissions:
  contents: read
```

Cloud refresh được cấp thêm:

```yaml
id-token: write
```

Dashboard deploy chỉ được cấp quyền Pages ở job riêng.

### Trình tự cloud refresh

```text
Validate Microsoft OIDC configuration
→ Azure login with GitHub OIDC
→ Resolve SharePoint site and drive IDs
→ Download ERP workbooks
→ Download Target workbooks
→ Download customer catalog
→ Download product catalog
→ Execute strict Sell-In cloud pipeline
→ Finalize dashboard date
→ Run system health check
→ Verify processed Data_Goc workbooks
→ Upload processed Data_Goc to SharePoint
```

Pipeline cố tình **fail-closed**. Không có cơ chế tự lấy dữ liệu cũ để “cứ chạy tiếp”.

## 6. Vận hành hằng ngày

### Người phụ trách dữ liệu

1. Cập nhật file ERP vào `Vikoda_Sales_Data/Data ERP`.
2. Cập nhật Target khi có thay đổi.
3. Cập nhật `Thong tin khach hang.xlsx` trong `DanhMuc_KH` khi danh mục thay đổi.
4. Cập nhật `Danh Muc San Pham.xlsx` trong `DanhMuc_SP` khi danh mục thay đổi.
5. Không đổi tên folder/file contract nếu chưa phối hợp sửa pipeline.
6. Chờ lịch tự động 18:00 Việt Nam hoặc yêu cầu chạy manual.
7. Kiểm tra `Data_Goc` sau khi Actions hoàn tất.

### Lịch tự động

```text
11:00 UTC mỗi ngày
= 18:00 giờ Việt Nam
```

Schedule chỉ refresh và upload output; không tự publish dashboard.

## 7. Chạy manual

Vào:

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
publish_dashboard = false
```

Không dùng `Re-run failed jobs` sau khi đã có commit/config mới; rerun có thể giữ context của run cũ. Khi cấu hình hoặc code vừa thay đổi, luôn tạo **workflow run mới** trên `main`.

## 8. Kết quả thành công

Ở cấp workflow:

```text
Read-only CI                                   PASS
Refresh SharePoint and rebuild Sell-In outputs PASS
Deploy approved dashboard                     SKIPPED
```

Ở cloud job:

```text
Validate Microsoft OIDC configuration          PASS
Azure login with GitHub OIDC                   PASS
Resolve SharePoint site and drive IDs           PASS
Download ERP workbooks from SharePoint          PASS
Download Target workbooks from SharePoint       PASS
Download customer catalog from SharePoint       PASS
Download product catalog from SharePoint        PASS
Execute strict Sell-In cloud pipeline            PASS
Finalize dashboard date from latest invoice     PASS
Run system health check                          PASS
Verify processed Data_Goc workbooks exist       PASS
Upload processed Data_Goc to SharePoint          PASS
```

Sau đó kiểm tra SharePoint `Data_Goc`: file phải tồn tại và `Modified` phải tương ứng lượt chạy mới.

## 9. Publish dashboard

Static hosting không phải ranh giới bảo mật cho dữ liệu nội bộ. Chỉ publish khi dữ liệu đã được sanitize và phê duyệt.

Repository Variables gate:

```text
ENABLE_PAGES_DEPLOY = true
WEB_DATA_CLASSIFICATION = public-or-sanitized
```

Manual input:

```text
run_cloud_refresh = true
publish_dashboard = true
```

Cả ba điều kiện phải đúng thì job deploy mới chạy.

## 10. Troubleshooting

### `AZURE_CLIENT_ID Repository Variable is missing`

Tạo `AZURE_CLIENT_ID` trong tab **Variables**, không phải Secrets.

### `AZURE_TENANT_ID Repository Variable is missing`

Tạo `AZURE_TENANT_ID` bằng Directory (tenant) ID.

### `AADSTS700213: No matching federated identity record found`

Federated Credential không khớp OIDC token. Production subject hiện tại:

```text
repo:Huanpro1239@213777839/vikoda-sellin-dashboard@1333996723:ref:refs/heads/main
```

Đối chiếu thêm:

```text
Issuer: https://token.actions.githubusercontent.com
Audience: api://AzureADTokenExchange
```

### `Unable to get ACTIONS_ID_TOKEN_REQUEST_URL`

Cloud job thiếu `id-token: write`. Workflow production đã có quyền này; lỗi thường xuất hiện nếu chạy script ở job khác hoặc workflow fork/copy chưa đồng bộ.

### HTTP 403 từ Microsoft Graph

OIDC đã đăng nhập nhưng app thiếu authorization SharePoint. Kiểm tra:

```text
Sites.Selected
Admin consent = Granted
Planning site role = write
```

### HTTP 404 khi download folder

Tên/path SharePoint không khớp. Đối chiếu đúng các path ở mục 2. Đặc biệt:

```text
DanhMuc_KH
DanhMuc_SP
Data_Goc
```

không phải các tên có dấu cách cũ.

### Không có workbook nguồn

Pipeline dừng có chủ đích. Kiểm tra folder nguồn có `.xlsx`/`.xlsm` hợp lệ và file không rỗng.

### `remote size` khác `local size` khi upload workbook

SharePoint có thể xử lý metadata Office làm size remote thay đổi. Sync code hiện chấp nhận chênh lệch này cho `.xlsx/.xlsm` nếu upload HTTP thành công, tên file đúng và remote size > 0. File không phải Office vẫn kiểm tra byte-size nghiêm.

### Dashboard deploy bị `SKIPPED`

Đây là đúng khi `publish_dashboard=false` hoặc thiếu một trong hai gate `ENABLE_PAGES_DEPLOY` / `WEB_DATA_CLASSIFICATION`.

## 11. Chạy local

Cài dependency:

```bash
python -m pip install -r requirements.txt
```

Regression tests:

```bash
python code/run_all_tests.py --quiet
npm run verify:web
```

Test Microsoft Graph local:

```bash
az login --tenant <AZURE_TENANT_ID> --allow-no-subscriptions
python code/common/sharepoint_bootstrap.py
```

Sau bootstrap, các Graph script dùng `AzureCliCredential` từ phiên Azure CLI hiện tại.

## 12. Khi thay đổi hệ thống

Trước khi merge/push thay đổi production path:

```text
1. Không đưa production data vào Git.
2. Không reintroduce AZURE_CLIENT_SECRET.
3. Không reintroduce Power Automate làm production trigger.
4. Giữ Sites.Selected nếu không có lý do bắt buộc mở rộng quyền.
5. Cập nhật README + runbook nếu folder contract thay đổi.
6. Chạy Python test suite + web regression.
7. Chạy manual end-to-end trên main.
8. Xác nhận Data_Goc upload PASS.
```

Guardrails dành cho automation/AI được ghi tại [`AGENTS.md`](AGENTS.md). Security policy tại [`SECURITY.md`](SECURITY.md).
