# Tạo báo cáo Target

Dùng `$skill-bao-cao` để:

1. Đọc toàn bộ dữ liệu trong `Data/Target` và tổng hợp Target các tháng.
2. Đọc `Data/out put/Sell in hang  thang`, lấy dữ liệu từ tháng 1 đến tháng
   hiện tại của năm nay và cùng kỳ năm trước.
3. Đọc danh mục khách hàng trong `Data/Danh muc KH`.
4. Tạo `Data/File bao cao/Excel/Bao_Cao_Sell_in.xlsx` gồm ba sheet `Target`,
   `Data` và `DMKH`.

Ưu tiên kỳ có trong `Target chuan.xlsm`, chạy đầy đủ bước kiểm tra và báo rõ:

- Số kỳ và số dòng.
- Tổng `TargetVikoda`, `TargetTong` của từng kỳ.
- Kỳ nào được thay bằng dữ liệu chuẩn.
- Cảnh báo mã khách hàng `0` hoặc một mã có nhiều tên.
- Các kỳ Sell In đã lấy, số dòng, tổng `SoLuong`, tổng `ThanhTien`.
- Số dòng danh mục khách hàng, mã lặp và dòng thiếu mã.
- Kết quả kiểm tra chạy sau khi sao chép dự án sang đường dẫn khác.
