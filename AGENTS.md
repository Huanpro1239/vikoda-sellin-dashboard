# AGENTS.md — VIKODA SELL-IN ENGINEERING GUARDRAILS

Áp dụng cho AI agents, automation và contributors làm việc trong repository này.

## Production source of truth

Kiến trúc production duy nhất:

```text
SharePoint Online
→ Power Automate Standard (event signal only)
→ GitHub repository_dispatch: sharepoint_changed
→ GitHub Actions
→ GitHub OIDC + Microsoft Entra ID
→ Microsoft Graph
→ fingerprint/change detection
→ incremental Python ETL
→ validation + health check
→ Microsoft Graph upload Data_Goc
→ GitHub Pages deploy
```

Power Automate chỉ phát tín hiệu khi file nguồn được tạo/sửa. Nó không xử lý ETL,
không giữ credential Graph và không quyết định dữ liệu nào cần rebuild. GitHub
workflow luôn xác minh fingerprint SharePoint trước khi download/ETL/deploy.

Không reintroduce scheduled SharePoint polling cho production refresh. Manual
`workflow_dispatch` phải được giữ làm phương án fallback vận hành.

## Event contract

Power Automate chỉ được dispatch event:

```text
sharepoint_changed
```

Chỉ 4 folder nguồn được phép kích hoạt event:

```text
Vikoda_Sales_Data/Data ERP
Vikoda_Sales_Data/Target
Vikoda_Sales_Data/DanhMuc_KH
Vikoda_Sales_Data/DanhMuc_SP
```

Không dispatch thay đổi trong `Vikoda_Sales_Data/Data_Goc` vì pipeline tự ghi output
vào đó; cho phép folder này kích hoạt lại workflow sẽ tạo refresh loop.

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

Nếu đổi folder contract, phải cập nhật workflow + README + runbook + Power Automate
condition và chạy end-to-end validation.

## Authentication guardrails

- GitHub connector trong Power Automate chỉ cần quyền dispatch repository event.
- Production cloud auth tới Microsoft Graph: GitHub OIDC + Microsoft Entra Federated Credential.
- Required GitHub Variables: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`.
- Không thêm `AZURE_CLIENT_SECRET` vào workflow production.
- Giữ Microsoft Graph `Sites.Selected` nếu không có lý do bắt buộc mở rộng quyền.
- PR/push CI không được có `id-token: write`.
- `cloud-refresh` được cấp `id-token: write` chỉ để đăng nhập Microsoft Entra bằng OIDC.
- `deploy-dashboard` được cấp `id-token: write` chỉ cho GitHub Pages deployment.
- Job deploy Pages không được nhận cấu hình Microsoft Entra/Graph.
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

GitHub runner là ephemeral workspace, không phải persistent data store. Production
output phải được ghi về SharePoint; dashboard runtime được publish qua Pages artifact.

## Pipeline invariants

- `repository_dispatch: sharepoint_changed` là trigger production chính.
- Không có `schedule` polling trong production workflow.
- `workflow_dispatch` được giữ để chạy thủ công khi Power Automate gặp sự cố.
- Change detector phải chạy trước download/ETL và STOP sớm khi fingerprint không đổi.
- Chỉ rebuild ERP period bị ảnh hưởng khi có thể xác định delta.
- Thiếu workbook nguồn bắt buộc phải fail; không im lặng fallback sang dữ liệu cũ.
- Health check + web regression phải PASS trước Pages deploy.
- State/fingerprint chỉ được commit sau pipeline thành công.
- Upload chỉ nhận workbook/checkpoint hợp lệ theo contract.
- Không dùng exact byte-size làm điều kiện duy nhất để xác nhận Office upload vì SharePoint có thể thay đổi server-side metadata.

## Local utilities

`Chay CT/` và các script hỗ trợ máy Windows chỉ là tooling local/manual. Không dùng
FileSystemWatcher, `.cmd`, PowerShell watcher hoặc OneDrive sync làm production trigger.
Nếu local utility không còn được dùng hoặc trùng production capability, ưu tiên xóa
thay vì duy trì hai kiến trúc song song.

## Required verification before completion

```bash
python code/run_all_tests.py --quiet
npm run verify:web
```

Nếu thay đổi Graph/OIDC/SharePoint/workflow production, ngoài CI phải chạy một
end-to-end event thật hoặc manual workflow trên `main` và xác minh:

```text
OIDC login PASS
SharePoint metadata/download PASS
incremental ETL PASS
health check PASS
Data_Goc upload PASS
GitHub Pages deploy PASS khi source_changed=true
```

## Documentation rule

Thay đổi production architecture phải giữ đồng bộ tối thiểu:

```text
README.md
HUONG_DAN_SHAREPOINT_GITHUB_ACTIONS.md
PROJECT_AUDIT.md
SECURITY.md
AGENTS.md
```

Không tạo thêm tài liệu mô tả một architecture khác với workflow thực tế. Nếu một
runbook chuyên biệt đã được hợp nhất vào runbook chính, xóa bản trùng để tránh drift.
