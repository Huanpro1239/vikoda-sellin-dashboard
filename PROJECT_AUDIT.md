# BÁO CÁO AUDIT HỆ THỐNG VIKODA SELL-IN DATA PLATFORM

**Repository:** `Huanpro1239/vikoda-sellin-dashboard`  
**Ngày audit:** 25/08/2026  
**Trạng thái:** **PRODUCTION CLOUD PIPELINE VALIDATED**  
**Phạm vi:** SharePoint, Microsoft Graph, GitHub OIDC, CI/CD, Python ETL, Data_Goc upload, bảo mật và repository hygiene.

## 1. Kết luận điều hành

Hệ thống production đã được xác nhận end-to-end với kiến trúc:

```text
SharePoint Online
    ↓
Microsoft Graph
    ↓
GitHub Actions OIDC
    ↓
Microsoft Entra ID
    ↓
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

Production path **không dùng Power Automate/Flow/webhook trung gian** và **không dùng Azure Client Secret dài hạn**.

## 2. Bằng chứng end-to-end

Manual production validation:

```text
Workflow: Vikoda Sell-In Pipeline
Run: #29
Run ID: 32869379937
Branch: main
Head SHA: 15385e92543fa409f1e96c126ee489f5356d5626
Conclusion: success
```

Cloud job đã xác nhận:

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

Run này xác nhận pipeline có thể đọc nguồn thật từ SharePoint, chạy ETL, validation/health check và ghi output trở lại SharePoint mà không cần máy cá nhân.

## 3. Xác thực Microsoft

Mô hình hiện hành:

```text
GitHub OIDC token
→ Microsoft Entra Federated Credential
→ azure/login
→ Azure CLI session
→ AzureCliCredential
→ Microsoft Graph token
```

Federated identity production:

```text
Issuer: https://token.actions.githubusercontent.com
Subject: repo:Huanpro1239@213777839/vikoda-sellin-dashboard@1333996723:ref:refs/heads/main
Audience: api://AzureADTokenExchange
```

GitHub chỉ cần hai Repository Variables bắt buộc:

```text
AZURE_TENANT_ID
AZURE_CLIENT_ID
```

Không cần `AZURE_CLIENT_SECRET`.

## 4. SharePoint contract

Production base folder:

```text
Vikoda_Sales_Data
```

Folder mapping đã được xác nhận:

```text
Vikoda_Sales_Data/Data ERP
Vikoda_Sales_Data/Target
Vikoda_Sales_Data/DanhMuc_KH
Vikoda_Sales_Data/DanhMuc_SP
Vikoda_Sales_Data/Data_Goc
```

`sharepoint_bootstrap.py` tự resolve site ID và default drive ID ở cloud run; không cần pin hai ID này trong GitHub Settings.

## 5. Authorization

Mô hình least-privilege:

```text
Microsoft Graph Application permission: Sites.Selected
Planning site role: write
```

Không có yêu cầu production hiện tại để mở rộng sang quyền tenant-wide.

## 6. CI/CD và separation of duties

Workflow duy nhất:

```text
.github/workflows/vikoda_pipeline.yml
```

| Event | Hành vi |
|---|---|
| Pull request | Repository hygiene + read-only CI |
| Push `main` | Repository hygiene + read-only CI |
| Schedule 18:00 VN | CI → OIDC → SharePoint → ETL → Data_Goc upload |
| Manual | Refresh ngay; dashboard publish là opt-in |

Quyền mặc định là `contents: read`. Chỉ cloud job có `id-token: write`; chỉ deploy job có Pages permissions.

## 7. Data controls

Các kiểm soát đang có:

- `Data/` và `web/data/` production không được commit.
- `.env`, token và credential dài hạn không được commit.
- `run_cloud_pipeline.py --strict` yêu cầu artifact hợp lệ của lượt chạy hiện tại.
- Thiếu workbook nguồn hoặc Graph configuration hợp lệ thì pipeline fail-closed.
- `Data_Goc` chỉ upload sau ETL, finalization và health check thành công.
- Upload Graph kiểm tra HTTP success, tên file và remote size hợp lệ; workbook Office cho phép server-side metadata làm size thay đổi.
- Dashboard không tự publish trong scheduled refresh.

## 8. Dashboard security gate

Pages deploy chỉ được phép khi đồng thời:

```text
manual input: publish_dashboard = true
ENABLE_PAGES_DEPLOY = true
WEB_DATA_CLASSIFICATION = public-or-sanitized
```

Static hosting không được xem là access control cho dữ liệu nội bộ.

## 9. Repository hygiene

Trạng thái current tree:

- Production workbooks không thuộc current source tree.
- `.gitignore` và workflow hygiene chặn thay đổi dưới `Data/` và `web/data/`.
- `SECURITY.md` cảnh báo rõ về dữ liệu lịch sử trong public Git.
- Dependabot đang theo dõi `pip` và `github-actions` hàng tuần.
- `CODEOWNERS` đã tồn tại.
- `AGENTS.md` được dùng làm guardrail để automation/AI không reintroduce kiến trúc legacy.

## 10. Rủi ro còn lại / non-blocking follow-up

### A. `main` hiện chưa bật branch protection

Tại thời điểm audit, GitHub báo `main` chưa được protected. Đây không chặn production pipeline nhưng là hardening nên cân nhắc:

```text
Require pull request before merge
Require status checks
Block force pushes
```

Không bật tự động trong đợt audit này để tránh thay đổi workflow phát triển hiện tại khi chưa có phê duyệt riêng.

### B. Repository là public nhưng mã nguồn có proprietary notice

Public visibility không đồng nghĩa cấp license. Tuy nhiên nếu production data từng tồn tại trong Git history, cần xử lý như security incident riêng; `.gitignore` không xóa dữ liệu lịch sử, fork hoặc cache.

### C. Dashboard Pages đang cố ý gated

Đây là control, không phải lỗi. Chỉ bật khi dữ liệu đã sanitize và có phê duyệt.

### D. Folder contract cần được quản lý như interface

Rename `Data ERP`, `Target`, `DanhMuc_KH`, `DanhMuc_SP` hoặc `Data_Goc` phải đi kèm code/doc update và manual end-to-end validation.

## 11. Definition of Done cho thay đổi production

Một thay đổi chỉ được xem là hoàn tất khi:

```text
Repository hygiene       PASS
Python test suite        PASS
Web regression           PASS
Cloud refresh manual     PASS
OIDC login               PASS
All SharePoint downloads PASS
Strict ETL               PASS
Health check             PASS
Data_Goc upload          PASS
```

Chi tiết vận hành: [`HUONG_DAN_SHAREPOINT_GITHUB_ACTIONS.md`](HUONG_DAN_SHAREPOINT_GITHUB_ACTIONS.md).  
Security policy: [`SECURITY.md`](SECURITY.md).
