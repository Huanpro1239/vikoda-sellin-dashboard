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
| `Chay CT/Kiem tra.cmd` | Chạy toàn bộ 169 test của cả hai skill |

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

## Google Drive và nguồn Looker

Mỗi lần chạy `Tach data.cmd` — và cả `Tach data - Chuyen giao.cmd` trên máy khác
— bước cuối tải **toàn bộ** file `Sell in T*.xlsx` lên thư mục Drive dùng chung, kể
cả tháng không thay đổi, để Drive luôn khớp local:

<https://drive.google.com/drive/folders/1zJHdr3L9g9VAQVYM8KR_Bl0jpV2FClv5>

Tải bằng `rclone` gọi thẳng Drive API, đích xác định bằng **folder ID**. Vì vậy máy
đích **không cần cài Google Drive for Desktop** và mọi máy chắc chắn đẩy vào đúng một
thư mục. Việc phải làm một lần trên mỗi máy: đặt `rclone.exe` vào `.runtime\rclone\`
rồi `rclone config` tạo remote tên `vikoda-drive`. Hướng dẫn từng bước:
`code/Skill/sell-in-monthly/references/google-drive-rclone.md`.

Dùng `rclone copy`, **không** `sync`. `sync` sẽ xóa mọi thứ trong thư mục Drive mà
local không có — kể cả Google Sheet bạn nạp CSV vào để vẽ Looker. `copy` chỉ thêm và
ghi đè, đồng thời tự bỏ qua file không đổi nên vẫn đối chiếu cả thư mục mà chỉ
truyền phần khác.

Sau khi tải, script gọi `rclone lsjson` đếm lại số file trong thư mục Drive rồi so
với số mong đợi. Chưa cài rclone thì in hướng dẫn và vẫn hoàn tất, file cục bộ đã đủ.

Kèm theo là một CSV gộp tất cả các tháng, `Sell in tong hop.csv`, dựng bởi
`code\Skill\sell-in-monthly\scripts\build_looker_dataset.py`. Cần file này vì
Looker Studio **không** đọc được `.xlsx` trên Drive — nguồn dùng được chỉ có
Google Sheets, connector File Upload (CSV) hoặc BigQuery. CSV có thêm cột
`KyBaoCao` dạng `YYYY-MM`, `NgayHoaDon` dạng `YYYY-MM-DD`, số ghi thuần, UTF-8
không BOM.

Cách nối vào Looker, khuyến nghị đi qua Google Sheets để khỏi tải lại tay: tạo
một Google Sheet, `Tệp > Nhập > chọn Sell in tong hop.csv trên Drive > Thay thế
trang tính hiện tại`, rồi trong Looker dùng connector Google Sheets. Các tháng
sau chỉ cần nhập lại đúng file đó, báo cáo giữ nguyên.

```powershell
.\Chay CT\Tach data.cmd -SkipGoogleDrive     # chỉ tạo file cục bộ
.\Chay CT\Tach data.cmd -SkipLookerDataset   # không dựng CSV gộp
.\Chay CT\Tach data.cmd -DriveFolderId "https://drive.google.com/drive/folders/XXXX"
.\Chay CT\Tach data.cmd -RclonePath "C:\Tools\rclone.exe"
```

Trên máy chuyển giao, tham số là `--skip-google-drive`, `--skip-looker-dataset`,
`--drive-folder-id`, `--rclone-remote`, `--rclone`; hoặc
`set TACH_DATA_SKIP_DRIVE=1` trước khi chạy.

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
Sáu trang báo cáo kể một mạch liền — đạt hay hụt, vì kênh nào, vì sản phẩm nào,
vì địa bàn nào, số chi tiết, rồi làm gì tiếp:

- **01. Tổng quan điều hành**: bốn KPI cốt lõi, Actual–cùng kỳ LY–Target theo tháng, cơ cấu doanh thu theo nhóm sản phẩm và theo kênh, waterfall miền tạo gap.
- **02. Kênh & khách hàng**: doanh thu và tăng trưởng theo kênh, doanh thu theo hệ thống MT, bảng xếp hạng khách hàng, khách mới so với khách ngừng mua.
- **03. Sản phẩm & danh mục**: hàng Vikoda so với hàng thương mại KDT, SKU dẫn đầu, SKU tụt mạnh nhất, cơ cấu theo thương hiệu.
- **04. Vùng miền & sản lượng**: xu hướng Két/Thùng/Bình, treemap tỷ trọng Miền → Vùng, vùng đạt Target thấp nhất, cơ cấu sản lượng, độ phủ khách hàng và danh mục.
- **05. Chi tiết KH & SP**: trang Reporting dạng bảng đầy đủ để lọc, sort và ra quyết định.
- **06. Kế hoạch & khuyến nghị**: run-rate, gap cần bù và áp lực doanh thu mỗi ngày theo vùng, kèm khối hướng dẫn đọc số và giao việc.

Chưa có bản đồ tỉnh/thành vì cột `Tỉnh/Thành` trong DMKH gần như bỏ trống. Khi
DMKH khai báo đủ tỉnh, đổi treemap trang 04 sang `filledMap` là chạy được ngay.

Giao diện dùng chuẩn executive 1280×720 kiểu ERP và kể chuyện theo DAR
(`Dashboard → Analysis → Reporting`). KPI chỉ xuất hiện trên trang Tổng quan và được xếp
dọc ở sidebar trái; nhờ đó biểu đồ chính dùng toàn bộ chiều rộng vùng nội dung.
Bộ lọc trang Tổng quan chỉ giữ Năm/Kỳ, còn các trang Analysis/Reporting mới bổ sung Miền,
Vùng, Kênh, Loại khách hàng, Nhóm sản phẩm và ĐVT theo đúng ngữ cảnh phân tích. Toàn bộ
slicer dùng nền navy, giá trị đang chọn màu cyan và kích thước đồng nhất 196×60 px để
dropdown hiện trọn chữ. Các slicer cách đều 8 px, tách khỏi khối KPI để không chồng lấn
hoặc bị che. Sáu nút chuyển trang thật được đặt trên rail trái, trong đó trang hiện tại
được tô cyan.
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

Project dùng sáu bảng CSV trong thư mục `PowerBI/Data`, 51 measure DAX và bảy quan hệ
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
  run_all_tests.py  gọi runner test của mọi skill trong một lệnh
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
| `Work/sell_in/looker` | CSV gộp tất cả các tháng, nguồn cho Looker Studio |
| `Danh muc KH`, `Danh muc SP`, `Danh Sach Sales`, `Target` | Dữ liệu tham chiếu |
| `File bao cao/Excel` | `Bao_Cao_Sell_in.xlsx` |
| `File bao cao/PowerBI` | Project PBIP, semantic model, report và CSV nguồn (không có PBIX) |
| `Logs` | Nhật ký cần giữ, gồm trạng thái tăng dần |
| `Work` | Staging, preview, verification — tạo lại được |

Ba chỗ **không** được xóa tùy tiện:

- `Data/Logs/Tach data logs/incremental_state.json` — mốc so sánh tăng dần. Mất
  file này thì lần chạy sau phải đối chiếu lại toàn bộ nguồn để tạo mốc mới.
- `Data/Work/sell_in/new_customers` — quyết định duyệt khách hàng mới của người
  vận hành, giữ cho tới khi các dòng `DUYET` đã được áp dụng.
- `.runtime/rclone/` — `rclone.exe` và cấu hình remote đã đăng nhập Google. Mất
  thì phải tải lại và `rclone config` lại. Không được git theo dõi.
- `Chay CT/drive.conf` — chỉ có khi bạn muốn đổi thư mục Drive đích cho riêng máy
  này. Cố tình không được git theo dõi.

## Dọn dẹp

```powershell
.\Chay CT\Don dep.cmd            # chỉ liệt kê những gì sẽ xóa
.\Chay CT\Don dep.cmd -Confirm   # xóa thật
.\Chay CT\Don dep.cmd -Verbose   # liệt kê đầy đủ thay vì vài ví dụ
```

Dọn bản nháp Power BI, ảnh chụp gỡ lỗi, bytecode Python, file tạm Excel, file
`.pbix` sót lại, cùng các bản tái tạo được trong `Data/Work`: CSV gộp Looker
(~19 MB), staging JSON của tháng, ảnh preview và report đối soát của lần chạy
trước.

Script chạy theo nguyên tắc chặn mặc định: chỉ những mẫu ghi rõ trong
`CLEANUP_RULES` mới bị xóa, và mọi ứng viên còn phải vượt qua hàng rào
`PROTECTED_PATHS` — trong đó có sẵn ba chỗ cấm ở trên cùng toàn bộ dữ liệu nguồn.
Có thêm một chốt chặn thứ hai: file đuôi `.csv`/`.json`/`.py`/`.xlsx`... bị từ chối
mặc định, quy tắc nào cần chạm vào phải khai `allow_data_suffix=True` — đọc code
là thấy ngay, không thể vô tình. Chạy nhầm ở thư mục không phải dự án thì script
tự dừng.

## Test

```powershell
.\Chay CT\Kiem tra.cmd           # cả hai skill, 169 test
```

Hoặc chạy riêng từng skill khi đang sửa một chỗ cụ thể:

```powershell
python .\code\Skill\sell-in-monthly\scripts\run_tests.py
python .\code\Skill\skill-bao-cao\scripts\run_tests.py
```

Chạy `Kiem tra.cmd` trước khi bàn giao bất kỳ thay đổi logic nào.

Khi kiểm thử bước Google Drive, luôn trỏ vào một thư mục Drive riêng. Để trống thì
mặc định là thư mục dùng chung thật:

```powershell
.\Chay CT\Tach data.cmd -DriveFolderId "https://drive.google.com/drive/folders/XXXX"
```

## Checklist triển khai

Chạy đủ 6 bước này trước khi giao cho người khác hoặc lên máy mới:

1. `.\Chay CT\Kiem tra.cmd` — 169/169 test phải đạt.
2. `.\Chay CT\Don dep.cmd` — đọc danh sách, xác nhận không có gì lạ, rồi
   `.\Chay CT\Don dep.cmd -Confirm`.
3. `.\Chay CT\Tach data.cmd` — kiểm tra dòng `Doi soat: thu muc Drive hien co <n>
   file`. Số `<n>` phải **không nhỏ hơn** số workbook trong
   `Data/out put/Sell in hang  thang` cộng 1 (file CSV Looker). Nhiều hơn là bình
   thường nếu bạn để thêm Google Sheet trong thư mục đó.
4. Đối soát `Data/Work/sell_in/verification/looker_dataset_report.json`: tổng
   `row_count` và `amount_total` phải khớp workbook tháng.
5. `.\Chay CT\Bao cao Power BI.cmd` — mở được dashboard, số khớp workbook Excel.
6. Nếu máy đích dùng nhánh EXE, dựng lại
   `code\Skill\sell-in-monthly\scripts\build_portable.ps1` và đối chiếu
   `assets/portable/SHA256.txt`.

Chuyển giao sang máy khác: đọc
`code/Skill/sell-in-monthly/references/chuyen-giao.md`.

## Cải tiến

Đọc `code/Prompt/cai-tien-du-an.md` trước khi sửa. Nguyên tắc quan trọng nhất: logic
dùng chung giữa luồng chính và luồng chuyển giao chỉ được có **một bản**.

Git theo dõi `code/` và `Chay CT/`. Dữ liệu, thư viện vendored và file `.exe`
đóng gói nằm trong `.gitignore` vì không diff được và làm repo phình nhanh.
