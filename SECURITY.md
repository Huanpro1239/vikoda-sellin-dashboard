# Chính sách bảo mật

## Phạm vi hỗ trợ

Nhánh `main` là phiên bản duy nhất được duy trì. Dự án xử lý dữ liệu bán hàng,
khách hàng và chỉ tiêu kinh doanh; toàn bộ dữ liệu nguồn, dữ liệu staging, báo
cáo Excel và payload chi tiết phải được xem là **dữ liệu nội bộ**.

## Báo cáo lỗ hổng

Không đăng secret, dữ liệu khách hàng hoặc bằng chứng khai thác vào GitHub
Issue công khai. Hãy dùng **Private vulnerability reporting** trong tab
Security của repository, hoặc liên hệ riêng với chủ repository/quản trị viên
Vikoda. Nội dung tối thiểu gồm phiên bản/commit, tác động, cách tái hiện và cách
liên hệ lại. Không đính kèm dữ liệu sản xuất nếu chưa được yêu cầu qua kênh an
toàn.

## Quy tắc bắt buộc

- Không commit dữ liệu trong `Data/`, payload giao dịch trong `web/data/`, file
  `.env`, token, webhook, certificate hoặc cấu hình rclone thật.
- Secret cloud chỉ được lưu trong GitHub Actions Secrets hoặc secret store được
  phê duyệt; phải thu hồi và thay mới ngay khi nghi ngờ lộ.
- Màn hình mật khẩu chạy bằng JavaScript phía client **không phải access
  control**. Không xuất bản dữ liệu nội bộ trên static hosting nếu chưa có lớp
  xác thực phía server/identity proxy và phê duyệt dữ liệu.
- Job CI của pull request không được nhận production secrets. Job deploy phải
  fail khi thiếu credential hoặc khi SharePoint không trả về workbook nguồn
  `.xlsm`/`.xlsx` hợp lệ.
- Workbook có macro hoặc external link phải được quét và làm sạch trước khi
  chia sẻ.

## Trạng thái dữ liệu lịch sử

Thêm `.gitignore` không xóa file đã commit. Cho tới khi hoàn tất quy trình di
chuyển dữ liệu, thu hồi quyền truy cập, rewrite lịch sử có kiểm soát và xác nhận
cache/fork, phải giả định rằng mọi dữ liệu từng xuất hiện trong repository công
khai đã bị lộ. Không rewrite history hoặc force-push nếu chưa có backup và kế
hoạch phối hợp với mọi người đang clone repository.
