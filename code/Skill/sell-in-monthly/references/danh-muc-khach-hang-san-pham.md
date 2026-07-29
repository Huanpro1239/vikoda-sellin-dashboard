# Quy trình dữ liệu danh mục khách hàng và sản phẩm

## 1. Nguồn chuẩn

- Danh mục khách hàng:
  `Data/Danh muc KH/Thong tin khach hang.xlsx`, sheet `DM KH`.
- Danh mục sản phẩm:
  `Data/Danh muc SP/Danh Muc San Pham.xlsx`, sheet `DanhMucSanPham`.
- Sell In dùng để phát hiện phát sinh: file `Sell in TMM_YYYY.xlsx` có cặp
  `(Nam, Thang)` lớn nhất trong tên file.
- ERP dùng để bổ sung thông tin: toàn bộ file VKD và Vikoda/Vkoda cùng kỳ với
  file Sell In mới nhất.

Không dùng thời gian sửa file để xác định kỳ mới nhất.

## 2. Áp dụng khách hàng đã duyệt

Thực hiện bước này sau khi workbook Sell In đã đạt kiểm tra và trước khi tạo lại
danh sách khách hàng mới:

1. Đọc các file `Khach hang moi TMM_YYYY.xlsx` trong
   `Data/Work/sell_in/new_customers`.
2. Chỉ lấy dòng có `TrangThaiDuyet = DUYET`.
3. Bắt buộc có `MaKhachHangMoi` và `TenKhachHang`.
4. So sánh mã sau khi xóa khoảng trắng và không phân biệt hoa/thường.
5. Bỏ qua mã đã có trong danh mục; không ghi đè dữ liệu hiện hữu.
6. Dừng nếu cùng một mã được duyệt nhiều lần với nội dung khác nhau.
7. Nếu có dòng hợp lệ cần thêm, sao lưu danh mục vào
   `Data/Logs/Danh muc KH backups`.
8. Nối dòng vào cuối danh mục, giữ cấu trúc 13 cột nghiệp vụ và cột trống cuối
   hiện hữu, sao chép định dạng từ dòng trước, giữ mã dạng chữ.
9. Mở lại file sau khi ghi và xác nhận mọi mã vừa thêm đều tồn tại.

Nếu không có dòng `DUYET`, không sửa và không tạo bản sao danh mục.

## 3. Phát hiện khách hàng mới

1. Đọc `MaKhachHangMoi` duy nhất trong file Sell In mới nhất.
2. Bỏ mã trống và `VKD3`.
3. Chuẩn hóa mã bằng cách xóa khoảng trắng, so sánh không phân biệt hoa/thường.
4. Mã chưa có trong danh mục khách hàng là ứng viên mới.
5. Tổng hợp `TenKhachHang`, ngày hóa đơn gần nhất và số dòng Sell In.
6. Đọc hai nguồn ERP cùng kỳ để đề xuất thông tin chi tiết.

## 4. Quy tắc đề xuất dữ liệu

| Cột danh mục | Quy tắc |
| --- | --- |
| `MaKhachHangMoi` | Lấy từ Sell In; không để trống. |
| `TenKhachHang` | Ưu tiên ERP nếu chỉ có một giá trị; dự phòng bằng Sell In. |
| `TenKhachHangdaydu` | Đề xuất bằng `TenKhachHang`; người duyệt được sửa. |
| `DiaChi` | Ưu tiên `DiaChiGiaoHangImport`, dự phòng `DiaChiGiaoHang`; luôn nhắc kiểm tra vì đây có thể là địa chỉ giao hàng. |
| `KenhBanHang` | Lấy từ ERP khi không xung đột. |
| `Loaikhachhang` | Để trống, không tự suy diễn. |
| `Hethong MT` | Để trống, không tự suy diễn. |
| `MIEN`, `VUNG` | Suy ra từ `TINHTHANH` bằng các dòng hiện có trong danh mục chỉ khi mỗi trường có đúng một giá trị. |
| `TINHTHANH`, `QUANHUYEN` | Lấy từ ERP khi không xung đột. |
| `CODE`, `TENKH` | Để trống, không tự suy diễn. |

Khi một trường ERP có nhiều giá trị:

- Dùng giao dịch có ngày hóa đơn gần nhất làm gợi ý.
- Ghi tên trường vào `TruongXungDot`.
- Đặt trạng thái mặc định `CAN BO SUNG`.
- Không tự động duyệt.

Nếu không có xung đột, đặt trạng thái mặc định `CHO DUYET`.

## 5. Workbook rà soát

Tạo:

`Data/Work/sell_in/new_customers/Khach hang moi TMM_YYYY.xlsx`

Workbook có ba sheet:

1. `Khach hang moi`: 13 cột danh mục và các cột kiểm soát
   `KyDuLieu`, `FileNguonERP`, `NgayHoaDonGanNhat`, `SoDongSellIn`,
   `TruongXungDot`, `TrangThaiDuyet`, `GhiChuDuyet`.
2. `Ma SP chua co`: mã xuất hiện trong Sell In nhưng chưa có ở cả hai cột mã
   của danh mục sản phẩm.
3. `Huong dan`: hướng dẫn duyệt và số lượng cần rà soát.

Các trạng thái hợp lệ:

- `CHO DUYET`
- `DUYET`
- `TU CHOI`
- `CAN BO SUNG`

Khi chạy lại cùng kỳ, giữ giá trị người dùng đã nhập, trạng thái và ghi chú đối
với ứng viên vẫn chưa có trong danh mục.

## 6. Đối chiếu danh mục sản phẩm

1. Lấy mã sản phẩm duy nhất trong file Sell In mới nhất.
2. So sánh với cả `MaSanPhamMoi_Vikoda` và `MaSanPhamMoi_VKD`.
3. Ghi mã thiếu, tên sản phẩm và số dòng Sell In vào sheet `Ma SP chua co`.
4. Không tự thêm sản phẩm vì ERP không đủ các trường như tên thu gọn, quy cách,
   đơn vị tính, VAT, Cobrand và loại sản phẩm.

Mã thiếu là cảnh báo cần xử lý nghiệp vụ, không làm sai dữ liệu Sell In đã tạo.

## 7. Kiểm tra và lưu vết

- Kế hoạch duyệt:
  `Data/Work/sell_in/master_data/approved_customers_plan.json`.
- Kết quả áp dụng:
  `Data/Work/sell_in/master_data/approved_customers_apply_report.json`.
- Phân tích kỳ mới nhất:
  `Data/Work/sell_in/master_data/master_data_analysis.json`.
- Báo cáo kiểm tra:
  `Data/Work/sell_in/verification/master_data_report.json`.
- Preview:
  `Data/Work/sell_in/previews/master_data`.

`Data/Work/sell_in/new_customers` là ngoại lệ trong `Data/Work`: phải giữ lại
khi còn dòng chờ duyệt hoặc ghi chú chưa được áp dụng.
