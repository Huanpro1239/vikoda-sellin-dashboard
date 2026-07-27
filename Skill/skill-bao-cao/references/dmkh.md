# Danh mục khách hàng

## Nguồn

Đọc file `Data/Danh muc KH/Thong tin khach hang.xlsx`, sheet `DM KH`.

Lấy toàn bộ dòng có dữ liệu, không tự xóa trùng và không loại dòng thiếu
`MaKhachHangMoi`.

## Cột đầu ra

Giữ nguyên 13 cột có tiêu đề:

`MaKhachHangMoi, TenKhachHang, TenKhachHangdaydu, DiaChi, KenhBanHang,
Loaikhachhang, Hethong MT, MIEN, VUNG, TINHTHANH, QUANHUYEN, CODE, TENKH`

Cột N của file nguồn hiện chưa có tiêu đề nhưng có thể chứa dữ liệu. Lưu cột
này thành `ThongTinBoSungNguon` để không mất thông tin. Dừng quy trình để xem
xét nếu cột N được đặt tiêu đề mới trong tương lai.

## Quy tắc

- Lưu cả 14 cột dạng chữ để bảo toàn mã và ký tự đầu.
- Không chạy công thức từ file nguồn.
- Giữ nguyên thứ tự dòng nguồn.
- Không tự gộp các mã khách hàng lặp.
- Ghi cảnh báo cho dòng thiếu `MaKhachHangMoi`, mã lặp và dữ liệu ở cột N.

## Đầu ra và đối soát

- Tên sheet: `DMKH`.
- Excel Table: `tblDMKH`.
- Bật bộ lọc, cố định hàng 1 và ẩn gridlines.
- Đối soát từng ô với staging sau khi chuẩn hóa khoảng trắng đầu/cuối.
- Staging: `Data/Work/bao_cao/dmkh/staging`.
