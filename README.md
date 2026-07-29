# Bao cao Sell in

Ba đầu ra tự động cho dữ liệu bán hàng Vikoda:

1. **Tách data Sell In** — đọc file ERP hàng tháng, lọc và chuẩn hóa thành
   workbook `Sell in TMM_YYYY.xlsx` theo tháng, đồng thời phát hiện khách hàng
   mới cần duyệt vào danh mục.
2. **Báo cáo Sell In** — dựng `Bao_Cao_Sell_in.xlsx` gồm sheet tổng hợp `PIVOT`
   theo 20 vùng bán hàng và 8 sheet báo cáo chi tiết theo miền.
3. **Dashboard Power BI** — dựng project `Vikoda_SellIn_PowerBI.pbip`, mô hình dữ
   liệu hình sao và bốn trang phân tích dành cho CEO/quản lý kinh doanh.

## Chạy

Nhấp đúp launcher trong thư mục `Chay CT`:

| File | Việc |
| --- | --- |
| `Chay CT/Bao cao Power BI.cmd` | Cập nhật tất cả rồi mở Power BI Desktop — dùng file này là đủ |
| `Chay CT/Bao cao Target.cmd` | Như trên nhưng luôn dựng lại cả workbook Excel |
| `Chay CT/Tach data.cmd` | Chỉ chạy riêng bước tách Sell In hàng tháng |
| `Chay CT/Tach data - Chuyen giao.cmd` | Bản tách data cho máy khác, chỉ cần Python |
| `Chay CT/Don dep.cmd` | Dọn file tạm và bản nháp; mặc định chỉ liệt kê |

Không cần nhớ thứ tự nữa. Hai launcher đầu tự so mốc thời gian ERP → workbook
tháng → staging → CSV, rồi chỉ chạy lại đúng những chặng đã cũ. Thay file ERP
xong nhấp đúp `Bao cao Power BI.cmd` là ra số mới.

Ép làm lại kể cả khi dữ liệu đã mới nhất, hoặc tắt phần tự động:

```powershell
.\Chay CT\Bao cao Power BI.cmd -Force            # dựng lại gói Power BI từ đầu
.\Chay CT\Bao cao Power BI.cmd -NoOpen           # không mở Power BI Desktop
.\Chay CT\Bao cao Power BI.cmd -SkipAutoRefresh  # không tự chạy lại chặng cũ
```

Xem trước chặng nào đang cũ mà không chạy gì:

```powershell
python .\code\Skill\skill-bao-cao\scripts\pipeline_freshness.py --project-root . --format text
```

Ép làm lại một tháng hoặc toàn bộ:

```powershell
.\Chay CT\Tach data.cmd -ForcePeriod 2026-07
.\Chay CT\Tach data.cmd -ForceAll
```

## Yêu cầu máy

Chỉ cần **Python 3.8+**. Script tự tìm theo thứ tự: tham số
`-PythonExecutable`, `.runtime\python\python.exe` trong thư mục dự án, runtime
Codex, `py.exe -3`, rồi `python.exe` trong PATH. Nếu Python hệ thống chưa có
`openpyxl`, script tự dùng bản vendored sẵn trong
`code\Skill\skill-bao-cao\scripts\vendor`.

Node kèm `@oai/artifact-tool` là **tùy chọn**, chỉ dùng để render ảnh preview.
Không có Node thì bỏ qua ảnh, mọi bước dựng file và kiểm tra vẫn chạy đủ.
Launcher `Chay CT/Bao cao Target.cmd` mặc định bỏ qua preview Node để tránh lỗi V8
trên máy chuyển giao; bước kiểm tra dữ liệu, công thức và định dạng vẫn chạy đầy đủ.
Muốn chạy riêng preview giao diện, dùng thêm tham số `-EnableVisualQa`; không cần cho
quy trình vận hành hằng ngày.

Để mở, làm mới và phát hành dashboard cần **Power BI Desktop**. Việc tạo project PBIP
và bộ dữ liệu CSV chỉ cần Python; không bắt buộc Power BI Desktop phải được mở khi chạy.

## Dashboard Power BI

Thư mục `Data/File bao cao/PowerBI/` chỉ có một bản bàn giao duy nhất:
`Vikoda_SellIn_PowerBI.pbip`. Dự án cố tình **không** giữ file `.pbix` — bản
chụp đó không có cách nào tự cập nhật theo dữ liệu, nên chỉ tạo rủi ro đọc nhầm
số cũ. Cần chia sẻ cho người khác thì Publish lên Power BI Service.
Bốn trang báo cáo gồm:

- **CEO | Tổng quan**: bốn KPI cốt lõi, Actual–Target theo tháng, cơ cấu doanh thu và miền tạo gap.
- **Kế hoạch & cảnh báo**: run-rate, phần doanh thu cần bù và khả năng hoàn thành theo miền.
- **Vùng & sản lượng**: xu hướng Két/Thùng/Bình, cơ cấu sản lượng và vùng cần ưu tiên.
- **Chi tiết KH & SP**: trang Reporting dạng bảng đầy đủ để lọc, sort và ra quyết định.

Giao diện dùng chuẩn executive 1280×720 kiểu ERP và kể chuyện theo DAR
(`Dashboard → Analysis → Reporting`). KPI chỉ xuất hiện trên trang CEO và được xếp
dọc ở sidebar trái; nhờ đó biểu đồ chính dùng toàn bộ chiều rộng vùng nội dung.
Bộ lọc trang CEO chỉ giữ Năm/Kỳ, còn các trang Analysis/Reporting mới bổ sung Miền,
Vùng và Nhóm sản phẩm theo đúng ngữ cảnh phân tích. Toàn bộ slicer dùng nền navy,
giá trị đang chọn màu cyan và kích thước đồng nhất 196×60 px để dropdown hiện trọn chữ.
Các slicer cách đều 8 px, tách khỏi khối KPI để không chồng lấn hoặc bị che. Bốn nút
chuyển trang thật được đặt trên rail trái, trong đó trang hiện tại được tô cyan.
Trục X/Y có tiêu đề và gridline rõ; bảng phẳng được chuẩn chiều rộng/chiều cao.
Doanh thu và sản lượng quản trị đều làm tròn không có số thập phân. Trục tháng dùng
nhãn phân loại `YY/MM` theo thứ tự thời gian để loại khoảng trắng giữa các kỳ không có dữ liệu;
so sánh Actual/Target dùng cột dọc kết hợp
đường `% đạt` trên trục phụ. Donut chỉ dùng cho cơ cấu, waterfall dùng để chỉ ra đóng
góp dương/âm vào gap; bảng Reporting tự giãn kín trang, dòng tổng navy và zebra fill.
Khi chưa chọn
Năm/Kỳ, KPI tự mặc định về kỳ dữ liệu mới nhất; chọn slicer để phân tích lịch sử.

Quy trình vận hành chuẩn — hai bước:

1. Cập nhật file ERP/Target/DMKH/DMSP rồi nhấp đúp `Chay CT/Bao cao Power BI.cmd`.
   Launcher tự tách data nếu ERP mới hơn, tự dựng lại staging và Excel nếu cần,
   dựng gói Power BI, rồi mở Power BI Desktop.
2. Trong Power BI Desktop bấm **Refresh**. Xong.

Không còn bước Save As, không còn file PBIX phải đồng bộ tay. Nếu chặng nào đã
mới nhất, script bỏ qua chặng đó thay vì chạy lại vô ích — nhờ vậy `cache.abf`
và chữ ký cho phép đọc file trong `.pbi/` được giữ nguyên, mở lên không bị hỏi
lại quyền truy cập.

Khi cần Publish lên Power BI Service để chia sẻ, làm sau bước Refresh.

Project dùng sáu bảng CSV trong thư mục `PowerBI/Data`, 38 measure DAX và bảy quan hệ
many-to-one. Doanh thu/Target hiển thị theo triệu đồng; sản lượng K/T/B lấy `Số lượng ÷
Quy cách` từ DMSP, có so sánh cùng kỳ và tăng trưởng YoY riêng cho Két/Thùng/Bình.
Biểu đồ Target dùng cột dọc Actual–Target kết hợp đường `% đạt`; dashboard áp dụng
phương pháp DAR của Datapot để tránh lặp KPI và biểu đồ.
Toàn bộ được sinh lại tự
động; không chỉnh thủ công CSV vì lần chạy kế tiếp sẽ ghi lại. Hướng visual tham khảo danh mục template công khai của
[DaTaxan](https://dataxan.com/vi/mau-bao-cao-power-bi/) và
[Datapot – phương pháp DAR](https://datapot.vn/xay-dung-bao-cao-power-bi-theo-phuong-phap-dar/),
đồng thời giữ màu và logic quản trị riêng của Vikoda.

## Cấu trúc

```
code/             toàn bộ mã chạy, quy tắc và prompt
  Skill/          mã chạy và quy tắc nghiệp vụ — nguồn chuẩn duy nhất
    sell-in-monthly/  quy trình tách data Sell In
    skill-bao-cao/    quy trình dựng báo cáo
  Prompt/         yêu cầu mẫu để vận hành, kiểm tra và cải tiến
Chay CT/          các launcher CMD cho người vận hành
Data/             dữ liệu nguồn, kết quả, nhật ký và vùng làm việc
```

Chi tiết đọc `code/Skill/<tên skill>/SKILL.md` và thư mục `references` của skill đó.
Không đặt mã chạy hoặc prompt trong `Data`.

### Phương án 2: Power Query

Workbook `Data/File bao cao/Excel/Bao_Cao_Sell_in.xlsx` có thêm hai query
`PQ_PVT_DATA`, `PQ_PIVOT` và sheet hướng dẫn `PQ_HuongDan`. Sau khi phương án Python
cập nhật các sheet nguồn/mô hình, mở workbook trong Excel và chọn **Data > Refresh All**.
`PQ_PIVOT` sẽ tính lại các tổng Miền/Vùng để đối soát độc lập với sheet `PIVOT`.

Hai query dùng `Excel.CurrentWorkbook()` và connection `Data Source=$Workbook$`; không
lưu đường dẫn ổ đĩa. Có thể copy riêng workbook sang máy/thư mục khác rồi dùng
**Refresh All**, miễn máy đích dùng Excel có Power Query.

Khi dựng lại workbook hoàn toàn bằng Python, chạy
`code/Skill/skill-bao-cao/scripts/add_powerquery_option2.ps1` một lần để gắn lại Power Query.
Script cũng nhận `-WorkbookPath "D:\thu-muc-khac\Bao_Cao_Sell_in.xlsx"` khi workbook
nằm ngoài cấu trúc dự án.

### Thư mục trong `Data`

| Thư mục | Nội dung |
| --- | --- |
| `Data ERP` | Workbook ERP nguồn |
| `out put/Sell in hang  thang` | Workbook Sell In theo tháng |
| `Danh muc KH`, `Danh muc SP`, `Danh Sach Sales`, `Target` | Dữ liệu tham chiếu |
| `File bao cao/Excel` | `Bao_Cao_Sell_in.xlsx` |
| `File bao cao/PowerBI` | Project PBIP, semantic model, report và CSV nguồn (không có PBIX) |
| `Logs` | Nhật ký cần giữ, gồm trạng thái tăng dần |
| `Work` | Staging, preview, verification — tạo lại được |

Hai chỗ trong `Data` **không** được xóa tùy tiện:

- `Data/Logs/Tach data logs/incremental_state.json` — mốc so sánh tăng dần. Mất
  file này thì lần chạy sau phải đối chiếu lại toàn bộ nguồn để tạo mốc mới.
- `Data/Work/sell_in/new_customers` — quyết định duyệt khách hàng mới của người
  vận hành, giữ cho tới khi các dòng `DUYET` đã được áp dụng.

## Dọn dẹp

```powershell
.\Chay CT\Don dep.cmd            # chỉ liệt kê những gì sẽ xóa
.\Chay CT\Don dep.cmd -Confirm   # xóa thật
.\Chay CT\Don dep.cmd -Verbose   # liệt kê đầy đủ thay vì vài ví dụ
```

Dọn bản nháp Power BI, ảnh chụp gỡ lỗi, bytecode Python, file tạm Excel và file
`.pbix` sót lại. Script chạy theo nguyên tắc chặn mặc định: chỉ những mẫu ghi rõ
trong `CLEANUP_RULES` mới bị xóa, và mọi ứng viên còn phải vượt qua hàng rào
`PROTECTED_PATHS` — trong đó có sẵn hai chỗ cấm ở trên cùng toàn bộ dữ liệu
nguồn. Chạy nhầm ở thư mục không phải dự án thì script tự dừng.

## Test

```powershell
python .\code\Skill\sell-in-monthly\scripts\run_tests.py
python .\code\Skill\skill-bao-cao\scripts\run_tests.py
```

Chạy cả hai trước khi bàn giao bất kỳ thay đổi logic nào.

## Cải tiến

Đọc `code/Prompt/cai-tien-du-an.md` trước khi sửa. Nguyên tắc quan trọng nhất: logic
dùng chung giữa luồng chính và luồng chuyển giao chỉ được có **một bản**.

Git theo dõi `code/` và `Chay CT/`. Dữ liệu, thư viện vendored và file `.exe`
đóng gói nằm trong `.gitignore` vì không diff được và làm repo phình nhanh.
