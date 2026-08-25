# HƯỚNG DẪN SHAREPOINT + GITHUB ACTIONS OIDC

Tài liệu này mô tả quy trình chuẩn của hệ thống Sell-In Vikoda. GitHub Actions truy cập SharePoint trực tiếp bằng Microsoft Graph và xác thực Microsoft Entra bằng GitHub OIDC. Không dùng Power Automate và không dùng Azure Client Secret.

## 1. Sơ đồ chuẩn

```text
ERP / Target / Danh mục
          ↓
SharePoint Online - site Planning
          ↓
Microsoft Graph
          ↓
GitHub Actions OIDC
          ↓
Python ETL --strict
          ↓
Validation + Health Check
          ↓
Data/Data_Goc
          ↓
Microsoft Graph Upload
          ↓
SharePoint / Data_Goc
```

## 2. Entra App

Tên gợi ý:

```text
vikoda-sellin-github-actions
```

Supported account type:

```text
Accounts in this organizational directory only (Single tenant)
```

Microsoft Graph Application permission:

```text
Sites.Selected
```

Sau khi Admin consent, cấp app role `write` riêng trên site:

```text
https://vikodacomvn.sharepoint.com/sites/Planning
```

## 3. Tạo Federated Credential cho GitHub

Trong Microsoft Entra:

```text
App registrations
→ vikoda-sellin-github-actions
→ Certificates & secrets
→ Federated credentials
→ Add credential
→ GitHub Actions deploying Azure resources
```

Cấu hình repository/branch:

```text
Organization: Huanpro1239
Organization / Owner ID: 213777839
Repository: vikoda-sellin-dashboard
Repository ID: 1333996723
Entity type: Branch
GitHub branch name: main
Name: github-main-vikoda-sellin
```

GitHub Actions của repository này hiện phát OIDC token với subject ID-bound. Federated Credential trong Entra phải khớp chính xác:

```text
Issuer: https://token.actions.githubusercontent.com
Subject: repo:Huanpro1239@213777839/vikoda-sellin-dashboard@1333996723:ref:refs/heads/main
Audience: api://AzureADTokenExchange
```

Không dùng subject legacy thiếu Owner ID/Repository ID. Khi GitHub thay đổi identity claim hoặc repository được chuyển owner, hãy lấy `subject claim` trực tiếp từ log bước `azure/login` và đồng bộ lại Federated Credential.

Bước này thay thế hoàn toàn Client Secret.

## 4. GitHub Variables

Vào:

```text
Repository
→ Settings
→ Secrets and variables
→ Actions
→ Variables
```

Tạo:

```text
AZURE_TENANT_ID = <Directory tenant ID>
AZURE_CLIENT_ID = <Application client ID>

SHAREPOINT_HOSTNAME = vikodacomvn.sharepoint.com
SHAREPOINT_SITE_PATH = /sites/Planning
SHAREPOINT_ERP_FOLDER = Data ERP
SHAREPOINT_TARGET_FOLDER = Target
SHAREPOINT_CUSTOMER_FOLDER = Danh muc KH
SHAREPOINT_PRODUCT_FOLDER = Danh muc SP
SHAREPOINT_DATA_GOC_FOLDER = Data_Goc
```

Không cần tạo:

```text
AZURE_CLIENT_SECRET
```

`SHAREPOINT_SITE_ID` và `SHAREPOINT_DRIVE_ID` cũng không bắt buộc. Bootstrap sẽ tự resolve. Nếu muốn cache hai ID này, dùng Repository Variables chứ không cần Secrets.

## 5. Workflow cloud

File duy nhất:

```text
.github/workflows/vikoda_pipeline.yml
```

Cloud job yêu cầu:

```text
permissions:
  contents: read
  id-token: write
```

Trình tự:

```text
Validate Microsoft OIDC configuration
→ azure/login@v3
→ sharepoint_bootstrap.py
→ download SharePoint folders
→ run_cloud_pipeline.py --strict
→ finalize_data_dates.py
→ health_check.py
→ verify Data_Goc
→ upload Data_Goc to SharePoint
```

## 6. Chạy thử thủ công

Vào:

```text
GitHub → Actions → Vikoda Sell-In Pipeline → Run workflow
```

Chọn:

```text
run_cloud_refresh = true
publish_dashboard = false
```

Lần test đầu tiên không publish dashboard.

## 7. Kết quả đúng

Các job:

```text
Read-only CI                                   PASS
Refresh SharePoint and rebuild Sell-In outputs PASS
Deploy approved dashboard                     SKIPPED
```

Trong cloud job, các bước phải xanh:

```text
Validate Microsoft OIDC configuration
Azure login with GitHub OIDC
Resolve SharePoint site and drive IDs
Download ERP workbooks from SharePoint
Download Target workbooks from SharePoint
Download customer catalog from SharePoint
Download product catalog from SharePoint
Execute strict Sell-In cloud pipeline
Finalize dashboard date from latest invoice
Run system health check
Verify processed Data_Goc workbooks exist
Upload processed Data_Goc to SharePoint
```

Sau đó kiểm tra SharePoint `Data_Goc` có workbook mới hoặc Modified time mới.

## 8. Lịch tự động

```text
11:00 UTC mỗi ngày
= 18:00 giờ Việt Nam
```

Schedule chỉ refresh dữ liệu và upload `Data_Goc`; không tự publish dashboard.

## 9. Publish dashboard

Chỉ dùng khi dữ liệu đã sanitize/phê duyệt.

Repository Variables:

```text
ENABLE_PAGES_DEPLOY = true
WEB_DATA_CLASSIFICATION = public-or-sanitized
```

Sau đó chạy manual workflow:

```text
run_cloud_refresh = true
publish_dashboard = true
```

## 10. Lỗi thường gặp

### `AZURE_CLIENT_ID Repository Variable is missing`

Tạo biến `AZURE_CLIENT_ID` trong tab **Variables**. Dùng Application (client) ID của app `vikoda-sellin-github-actions`.

### `AZURE_TENANT_ID Repository Variable is missing`

Tạo biến `AZURE_TENANT_ID` bằng Directory (tenant) ID.

### `AADSTS700213: No matching federated identity record found`

Federated Credential không khớp OIDC subject mà GitHub thực sự phát. Với repository hiện tại, subject phải là:

```text
repo:Huanpro1239@213777839/vikoda-sellin-dashboard@1333996723:ref:refs/heads/main
```

Đối chiếu thêm:

```text
Issuer: https://token.actions.githubusercontent.com
Audience: api://AzureADTokenExchange
```

### `Unable to get ACTIONS_ID_TOKEN_REQUEST_URL`

Cloud job thiếu:

```text
id-token: write
```

Workflow chuẩn đã cấu hình quyền này.

### HTTP 403 từ Microsoft Graph

OIDC login đã thành công nhưng app chưa có quyền dữ liệu phù hợp. Kiểm tra:

```text
Microsoft Graph Application permission: Sites.Selected
Admin consent: Granted
Planning site permission: write
```

### Không tìm thấy SharePoint folder

Kiểm tra `SHAREPOINT_*_FOLDER` Variables và tên folder thật.

### Pipeline không có workbook

Pipeline cố tình fail-closed. Kiểm tra `Data ERP`, `Target`, `Danh muc KH`, `Danh muc SP` có workbook `.xlsx`/`.xlsm` hợp lệ.

## 11. Test local

Cài dependency:

```bash
python -m pip install -r requirements.txt
```

Đăng nhập Azure CLI:

```bash
az login --tenant <AZURE_TENANT_ID> --allow-no-subscriptions
```

Sau đó test:

```bash
python code/run_all_tests.py --quiet
npm run verify:web
```

Khi chạy Graph script local, `AzureCliCredential` sẽ dùng phiên đăng nhập Azure CLI hiện tại.

## 12. Quy tắc bảo mật

- Không tạo hoặc lưu `AZURE_CLIENT_SECRET` cho workflow này.
- Không commit token, `.env` hoặc workbook sản xuất.
- Federated Credential chỉ trust đúng repository và branch `main`.
- Không cấp `Sites.ReadWrite.All` nếu `Sites.Selected` đáp ứng được yêu cầu.
- Không publish static dashboard chứa dữ liệu nội bộ chưa được sanitize.
