# Target hàng tháng

## Nguồn chính thức

Chỉ dùng hai file trong `Data/Target`:

1. `Target sellin YYYY.xlsx`: Target NPP và B2C đủ 12 tháng.
2. `Target MT KA.xlsx`: Target MT/KA đủ 12 tháng.

Không dùng `Target allocation*.xlsx` để ghi đè một tháng riêng. Điều này giữ
cùng một chính sách nguồn cho cả năm.

## Target NPP/B2C

Đọc `Target sellin YYYY.xlsx`:

- Chọn sheet chứa bảng `TARGET ALLOCATION SELL IN NPP`.
- Tìm hàng tiêu đề có `MÃ NPP`, `TÊN NPP`, `MIỀN`, `VÙNG`.
- Mỗi tháng phải có đủ nhóm cột `VIKODA` và `TỔNG CỘNG`.
- Lấy `VIKODA` làm `TargetVikoda`.
- Lấy `TỔNG CỘNG` làm `TargetTong`.
- Giá trị nguồn là triệu đồng; nhân `1.000.000` để lưu VND.
- Bỏ dòng không có mã khách hàng.
- Lấy `MIỀN`, `VÙNG` trên cùng dòng làm metadata báo cáo.

Ngoại lệ bắt buộc cho hai dòng tổng hợp không có `MÃ NPP`:

- Dòng có tên/vùng `B2C`: dùng mã `B2C`, Miền/Vùng `B2C/B2C`.
- Dòng có tên/vùng `Other`: dùng mã `0`, Miền/Vùng `Other/Other`.

Hai dòng này chứa Target đủ 12 tháng và không được loại bởi điều kiện mã trống.
Thiếu một trong hai dòng thì dừng quy trình.

Phải tìm đủ 12 nhóm tháng từ Jan đến Dec. Thiếu bất kỳ tháng nào thì dừng.

## Target MT/KA theo VBA Final V6

Đọc `Target MT KA.xlsx`, sheet `DATA`, cho toàn bộ 12 tháng:

- Đọc cột `A, B, D, E, G, R, U`.
- Chỉ lấy cột A bằng `KA` hoặc `MT`.
- Cột R phải là kỳ `YYYYMM` thuộc năm của file `Target sellin YYYY.xlsx`.
- Mã khách hàng cột D phải khác trống.
- Nhóm theo `Kỳ + Mã khách hàng`.
- Lấy tên không trống đầu tiên ở cột E.
- `TargetVikoda`: tổng cột U của dòng có nhóm sản phẩm cột G chứa `VIKODA`.
- `TargetTong`: tổng toàn bộ cột U.
- Cột U đã là VND, không nhân thêm.
- Lấy cột A/B làm metadata Miền/Vùng.

Đây là cách nhóm do VBA `Import_Target_SellIn_Final_V6` tạo bằng Power Query.
Không dùng sheet `Sheet1` làm nguồn tính.

## Ghép và kiểm soát

Khóa chuẩn hóa:

`Kỳ + Mã khách hàng + Tên khách hàng`

Cộng Target nếu cùng khóa xuất hiện ở hai nguồn. Giữ riêng khi cùng mã nhưng
khác tên, đồng thời ghi cảnh báo.

Áp dụng các kiểm soát:

- Hai nguồn phải tạo đủ 12 kỳ của mỗi năm.
- Mỗi kỳ phải có dữ liệu MT/KA từ sheet `DATA`.
- Target lưu dưới dạng số nguyên VND.
- Nếu Target âm trong hai nguồn năm, chuẩn hóa thành `0` và ghi kỳ, mã vào audit.
- Không cho phép `TargetTong < TargetVikoda` sau chuẩn hóa.
- Mã hoặc tên `B2C` luôn ánh xạ vào Miền/Vùng `B2C`.
- Tên `Other` luôn ánh xạ vào Miền/Vùng `Other`.

## File tham chiếu

`Target chuan.xlsm`, sheet `DATA_TARGET`, chỉ dùng để đối chiếu kỳ mẫu:

- Đọc kỳ từ `Period: YYYYMM`.
- Đọc `MaKhachHangMoi`, `TenKhachHang`, `Target Vikoda`, `Target Tong`.
- So sánh từng dòng và tổng với kết quả từ hai file năm.
- Ghi `MATCHED` hoặc `REFERENCE_ONLY_MISMATCH` cùng chênh lệch vào audit.
- Không dùng dữ liệu tham chiếu để ghi đè báo cáo.

Các file trong `Target chuan hang thang` cũng chỉ là tài liệu tham khảo và
không tham gia luồng tạo Target.

## Cấu trúc đầu ra

Sheet `Target` trong `Data/File bao cao/Excel/Bao_Cao_Sell_in.xlsx` gồm:

1. `Ky`
2. `Nam`
3. `Thang`
4. `MaKhachHangMoi`
5. `TenKhachHang`
6. `TargetVikoda`
7. `TargetTong`
8. `NgayCapNhatNguon`
9. `NguonFile`

Sắp xếp theo `Nam`, `Thang`, `MaKhachHangMoi`, `TenKhachHang`.
Staging được lưu thêm `MienBaoCao`, `VungBaoCao` để dựng `PIVOT`.

Audit ghi `ANNUAL_TWO_SOURCE_VBA_MTKA` cho mọi kỳ.

## Vùng làm việc

- Staging: `Data/Work/bao_cao/target/staging`.
- Preview: `Data/Work/bao_cao/target/previews`.
- Verification: `Data/Work/bao_cao/target/verification`.

Không dùng file trong `Data/Work` làm nguồn chính thức.
