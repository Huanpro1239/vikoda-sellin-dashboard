---
name: skill-bao-cao
description: Xây dựng và vận hành Bao_Cao_Sell_in.xlsx trong dự án "Bao cao Sell in"; tạo Target đủ 12 tháng từ Target sellin YYYY.xlsx và Target MT KA.xlsx, áp dụng cách nhóm MT/KA của VBA Final V6, tổng hợp Sell In năm nay/cùng kỳ, DMKH, PVT_DATA và PIVOT theo Miền/Vùng. Dùng khi cần chạy hoặc kiểm tra báo cáo, cập nhật Target/Sell In/DMKH, phân tích Actual so với Target, YoY, MoM, Vikoda/KDT, đóng gói hoặc di chuyển dự án.
---

# Skill báo cáo Sell In

## Phạm vi

Tạo `Data/File bao cao/Excel/Bao_Cao_Sell_in.xlsx` với năm sheet:

- `Target`: Target tất cả các tháng.
- `Data`: Sell In từ đầu năm đến tháng hiện tại và cùng kỳ năm trước.
- `DMKH`: danh mục khách hàng để tra cứu và chuẩn hóa báo cáo.
- `PIVOT`: báo cáo tổng hợp theo 20 vùng bán hàng.
- `PVT_DATA`: dữ liệu mô hình chi tiết, phải để ẩn.

Đọc reference liên quan trước khi thay đổi:

- `references/target-hang-thang.md`: nguồn và quy tắc Target.
- `references/data-sell-in.md`: phạm vi kỳ và cấu trúc `Data`.
- `references/dmkh.md`: nguồn và cấu trúc `DMKH`.
- `references/pivot-bao-cao.md`: mô hình, công thức và bố cục `PIVOT`.
- `references/portable.md`: launcher và runtime.

## Chạy

Tại thư mục gốc dự án:

```powershell
powershell -ExecutionPolicy Bypass -File ".\Skill\skill-bao-cao\scripts\run_target_report.ps1"
```

Hoặc nhấp đúp `Bao cao Target.cmd`.

## Luồng bắt buộc

1. Chạy `scripts/extract_targets.py` để chuẩn hóa Target và lưu thêm metadata
   `MienBaoCao`, `VungBaoCao` trong staging.
2. Chạy `scripts/extract_sell_in_data.py` để lấy thực hiện theo phạm vi kỳ.
3. Chạy `scripts/extract_customers.py` để chuẩn hóa danh mục khách hàng.
4. Chạy `scripts/build_report_workbook.py` để tạo workbook nền.
5. Chạy `scripts/build_pivot_sheet.mjs` để tạo mô hình và công thức trong workbook
   PIVOT nhỏ; chạy `scripts/merge_pivot_workbook.py` để ghép vào báo cáo chính và
   ẩn `PVT_DATA`.
6. Chạy `scripts/inspect_target_workbook.mjs` để tạo ảnh kiểm tra năm sheet, trừ
   khi người dùng truyền `-SkipVisualQa`.
7. Chạy `scripts/verify_target_report.py`; chỉ bàn giao khi `problems` rỗng.

## Quy tắc cốt lõi

- Dùng đúng hai nguồn Target năm: `Target sellin YYYY.xlsx` cho NPP/B2C và
  `Target MT KA.xlsx` sheet `DATA` cho MT/KA; cả hai phải có đủ 12 tháng.
- Trong Target năm, không bỏ hai dòng tổng hợp không có `MÃ NPP`: ánh xạ dòng
  `B2C` thành mã `B2C` và dòng `Other` thành mã `0`, giữ đủ Target 12 tháng.
- Với MT/KA, áp dụng cho từng tháng đúng cách nhóm của VBA Final V6: lọc KA/MT,
  nhóm theo mã, cộng cột U trực tiếp và nhận diện Vikoda từ cột G.
- Không cho `Target allocation*.xlsx` ghi đè từng tháng. Dùng
  `Target chuan.xlsm` chỉ để đối chiếu tham chiếu; chênh lệch phải ghi trong
  audit nhưng không thay dữ liệu từ hai file năm.
- Ghi chính sách `ANNUAL_TWO_SOURCE_VBA_MTKA` cho cả 12 tháng trong audit.
- Lưu Target theo VND; Target âm trong hai nguồn năm được chuẩn hóa thành `0`
  và ghi cảnh báo kèm kỳ, mã khách hàng.
- Doanh thu Sell In chỉ lấy `Đơn hàng bán` và `Đơn trả hàng` trong cột
  `LoaiDonHang` (tương đương nghiệp vụ `Hóa đơn bán` và `Hóa đơn trả hàng`);
  loại mọi loại hóa đơn/đơn hàng khác trước khi tạo `Data` và `PVT_DATA`.
- Giữ nguyên từng dòng Sell In hợp lệ sau bộ lọc và toàn bộ DMKH; không tự xóa trùng.
- Dùng DMKH để ánh xạ khách hàng vào Miền/Vùng. Dùng metadata Target khi khách
  hàng mới chưa có trong DMKH; đưa trường hợp còn lại vào `Other`.
- Luôn ánh xạ mã hoặc tên `B2C` vào Miền/Vùng `B2C`; không được đưa Target B2C
  vào `Other`.
- Luôn ánh xạ dòng Target có tên `Other` vào Miền/Vùng `Other`; không được bỏ
  dòng này hoặc đưa sang vùng bán hàng khác.
- Tính `PIVOT` cho tháng hiện tại, cùng tháng năm trước và tháng liền trước.
- Nhận diện Vikoda khi tên sản phẩm chứa `Vikoda`; nhận diện KDT khi tên sản phẩm
  chứa `KDT`.
- Tính các chỉ số kết quả trong `PIVOT` bằng công thức, không ghi cứng.

## Test

Chạy trước khi bàn giao mọi thay đổi logic:

```powershell
python .\Skill\skill-bao-cao\scripts\run_tests.py
```

`scripts/tests/test_target_rules.py` khóa ánh xạ 20 vùng bán hàng, quy tắc
B2C/Other, cách tách vùng KA và chuẩn hóa giá trị Target.
`scripts/tests/test_sell_in_rules.py` khóa bộ lọc `LoaiDonHang`, phạm vi kỳ và
kiểu dữ liệu của sheet `Data`.

## Kiểm tra bắt buộc

- Có đúng năm sheet theo thứ tự `Target`, `Data`, `DMKH`, `PIVOT`, `PVT_DATA`.
- `PVT_DATA` ẩn; `PIVOT` hiển thị, có 20 dòng vùng, 8 dòng tổng miền và một
  `Grand Total`.
- `PIVOT` có đủ 493 công thức trong vùng `D5:T33`.
- Tổng Target, Actual, Vikoda, KDT, cùng kỳ và tháng trước tại `Grand Total`
  khớp nguồn.
- Từng dòng vùng trong `PIVOT` khớp tổng từ `PVT_DATA`.
- Không có lỗi `#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?` hoặc `#N/A`.
- Số dòng, tổng từng kỳ, kiểu dữ liệu và định dạng của `Target`, `Data`, `DMKH`
  khớp staging.
