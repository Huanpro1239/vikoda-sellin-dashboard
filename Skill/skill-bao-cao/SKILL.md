---
name: skill-bao-cao
description: Xây dựng và vận hành Bao_Cao_Sell_in.xlsx trong dự án "Bao cao Sell in"; tạo Target đủ 12 tháng từ Target sellin YYYY.xlsx và Target MT KA.xlsx, áp dụng cách nhóm MT/KA của VBA Final V6, tổng hợp Sell In năm nay/cùng kỳ, DMKH, PVT_DATA và PIVOT theo Miền/Vùng. Dùng khi cần chạy hoặc kiểm tra báo cáo, cập nhật Target/Sell In/DMKH, phân tích Actual so với Target, YoY, MoM, Vikoda/KDT, đóng gói hoặc di chuyển dự án.
---

# Skill báo cáo Sell In

## Phạm vi

Tạo `Data/File bao cao/Excel/Bao_Cao_Sell_in.xlsx` với 13 sheet, đúng thứ tự:

- `Target`: Target tất cả các tháng.
- `Data`: Sell In từ đầu năm đến tháng hiện tại và cùng kỳ năm trước.
- `DMKH`: danh mục khách hàng để tra cứu và chuẩn hóa báo cáo.
- `PIVOT`: báo cáo tổng hợp theo 20 vùng bán hàng, bố cục theo file mẫu
  `Sell_in_report_chuan.xlsb`.
- `PVT_DATA`: dữ liệu mô hình chi tiết, phải để ẩn.
- 8 sheet `BC_<Miền>`: `BC_Miền Bắc`, `BC_Miền Nam`, `BC_Miền Trung 1`,
  `BC_Miền Trung 2`, `BC_KA`, `BC_MT`, `BC_B2C`, `BC_Other`. Mỗi sheet là báo
  cáo chi tiết ba cấp Vùng → Khách hàng → Sản phẩm, có thể thu gọn.

Đọc reference liên quan trước khi thay đổi:

- `references/target-hang-thang.md`: nguồn và quy tắc Target.
- `references/data-sell-in.md`: phạm vi kỳ và cấu trúc `Data`.
- `references/dmkh.md`: nguồn và cấu trúc `DMKH`.
- `references/pivot-bao-cao.md`: mô hình, công thức và bố cục `PIVOT` và `BC_`.
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
5. Chạy `scripts/build_pivot_sheet.py` để dựng `PVT_DATA`, `PIVOT` và 8 sheet
   `BC_<Miền>` ngay trong workbook báo cáo, rồi ẩn `PVT_DATA`. Mô hình gộp số
   liệu nằm ở `scripts/report_model.py`.
6. Chạy `scripts/inspect_target_workbook.mjs` để tạo ảnh kiểm tra, trừ khi
   truyền `-SkipVisualQa`. Bước này **tùy chọn**: cần Node kèm
   `@oai/artifact-tool`, không có thì tự bỏ qua.
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
- `PIVOT` giữ đúng bố cục file mẫu: dòng 1 tiêu đề, dòng 2 kỳ báo cáo, dòng 3
  nhóm cột, dòng 4 tên cột, dòng 5 số thứ tự cột `(1)`…`(17)`, dữ liệu từ dòng 6.
  Tên cột phần trăm phải tham chiếu số thứ tự, ví dụ `Total % (3) vs (1)`.
- Tiền lưu đủ VND, hiển thị triệu đồng bằng định dạng `#,##0,,`. Không chia sẵn
  giá trị trong ô vì sẽ phát sinh sai số làm tròn khi cộng.
- Trong sheet `BC_`, dòng vùng và dòng khách hàng dùng `SUMIFS` về `PVT_DATA`;
  dòng sản phẩm là dữ liệu lá nên ghi thẳng giá trị.
- Gom khách hàng trong `BC_` theo **mã**, không theo tên hiển thị. Một mã có thể
  có hai cách viết tên giữa Sell In và Target; tách đôi sẽ làm dòng khách hàng
  đếm gộp trong khi dòng sản phẩm con chỉ có một phần.

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

- Có đúng 13 sheet theo thứ tự `Target`, `Data`, `DMKH`, `PIVOT`, `PVT_DATA`
  rồi 8 sheet `BC_<Miền>` theo thứ tự miền của báo cáo.
- `PVT_DATA` ẩn; `PIVOT` hiển thị, có 20 dòng vùng, 8 dòng tổng miền và một
  `Grand Total` tại dòng 34.
- `PIVOT` có đủ 493 công thức trong vùng `C6:S34` và đủ số thứ tự cột ở dòng 5.
- Tổng Target, Actual, Vikoda, KDT, cùng kỳ và tháng trước tại `Grand Total`
  khớp nguồn.
- Từng dòng vùng trong `PIVOT` khớp tổng từ `PVT_DATA`.
- Mỗi sheet `BC_` có đủ các vùng của miền đó, đúng thứ tự; mỗi dòng khách hàng
  bằng tổng các dòng sản phẩm con.
- `Grand Total` của từng sheet `BC_` khớp dòng tổng miền tương ứng trong `PIVOT`;
  tổng 8 sheet `BC_` khớp `Grand Total` của `PIVOT`.
- Bộ kiểm tra tự tính lại công thức bằng `scripts/formula_eval.py`, không đọc
  giá trị Excel đệm sẵn — openpyxl không ghi kèm giá trị đã tính.
- Không có lỗi `#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?` hoặc `#N/A`.
- Số dòng, tổng từng kỳ, kiểu dữ liệu và định dạng của `Target`, `Data`, `DMKH`
  khớp staging.
