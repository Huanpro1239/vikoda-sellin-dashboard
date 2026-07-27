# Báo cáo PIVOT theo Miền/Vùng

## Mục tiêu

Tạo sheet `PIVOT` tương tự sheet cùng tên trong
`Sell_in_report_chuan.xlsb`, nhưng giữ các chỉ số kết quả bằng công thức để dễ
đối soát.

## Kỳ tính

Lấy kỳ từ `current_year` và `through_month` trong staging Sell In:

- `Actual`: tháng hiện tại.
- `LY`: cùng tháng năm trước.
- `Previous Month`: tháng liền trước.
- `Target`: Target của tháng hiện tại.

Ba chỉ tiêu Sell In `Actual`, `LY` và `Previous Month` chỉ tổng hợp các dòng
đã qua bộ lọc loại hóa đơn: `Đơn hàng bán` và `Đơn trả hàng`. Các loại khác
không được đưa vào `PVT_DATA`.

Nếu kỳ hiện tại là tháng 1, kỳ tháng trước là tháng 12 của năm trước. Khi nguồn
không có kỳ này, giá trị tháng trước bằng `0`.

## Ánh xạ Miền/Vùng

Dùng đúng thứ tự:

1. Miền Bắc: Bắc Miền Trung, Đông Bắc, Hà Nội, Tây Bắc.
2. Miền Nam: Miền Đông, Miền Tây, TP. HCM 1, TP. HCM 2.
3. Miền Trung 1: Miền Trung 1A, Miền Trung 1B, Tây Nguyên.
4. Miền Trung 2: Miền Trung 2A, Miền Trung 2B.
5. KA: KA Miền Bắc, KA Miền Trung 1, KA Miền Trung 2, KA Miền Nam.
6. MT: MT.
7. B2C: B2C.
8. Other: Other.

Với Sell In, tra `MaKhachHangMoi` trong DMKH. Với Target, ưu tiên
`MienBaoCao`/`VungBaoCao` từ staging, sau đó mới tra DMKH. Chuẩn hóa các biến thể
viết hoa/thường như `Ka Miền Trung 1`, `Miền tây`; chuyển `XK` và mọi cặp không
hợp lệ vào `Other`.

Riêng Target có mã hoặc tên `B2C` phải ánh xạ trực tiếp vào `B2C/B2C`, kể cả
khi metadata staging hoặc DMKH bị thiếu. Dừng kiểm tra nếu Target B2C còn xuất
hiện trong `Other`.

Riêng Target có tên `Other` phải ánh xạ trực tiếp vào `Other/Other`. Dừng kiểm
tra nếu dòng Target này bị bỏ hoặc xuất hiện trong vùng khác.

Dừng quy trình nếu DMKH còn cùng mã khách hàng nhưng có Miền/Vùng mâu thuẫn.

## PVT_DATA

Để sheet `PVT_DATA` ẩn và lưu các cột:

`MIEN, VUNG, MaKH, KhachHang, SanPham, Actual, CungKyLY, ThangTruoc,
Vikoda, TargetTong, TargetVikoda, KDT, VikodaLY, VikodaThangTruoc`

- Gộp Sell In theo Miền, Vùng, khách hàng và sản phẩm trên ba kỳ cần tính.
- Thêm một dòng sản phẩm `-` cho mỗi dòng Target của kỳ hiện tại.
- `Vikoda`: Actual nếu tên sản phẩm chứa `Vikoda`, ngược lại bằng `0`.
- `KDT`: Actual nếu tên sản phẩm chứa `KDT`, ngược lại bằng `0`.
- `VikodaLY` và `VikodaThangTruoc`: doanh thu Vikoda ở kỳ tương ứng.

## PIVOT

Giữ vùng báo cáo `B1:T33`:

- Hàng 1-2: tiêu đề, kỳ, đơn vị và quy tắc phân loại.
- Hàng 3-4: nhóm cột và tiêu đề.
- Hàng 5-32: 20 vùng và 8 dòng tổng miền.
- Hàng 33: `Grand Total`.

Các nhóm chỉ số:

- Target: Total Target, Vikoda Target.
- Actual vs Target: Actual, Attainment, Variance, Vikoda Actual,
  Vikoda Attainment, Vikoda Variance, KDT Actual.
- YoY: Total LY, Total YoY Index, Vikoda LY, Vikoda YoY Index.
- MoM: Total Previous Month, Total MoM Index, Vikoda Previous Month,
  Vikoda MoM Index.

Dùng `SUMIFS`, `SUM` và `IFERROR` với phạm vi hữu hạn trong `PVT_DATA`. Hiển thị
doanh thu theo triệu đồng bằng định dạng số, nhưng giữ giá trị ô theo VND.

## Đối soát

- Tổng từng chỉ tiêu trong `PVT_DATA` phải khớp Target và Sell In nguồn.
- Từng dòng vùng trong `PIVOT` phải khớp tổng theo Miền/Vùng từ `PVT_DATA`.
- `Grand Total` phải khớp nguồn cho chín chỉ tiêu tiền.
- Các tỷ lệ phải dùng mẫu số đúng và trả `0` khi mẫu số bằng `0`.
- Tô màu tỷ lệ hoàn thành: đỏ dưới 80%, vàng từ 80% đến dưới 100%, xanh từ 100%.
- Tô chữ variance âm màu đỏ và variance dương màu xanh.
