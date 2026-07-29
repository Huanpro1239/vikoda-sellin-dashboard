# Luồng chuyển giao

## Mục đích

Dùng `Tach data - Chuyen giao.cmd` khi sao chép toàn bộ dự án sang máy Windows
khác.

Luồng này:

- Không dùng Google Drive.
- Chỉ đọc dữ liệu trong `Data/Data ERP`.
- Ghi file vào `Data/out put/Sell in hang  thang`.
- Ghi log vào `Data/Logs/Tach data logs/audit_portable.json`.
- Dùng `Data/Logs/Tach data logs/incremental_state.json` để chỉ xử lý tháng có
  thay đổi; logic `SKIP/REBUILD` giống luồng chính.
- Phát hiện khách hàng mới, áp dụng dòng đã `DUYET` và đối chiếu danh mục sản
  phẩm giống luồng chính.
- Ưu tiên Python 3 được Windows cho phép và đã có `openpyxl`.
- Nếu không tìm thấy Python phù hợp, chạy
  `code/Skill/sell-in-monthly/assets/portable/TachDataPortable.exe`.

## Cách chuyển giao

1. Đóng các file Sell In đang mở.
2. Sao chép `Data`, `Skill`, `Prompt` và hai file `.cmd` ở thư mục gốc. Có thể
   bỏ staging/preview trong `Data/Work`,
   nhưng phải giữ `Data/Work/sell_in/new_customers` nếu còn dòng chờ duyệt.
   Nên giữ `Data/Logs/Tach data logs/incremental_state.json` để máy nhận tiếp
   tục chạy nhanh; nếu không có, lần đầu sẽ đối chiếu toàn bộ để tạo mốc.
3. Trên máy nhận, đặt file ERP vào `Data/Data ERP`.
4. Nhấp đúp `Tach data - Chuyen giao.cmd`.
5. Kiểm tra thông báo hoàn tất, file đầu ra, workbook khách hàng mới và log.

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
`master_data.py`, `normalization.py` hoặc quy tắc dùng chung:

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

File thực thi dành cho Windows 64-bit. EXE chưa ký chỉ chạy trên thiết bị có
chính sách cho phép; launcher Python là đường dự phòng, không phải cách vượt
Device Guard.
