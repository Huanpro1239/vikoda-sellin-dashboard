# Bao cao Sell in

Hai quy trình Excel cho dữ liệu bán hàng Vikoda:

1. **Tách data Sell In** — đọc file ERP hàng tháng, lọc và chuẩn hóa thành
   workbook `Sell in TMM_YYYY.xlsx` theo tháng, đồng thời phát hiện khách hàng
   mới cần duyệt vào danh mục.
2. **Báo cáo Sell In** — dựng `Bao_Cao_Sell_in.xlsx` gồm sheet tổng hợp `PIVOT`
   theo 20 vùng bán hàng và 8 sheet báo cáo chi tiết theo miền.

## Chạy

Nhấp đúp một trong hai file ở thư mục gốc:

| File | Việc |
| --- | --- |
| `Tach data.cmd` | Tách và chuẩn hóa Sell In hàng tháng |
| `Bao cao Target.cmd` | Dựng `Bao_Cao_Sell_in.xlsx` |
| `Tach data - Chuyen giao.cmd` | Bản tách data cho máy khác, chỉ cần Python |

Ép làm lại một tháng hoặc toàn bộ:

```powershell
.\Tach data.cmd -ForcePeriod 2026-07
.\Tach data.cmd -ForceAll
```

## Yêu cầu máy

Chỉ cần **Python 3.8+**. Script tự tìm theo thứ tự: tham số
`-PythonExecutable`, `.runtime\python\python.exe` trong thư mục dự án, runtime
Codex, `py.exe -3`, rồi `python.exe` trong PATH. Nếu Python hệ thống chưa có
`openpyxl`, script tự dùng bản vendored sẵn trong
`Skill\skill-bao-cao\scripts\vendor`.

Node kèm `@oai/artifact-tool` là **tùy chọn**, chỉ dùng để render ảnh preview.
Không có Node thì bỏ qua ảnh, mọi bước dựng file và kiểm tra vẫn chạy đủ.

## Cấu trúc

```
Skill/            mã chạy, quy tắc nghiệp vụ và tài liệu — nguồn chuẩn duy nhất
  sell-in-monthly/    quy trình tách data Sell In
  skill-bao-cao/      quy trình dựng báo cáo
Prompt/           yêu cầu mẫu để vận hành, kiểm tra và cải tiến
Data/             dữ liệu nguồn, kết quả, nhật ký và vùng làm việc
```

Chi tiết đọc `Skill/<tên skill>/SKILL.md` và thư mục `references` của skill đó.
Không đặt mã chạy hoặc prompt trong `Data`.

### Thư mục trong `Data`

| Thư mục | Nội dung |
| --- | --- |
| `Data ERP` | Workbook ERP nguồn |
| `out put/Sell in hang  thang` | Workbook Sell In theo tháng |
| `Danh muc KH`, `Danh muc SP`, `Danh Sach Sales`, `Target` | Dữ liệu tham chiếu |
| `File bao cao/Excel` | `Bao_Cao_Sell_in.xlsx` |
| `Logs` | Nhật ký cần giữ, gồm trạng thái tăng dần |
| `Work` | Staging, preview, verification — tạo lại được |

Hai chỗ trong `Data` **không** được xóa tùy tiện:

- `Data/Logs/Tach data logs/incremental_state.json` — mốc so sánh tăng dần. Mất
  file này thì lần chạy sau phải đối chiếu lại toàn bộ nguồn để tạo mốc mới.
- `Data/Work/sell_in/new_customers` — quyết định duyệt khách hàng mới của người
  vận hành, giữ cho tới khi các dòng `DUYET` đã được áp dụng.

## Test

```powershell
python .\Skill\sell-in-monthly\scripts\run_tests.py
python .\Skill\skill-bao-cao\scripts\run_tests.py
```

Chạy cả hai trước khi bàn giao bất kỳ thay đổi logic nào.

## Cải tiến

Đọc `Prompt/cai-tien-du-an.md` trước khi sửa. Nguyên tắc quan trọng nhất: logic
dùng chung giữa luồng chính và luồng chuyển giao chỉ được có **một bản**.

Git chỉ theo dõi `Skill/` và `Prompt/`. Dữ liệu, thư viện vendored và file `.exe`
đóng gói nằm trong `.gitignore` vì không diff được và làm repo phình nhanh.
