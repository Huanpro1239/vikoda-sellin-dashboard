# HƯỚNG DẪN VẬN HÀNH SHAREPOINT + GITHUB ACTIONS

Tài liệu này mô tả quy trình chuẩn của hệ thống Sell-In Vikoda sau khi loại bỏ lớp kích hoạt trung gian. GitHub Actions truy cập SharePoint trực tiếp bằng Microsoft Graph.

## 1. Sơ đồ chuẩn

```text
ERP / Target / Danh mục
          ↓
SharePoint Online - site Planning
          ↓
Microsoft Graph
          ↓
GitHub Actions
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

Dashboard là đầu ra riêng. Chỉ publish khi dữ liệu đã được duyệt public/sanitized.

## 2. Entra App

Tên gợi ý:

```text
vikoda-sellin-github-actions
```

Supported account type:

```text
Accounts in this organizational directory only (Single tenant)
```

Microsoft Graph Application permission khuyến nghị:

```text
Sites.Selected
```

Sau khi Admin consent, cấp app role `write` riêng trên site:

```text
https://vikodacomvn.sharepoint.com/sites/Planning
```

## 3. Client Secret

Trong Entra App:

```text
Certificates & secrets
→ Client secrets
→ New client secret
```

Lưu **Value** ngay sau khi tạo. Không dùng `Secret ID` làm credential.

## 4. GitHub Secrets

Vào:

```text
Repository
→ Settings
→ Secrets and variables
→ Actions
→ Repository secrets
```

Tạo đúng ba tên:

```text
AZURE_TENANT_ID
AZURE_CLIENT_ID
AZURE_CLIENT_SECRET
```

Quy tắc tên Secret:

- Chỉ chữ, số và `_`.
- Không có khoảng trắng.
- Không có dấu `-`, `:`, `=` hoặc dấu ngoặc.
- Không thêm khoảng trắng ở đầu/cuối.

## 5. GitHub Variables

Tạo các Repository Variables:

```text
SHAREPOINT_HOSTNAME = vikodacomvn.sharepoint.com
SHAREPOINT_SITE_PATH = /sites/Planning
SHAREPOINT_ERP_FOLDER = Data ERP
SHAREPOINT_TARGET_FOLDER = Target
SHAREPOINT_CUSTOMER_FOLDER = Danh muc KH
SHAREPOINT_PRODUCT_FOLDER = Danh muc SP
SHAREPOINT_DATA_GOC_FOLDER = Data_Goc
```

`SHAREPOINT_SITE_ID` và `SHAREPOINT_DRIVE_ID` là tùy chọn. Nếu không có, `sharepoint_bootstrap.py` sẽ tự resolve.

## 6. Kiểm tra folder SharePoint

Site `Planning` phải có tối thiểu:

```text
Data ERP
Target
Danh muc KH
Danh muc SP
Data_Goc
```

Tên folder phải khớp với Repository Variables.

## 7. Chạy thử thủ công

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

## 8. Kết quả đúng

Các job phải có trạng thái:

```text
Read-only CI                                   PASS
Refresh SharePoint and rebuild Sell-In outputs PASS
Deploy approved dashboard                     SKIPPED
```

Trong job refresh, các bước chính phải xanh:

```text
Preflight Entra credentials and resolve SharePoint IDs
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

Sau đó kiểm tra SharePoint `Data_Goc` có file `Sell in TMM_YYYY.xlsx` với thời gian Modified mới.

## 9. Lịch tự động

Workflow chạy:

```text
11:00 UTC mỗi ngày
= 18:00 giờ Việt Nam
```

Schedule chỉ refresh dữ liệu và upload `Data_Goc`; không tự publish dashboard.

## 10. Publish dashboard

Chỉ cấu hình khi dữ liệu đã được sanitize/phê duyệt.

Repository Variables bắt buộc:

```text
ENABLE_PAGES_DEPLOY = true
WEB_DATA_CLASSIFICATION = public-or-sanitized
```

Sau đó chạy manual workflow với:

```text
run_cloud_refresh = true
publish_dashboard = true
```

Nếu một trong hai biến phê duyệt không đúng, job deploy phải bị skip.

## 11. Lỗi thường gặp

### Thiếu Azure Secret

Log:

```text
Missing GitHub Actions secrets: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET
```

Xử lý: kiểm tra đúng tên Repository Secrets và nhập Client Secret **Value**.

### HTTP 401

Nguyên nhân thường gặp:

- Tenant ID sai.
- Client ID sai.
- Client Secret Value sai hoặc hết hạn.

### HTTP 403

Nguyên nhân thường gặp:

- App chưa Admin consent.
- Chưa cấp `write` cho site `Planning`.
- Cấp permission cho sai Application Client ID.

### Không tìm thấy folder

Kiểm tra các Repository Variables và tên folder SharePoint.

### Pipeline báo không có workbook

Cloud pipeline cố tình fail-closed. Kiểm tra `Data ERP`, `Target`, `Danh muc KH`, `Danh muc SP` có workbook `.xlsx`/`.xlsm` hợp lệ.

### Không có file trong Data_Goc

Kiểm tra log `run_cloud_pipeline.py --strict`. Workflow không upload nếu ETL không tạo workbook mới.

## 12. Quy tắc vận hành

- Không commit dữ liệu ERP thật lên GitHub.
- Không đưa Client Secret vào source code, README hoặc log.
- Không sửa workbook nguồn trong quá trình ETL.
- Không publish dashboard chứa dữ liệu nội bộ lên static hosting.
- Khi thay Client Secret, cập nhật GitHub Secret trước khi secret cũ hết hạn.
- Sau thay đổi code, luôn để CI chạy xanh trước khi manual refresh production.

## 13. Lệnh kiểm tra local

```bash
python code/run_all_tests.py --quiet
npm run verify:web
```

Khi cần test Graph từ local, cấu hình biến môi trường theo `.env.example`; tuyệt đối không commit `.env`.
