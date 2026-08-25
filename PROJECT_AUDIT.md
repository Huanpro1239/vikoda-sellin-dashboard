# BÁO CÁO AUDIT HỆ THỐNG VIKODA SELL-IN DASHBOARD

**Repository:** `Huanpro1239/vikoda-sellin-dashboard`  
**Ngày cập nhật:** 25/08/2026  
**Phạm vi:** Kiến trúc dữ liệu, CI/CD, SharePoint, OIDC, bảo mật và repo hygiene

## 1. Kiến trúc hiện hành

```text
SharePoint Online
    ↓
Microsoft Graph
    ↓
GitHub Actions OIDC
    ↓
Microsoft Entra
    ↓
Python ETL --strict
    ↓
Validation + Health Check
    ↓
Data/Data_Goc
    ↓
Microsoft Graph Upload
    ↓
SharePoint/Data_Goc
```

Không có Power Automate/Flow/webhook trung gian và không dùng Azure Client Secret dài hạn trong pipeline production.

## 2. Workflow

Workflow chính:

```text
.github/workflows/vikoda_pipeline.yml
```

| Event | Hành vi |
|---|---|
| Pull request | Repository hygiene + read-only CI |
| Push `main` | Repository hygiene + read-only CI |
| Schedule 18:00 VN | CI → OIDC login → SharePoint refresh → ETL → upload `Data_Goc` |
| Manual | Refresh ngay; publish dashboard chỉ khi được phê duyệt |

Cloud job có `id-token: write`; PR/push test không có quyền này.

## 3. Xác thực Microsoft

Mô hình cloud dùng:

```text
GitHub OIDC token
→ Microsoft Entra Federated Credential
→ azure/login
→ Azure CLI session
→ AzureCliCredential
→ Microsoft Graph token
```

GitHub chỉ cần Repository Variables:

```text
AZURE_TENANT_ID
AZURE_CLIENT_ID
```

Không cần `AZURE_CLIENT_SECRET`.

Federated credential chuẩn:

```text
Issuer: https://token.actions.githubusercontent.com
Subject: repo:Huanpro1239/vikoda-sellin-dashboard:ref:refs/heads/main
Audience: api://AzureADTokenExchange
```

## 4. SharePoint authorization

Khuyến nghị:

```text
Microsoft Graph Application permission: Sites.Selected
Planning site role: write
```

`code/common/sharepoint_bootstrap.py` tự resolve site ID và default drive ID khi không cấu hình sẵn.

## 5. Kiểm soát dữ liệu

- Không commit workbook production trong `Data/`.
- Không commit payload production trong `web/data/`.
- Không lưu `.env`, access token hoặc credential dài hạn trong repository.
- Cloud pipeline fail-closed nếu thiếu OIDC config, SharePoint ID không resolve được hoặc không có workbook hợp lệ.
- `run_cloud_pipeline.py --strict` yêu cầu artifact của chính lượt chạy hiện tại.
- `Data_Goc` chỉ được upload sau ETL và health check thành công.

## 6. Dashboard hosting

Static hosting không phải ranh giới bảo mật cho dữ liệu nội bộ. Job publish chỉ chạy khi đồng thời có:

```text
ENABLE_PAGES_DEPLOY=true
WEB_DATA_CLASSIFICATION=public-or-sanitized
```

và manual workflow chọn `publish_dashboard=true`.

## 7. Trạng thái test cần xác nhận sau thay đổi OIDC

CI push phải xác nhận:

```text
Repository hygiene: PASS
Python test suite: PASS
Web regression: PASS
Cloud refresh on push: SKIPPED
Dashboard deploy on push: SKIPPED
```

Sau đó cần manual end-to-end test để xác nhận:

```text
OIDC login: PASS
Graph site/drive resolve: PASS
SharePoint downloads: PASS
ETL: PASS
Data_Goc upload: PASS
```

## 8. Việc còn phải hoàn tất trước production cloud

1. Tạo Federated Credential cho repo/branch `main` trong Entra App.
2. Tạo Repository Variables `AZURE_TENANT_ID` và `AZURE_CLIENT_ID`.
3. Xác nhận `Sites.Selected` đã Admin consent.
4. Xác nhận app có `write` trên site `Planning`.
5. Chạy manual workflow với `run_cloud_refresh=true`, `publish_dashboard=false`.
6. Kiểm tra `Data_Goc` trên SharePoint có Modified time mới.

## 9. Kiểm tra local

```bash
python -m pip install -r requirements.txt
python code/run_all_tests.py --quiet
npm run verify:web
python code/health_check.py
```

Khi test Microsoft Graph local:

```bash
az login --tenant <AZURE_TENANT_ID> --allow-no-subscriptions
```

Chi tiết xem [`HUONG_DAN_SHAREPOINT_GITHUB_ACTIONS.md`](HUONG_DAN_SHAREPOINT_GITHUB_ACTIONS.md).
