# RUNBOOK KỸ THUẬT — VIKODA SELL-IN DASHBOARD

> Production runbook cho SharePoint → Power Automate → GitHub Actions → Data_Goc → GitHub Pages.

## 1. Kiến trúc production

```text
SharePoint file created/modified
        ↓
Power Automate Standard
        ↓ repository_dispatch: sharepoint_changed
GitHub Actions
        ↓
GitHub OIDC + Microsoft Entra
        ↓
Microsoft Graph
        ↓
Fingerprint detector
   ├─ unchanged → STOP
   └─ changed
        ↓
Incremental planner
        ↓
Rebuild đúng period cần thiết
        ↓
Validation + Health Check
        ↓
Upload Data_Goc delta/checkpoint
        ↓
Web regression + Pages artifact
        ↓
GitHub Pages deploy
```

Production **không polling SharePoint theo cron**. Manual `workflow_dispatch` được giữ
làm fallback.

---

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
        ├── Sell in Txx_yyyy.xlsx
        ├── _vikoda_pipeline_state.json
        └── _vikoda_incremental_state.json
```

Không đổi path production nếu chưa cập nhật đồng bộ Power Automate, workflow và code.

---

## 3. Power Automate flow

Tên khuyến nghị:

```text
VIKODA - SharePoint Change to Dashboard
```

### Trigger

Connector: **SharePoint**

```text
When a file is created or modified (properties only)
```

Cấu hình:

```text
Site Address : Planning - https://vikodacomvn.sharepoint.com/sites/Planning
Library Name : Documents
Folder       : để trống
```

### Condition

Logic `OR`, dùng Dynamic content `Folder path`:

```text
Folder path contains Vikoda_Sales_Data/Data ERP
OR Folder path contains Vikoda_Sales_Data/Target
OR Folder path contains Vikoda_Sales_Data/DanhMuc_KH
OR Folder path contains Vikoda_Sales_Data/DanhMuc_SP
```

**Không thêm `Data_Goc`.** Pipeline tự upload output vào Data_Goc; nếu flow dispatch
thay đổi ở folder này sẽ tạo vòng lặp.

### Nhánh True

1. `Schedule → Delay`: 30 seconds.
2. `GitHub → Create a repository dispatch event`.

```text
Repository Owner : Huanpro1239
Repository Name  : vikoda-sellin-dashboard
Event Name       : sharepoint_changed
Event Payload    : {}
```

Nhánh False để trống.

### Trạng thái production

```text
Flow status = On
SharePoint connection = valid
GitHub connection = Huanpro1239 / valid
Environment = Vikoda (default)
```

---

## 4. GitHub workflow contract

Workflow:

```text
.github/workflows/vikoda_pipeline.yml
```

Trigger production:

```yaml
repository_dispatch:
  types: [sharepoint_changed]
```

Các trigger khác:

| Trigger | Hành vi |
|---|---|
| Pull request | hygiene + Python tests + web regression |
| Push `main` | read-only CI |
| `repository_dispatch/sharepoint_changed` | SharePoint incremental refresh |
| Manual `workflow_dispatch` | fallback/manual refresh |

Không thêm `schedule` để polling SharePoint.

---

## 5. Hai state file

### Source state

```text
Data_Goc/_vikoda_pipeline_state.json
```

Lưu fingerprint/manifest nguồn của run thành công gần nhất.

### Incremental state

```text
Data_Goc/_vikoda_incremental_state.json
```

Dùng để xác định period nào cần `REBUILD` hoặc `SKIP`.

**Quy tắc:** checkpoint chỉ được cập nhật sau pipeline thành công.

---

## 6. Microsoft Entra + GitHub OIDC

Repository Variables:

```text
AZURE_TENANT_ID
AZURE_CLIENT_ID
```

Không dùng:

```text
AZURE_CLIENT_SECRET
```

Graph authorization khuyến nghị:

```text
Application permission: Sites.Selected
Planning site role: write
```

Federated identity production phải trust đúng repository/branch và audience:

```text
Repository: Huanpro1239/vikoda-sellin-dashboard
Branch: main
Issuer: https://token.actions.githubusercontent.com
Audience: api://AzureADTokenExchange
```

Power Automate không giữ Graph token/client secret. GitHub runner lấy token OIDC tại
thời điểm run.

---

## 7. Incremental behavior

Ví dụ ERP tháng 08/2026 thay đổi:

```text
T01–T07 → SKIP
T08     → REBUILD
T09+    → SKIP
```

Nếu Power Automate phát event trùng nhưng fingerprint đã được xử lý:

```text
repository_dispatch
→ fingerprint unchanged
→ STOP trước download/ETL/deploy
```

Concurrency của workflow serialize các refresh run để giảm race trên checkpoint.

---

## 8. Checklist một event run thành công

Trong GitHub Actions, run phải có trigger:

```text
repository_dispatch
```

Các bước chính:

```text
Azure login with GitHub OIDC for Microsoft Graph
Resolve SharePoint site and drive IDs
Detect SharePoint source changes and affected ERP periods
Download existing Data_Goc baseline
Download changed-source inputs
Rebuild only changed Data_Goc periods and dashboard data
Finalize dashboard date from latest invoice
Run system health check
Upload only changed Data_Goc files and checkpoint
Validate generated dashboard
Upload full dashboard as GitHub Pages artifact
Commit successful SharePoint source manifest
Deploy full dashboard to GitHub Pages
```

Summary nên cho biết:

```text
Trigger: repository_dispatch
Dispatch action: sharepoint_changed
Source change: true/false
ERP periods changed
Data_Goc periods rebuilt
Data_Goc workbooks rebuilt
```

---

## 9. Test end-to-end

### Test A — ERP thay đổi

Sửa/save một workbook trong:

```text
Vikoda_Sales_Data/Data ERP/
```

Kỳ vọng:

```text
Power Automate run = Success
Condition = True
GitHub dispatch = Success
GitHub Actions trigger = repository_dispatch
Source change = true
rebuild đúng period
Pages deploy = success
```

### Test B — Data_Goc thay đổi

Pipeline upload file vào Data_Goc.

Kỳ vọng:

```text
Power Automate Condition = False
không dispatch GitHub
```

### Test C — save trùng

Save cùng file nhiều lần.

Kỳ vọng: có thể có nhiều event nhưng run sau checkpoint phải STOP khi fingerprint không
còn delta.

---

## 10. Manual fallback

Nếu Power Automate lỗi:

```text
Repository
→ Actions
→ Vikoda Sell-In Pipeline
→ Run workflow
→ Branch: main
→ run_cloud_refresh = true
```

Không cần bật lại cron.

---

# TROUBLESHOOTING

## 11. Power Automate không chạy

Kiểm tra:

```text
Environment = Vikoda (default)
Flow status = On
SharePoint connection valid
Trigger Library = Documents
Folder path Condition đúng 4 source folders
```

## 12. GitHub action trong Power Automate lỗi connection

Nếu gặp `broken connection` hoặc `cannot be used to activate this flow`:

1. tạo/reauthorize GitHub connection bằng chính account có quyền repo;
2. action phải hiển thị `Connected to Huanpro1239`;
3. kiểm tra repository owner/name và event name;
4. Save flow rồi xác nhận Status = On.

## 13. Power Automate success nhưng GitHub không có run

Kiểm tra action:

```text
Repository Owner = Huanpro1239
Repository Name = vikoda-sellin-dashboard
Event Name = sharepoint_changed
```

Sau đó kiểm tra workflow trên `main` có `repository_dispatch` contract.

## 14. GitHub run có nhưng Source change = false

Đây không nhất thiết là lỗi. Có thể event trùng hoặc file save không tạo delta metadata
mới so với checkpoint thành công gần nhất. Pipeline chủ động STOP để tránh ETL thừa.

## 15. AADSTS / OIDC lỗi

Kiểm tra:

```text
AZURE_TENANT_ID
AZURE_CLIENT_ID
Federated Credential repository/branch
issuer
audience
```

## 16. Graph 403

Kiểm tra:

```text
Sites.Selected
Admin consent
Planning site permission = write
```

## 17. Graph 404

Kiểm tra site/library/folder contract, đặc biệt:

```text
Vikoda_Sales_Data/Data ERP
Vikoda_Sales_Data/Target
Vikoda_Sales_Data/DanhMuc_KH
Vikoda_Sales_Data/DanhMuc_SP
Vikoda_Sales_Data/Data_Goc
```

## 18. Pages deploy fail

Kiểm tra:

```text
Settings → Pages → Source = GitHub Actions
```

và cloud refresh phải tạo Pages artifact thành công.

---

## 19. Local utilities

`Chay CT/` chỉ dành cho chạy thủ công/local trên Windows. Không dùng OneDrive
FileSystemWatcher/PowerShell watcher làm production trigger. Production source of truth
là event-driven flow ở mục 3.

---

## 20. Quy tắc bảo trì

1. Không commit token, secret, `.env`, Data hoặc generated `web/data`.
2. Không reintroduce `AZURE_CLIENT_SECRET`.
3. Không reintroduce scheduled SharePoint polling.
4. Không để `Data_Goc` kích hoạt Power Automate dispatch.
5. Giữ change detector trước ETL.
6. Giữ incremental planner và state commit-after-success.
7. Thay đổi cloud architecture phải cập nhật README + runbook + AGENTS + SECURITY + PROJECT_AUDIT.
8. Trước merge chạy `python code/run_all_tests.py --quiet` và `npm run verify:web`.

---

## Tài liệu liên quan

- [README](README.md)
- [Hướng dẫn nhân viên](HUONG_DAN_NHAN_VIEN_VIKODA.md)
- [Engineering guardrails](AGENTS.md)
- [Project audit](PROJECT_AUDIT.md)
- [Security policy](SECURITY.md)
