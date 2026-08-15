# Tải file lên Google Drive bằng rclone

## Vì sao không dùng Google Drive for Desktop nữa

Trước đây bước đồng bộ chép file vào `G:\My Drive\Bao cao Sell in\Sell in hang thang`
do Drive for Desktop mount. Cách đó có hai vấn đề:

- Máy không cài được Drive for Desktop là mất luôn bước đồng bộ. Máy chuyển giao ở
  nhà máy thường bị chính sách IT chặn cài đặt.
- Mỗi máy mount Drive một ổ khác nhau, phải dò hoặc khai báo đường dẫn, và không có
  gì bảo đảm hai máy đẩy vào **cùng một** thư mục.

Giờ dùng `rclone` gọi thẳng Drive API. Đích xác định bằng **folder ID** do quản
trị viên cấp. Không commit ID thật vào source hoặc tài liệu; mỗi máy khai báo qua
biến `TACH_DATA_DRIVE_FOLDER_ID` hoặc `Chay CT/drive.conf` (copy từ
`Chay CT/drive.conf.example`). Thiếu cấu hình thì bước Drive dừng an toàn và file
cục bộ vẫn được giữ.

## Vì sao `copy` chứ không phải `sync`

`rclone sync` làm đích giống hệt nguồn, nghĩa là **xóa** mọi thứ trong thư mục Drive
mà local không có. Thư mục đó còn chứa Google Sheet nạp từ CSV để vẽ Looker, và có
thể chứa file người khác đặt vào. Nên bước đồng bộ dùng `rclone copy`: chỉ thêm và
ghi đè, không bao giờ xóa.

`copy` cũng tự bỏ qua file không đổi, nên vẫn đối chiếu đủ cả thư mục nhưng chỉ
truyền phần khác. Vì vậy tham số `-SyncChangedOnly` cũ đã bỏ — rclone làm việc đó
tốt hơn và vẫn bảo đảm thư mục Drive đầy đủ.

## Cài một lần trên mỗi máy

### 1. Tải rclone

Tải bản Windows tại <https://rclone.org/downloads/>, giải nén, đặt `rclone.exe` vào:

```
D:\Vikoda\Bao cao Sell in\.runtime\rclone\rclone.exe
```

Script tìm rclone theo thứ tự: tham số `-RclonePath` → biến môi trường
`TACH_DATA_RCLONE` → `.runtime\rclone\rclone.exe` → `PATH`. Đặt vào `.runtime` là
gọn nhất vì đi theo thư mục dự án và đã được `.gitignore` bỏ qua.

### 2. Tạo remote

```powershell
cd "D:\Vikoda\Bao cao Sell in"
.\.runtime\rclone\rclone.exe config
```

Trả lời theo thứ tự:

| Câu hỏi | Trả lời |
| --- | --- |
| `n/s/q>` | `n` (new remote) |
| `name>` | `vikoda-drive` — phải đúng tên này |
| `Storage>` | `drive` (gõ `drive` hoặc chọn số tương ứng) |
| `client_id>` | Enter để trống |
| `client_secret>` | Enter để trống |
| `scope>` | `1` (Full access) |
| `service_account_file>` | Enter để trống |
| `Edit advanced config?` | `n` |
| `Use web browser to automatically authenticate?` | `y` nếu máy có trình duyệt |

Trình duyệt mở ra, đăng nhập bằng tài khoản Google **có quyền ghi** vào thư mục dùng
chung, rồi bấm Allow. Xong thì chọn `n` cho câu "Configure this as a Shared Drive?"
vì thư mục nằm trong My Drive, không phải ổ chia sẻ.

Tên remote phải đúng `vikoda-drive`. Muốn dùng tên khác thì khai trong
`Chay CT/drive.conf` hoặc truyền `-RcloneRemote`.

### 3. Máy không có trình duyệt

Ở bước "Use web browser" chọn `n`. rclone in ra một lệnh dạng:

```
rclone authorize "drive" "eyJzY29wZSI6..."
```

Chạy đúng lệnh đó trên **máy khác có trình duyệt** (máy nào cũng được, chỉ cần có
rclone), đăng nhập, rồi copy đoạn token dài nó in ra và dán trở lại máy đang cấu
hình. Cách này để cấu hình được máy không có giao diện.

### 4. Khai báo folder ID và kiểm tra

Tạo file `Chay CT/drive.conf` từ file example rồi thay placeholder bằng folder ID
đã được cấp. File thật đã nằm trong `.gitignore`.

```powershell
.\.runtime\rclone\rclone.exe lsjson vikoda-drive: --drive-root-folder-id <FOLDER_ID_DUOC_CAP> --max-depth 1
```

Ra danh sách JSON các file trong thư mục là xong. Nếu báo
`didn't find section in config file` thì tên remote sai; nếu báo lỗi 404 thì tài
khoản vừa đăng nhập không có quyền vào thư mục đó.

## Chạy và đối soát

Bước đồng bộ chạy tự động ở cuối `Tach data.cmd` và
`Tach data - Chuyen giao.cmd`. Sau khi tải lên, script gọi `rclone lsjson` để đếm lại
số file trong thư mục Drive và so với số mong đợi. Không xem được thư mục Drive bằng
mắt từ trong script, nên bước đối soát này là cách duy nhất biết file đã thật sự lên.

Kết quả đầy đủ ghi ở:

- Luồng chính: `Data/Work/sell_in/verification/drive_sync_report.json`
- Luồng chuyển giao: `Data/Logs/Tach data logs/audit_portable.json`, khóa `google_drive`

Dòng in ra khi chạy có dạng:

```
Google Drive: da tai len thu muc <ID da rut gon trong log> (remote 'vikoda-drive')
  Doi soat: thu muc Drive hien co 20 file, mong doi it nhat 20.
```

Số mong đợi bằng số workbook trong `Data/out put/Sell in hang  thang` cộng 1 (file
CSV Looker). Thư mục Drive có thể nhiều hơn nếu bạn để thêm Google Sheet trong đó —
đó là bình thường.

## Chưa cài rclone thì sao

Bước đồng bộ in hướng dẫn cài rồi **vẫn hoàn tất** lần tách data. File cục bộ trong
`Data/out put` và CSV trong `Data/Work/sell_in/looker` đã đầy đủ; chỉ là chưa lên
Drive. Thiếu công cụ đồng bộ không phải lý do làm đổ cả lần chạy.

## Tùy chọn dòng lệnh

Luồng chính:

```powershell
.\Chay CT\Tach data.cmd -SkipGoogleDrive
.\Chay CT\Tach data.cmd -DriveFolderId "https://drive.google.com/drive/folders/XXXX"
.\Chay CT\Tach data.cmd -RcloneRemote "drive-thu-nghiem"
.\Chay CT\Tach data.cmd -RclonePath "C:\Tools\rclone.exe"
```

Luồng chuyển giao dùng `--skip-google-drive`, `--drive-folder-id`,
`--rclone-remote`, `--rclone`; hoặc đặt `TACH_DATA_SKIP_DRIVE=1`,
`TACH_DATA_DRIVE_FOLDER_ID`, `TACH_DATA_RCLONE_REMOTE`, `TACH_DATA_RCLONE`.

Khi kiểm thử, luôn trỏ vào một thư mục Drive riêng bằng `-DriveFolderId` để không
ghi vào thư mục dùng chung thật.
