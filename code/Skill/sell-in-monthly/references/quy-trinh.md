# Quy trình tách dữ liệu Sell In hàng tháng

## 1. Mục tiêu

Đọc các file ERP trong `Data/Data ERP`, gộp dữ liệu VKD và Vikoda theo từng
tháng/năm, rồi tạo file tại `Data/out put/Sell in hang  thang`.

Tên file đầu ra: `Sell in TMM_YYYY.xlsx`.

## 2. Kế hoạch tăng dần

Trước khi tách dữ liệu, `incremental.py` nhóm file nguồn theo kỳ và lập
`Data/Work/sell_in/staging/incremental_plan.json`.

Mỗi kỳ có một hành động:

- `SKIP`: file nguồn và output không có thay đổi dữ liệu cần xử lý.
- `REBUILD`: đọc lại tất cả file VKD/Vikoda của kỳ, tạo lại toàn bộ output kỳ
  đó rồi kiểm tra.

`REBUILD` xảy ra khi:

1. Output thiếu, không mở được hoặc sai cấu trúc.
2. Nguồn có `NgayHoaDon` mới, mất ngày hoặc số dòng hợp lệ của một ngày thay
   đổi so với output.
3. Thêm hoặc bớt file nguồn của kỳ.
4. Output bị sửa sau lần chạy đã xác minh.
5. Người dùng dùng `-ForcePeriod YYYY-MM` hoặc `-ForceAll`.

Mỗi file nguồn được nhận diện bằng SHA-256. Nếu SHA-256 không đổi, lần chạy sau
không mở workbook đó. Nếu file chỉ được lưu lại nhưng số dòng theo từng
`NgayHoaDon` không đổi, kỳ vẫn `SKIP`.

Vì chưa có khóa chứng từ duy nhất, kỳ `REBUILD` luôn được tạo lại từ toàn bộ
file nguồn của kỳ; không nối thêm dòng trực tiếp vào output cũ. Cơ chế này phát
hiện thay đổi ngày/số dòng, nhưng không phát hiện sửa số lượng, đơn giá hoặc nội
dung khác khi ngày và số dòng giữ nguyên. Trường hợp đó phải ép chạy kỳ.

Trạng thái ổn định nằm tại
`Data/Logs/Tach data logs/incremental_state.json` và chỉ được cập nhật sau khi
output vừa tạo đạt kiểm tra. Nếu chưa có trạng thái, lần chạy đầu đối chiếu toàn
bộ nguồn với output hiện có để tạo mốc; không tạo lại file đã khớp.

## 3. Quy ước file nguồn

Tên file phải chứa:

- Công ty: `VKD`, `Vikoda` hoặc biến thể `Vkoda`.
- Tháng: `T1` đến `T12`.
- Năm: bốn chữ số.

Ví dụ:

- `BCDonHangBanTrongKyNPP_VKD_T6_2026.xlsm`
- `BCDonHangBanTrongKyNPP_Vikoda_T3_2026.xlsm`
- `BCDonHangBanTrongKyNPP_Vkoda_T6_2026.xlsm`

`Thang` và `Nam` luôn lấy từ tên file, không lấy từ ngày hóa đơn.

## 4. Dữ liệu đầu vào

- Chỉ đọc worksheet đầu tiên của mỗi workbook.
- Tìm hàng tiêu đề có đủ trường bắt buộc trong 40 hàng đầu; không cố định số
  hàng.
- Các cột nguồn:

`Vung, KhuVuc, NgayHoaDon, MaKhachHangMoi, TenKhachHang, MaSanPhamMoi, TenSanPham, SoLuong, DonGia, ThanhTien, LoaiDonHang, GhiChu`

## 5. Quy tắc từng dòng

1. Bỏ dòng hoàn toàn trống.
2. Xác định công ty, tháng và năm từ tên file.
3. Với Vikoda/Vkoda, loại dòng có `MaKhachHangMoi = VKD3` sau khi xóa khoảng
   trắng và không phân biệt hoa/thường.
4. Chuẩn hóa `MaSanPhamMoi` thành chữ để không mất số đầu.
5. Chỉ giữ mã sản phẩm bắt đầu bằng `1` hoặc `2`.
6. Với VKD, đổi đúng ký tự đầu của mã sản phẩm từ `2` thành `1`.
7. Chuyển `NgayHoaDon` thành ngày Excel thật và hiển thị `dd/mm/yyyy`.
8. Giữ `SoLuong`, `DonGia`, `ThanhTien` ở dạng số.
9. Chuẩn hóa `SoLuong` nguyên như `240.0`, `"240.0"` hoặc `"240."` thành số
   nguyên `240`; giữ giá trị lẻ thực sự như `1.92`.
10. Gán `Thang`, `Nam` từ tên file.

Không tự động xóa trùng khi chưa có khóa chứng từ duy nhất.

## 6. Tạo file đầu ra

- Nhóm dữ liệu theo `Nam + Thang`.
- Gộp VKD và Vikoda/Vkoda trong cùng kỳ.
- Sắp xếp theo `NgayHoaDon`, `MaKhachHangMoi`, `MaSanPhamMoi`.
- Tên sheet: `Sell in`.
- Thứ tự 14 cột:

`Vung, KhuVuc, NgayHoaDon, MaKhachHangMoi, TenKhachHang, MaSanPhamMoi, TenSanPham, SoLuong, DonGia, ThanhTien, LoaiDonHang, GhiChu, Thang, Nam`

- Hàng tiêu đề có bộ lọc và cố định hàng đầu.
- Mã khách hàng và mã sản phẩm là chữ.
- `NgayHoaDon` dùng định dạng `dd/mm/yyyy`.
- `SoLuong` nguyên dùng định dạng `#,##0`; số lẻ thực sự dùng `#,##0.##`.
  Vì vậy số nguyên không hiện `.0` hoặc dấu chấm thừa, còn số lẻ hợp lệ vẫn
  hiển thị tối đa hai chữ số thập phân.

## 7. Kiểm tra bắt buộc

1. Số file đầu ra bằng số kỳ tháng/năm trong nguồn.
2. Mỗi file chỉ có một sheet `Sell in`.
3. Đúng tên và thứ tự 14 cột.
4. Ngày hóa đơn là ngày Excel thật.
5. Mã sản phẩm bắt đầu bằng `1` hoặc `2` và được lưu dạng chữ.
6. `Thang`, `Nam` khớp tên file.
7. `SoLuong` là số, dùng đúng định dạng và không có chuỗi kết thúc bằng dấu
   chấm.
8. Không có công thức lỗi.
9. Tổng dòng, tổng `SoLuong`, tổng `ThanhTien` khớp nhật ký xử lý.
10. `missing` và `problems` trong báo cáo verification đều rỗng.

## 8. Dữ liệu danh mục

Sau khi các file `REBUILD` đạt kiểm tra:

1. Áp dụng các dòng khách hàng đã được người dùng chọn `DUYET`.
2. Xác định file Sell In mới nhất theo tháng/năm trong tên file.
3. Phát hiện khách hàng mới và bổ sung gợi ý từ ERP cùng kỳ.
4. Đối chiếu mã sản phẩm với `Danh Muc San Pham.xlsx`.
5. Tạo và kiểm tra workbook rà soát.

Luôn lập kế hoạch duyệt. Nếu không có tháng `REBUILD` và không có dòng `DUYET`
thì bỏ qua toàn bộ bước phân tích/tạo lại workbook danh mục.

Đọc `danh-muc-khach-hang-san-pham.md` trước khi thay đổi quy tắc chi tiết.

## 9. Nhật ký và vùng làm việc

- Staging/audit: `Data/Work/sell_in/staging`.
- Kế hoạch tăng dần:
  `Data/Work/sell_in/staging/incremental_plan.json`.
- Trạng thái tăng dần:
  `Data/Logs/Tach data logs/incremental_state.json`.
- Preview: `Data/Work/sell_in/previews`.
- Verification: `Data/Work/sell_in/verification`.
- Rà soát khách hàng mới:
  `Data/Work/sell_in/new_customers/Khach hang moi TMM_YYYY.xlsx`.
- Phân tích danh mục: `Data/Work/sell_in/master_data`.
- Log portable: `Data/Logs/Tach data logs/audit_portable.json`.

Các thư mục trong `Data/Work` có thể tạo lại, ngoại trừ
`Data/Work/sell_in/new_customers` khi còn trạng thái hoặc ghi chú đang chờ áp
dụng. Không dùng các file staging/preview làm nguồn dữ liệu chính thức.

## 10. Google Drive

Đích mặc định: `G:/My Drive/Bao cao Sell in/Sell in hang thang`.

Chỉ chép các file `REBUILD` sau khi kiểm tra đạt. Không chép lại các file
`SKIP`. Dùng `-SkipGoogleDrive` khi chỉ cần tạo và kiểm tra file cục bộ.
