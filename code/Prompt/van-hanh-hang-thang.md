# Prompt vận hành Sell In hàng tháng

Dùng Skill `Skill/sell-in-monthly` để chạy báo cáo Sell In từ các file trong
`Data/Data ERP`.

Yêu cầu:

1. Đọc `SKILL.md`, `references/quy-trinh.md` và
   `references/danh-muc-khach-hang-san-pham.md`.
2. Chạy luồng chính với tùy chọn không chép Google Drive nếu tôi chưa yêu cầu.
3. Kiểm tra `incremental_plan.json`; báo rõ tháng `REBUILD`, tháng `SKIP` và lý
   do. Không ép chạy lại tháng không đổi.
4. Với tháng `REBUILD`, kiểm tra `audit.json`, `verification_report.json` và
   ảnh preview.
5. Xác nhận cột `SoLuong` là dữ liệu số; số nguyên không có `.0` hoặc dấu chấm
   thừa, số lẻ thực sự vẫn được giữ.
6. Kiểm tra `master_data_report.json` và workbook
   `new_customers/Khach hang moi TMM_YYYY.xlsx`.
7. Báo số khách hàng chờ duyệt, số khách hàng đã nối thêm, mã sản phẩm chưa có,
   số file, số dòng từng tháng, file bị bỏ qua và mọi lỗi phát hiện được.
