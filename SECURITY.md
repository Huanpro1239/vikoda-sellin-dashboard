# Chính sách bảo mật

## Phạm vi

Nhánh `main` là phiên bản được duy trì. Pipeline xử lý dữ liệu Sell-In từ SharePoint và publish dashboard lên GitHub Pages.

Theo cấu hình hiện tại, **dashboard GitHub Pages là public và publish đầy đủ payload dashboard**. Không có lớp ẩn danh, mã hóa hay access-control phía server cho Pages.

## Những gì vẫn phải được bảo vệ

- Không commit `.env`, access token, refresh token, certificate hoặc secret vào repository.
- Không dùng `AZURE_CLIENT_SECRET` cho production workflow.
- GitHub Actions truy cập Microsoft Graph bằng GitHub OIDC + Microsoft Entra Federated Credential.
- `AZURE_TENANT_ID` và `AZURE_CLIENT_ID` chỉ là identifier và được lưu dưới Repository Variables.
- Federated Credential chỉ trust đúng repository/branch production.
- SharePoint Graph nên dùng `Sites.Selected` và chỉ cấp role `write` cho site cần thiết.

## Dữ liệu runtime

`Data/` và `web/data/` không được commit trực tiếp vào Git. Workflow tạo dữ liệu runtime trong runner, kiểm tra chất lượng rồi publish artifact lên GitHub Pages.

Điều này giúp repository không phình theo từng kỳ dữ liệu và tránh lưu nhiều bản lịch sử dashboard trong Git. Tuy nhiên dữ liệu đã deploy trên GitHub Pages vẫn là dữ liệu công khai.

## CI / workflow

- Pull request và push chỉ chạy test/hygiene read-only.
- Cloud job mới có `id-token: write` để lấy token OIDC cho Microsoft Graph.
- Khi SharePoint không thay đổi, watcher dừng trước các bước download/ETL/deploy.
- Khi có thay đổi, pipeline phải PASS health check và web regression trước khi tạo Pages artifact.
- Source manifest chỉ commit lên SharePoint sau khi các bước build/package thành công.

## Báo cáo lỗ hổng

Không đăng token, secret hoặc bằng chứng khai thác vào GitHub Issue công khai. Dùng Private vulnerability reporting hoặc liên hệ riêng với quản trị viên repository.
