# Dữ liệu thực hiện Sell In

## Mục tiêu

Tạo sheet `Data` trong `Data/File bao cao/Excel/Bao_Cao_Sell_in.xlsx` làm cơ sở
cho báo cáo thực hiện, so sánh cùng kỳ và tính tỷ lệ hoàn thành Target.

## Nguồn

Đọc các workbook trong:

`Data/out put/Sell in hang  thang`

Tên file bắt buộc:

`Sell in TMM_YYYY.xlsx`

Mỗi file chỉ lấy sheet `Sell in` và phải có đúng mười bốn cột:

`Vung, KhuVuc, NgayHoaDon, MaKhachHangMoi, TenKhachHang, MaSanPhamMoi,
TenSanPham, SoLuong, DonGia, ThanhTien, LoaiDonHang, GhiChu, Thang, Nam`

## Phạm vi kỳ

Với ngày chạy thuộc tháng `M`, năm `Y`, lấy:

- Năm hiện tại: tháng 1 đến tháng `M` của năm `Y`.
- Cùng kỳ năm trước: tháng 1 đến tháng `M` của năm `Y - 1`.

Ví dụ chạy trong tháng 7/2026 thì lấy:

- `202601` đến `202607`.
- `202501` đến `202507`.

Không lấy các tháng tương lai của năm hiện tại hoặc các tháng sau tháng `M` của
năm trước. Dừng quy trình nếu thiếu bất kỳ file kỳ bắt buộc nào.

## Bộ lọc loại hóa đơn

Nguồn tháng dùng cột `LoaiDonHang` cho ý nghĩa nghiệp vụ loại hóa đơn. Chỉ đưa
hai nhóm sau vào doanh thu và sheet `Data`:

- `Đơn hàng bán`: tương đương `Hóa đơn bán`.
- `Đơn trả hàng`: tương đương `Hóa đơn trả hàng`; giữ nguyên `ThanhTien` âm để
  giảm trừ doanh thu.

Loại toàn bộ nhóm khác, gồm biếu tặng, khuyến mại, sampling, thanh lý,
`Bán hàng khác` và giá trị trống. Không đổi các dòng bị loại thành doanh thu
bằng `0`; phải bỏ hẳn khỏi staging và workbook.

Audit phải ghi theo từng kỳ: số dòng nguồn, số dòng giữ lại, số dòng bị loại,
giá trị bị loại và chi tiết theo từng nhãn `LoaiDonHang`.

## Quy tắc từng dòng

- Không tự xóa trùng.
- Giữ nguyên dữ liệu thực hiện hợp lệ sau bộ lọc loại hóa đơn.
- Lưu `NgayHoaDon` là ngày Excel thật, hiển thị `dd/mm/yyyy`.
- Lưu `MaKhachHangMoi`, `MaSanPhamMoi` là chữ.
- Lưu `SoLuong`, `DonGia`, `ThanhTien` là số.
- Hiển thị `SoLuong` nguyên bằng `#,##0`; chỉ dùng `#,##0.##` khi có phần lẻ,
  để không xuất hiện dấu chấm thừa phía sau số nguyên.
- Xác nhận `Thang`, `Nam` trong từng dòng khớp kỳ trên tên file.
- Sắp xếp theo `Nam`, `Thang`, `NgayHoaDon`, `MaKhachHangMoi`,
  `MaSanPhamMoi`.

## Cấu trúc đầu ra

Tên sheet: `Data`.

Giữ đúng thứ tự mười bốn cột nguồn. Tạo Excel Table tên `tblDataSellIn`, bật
bộ lọc, cố định hàng tiêu đề và không tạo công thức trong vùng dữ liệu.

## Đối soát

Theo từng kỳ, kiểm tra:

- Số dòng nguồn, số dòng giữ lại và số dòng bị loại.
- Tổng `SoLuong`.
- Tổng `ThanhTien`.
- Mọi dòng trong `Data` chỉ có `Đơn hàng bán` hoặc `Đơn trả hàng`.
- Kiểu dữ liệu ngày, mã và số.
- Không có công thức hoặc lỗi công thức.

## Vùng làm việc

- Staging: `Data/Work/bao_cao/data/staging`.
- Preview dùng chung: `Data/Work/bao_cao/target/previews`.
- Verification dùng chung: `Data/Work/bao_cao/target/verification`.
