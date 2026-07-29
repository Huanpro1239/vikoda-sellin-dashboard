# Cấu trúc dự án Skill / Data / Prompt

## Skill

`code/Skill/sell-in-monthly` là nguồn chuẩn duy nhất cho logic vận hành:

- `SKILL.md`: quy trình ngắn gọn và điểm vào chính.
- `scripts`: mã xử lý, kiểm tra, build và test.
- `references`: quy tắc nghiệp vụ và hướng dẫn bảo trì.
- `assets/portable`: file `.exe` chuyển giao và mã SHA-256.
- `agents/openai.yaml`: thông tin hiển thị của Skill.

Không tạo bản sao mã chạy ở thư mục gốc. Hai file `.cmd` ở thư mục gốc chỉ là
lối tắt cho người vận hành.

### Module dùng chung trong `scripts`

Luồng chính và luồng chuyển giao phải gọi cùng một bản logic. Không viết bản
thứ hai cho riêng một luồng:

- `extraction.py`: đọc file ERP và mọi quy tắc lọc/chuẩn hóa dòng nguồn —
  `OUTPUT_COLUMNS`, `FILE_PATTERN`, `extract_file`, `parse_source_name`,
  `clean_id`, `locate_header`, `sort_key`. Dùng bởi `extract_sources.py`,
  `incremental.py` và `portable_sell_in.py`.
- `workbook_builder.py`: dựng, định dạng, kiểm tra và ghi workbook Sell In —
  `build_workbook`, `verify_workbook`, `write_monthly_workbook`. Dùng bởi
  `build_outputs.py` và `portable_sell_in.py`. Mọi thay đổi định dạng file đầu
  ra chỉ sửa ở đây.
- `incremental.py`: điều kiện `SKIP`/`REBUILD` và trạng thái tăng dần.
- `master_data.py`: khách hàng mới, duyệt danh mục và đối chiếu sản phẩm.
- `normalization.py`: chuẩn hóa số và định dạng số lượng.

`extract_file` trả `NgayHoaDon` kiểu `datetime.date`. Luồng chính đổi sang
chuỗi ISO bằng `iso_invoice_date` khi ghi staging JSON; `incremental.py` cũng
dùng chuỗi ISO cho khóa `date_counts` để so khớp được với output và ghi vào
`incremental_state.json`. Đổi kiểu trả về mà quên hai chỗ này sẽ làm mọi tháng
bị `REBUILD` lại — `scripts/tests/test_extraction.py` khóa hợp đồng đó.

### Runtime

`run_sell_in.ps1` và `run_target_report.ps1` tự tìm Python 3.8+ có `openpyxl`
theo thứ tự: tham số `-PythonExecutable`, `.runtime\python\python.exe` trong
thư mục dự án, runtime Codex, `py.exe -3`, rồi `python.exe`/`python3.exe` trong
PATH. Nếu Python hệ thống không có `openpyxl`, script tự thêm bản vendored tại
`code\Skill\skill-bao-cao\scripts\vendor` vào `PYTHONPATH`.

Toàn bộ bước dựng file đã chuyển sang Python/openpyxl. Node kèm
`@oai/artifact-tool` chỉ còn phục vụ `render_previews.mjs` để render ảnh PNG,
và là tùy chọn: không có Node thì bỏ qua ảnh preview, mọi bước khác vẫn chạy
đủ. Tìm Node ở `.runtime\node` rồi tới runtime Codex.

`inspect_sources.mjs` là công cụ soi file ERP khi gỡ lỗi, không nằm trong luồng
chạy tự động và cũng cần `@oai/artifact-tool`.

## Data

`Data` chứa toàn bộ dữ liệu và kết quả:

- `Data/Data ERP`: workbook ERP nguồn.
- `Data/out put/Sell in hang  thang`: workbook Sell In đầu ra.
- `Data/Danh muc KH`, `Data/Danh muc SP`, `Data/Danh Sach Sales`, `Data/Target`:
  dữ liệu tham chiếu.
- `Data/File bao cao`: file phục vụ báo cáo Excel/Power BI.
- `Data/Logs`: nhật ký chạy ổn định cần lưu.
- `Data/Work`: staging, preview, verification và file build tạm có thể tạo lại.

Ngoại lệ: `Data/Work/sell_in/new_customers` chứa quyết định duyệt và ghi chú của
người dùng. Giữ thư mục này cho đến khi các dòng đã duyệt được áp dụng hoặc
người dùng xác nhận không còn cần.

`Data/Logs/Tach data logs/incremental_state.json` là trạng thái vận hành cần
giữ khi sao chép dự án. Xóa file này không làm mất dữ liệu chính thức nhưng lần
chạy sau phải đọc và đối chiếu lại toàn bộ nguồn/output để tạo mốc mới.

Không đặt logic hoặc prompt trong `Data`.

## Prompt

`Prompt` chứa yêu cầu mẫu dành cho người vận hành hoặc người cải tiến:

- `van-hanh-hang-thang.md`: chạy và đối soát báo cáo tháng.
- `cai-tien-du-an.md`: sửa quy tắc hoặc chức năng mà không bỏ sót luồng portable.
- `kiem-tra-chat-luong.md`: kiểm tra dữ liệu và định dạng sau thay đổi.

Khi quy trình thay đổi, cập nhật đồng thời Prompt liên quan, `SKILL.md` và
reference chi tiết. Không ghi kết quả chạy theo thời điểm vào Prompt.
