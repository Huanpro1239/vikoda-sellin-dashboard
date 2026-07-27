# Prompt kiểm tra chất lượng Sell In

Đọc Skill `Skill/sell-in-monthly` và kiểm tra một lần chạy Sell In theo các mục:

- Đúng số file theo tháng/năm và đúng 14 cột.
- Ngày hóa đơn là ngày Excel thật.
- Mã khách hàng, mã sản phẩm là chữ; mã sản phẩm bắt đầu bằng `1` hoặc `2`.
- `Thang`, `Nam` khớp tên file.
- `SoLuong`, `DonGia`, `ThanhTien` là số.
- `SoLuong` nguyên không có `.0` hoặc dấu chấm thừa; giá trị lẻ hợp lệ không bị
  làm tròn.
- Không có công thức lỗi, không có file thiếu và không có mục trong `problems`.
- Tổng dòng, tổng `SoLuong`, tổng `ThanhTien` khớp nhật ký nguồn.
- Kỳ mới nhất được chọn theo tên `Sell in TMM_YYYY.xlsx`, không theo ngày sửa.
- Workbook khách hàng mới đúng ba sheet, đúng cột và chỉ dùng bốn trạng thái hợp
  lệ.
- Dòng đã `DUYET` chỉ được nối thêm khi mã chưa có; danh mục được sao lưu trước
  khi thay đổi và không bị ghi đè.
- Mã sản phẩm chưa có được cảnh báo nhưng không tự động thêm vào danh mục sản
  phẩm.
- Launcher chuyển giao ưu tiên Python hợp lệ; nếu dùng EXE, xác nhận chữ ký hoặc
  allow-list đáp ứng chính sách Device Guard của máy nhận.

Chỉ kết luận đạt khi kiểm tra dữ liệu và preview trực quan đều đạt.
