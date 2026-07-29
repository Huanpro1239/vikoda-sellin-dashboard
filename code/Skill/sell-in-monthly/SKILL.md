---
name: sell-in-monthly
description: Tách tăng dần, lọc, chuẩn hóa và gộp dữ liệu Sell In hàng tháng từ file ERP Excel/XLSM của VKD và Vikoda; chỉ tạo lại tháng có thay đổi NgayHoaDon/số dòng, tạo workbook theo tháng/năm, kiểm tra chất lượng, phát hiện khách hàng mới, cập nhật khách hàng đã duyệt, đối chiếu danh mục sản phẩm, tạo bản chuyển giao Windows và tùy chọn đồng bộ Google Drive. Dùng khi cần chạy hoặc cải tiến dự án "Bao cao Sell in", thêm dữ liệu ERP, xử lý khách hàng mới, kiểm tra danh mục khách hàng/sản phẩm, sửa quy tắc MaKhachHangMoi/VKD3, MaSanPhamMoi, NgayHoaDon, SoLuong, định dạng file đầu ra, trạng thái tăng dần hoặc luồng chuyển giao.
---

# Sell In hàng tháng

## Cấu trúc

- `code/Skill/sell-in-monthly`: quy tắc, mã chạy, tài liệu và file chuyển giao.
- `Data`: dữ liệu nguồn, dữ liệu tham chiếu, kết quả, log và vùng làm việc.
- `Prompt`: yêu cầu mẫu để vận hành, kiểm tra và cải tiến.

Đọc `references/cau-truc-du-an.md` khi thay đổi đường dẫn hoặc tổ chức dự án.
Đọc `references/quy-trinh.md` khi sửa logic dữ liệu, cấu trúc cột hoặc đối soát.
Đọc `references/danh-muc-khach-hang-san-pham.md` khi xử lý khách hàng mới,
duyệt cập nhật danh mục khách hàng hoặc kiểm tra mã sản phẩm thiếu.
Đọc `references/chuyen-giao.md` khi cập nhật bản chạy trên máy khác.

## Chạy

Tại thư mục gốc:

```powershell
.\Chay CT\Tach data.cmd
```

Chỉ tạo file cục bộ, không chép Google Drive:

```powershell
powershell -ExecutionPolicy Bypass -File ".\code\Skill\sell-in-monthly\scripts\run_sell_in.ps1" -SkipGoogleDrive
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
8. Chỉ chép các file `REBUILD` đã đạt kiểm tra sang Google Drive.
9. Chỉ ghi `Data/Logs/Tach data logs/incremental_state.json` sau khi toàn bộ
   bước cần chạy đã thành công.

Luồng chuyển giao dùng `scripts/portable_sell_in.py`, đóng gói tại
`assets/portable/TachDataPortable.exe`. Hai luồng gọi cùng `extraction.py` và
`workbook_builder.py` nên file Sell In tạo ra giống hệt nhau.

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
- Xác nhận `problems` và `missing` đều rỗng.
- Kiểm tra workbook `Data/Work/sell_in/new_customers/Khach hang moi TMM_YYYY.xlsx`.
- Kiểm tra ảnh trong `Data/Work/sell_in/previews` khi đổi định dạng.
- Khi sửa logic dùng chung, chạy `python .\code\Skill\sell-in-monthly\scripts\run_tests.py`.
  `test_extraction.py` khóa quy tắc lọc nguồn và kiểu `NgayHoaDon`;
  `test_workbook_builder.py` khóa định dạng file đầu ra;
  `test_incremental.py` khóa điều kiện `SKIP`/`REBUILD`.
- Khi sửa luồng chuyển giao, chạy `scripts/build_portable.ps1`, kiểm tra
  `assets/portable/SHA256.txt`, chạy thử launcher và kiểm tra cả nhánh Python
  lẫn EXE khi chính sách máy cho phép.
