---
name: sell-in-monthly
description: Chặng ĐẦU VÀO của dự án "Bao cao Sell in" - đọc file ERP xlsm của VKD và Vikoda, lọc và chuẩn hóa thành workbook "Sell in TMM_YYYY.xlsx" theo tháng, chỉ dựng lại tháng có thay đổi NgayHoaDon hoặc số dòng, phát hiện khách hàng mới cần duyệt, đối chiếu danh mục sản phẩm, gộp CSV tất cả các tháng làm nguồn Looker Studio và đồng bộ toàn bộ file lên Google Drive. Dùng skill này BẤT CỨ KHI NÀO người dùng muốn chạy hoặc sửa bước tách data Sell In, thêm file ERP tháng mới, xử lý khách hàng mới, sửa quy tắc MaKhachHangMoi/VKD3/MaSanPhamMoi/NgayHoaDon/SoLuong, sửa định dạng workbook tháng, xử lý trạng thái SKIP/REBUILD, sửa bước đồng bộ Drive hay nguồn Looker, hoặc chạy luồng chuyển giao sang máy khác. Trigger cả khi chỉ nói "chạy tách data", "cập nhật Sell In tháng này", "có file ERP mới", "khách hàng nào chưa có trong danh mục", "đẩy lên Drive", "số nguồn cho Looker" mà không nêu tên file. KHÔNG dùng cho Bao_Cao_Sell_in.xlsx, sheet PIVOT/Target hay dashboard Power BI - đó là skill-bao-cao.
---

# Sell In hàng tháng

## Nguồn chuẩn của skill này

Bản gốc nằm trong repo tại `code/Skill/sell-in-monthly` của dự án
`D:\Vikoda\Bao cao Sell in`. File `.skill` đã cài vào Claude chỉ là **bản phát
hành**, một bản chụp.

Mọi sửa đổi làm trong repo, chạy `.\Chay CT\Kiem tra.cmd`, commit, rồi đóng gói
lại và cài đè. Sửa trực tiếp vào bản đã cài thì thay đổi không có test bảo vệ,
không vào git, và sẽ mất ở lần cài đè kế tiếp.

Skill này chỉ chạy được khi thư mục dự án có sẵn: mã chạy và dữ liệu đều nằm
trong repo, `.skill` không mang theo chúng.

## Vị trí trong dây chuyền

Dự án có hai skill nối tiếp nhau, đừng nhầm:

1. **`sell-in-monthly`** (skill này) — ERP → workbook `Sell in TMM_YYYY.xlsx`
   theo tháng → CSV Looker → Google Drive.
2. **`skill-bao-cao`** — đọc các workbook tháng đó → `Bao_Cao_Sell_in.xlsx` và
   dashboard Power BI.

Yêu cầu về `PIVOT`, `Target`, sheet `BC_` hay Power BI thuộc skill kia.

## Cấu trúc

- `code/Skill/sell-in-monthly`: quy tắc, mã chạy, tài liệu và file chuyển giao.
- `Data`: dữ liệu nguồn, dữ liệu tham chiếu, kết quả, log và vùng làm việc.
- `Prompt`: yêu cầu mẫu để vận hành, kiểm tra và cải tiến.

Đọc `references/cau-truc-du-an.md` khi thay đổi đường dẫn hoặc tổ chức dự án.
Đọc `references/quy-trinh.md` khi sửa logic dữ liệu, cấu trúc cột hoặc đối soát.
Đọc `references/danh-muc-khach-hang-san-pham.md` khi xử lý khách hàng mới,
duyệt cập nhật danh mục khách hàng hoặc kiểm tra mã sản phẩm thiếu.
Đọc `references/chuyen-giao.md` khi cập nhật bản chạy trên máy khác.
Đọc `references/google-drive-rclone.md` khi sửa bước tải file lên Google Drive
hoặc khi cài rclone trên máy mới.

## Chạy

Tại thư mục gốc:

```powershell
.\Chay CT\Tach data.cmd
```

Chỉ tạo file cục bộ, không chép Google Drive:

```powershell
powershell -ExecutionPolicy Bypass -File ".\code\Skill\sell-in-monthly\scripts\run_sell_in.ps1" -SkipGoogleDrive
```

Bỏ CSV gộp cho Looker, hoặc đổi thư mục Drive đích khi kiểm thử:

```powershell
.\Chay CT\Tach data.cmd -SkipLookerDataset
.\Chay CT\Tach data.cmd -DriveFolderId "https://drive.google.com/drive/folders/XXXX"
```

Ép làm lại một tháng hoặc toàn bộ:

```powershell
.\Chay CT\Tach data.cmd -ForcePeriod 2026-07
.\Chay CT\Tach data.cmd -ForceAll
```

Trên máy chuyển giao:

```powershell
.\Chay CT\Tach data - Chuyen giao.cmd
```

Launcher chuyển giao ưu tiên Python 3 được chính sách máy cho phép và có
`openpyxl`; nếu không tìm thấy mới dùng EXE. Đọc `references/chuyen-giao.md`
khi Device Guard hoặc Code Integrity chặn file thực thi.

Luồng chính cũng tự tìm Python theo thứ tự `-PythonExecutable` → `.runtime\python`
→ runtime Codex → `py.exe -3` → PATH, và mượn `openpyxl` vendored của
`skill-bao-cao` khi Python hệ thống chưa có. Chỉ định thủ công khi cần:

```powershell
.\Chay CT\Tach data.cmd -PythonExecutable "C:\Python312\python.exe"
```

Node kèm `@oai/artifact-tool` chỉ bắt buộc khi có tháng phải dựng lại. Máy không
có Node thì dùng `.\Chay CT\Tach data - Chuyen giao.cmd`.

## Luồng chính

0. Module dùng chung, cả luồng chính và luồng chuyển giao đều gọi; không viết
   bản thứ hai cho riêng một luồng:
   `scripts/extraction.py` (đọc và lọc file ERP) và
   `scripts/workbook_builder.py` (dựng, định dạng và kiểm tra workbook).
1. `scripts/incremental.py` và `scripts/plan_incremental.py`: lập kế hoạch
   `SKIP/REBUILD`, dùng lại dấu vân tay file không đổi và quản lý trạng thái.
2. `scripts/extract_sources.py`: chỉ đọc và chuẩn hóa các tháng `REBUILD`.
3. `scripts/build_outputs.py`: tạo, định dạng và xuất workbook của các tháng
   `REBUILD` bằng openpyxl. Ghi ra file tạm, kiểm tra rồi mới thay file thật.
4. `scripts/verify_outputs.py`: chỉ kiểm tra các workbook vừa tạo lại.
5. `scripts/prepare_master_data.py`: bốn lệnh `plan-approvals`, `analyze`,
   `apply-approved` và `build-review` — lập kế hoạch duyệt, sao lưu rồi nối
   thêm các dòng `DUYET` vào danh mục khách hàng mà không ghi đè dòng hiện có,
   xác định khách hàng mới từ file Sell In mới nhất, đối chiếu danh mục sản phẩm
   và tạo workbook rà soát.
6. `scripts/verify_master_data.py`: kiểm tra cấu trúc, trạng thái và kết quả cập
   nhật danh mục.
7. `scripts/render_previews.mjs`: **tùy chọn**, chỉ render ảnh PNG để soi mắt
   thường. Cần Node kèm `@oai/artifact-tool`; không có thì bỏ qua bước này.
8. `scripts/build_looker_dataset.py`: gộp **toàn bộ** workbook `Sell in T*.xlsx`
   thành một CSV phẳng `Data/Work/sell_in/looker/Sell in tong hop.csv` để làm
   nguồn vẽ Looker Studio. Thêm cột `KyBaoCao` (YYYY-MM), `NgayHoaDon` dạng
   `YYYY-MM-DD`, UTF-8 không BOM. Bỏ qua bằng `-SkipLookerDataset`.
9. `scripts/drive_sync.py` + CLI `scripts/sync_drive.py`: tải **toàn bộ** file
   `Sell in T*.xlsx` trong thư mục output cùng CSV gộp lên thư mục Google Drive
   dùng chung bằng `rclone`, mỗi lần chạy, kể cả khi không có tháng nào
   `REBUILD`. Đích xác định bằng **folder ID** nên máy đích không cần cài Google
   Drive for Desktop. Dùng `rclone copy`, **không bao giờ** `sync` — `sync` sẽ
   xóa Google Sheet và file người khác trong thư mục đó. Sau khi tải, gọi
   `rclone lsjson` đếm lại để đối soát. Chưa cài rclone thì chỉ cảnh báo, không
   làm đổ lần chạy. Cách cài: `references/google-drive-rclone.md`.
10. Chỉ ghi `Data/Logs/Tach data logs/incremental_state.json` sau khi toàn bộ
    bước cần chạy đã thành công.

Luồng chuyển giao dùng `scripts/portable_sell_in.py`, đóng gói tại
`assets/portable/TachDataPortable.exe`. Hai luồng gọi cùng `extraction.py`,
`workbook_builder.py`, `build_looker_dataset.py` và `drive_sync.py` nên file Sell
In, CSV Looker và kết quả trên Drive giống hệt nhau. Luồng chuyển giao import
trực tiếp thay vì gọi script con vì được đóng gói thành EXE.

## Quy tắc bắt buộc

- Gộp VKD và Vikoda/Vkoda khi cùng tháng/năm.
- Với Vikoda/Vkoda, loại `MaKhachHangMoi = VKD3`.
- Chỉ giữ `MaSanPhamMoi` bắt đầu bằng `1` hoặc `2`.
- Với VKD, đổi ký tự đầu `2` thành `1`.
- Lấy `Thang`, `Nam` từ tên file nguồn.
- Lưu `NgayHoaDon` là ngày Excel thật, hiển thị `dd/mm/yyyy`.
- Lưu mã khách hàng và mã sản phẩm ở dạng chữ.
- Chuẩn hóa `SoLuong` có giá trị nguyên từ `240.0` thành `240`; giữ số lẻ thực
  sự như `1.92`; dùng `#,##0` cho số nguyên và `#,##0.##` cho số lẻ để không có
  `.0` hoặc dấu chấm thừa.
- Không tự động xóa trùng khi chưa có khóa chứng từ duy nhất.
- Nếu nguồn của một tháng thay đổi, so sánh số dòng hợp lệ theo từng
  `NgayHoaDon` với output. Có ngày mới, thiếu ngày, đổi số dòng, thêm/bớt file
  nguồn, output mất/hỏng hoặc bị sửa thì làm lại toàn bộ tháng đó từ tất cả file
  nguồn của tháng.
- File nguồn chỉ được lưu lại nhưng tập `NgayHoaDon` và số dòng từng ngày không
  đổi thì bỏ qua. Thay đổi giá trị khác mà không đổi ngày/số dòng phải dùng
  `-ForcePeriod` hoặc `-ForceAll`.
- Xác định kỳ mới nhất bằng tháng/năm trong tên file `Sell in TMM_YYYY.xlsx`,
  không dùng thời gian sửa file.
- Chỉ thêm khách hàng vào `Data/Danh muc KH/Thong tin khach hang.xlsx` khi dòng
  trong workbook rà soát có `TrangThaiDuyet = DUYET`.
- Không ghi đè khách hàng đã có; sao lưu danh mục trước khi nối thêm.
- Không tự suy diễn `Loaikhachhang`, `Hethong MT`, `CODE`, `TENKH`.
- Chỉ cảnh báo mã sản phẩm thiếu; không tự thêm vào
  `Data/Danh muc SP/Danh Muc San Pham.xlsx`.

## Kiểm tra và cải tiến

- Đọc `Data/Work/sell_in/staging/audit.json`.
- Đọc `Data/Work/sell_in/staging/incremental_plan.json`.
- Đọc `Data/Logs/Tach data logs/incremental_state.json`.
- Đọc `Data/Work/sell_in/verification/verification_report.json`.
- Đọc `Data/Work/sell_in/verification/master_data_report.json`.
- Đọc `Data/Work/sell_in/verification/looker_dataset_report.json`: số dòng và
  tổng `SoLuong`/`ThanhTien` từng kỳ trong CSV gộp phải khớp workbook tháng.
- Xác nhận `problems` và `missing` đều rỗng.
- Kiểm tra workbook `Data/Work/sell_in/new_customers/Khach hang moi TMM_YYYY.xlsx`.
- Kiểm tra ảnh trong `Data/Work/sell_in/previews` khi đổi định dạng.
- Khi sửa logic dùng chung, chạy `python .\code\Skill\sell-in-monthly\scripts\run_tests.py`.
  `test_extraction.py` khóa quy tắc lọc nguồn và kiểu `NgayHoaDon`;
  `test_workbook_builder.py` khóa định dạng file đầu ra;
  `test_incremental.py` khóa điều kiện `SKIP`/`REBUILD`;
  `test_looker_dataset.py` khóa cột, kiểu ngày, số thuần và mã hoá của CSV gộp;
  `test_drive_sync.py` khóa thứ tự ưu tiên khi tìm thư mục Drive.
- Khi kiểm thử bước Drive, luôn truyền `-DriveFolderId`/`--drive-folder-id` vào
  một thư mục Drive riêng. Để trống thì mặc định là thư mục dùng chung thật.
- Khi sửa luồng chuyển giao, chạy `scripts/build_portable.ps1`, kiểm tra
  `assets/portable/SHA256.txt`, chạy thử launcher và kiểm tra cả nhánh Python
  lẫn EXE khi chính sách máy cho phép.
