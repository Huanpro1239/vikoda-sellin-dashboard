# Prompt cải tiến dự án Sell In

Kiểm tra yêu cầu thay đổi của tôi trên toàn bộ Skill `code/Skill/sell-in-monthly`.

Trước khi sửa:

1. Đọc `SKILL.md`, `references/cau-truc-du-an.md` và phần liên quan trong
   `references/quy-trinh.md`.
2. Nếu thay đổi dữ liệu danh mục, đọc
   `references/danh-muc-khach-hang-san-pham.md`.
3. Xác định thay đổi ảnh hưởng luồng chính, luồng portable hay cả hai.
4. Giữ logic dùng chung đúng một bản; không viết hai bản khác nhau cho luồng
   chính và portable:
   - quy tắc đọc và lọc file ERP: `scripts/extraction.py`
   - dựng và định dạng workbook đầu ra: `scripts/workbook_builder.py`
   - điều kiện phát hiện dữ liệu mới: `scripts/incremental.py`
   - danh mục khách hàng và sản phẩm: `scripts/master_data.py`
   - chuẩn hóa số: `scripts/normalization.py`
5. Giữ dữ liệu trong `Data` và prompt tái sử dụng trong `code/Prompt`.

Sau khi sửa:

1. Chạy `python scripts/run_tests.py` của skill bị ảnh hưởng.
2. Kiểm tra cả `SKIP`, `REBUILD`, file nguồn chỉ lưu lại, ngày mới, đổi số dòng
   cùng ngày, output thiếu và `ForcePeriod`.
3. Chạy luồng chính với dữ liệu thật vào thư mục kiểm thử.
4. Chạy lần hai và xác nhận file không đổi được bỏ qua nhanh.
5. Kiểm tra báo cáo verification và preview Excel.
6. Nếu `portable_sell_in.py` hoặc module dùng chung thay đổi, build lại `.exe`,
   cập nhật SHA-256 và chạy thử luồng chuyển giao.
7. Cập nhật tài liệu và Prompt liên quan để lần cải tiến sau không phải suy đoán.
8. Nếu thay đổi luồng khách hàng mới, kiểm thử cả bốn trạng thái duyệt, sao lưu
   danh mục, quy tắc không ghi đè và đối chiếu sản phẩm.
