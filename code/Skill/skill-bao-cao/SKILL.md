---
name: skill-bao-cao
description: Xây dựng và vận hành Bao_Cao_Sell_in.xlsx cùng dashboard Vikoda_SellIn_PowerBI.pbip trong dự án "Bao cao Sell in"; tạo Target đủ 12 tháng từ Target sellin YYYY.xlsx và Target MT KA.xlsx, áp dụng cách nhóm MT/KA của VBA Final V6, tổng hợp Sell In năm nay/cùng kỳ, DMKH, PVT_DATA và PIVOT theo Miền/Vùng. Dùng khi cần chạy hoặc kiểm tra báo cáo, cập nhật Target/Sell In/DMKH, phân tích Actual so với Target, YoY, MoM, Vikoda/KDT, dự báo, đóng gói hoặc di chuyển dự án.
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

Đồng thời tạo `Data/File bao cao/PowerBI/Vikoda_SellIn_PowerBI.pbip` gồm semantic
model và bốn trang `CEO | Tổng quan`, `Kế hoạch & dự báo`, `Vùng & miền`,
`Khách hàng & sản phẩm`.

Đọc reference liên quan trước khi thay đổi:

- `references/target-hang-thang.md`: nguồn và quy tắc Target.
- `references/data-sell-in.md`: phạm vi kỳ và cấu trúc `Data`.
- `references/dmkh.md`: nguồn và cấu trúc `DMKH`.
- `references/pivot-bao-cao.md`: mô hình, công thức và bố cục `PIVOT` và `BC_`.
- `references/portable.md`: launcher và runtime.

## Chạy

Tại thư mục gốc dự án:

```powershell
powershell -ExecutionPolicy Bypass -File ".\code\Skill\skill-bao-cao\scripts\run_target_report.ps1"
```

Hoặc nhấp đúp `Chay CT\Bao cao Target.cmd`. Luồng này mặc định tạo cả Excel và
Power BI; dùng `-SkipPowerBI` chỉ khi cần kiểm tra riêng workbook.

Dựng lại dashboard:

```powershell
powershell -ExecutionPolicy Bypass -File ".\code\Skill\skill-bao-cao\scripts\run_powerbi_dashboard.ps1"
```

Hoặc nhấp đúp `Chay CT\Bao cao Power BI.cmd`.

### Tự động phát hiện dữ liệu cũ

`scripts/pipeline_freshness.py` là bản logic **duy nhất** so mốc thời gian giữa
bốn chặng: ERP → workbook Sell In theo tháng → staging JSON → Excel/CSV. Cả hai
luồng PowerShell dot-source `scripts/lib/Pipeline.ps1` để gọi nó, không được
chép lại phần so sánh này sang PowerShell.

- Chặng `tach_data` so **theo từng kỳ**, ghép `BCDonHangBanTrongKyNPP_*_T{M}_{YYYY}.xlsm`
  với `Sell in T{MM}_{YYYY}.xlsx`. Tách data chạy tăng dần nên workbook tháng cũ
  mang mốc thời gian cũ là bình thường; so cả thư mục sẽ báo cũ sai.
- Chặng sau kế thừa trạng thái chặng trước: staging cũ thì Excel và Power BI đều
  phải dựng lại kể cả khi mốc riêng của chúng còn mới.
- `run_target_report.ps1` tự gọi lại Tach data khi cần; `run_powerbi_dashboard.ps1`
  giao trọn cho `run_target_report.ps1` khi staging cũ, tránh dựng gói hai lần.
- Tham số thoát hiểm: `-SkipAutoRefresh` (không tự chạy lại), `-Force` (dựng lại
  dù đã mới), `-NoOpen` (không mở Power BI Desktop).
- File tạm Excel `~$*.xlsx` bị bỏ qua; sai lệch dưới `TOLERANCE_SECONDS` (2 giây)
  không tính là cũ.

### Dọn dẹp

`scripts/cleanup_workspace.py` (launcher `Chay CT\Don dep.cmd`) xóa rác tái tạo
được. Thiết kế **chặn mặc định**, hai lớp:

1. Chỉ mẫu ghi trong `CLEANUP_RULES` mới thành ứng viên.
2. Mọi ứng viên phải vượt `PROTECTED_PATHS`; trúng vùng cấm thì bị từ chối và
   ghi vào phần `DA TU CHOI` của báo cáo, không im lặng bỏ qua.

Thêm quy tắc mới thì phải thêm test trong `tests/test_cleanup_workspace.py`
khẳng định dữ liệu nguồn còn nguyên sau `--confirm`. Mặc định là chạy thử;
`drop_nested()` loại ứng viên nằm trong thư mục đã chọn để báo cáo không phình
lên hàng trăm dòng và dung lượng không bị đếm hai lần.

## Dashboard Power BI

- `scripts/build_powerbi_package.py` tạo sáu bảng CSV: `DimDate`, `DimCustomer`,
  `DimProduct`, `DimTerritory`, `FactSellIn`, `FactTarget`.
- Semantic model phải có 38 measure DAX và bảy quan hệ many-to-one. Doanh thu/Target
  hiển thị theo triệu đồng; sản lượng K/T/B lấy `Số lượng ÷ Quy cách` từ DMSP và có
  chỉ tiêu riêng cho dòng chưa quy đổi, cùng kỳ và tăng trưởng YoY cho từng đơn vị.
  Các measure
  quan trọng gồm Actual, Target, Gap, tỷ lệ đạt, YoY, MoM, Vikoda/KDT, run-rate,
  dự báo cuối tháng, doanh thu/ngày cần đạt và Target ba tháng tới.
- Visual dùng theme Vikoda và phương pháp DAR của Datapot: trang 1 là Dashboard,
  trang 2–3 là Analysis theo chủ đề, trang 4 là Reporting chi tiết. KPI chỉ được đặt
  trên Dashboard; không lặp KPI hoặc cùng một biểu đồ ở các trang sau. Hướng thiết kế
  tham khảo DaTaxan/Datapot nhưng không phụ thuộc asset hay template bên ngoài.
- Canvas bắt buộc 1280×720 theo kiểu ERP; mỗi trang có header navy, sidebar trái rộng
  220 px với menu; Dashboard đặt bốn KPI dọc bên trái và chỉ có slicer Năm/Kỳ. Các
  trang Analysis/Reporting dùng sidebar cho bộ lọc theo ngữ cảnh, không có KPI.
  Rail có bốn `actionButton` dùng `PageNavigation`; trang hiện tại tô cyan. Slicer
  dùng nền navy, giá trị chọn màu cyan, bo góc 6 px và cùng lưới 196×60 px; dropdown
  phải hiện trọn chữ, các slicer cách nhau 8 px và không được chạm hoặc bị KPI che; không
  dùng card trắng tách rời rail.
  Biểu đồ chính phải rộng tối thiểu 1028 px, tắt data label khi nhiều series.
  Chart phải hiện tiêu đề trục X/Y, gridline và nhãn dễ đọc; trục tháng phải dùng
  `MonthAxis` dạng phân loại `YY/MM` để tránh khoảng trắng giữa các kỳ; bảng phẳng phải giới hạn
  số cột, có header/total rõ ràng. Doanh thu triệu đồng và sản lượng quản trị không
  hiển thị số thập phân; trục tháng phải tăng cỡ chữ, mật độ nhãn và nhãn dữ liệu.
  So sánh Actual/Target phải dùng cột dọc kết hợp đường `% đạt` trên trục phụ (vai trò
  combo `Y`/`Y2`, không dùng `ColumnY`/`LineY`). Donut chỉ dùng cho quan hệ part-to-whole;
  waterfall dùng để làm rõ đóng góp gap; trang sản lượng có xu hướng Két/Thùng/Bình.
  Trang Reporting cuối cùng dùng một bảng tự giãn cột kín toàn bộ vùng nội dung.
  Khi không có bộ lọc ngày, measure mặc định về kỳ dữ liệu mới nhất nhưng vẫn tôn
  trọng slicer lịch sử.
- Partition M ghi **đường dẫn tuyệt đối** tới CSV trong `PowerBI/Data`, tính lại bằng
  `Path.resolve()` ở mỗi lần dựng. Chuyển thư mục dự án sang ổ/máy khác thì phải chạy
  lại builder một lần để vá đường dẫn; copy riêng thư mục PowerBI sẽ không refresh được.
- Dự án **không** giữ file `.pbix`. PBIX là bản chụp tĩnh, không script nào ghi được
  vào nó nên sau mỗi lần cập nhật dữ liệu là lệch ngay mà không có dấu hiệu.
  `remove_stale_pbix()` xóa file này nếu còn sót từ quy trình cũ. Cần chia sẻ thì Publish.
- Builder giữ lại `.pbi/localSettings.json` và `.pbi/editorSettings.json` qua mỗi lần
  dựng (`preserve_local_settings`) để Power BI Desktop không hỏi lại quyền đọc file CSV.
  Cố tình **không** giữ `.pbi/cache.abf`: đó là số liệu lần trước, để lại sẽ hiện số cũ
  trước khi kịp Refresh.
- Sau khi mở project được dựng lại, người vận hành chỉ cần chọn **Refresh**.
  Power BI Desktop chỉ cần cho bước mở/refresh/publish, không cần cho bước sinh package.
- Không chỉnh tay CSV, `model.bim` hoặc PBIR nếu thay đổi có thể được biểu diễn trong
  builder; lần chạy tiếp theo sẽ sinh lại toàn bộ package.

## Phương án 2 - Power Query

Workbook đã có query `PQ_PVT_DATA` và `PQ_PIVOT`; sheet `PQ_HuongDan` mô tả cách dùng.
Chọn **Data > Refresh All** để Power Query đọc bảng mô hình chuẩn `tblPVTDataPython`
và tính lại tổng theo Miền/Vùng. Đây là lớp đối soát; luồng Python vẫn chịu trách nhiệm
đọc nguồn, chuẩn hóa Target/Data/DMKH và dựng báo cáo chi tiết.

Query chỉ dùng `Excel.CurrentWorkbook()`/`Data Source=$Workbook$`, tuyệt đối không ghi
đường dẫn máy tạo file. Vì vậy workbook có thể được copy độc lập sang máy khác.

Nếu luồng Python tạo lại toàn bộ workbook, chạy:

```powershell
powershell -ExecutionPolicy Bypass -File ".\code\Skill\skill-bao-cao\scripts\add_powerquery_option2.ps1"
```

Hoặc chỉ định workbook ở vị trí bất kỳ bằng tham số `-WorkbookPath`.

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
   `@oai/artifact-tool`, không có hoặc Node/V8 bị lỗi thì cảnh báo và tiếp tục.
   Luồng vận hành mặc định bỏ qua; truyền `-EnableVisualQa` khi cần soi giao diện.
7. Chạy `scripts/verify_target_report.py`; chỉ bàn giao khi `problems` rỗng.
8. Chạy `scripts/add_powerquery_option2.ps1` để gắn Power Query portable vào workbook.
9. Chạy `scripts/build_powerbi_package.py` để tạo lại project PBIP và bộ dữ liệu hình sao,
   trừ khi người vận hành chủ động truyền `-SkipPowerBI`.

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
python .\code\Skill\skill-bao-cao\scripts\run_tests.py
```

`scripts/tests/test_target_rules.py` khóa ánh xạ 20 vùng bán hàng, quy tắc
B2C/Other, cách tách vùng KA và chuẩn hóa giá trị Target.
`scripts/tests/test_sell_in_rules.py` khóa bộ lọc `LoaiDonHang`, phạm vi kỳ và
kiểu dữ liệu của sheet `Data`.
`scripts/tests/test_powerbi_package.py` khóa cấu trúc PBIP/PBIR, sáu bảng dữ liệu,
38 measure, bảy quan hệ và bốn trang dashboard.

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
- Mỗi sheet `BC_` có đủ 10 thẻ KPI ở hàng 5-8, gồm cả `TARGET VIKODA` và
  `% ĐẠT TG VIKODA`.
- Tô màu điều kiện không được phủ lên dòng `Grand Total` nền xanh đậm.
- `Grand Total` của từng sheet `BC_` khớp dòng tổng miền tương ứng trong `PIVOT`;
  tổng 8 sheet `BC_` khớp `Grand Total` của `PIVOT`.
- Bộ kiểm tra tự tính lại công thức bằng `scripts/formula_eval.py`, không đọc
  giá trị Excel đệm sẵn — openpyxl không ghi kèm giá trị đã tính.
- Không có lỗi `#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?` hoặc `#N/A`.
- Số dòng, tổng từng kỳ, kiểu dữ liệu và định dạng của `Target`, `Data`, `DMKH`
  khớp staging.
- `refresh_manifest.json` của Power BI báo đủ sáu bảng, 20 vùng, 38 measure và bảy
  quan hệ; tổng Actual/Target/Vikoda/cùng kỳ/tháng trước khớp báo cáo verification.
- Project `.pbip` mở được trong Power BI Desktop, đủ bốn trang và không thiếu visual.
