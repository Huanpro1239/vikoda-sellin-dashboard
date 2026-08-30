# Chính sách bảo mật

## Phạm vi

Nhánh `main` là production source. Pipeline xử lý dữ liệu Sell-In từ SharePoint,
ghi output quản lý về `Data_Goc` và publish dashboard static lên GitHub Pages.

Theo cấu hình hiện tại, **GitHub Pages là public và publish đầy đủ dashboard payload**
được tạo cho web. Không có server-side access control, ẩn danh hoặc mã hóa payload
trước khi Pages phục vụ file tĩnh.

## Không coi client-side login là security boundary

`web/js/auth.js` cung cấp optional local UX gate. Password/hash kiểm tra trong browser
không thể biến GitHub Pages public thành ứng dụng private và không bảo vệ được static
payload khỏi người có thể truy cập asset URL.

Không mô tả lớp này như cơ chế bảo mật dữ liệu production.

## Production trigger

SharePoint thay đổi → Power Automate Standard → GitHub `repository_dispatch` event:

```text
sharepoint_changed
```

Power Automate chỉ phát event. Nó không giữ Microsoft Graph client secret và không chạy
ETL. Flow phải lọc chỉ 4 source folder và loại `Data_Goc` để tránh refresh loop.

Production GitHub workflow không dùng scheduled SharePoint polling.

## Microsoft Graph authentication

- Không commit `.env`, access token, refresh token, certificate hoặc secret.
- Không dùng `AZURE_CLIENT_SECRET` cho production workflow.
- GitHub Actions truy cập Microsoft Graph bằng GitHub OIDC + Microsoft Entra Federated Credential.
- `AZURE_TENANT_ID` và `AZURE_CLIENT_ID` là identifier, lưu dưới Repository Variables.
- Federated Credential chỉ trust đúng production repository/branch/audience.
- Graph nên dùng `Sites.Selected` và chỉ cấp role cần thiết cho site Planning.

## Data boundary

Không commit:

```text
Data/
web/data/
production workbooks
customer/revenue-level exports
access tokens
refresh tokens
client secrets
```

GitHub runner là ephemeral. Production `Data_Goc` được ghi về SharePoint; runtime web
được tạo trong runner và đóng gói thành Pages artifact.

Việc không commit runtime data giúp giảm rò rỉ qua Git history, nhưng **không làm dữ
liệu đã deploy trên public GitHub Pages trở thành private**.

## CI / workflow permissions

- Pull request và push chạy test/hygiene read-only.
- Data-change `repository_dispatch` dùng code đã được review trên `main` và bỏ qua full source test suite trước refresh.
- `cloud-refresh` có `contents: read` + `id-token: write` để đăng nhập Microsoft Entra bằng OIDC.
- `deploy-dashboard` có `contents: read`, `pages: write`, `id-token: write` chỉ cho Pages deployment.
- Pages job không được nhận `AZURE_TENANT_ID`, `AZURE_CLIENT_ID` hoặc `azure/login`.
- Job khác không được có `id-token: write`.
- Workflow contract được regression-test bởi `code/common/validate_workflow_policy.py`.

## Release safety

- Change detector chạy trước download/ETL.
- Fingerprint không đổi → STOP sớm.
- Source thay đổi → incremental rebuild period cần thiết.
- Validation + health check + web regression phải PASS trước Pages deploy.
- Source/incremental state chỉ được cập nhật sau pipeline thành công.
- Data_Goc không được kích hoạt lại Power Automate dispatch.

## Dependency hygiene

Dependencies production được pin trong `requirements.txt`. Dependabot theo dõi Python
và GitHub Actions định kỳ. Mọi dependency PR phải qua test hiện có trước merge.

## Báo cáo lỗ hổng

Không đăng token, secret, dữ liệu khách hàng hoặc bằng chứng khai thác vào GitHub Issue
công khai. Dùng Private vulnerability reporting nếu repository bật tính năng này hoặc
liên hệ riêng với quản trị viên repository.
