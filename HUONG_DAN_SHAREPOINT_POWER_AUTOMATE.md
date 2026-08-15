# HƯỚNG DẪN TỰ ĐỘNG HÓA SHAREPOINT · POWER AUTOMATE · WEB DASHBOARD (24/7 CLOUD)

Tài liệu này hướng dẫn bạn thiết lập toàn bộ quy trình tự động hóa khép kín:
**Kế toán tải file lên SharePoint $\rightarrow$ Power Automate kích hoạt GitHub Actions $\rightarrow$ Tự động tính toán & cập nhật Web Dashboard riêng.**

---

## 🔐 1. RANH GIỚI BẢO MẬT WEB DASHBOARD

Màn hình khóa/hash JavaScript chỉ là lớp trải nghiệm cục bộ và **không bảo vệ**
file dữ liệu trên static hosting. Không lưu mật khẩu trong source hoặc tài liệu.

Trước khi phát hành dữ liệu nội bộ:

1. Đặt repository ở chế độ private và tắt Pages/public deployment cũ.
2. Đưa dashboard sau xác thực phía server, Entra ID hoặc identity-aware proxy.
3. Chỉ cấp URL nội bộ qua quản trị viên/IT; bật hết hạn phiên và thu hồi quyền.
4. Phân loại/phê duyệt artifact; không commit `Data/` hoặc `web/data/` vào Git.

---

## ⚡ 2. CẤU HÌNH POWER AUTOMATE CLOUD FLOW (KHI CÓ FILE MỚI TRÊN SHAREPOINT)

Để Power Automate tự động gọi GitHub cập nhật Web mỗi khi có file Sell In mới:

### Bước 2.1: Tạo fine-grained token giới hạn đúng repository
1. Đăng nhập vào [GitHub.com](https://github.com) $\rightarrow$ Bấm Avatar góc phải $\rightarrow$ **Settings**.
2. Chọn **Developer Settings** $\rightarrow$ **Personal access tokens** $\rightarrow$ **Fine-grained tokens**.
3. Tạo token chỉ truy cập repository private của dự án:
   - Đặt tên: `PowerAutomate_Trigger`
   - Repository permission: **Actions = Read and write**; không cấp `Contents: write`.
   - Đặt ngày hết hạn ngắn và lưu token trong connection/secret store của Power Automate.

### Bước 2.2: Tạo Flow trên Power Automate Cloud
1. Truy cập [make.powerautomate.com](https://make.powerautomate.com) bằng tài khoản công ty.
2. Chọn **Create (Tạo mới)** $\rightarrow$ **Automated cloud flow (Luồng đám mây tự động)**.
3. **Trigger (Kích hoạt):** Tìm và chọn **When a file is created or modified in a folder (SharePoint)**.
   - **Site Address:** Chọn trang SharePoint công ty của bạn.
   - **Folder Id:** Chọn thư mục chứa file Sell In (ví dụ: `/Vikoda_Sales_Data/Data_Goc`).
4. **Action (Hành động):** Bấm thêm bước mới $\rightarrow$ Tìm action **HTTP**:
   - **Method (Phương thức):** `POST`
   - **URI:** `https://api.github.com/repos/<OWNER>/<REPO>/actions/workflows/deploy_dashboard.yml/dispatches`
   - **Headers:**
     ```
     Accept: application/vnd.github+json
     Authorization: Bearer <Mã_Token_GitHub_ở_Bước_2.1>
     X-GitHub-Api-Version: 2026-03-10
     Content-Type: application/json
     ```
   - **Body (Nội dung):**
     ```json
     {
       "ref": "main",
       "inputs": {
         "deploy_pages": "true"
       }
     }
     ```
5. Bấm **Save (Lưu)** và bật **Turn on**.

5. Trên GitHub, chỉ bật biến `ENABLE_PAGES_DEPLOY=true` cho artifact đã được
   duyệt; cấu hình environment `github-pages`/môi trường production với reviewer
   và giới hạn nhánh `main`.

👉 **Kết quả:** Flow chỉ yêu cầu một workflow đã định danh; deployment vẫn phải
qua credential check, quality gate, test và protection/approval của môi trường.

---

## 🌐 3. PHÁT HÀNH DASHBOARD ĐÚNG PHÂN LOẠI DỮ LIỆU

- **Artifact có dữ liệu khách hàng/doanh thu:** không đưa lên GitHub Pages hoặc
  Vercel public. Dùng hosting doanh nghiệp có Entra ID/server-side auth và audit
  log, hoặc chỉ phân phối qua kênh nội bộ được IT phê duyệt.
- **GitHub Pages/Vercel:** chỉ dùng cho bản demo đã ẩn danh/tổng hợp và được data
  owner phê duyệt bằng văn bản. Client-side password không làm dữ liệu thành riêng tư.
- Sau mỗi lần build, kiểm tra quality status `PASS`, kỳ dữ liệu, số dòng, nguồn
  Target/DMKH/DMSP và xác nhận không có dữ liệu nhạy cảm ngoài phạm vi duyệt.

---

## 📌 4. CÁCH NHÚNG WEB DASHBOARD VÀO SHAREPOINT PAGE NỘI BỘ

Nếu muốn Sếp và nhân viên xem ngay bên trong cổng thông tin nội bộ SharePoint của công ty:

1. Mở trang SharePoint của phòng Kinh doanh (ví dụ: `https://vikoda.sharepoint.com/sites/sales`).
2. Bấm nút **Edit (Chỉnh sửa trang)** ở góc trên bên phải.
3. Bấm dấu **`+`** để thêm Web Part mới $\rightarrow$ Tìm và chọn **Embed (Nhúng)**.
4. Dán URL **đã được bảo vệ bằng xác thực thật** vào Web Part Embed. Việc nhúng
   một URL public vào SharePoint không biến URL đó thành private.
   Ví dụ khung nhúng:
   ```html
   <iframe src="https://<link_web_dashboard_cua_ban>" width="100%" height="800px" frameborder="0" scrolling="no"></iframe>
   ```
5. Bấm **Republish (Xuất bản lại trang)**.

👉 Toàn bộ Ban Giám Đốc và nhân viên khi vào SharePoint sẽ thấy ngay bảng điều khiển tương tác bán hàng Vikoda trực tiếp trên giao diện SharePoint công ty!
