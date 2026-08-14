# Luồng chuyển giao

## Mục đích

Dùng `Tach data - Chuyen giao.cmd` khi sao chép toàn bộ dự án sang máy Windows
khác.

Luồng này:

- Chỉ đọc dữ liệu trong `Data/Data ERP`.
- Ghi file vào `Data/out put/Sell in hang  thang`.
- Ghi log vào `Data/Logs/Tach data logs/audit_portable.json`.
- Gộp CSV nguồn Looker và đồng bộ Google Drive giống luồng chính; xem mục
  "Google Drive trên máy chuyển giao" bên dưới.
- Dùng `Data/Logs/Tach data logs/incremental_state.json` để chỉ xử lý tháng có
  thay đổi; logic `SKIP/REBUILD` giống luồng chính.
- Phát hiện khách hàng mới, áp dụng dòng đã `DUYET` và đối chiếu danh mục sản
  phẩm giống luồng chính.
- Ưu tiên Python 3 được Windows cho phép và đã có `openpyxl`.
- Nếu không tìm thấy Python phù hợp, chạy
  `code/Skill/sell-in-monthly/assets/portable/TachDataPortable.exe`.

## Cách chuyển giao

1. Đóng các file Sell In đang mở.
2. Chạy `.\Chay CT\Don dep.cmd --confirm` để bỏ rác tái tạo được trước khi sao
   chép — riêng CSV Looker và staging đã chiếm hơn 20 MB.
3. Sao chép ba thư mục `Data`, `code`, `Chay CT` và hai file `README.md`,
   `.gitignore` ở thư mục gốc. Phải giữ `Data/Work/sell_in/new_customers` nếu
   còn dòng chờ duyệt. Nên giữ
   `Data/Logs/Tach data logs/incremental_state.json` để máy nhận tiếp tục chạy
   nhanh; nếu không có, lần đầu sẽ đối chiếu toàn bộ để tạo mốc.
4. Trên máy nhận, đặt file ERP vào `Data/Data ERP`.
5. Cài rclone trên máy nhận: đặt `rclone.exe` vào `.runtime\rclone\` rồi chạy
   `rclone config` tạo remote tên `vikoda-drive`. Các bước chi tiết trong
   `references/google-drive-rclone.md`. **Không cần cài Google Drive for
   Desktop.** Bỏ bước này thì mọi thứ vẫn chạy, chỉ là file không lên Drive.
6. Nhấp đúp `Tach data - Chuyen giao.cmd`.
7. Kiểm tra thông báo hoàn tất, file đầu ra, workbook khách hàng mới, log và dòng
   `Google Drive: thu muc <ID> hien co <n> file` ở cuối.

Launcher tự tìm runtime theo thứ tự:

1. Python được cài trong hồ sơ người dùng.
2. Python trong Codex runtime.
3. `python.exe` hoặc `py.exe -3` trên `PATH`.
4. EXE portable.

Đặt `TACH_DATA_FORCE_EXE=1` chỉ khi cần kiểm thử riêng nhánh EXE.

Ép làm lại một kỳ hoặc toàn bộ trên máy chuyển giao:

```powershell
.\Chay CT\Tach data - Chuyen giao.cmd --force-period 2026-07
.\Chay CT\Tach data - Chuyen giao.cmd --force-all
```

## Google Drive trên máy chuyển giao

Máy chuyển giao vẫn đẩy lên Drive **giống luồng chính**: toàn bộ file
`Sell in T*.xlsx` cộng CSV gộp `Sell in tong hop.csv`, mỗi lần chạy, kể cả khi
không có tháng nào `REBUILD`.

**Máy này KHÔNG cần cài Google Drive for Desktop.** File tải lên bằng `rclone` gọi
thẳng Drive API, đích xác định bằng folder ID của thư mục dùng chung nên chắc chắn
trùng với máy gốc:

<https://drive.google.com/drive/folders/1zJHdr3L9g9VAQVYM8KR_Bl0jpV2FClv5>

Cả hai luồng dùng chung `scripts/drive_sync.py` nên không thể lệch hành vi. Luồng
chính gọi qua CLI `scripts/sync_drive.py`; luồng chuyển giao import trực tiếp vì
được đóng gói thành EXE, không chạy được script con.

Việc phải làm một lần trên máy chuyển giao: đặt `rclone.exe` vào
`.runtime\rclone\` rồi chạy `rclone config` tạo remote tên `vikoda-drive`. Máy
không có trình duyệt vẫn cấu hình được bằng `rclone authorize` chạy hộ ở máy khác.
Toàn bộ các bước trong `references/google-drive-rclone.md`.

Chưa cài rclone thì in hướng dẫn rồi **vẫn hoàn tất** lần tách data — file cục bộ
đã đủ, thiếu công cụ đồng bộ không phải lý do làm đổ cả lần chạy.

Tắt Drive trên máy chuyển giao:

```powershell
set TACH_DATA_SKIP_DRIVE=1
.\Chay CT\Tach data - Chuyen giao.cmd
```

Đổi đích cho một lần chạy, ví dụ khi kiểm thử:

```powershell
.\Chay CT\Tach data - Chuyen giao.cmd --drive-folder-id "https://drive.google.com/drive/folders/XXXX"
```

Kết quả ghi trong `Data/Logs/Tach data logs/audit_portable.json` tại khoá
`google_drive` (`folder_id`, `remote`, `expected_count`, `remote_listing`,
`failed_jobs`) và `looker_dataset`.

## Device Guard và Code Integrity

Nếu Windows báo `Enterprise signing level` hoặc Device Guard:

- Không đổi tên, sao chép hoặc đóng gói lại để né chính sách.
- Dùng launcher; launcher sẽ chạy mã Python bằng runtime được chính sách máy
  cho phép nếu runtime có `openpyxl`.
- Nếu máy không có Python phù hợp, chuyển EXE cho IT ký bằng chứng thư code
  signing được doanh nghiệp tin cậy hoặc yêu cầu IT allow-list SHA-256.
- Không dùng chứng thư tự ký nếu chính sách yêu cầu mức ký doanh nghiệp.

## Khi thay đổi mã Python

Nếu thay đổi `portable_sell_in.py`, `extraction.py`, `incremental.py`,
`master_data.py`, `normalization.py`, `drive_sync.py`, `build_looker_dataset.py`
hoặc quy tắc dùng chung:

```powershell
powershell -ExecutionPolicy Bypass -File ".\code\Skill\sell-in-monthly\scripts\build_portable.ps1"
```

Khi IT cung cấp chứng thư ký mã trong kho `CurrentUser\My`:

```powershell
powershell -ExecutionPolicy Bypass -File ".\code\Skill\sell-in-monthly\scripts\build_portable.ps1" `
  -CodeSigningCertificateThumbprint "<THUMBPRINT>" `
  -TimestampServer "<TIMESTAMP_URL>"
```

Sau đó:

1. Xác nhận `assets/portable/TachDataPortable.exe` có thời gian cập nhật mới.
2. Đối chiếu `assets/portable/SHA256.txt`.
3. Chạy `Tach data - Chuyen giao.cmd` vào thư mục kiểm thử.
4. Kiểm tra report, tổng dòng, định dạng `SoLuong`, workbook khách hàng mới và
   báo cáo đối chiếu danh mục.
5. Kiểm thử bước Drive bằng một thư mục Drive riêng để không ghi vào thư mục dùng
   chung thật:
   `.\Chay CT\Tach data - Chuyen giao.cmd --drive-folder-id "<ID thu muc thu nghiem>"`,
   rồi đối chiếu số file báo ra với `Data/out put/Sell in hang  thang` cộng một
   file CSV.

File thực thi dành cho Windows 64-bit. EXE chưa ký chỉ chạy trên thiết bị có
chính sách cho phép; launcher Python là đường dự phòng, không phải cách vượt
Device Guard.
