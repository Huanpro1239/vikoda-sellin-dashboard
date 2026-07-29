# Chạy dự án sau khi sao chép

## Nguyên tắc

- Suy ra thư mục gốc từ launcher hoặc `PSScriptRoot`.
- Trong file batch, truyền thư mục gốc bằng `%~dp0.`.
- Không ghi đường dẫn tuyệt đối theo tên người dùng, ổ đĩa hoặc Desktop.
- Giữ nguyên cấu trúc `Data`, `code` và thư mục `Chay CT`.
- Không đóng gói EXE.

## Python

Launcher tìm Python theo thứ tự:

1. `.runtime/python/python.exe` trong dự án.
2. Python của Codex trong hồ sơ người dùng.
3. `py -3`, `python.exe` hoặc `python3.exe` đã cài.

Yêu cầu Python 3.8 trở lên. `openpyxl` và `et_xmlfile` nằm trong
`scripts/vendor`.

## Node và spreadsheet runtime

Sheet `PIVOT` dùng `@oai/artifact-tool`, nên cần:

1. `.runtime/node/node.exe` và `.runtime/node/node_modules` trong dự án; hoặc
2. Codex spreadsheet runtime trong hồ sơ người dùng.

Launcher tạo junction `scripts/node_modules` trong lúc chạy rồi xóa sau khi kết
thúc. Không sửa thư mục dependency của runtime.

`-SkipVisualQa` chỉ bỏ bước tạo ảnh kiểm tra; không bỏ bước tạo PIVOT.

## Kiểm tra sau khi di chuyển

1. Chạy `Chay CT\Bao cao Target.cmd`.
2. Xác nhận có `Target`, `Data`, `DMKH`, `PIVOT` và `PVT_DATA`.
3. Xác nhận `PVT_DATA` ẩn và báo cáo verification có `problems` rỗng.
4. Không dùng staging cũ để kết luận; mỗi lần chạy phải tạo lại staging.
