# AGENTS.md — VIKODA SELL-IN ENGINEERING GUARDRAILS

Áp dụng cho AI agents, automation và contributors làm việc trong repository này.

## Production source of truth

Kiến trúc production duy nhất:

```text
SharePoint Online
→ Microsoft Graph
→ GitHub Actions OIDC
→ Microsoft Entra ID
→ Python ETL --strict
→ Validation + Health Check
→ Microsoft Graph upload
→ SharePoint Data_Goc
```

Không reintroduce Power Automate/Flow/webhook làm production trigger và không reintroduce Azure Client Secret dài hạn.

## SharePoint folder contract

```text
Base: Vikoda_Sales_Data
ERP: Data ERP
Target: Target
Customer catalog: DanhMuc_KH
Product catalog: DanhMuc_SP
Output: Data_Goc
```

Expected catalog files:

```text
DanhMuc_KH/Thong tin khach hang.xlsx
DanhMuc_SP/Danh Muc San Pham.xlsx
```

Nếu đổi folder contract, phải cập nhật workflow + README + runbook và chạy manual end-to-end validation.

## Authentication guardrails

- Production cloud auth: GitHub OIDC + Microsoft Entra Federated Credential.
- Required GitHub Variables: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`.
- Không thêm `AZURE_CLIENT_SECRET` vào workflow production.
- Giữ Microsoft Graph `Sites.Selected` nếu không có lý do bắt buộc mở rộng quyền.
- PR/push CI không được có `id-token: write`.
- `cloud-refresh` được cấp `id-token: write` chỉ để đăng nhập Microsoft Entra
  bằng OIDC và gọi Microsoft Graph.
- `deploy-dashboard` được cấp `id-token: write` chỉ cho cơ chế xác thực của
  GitHub Pages deployment; job này không được nhận cấu hình Microsoft Entra/Graph.
- Không job nào khác được cấp `id-token: write`.

## Data guardrails

Không commit:

```text
Data/
web/data/
.env
access tokens
refresh tokens
client secrets
production workbooks
customer/revenue-level exports
```

GitHub runner là ephemeral workspace, không phải persistent data store. Production output phải được ghi về SharePoint.

## Pipeline invariants

- `run_cloud_pipeline.py` phải chạy `--strict` trong production.
- Thiếu workbook nguồn phải fail; không fallback sang dữ liệu cũ.
- Health check phải PASS trước upload `Data_Goc`.
- Upload chỉ nhận `.xlsx` hợp lệ, non-empty.
- SharePoint có thể thay đổi byte-size của Office workbook do server-side metadata; không dùng exact byte-size làm điều kiện duy nhất để xác nhận upload Office.
- Dashboard publish mặc định OFF và phải giữ các security gates hiện tại.

## Required verification before completion

```bash
python code/run_all_tests.py --quiet
npm run verify:web
```

Nếu thay đổi Graph/OIDC/SharePoint/workflow production, ngoài CI còn phải chạy manual workflow trên `main` với:

```text
run_cloud_refresh = true
publish_dashboard = false
```

Definition of Done: OIDC + tất cả download + strict ETL + health check + `Data_Goc` upload đều PASS.

## Documentation rule

Các thay đổi production architecture phải giữ đồng bộ tối thiểu:

```text
README.md
HUONG_DAN_SHAREPOINT_GITHUB_ACTIONS.md
PROJECT_AUDIT.md (khi thay đổi trạng thái/audit)
SECURITY.md (khi thay đổi security model)
```

Không tạo tài liệu mới mô tả một architecture khác với workflow thực tế.
