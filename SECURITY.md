# Chính sách bảo mật

## Phạm vi hỗ trợ

Nhánh `main` là phiên bản duy nhất được duy trì. Dự án xử lý dữ liệu bán hàng,
khách hàng và chỉ tiêu kinh doanh; toàn bộ dữ liệu nguồn, dữ liệu staging, báo
cáo Excel và payload chi tiết phải được xem là **dữ liệu nội bộ**.

## Báo cáo lỗ hổng

Không đăng token, dữ liệu khách hàng hoặc bằng chứng khai thác vào GitHub Issue
công khai. Hãy dùng **Private vulnerability reporting** trong tab Security của
repository, hoặc liên hệ riêng với chủ repository/quản trị viên Vikoda. Không
đính kèm dữ liệu sản xuất nếu chưa được yêu cầu qua kênh an toàn.

## Quy tắc bắt buộc

- Không commit dữ liệu trong `Data/`, payload giao dịch trong `web/data/`, file
  `.env`, token, webhook, certificate hoặc cấu hình rclone thật.
- Cloud authentication dùng **GitHub OIDC + Microsoft Entra Federated
  Credential**. Không tạo hoặc lưu `AZURE_CLIENT_SECRET` cho production
  workflow này.
- `AZURE_TENANT_ID` và `AZURE_CLIENT_ID` là identifier và được lưu dưới GitHub
  Repository Variables; không đưa access token hoặc refresh token vào Variables.
- Federated Credential chỉ trust đúng repository `Huanpro1239/vikoda-sellin-dashboard`
  và branch `main`.
- Màn hình mật khẩu chạy bằng JavaScript phía client **không phải access
  control**. Không xuất bản dữ liệu nội bộ trên static hosting nếu chưa có lớp
  xác thực phía server/identity proxy và phê duyệt dữ liệu.
- Job CI của pull request chỉ có `contents: read`; job cloud mới được cấp
  `id-token: write`. Cloud job phải fail khi OIDC không hợp lệ hoặc khi SharePoint
  không trả về workbook `.xlsm`/`.xlsx` hợp lệ.
- SharePoint/Graph nên dùng `Sites.Selected` và cấp riêng role `write` cho site
  `Planning`, thay vì quyền tenant-wide nếu không cần thiết.
- Workbook có macro hoặc external link phải được quét và làm sạch trước khi chia sẻ.

## Trạng thái dữ liệu lịch sử

Thêm `.gitignore` không xóa file đã commit. Cho tới khi hoàn tất quy trình di
chuyển dữ liệu, thu hồi quyền truy cập, rewrite lịch sử có kiểm soát và xác nhận
cache/fork, phải giả định rằng mọi dữ liệu từng xuất hiện trong repository công
khai đã bị lộ. Không rewrite history hoặc force-push nếu chưa có backup và kế
hoạch phối hợp với mọi người đang clone repository.
