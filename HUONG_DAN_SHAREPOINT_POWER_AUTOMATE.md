# HƯỚNG DẪN TỰ ĐỘNG HÓA SHAREPOINT · POWER AUTOMATE · WEB DASHBOARD (24/7 CLOUD)

Tài liệu này hướng dẫn bạn thiết lập toàn bộ quy trình tự động hóa khép kín:
**Kế toán tải file lên SharePoint $\rightarrow$ Power Automate kích hoạt GitHub Actions $\rightarrow$ Tự động tính toán & cập nhật Web Dashboard riêng.**

---

## 🔐 1. MẬT KHẨU BẢO MẬT TRUY CẬP WEB DASHBOARD

Web Dashboard đã được tích hợp màn hình khóa bảo mật bằng chuẩn mã hóa SHA-256.

* **Mật khẩu mặc định:** `vikoda1979` hoặc `vikoda@2026`
* **Tính năng:** Tự động ghi nhớ phiên đăng nhập trên thiết bị (không cần nhập lại mật khẩu mỗi lần mở).
* **Cách đổi mật khẩu:**
  - Mở file `web/js/auth.js`.
  - Thay đổi giá trị mật khẩu trong hàm `login(...)` hoặc tạo chuỗi mã hóa SHA-256 mới.

---

## ⚡ 2. CẤU HÌNH POWER AUTOMATE CLOUD FLOW (KHI CÓ FILE MỚI TRÊN SHAREPOINT)

Để Power Automate tự động gọi GitHub cập nhật Web mỗi khi có file Sell In mới:

### Bước 2.1: Tạo GitHub Personal Access Token (PAT)
1. Đăng nhập vào [GitHub.com](https://github.com) $\rightarrow$ Bấm Avatar góc phải $\rightarrow$ **Settings**.
2. Cuộn xuống cuối bên trái chọn **Developer Settings** $\rightarrow$ **Personal access tokens** $\rightarrow$ **Tokens (classic)**.
3. Bấm **Generate new token (classic)**:
   - Đặt tên: `PowerAutomate_Trigger`
   - Tích chọn quyền: **`repo`** (Full control of private repositories) và **`workflow`**.
   - Bấm **Generate token** và sao chép mã token (ví dụ: `ghp_xxxxxxxxxxxx`).

### Bước 2.2: Tạo Flow trên Power Automate Cloud
1. Truy cập [make.powerautomate.com](https://make.powerautomate.com) bằng tài khoản công ty.
2. Chọn **Create (Tạo mới)** $\rightarrow$ **Automated cloud flow (Luồng đám mây tự động)**.
3. **Trigger (Kích hoạt):** Tìm và chọn **When a file is created or modified in a folder (SharePoint)**.
   - **Site Address:** Chọn trang SharePoint công ty của bạn.
   - **Folder Id:** Chọn thư mục chứa file Sell In (ví dụ: `/Vikoda_Sales_Data/Data_Goc`).
4. **Action (Hành động):** Bấm thêm bước mới $\rightarrow$ Tìm action **HTTP**:
   - **Method (Phương thức):** `POST`
   - **URI:** `https://api.github.com/repos/<Tên_User_GitHub>/<Tên_Repo>/dispatches`
   - **Headers:**
     ```
     Accept: application/vnd.github.v3+json
     Authorization: Bearer <Mã_Token_GitHub_ở_Bước_2.1>
     User-Agent: PowerAutomate-Bot
     Content-Type: application/json
     ```
   - **Body (Nội dung):**
     ```json
     {
       "event_type": "sharepoint_update"
     }
     ```
5. Bấm **Save (Lưu)** và bật **Turn on**.

👉 **Kết quả:** Từ nay, bất cứ khi nào kế toán tải file Excel tháng mới lên thư mục SharePoint đó, Power Automate sẽ tự động "bắn tin" cho GitHub Actions chạy phân tích và cập nhật Web Dashboard ngay lập tức!

---

## 🌐 3. CÁCH LẤY LINK WEB MIỄN PHÍ TRÊN GITHUB PAGES / VERCEL

### Cách A: Bật GitHub Pages (Có link dạng `https://<user>.github.io/<repo>/`)
1. Vào repository dự án trên GitHub $\rightarrow$ Chọn tab **Settings**.
2. Ở cột bên trái chọn **Pages**.
3. Tại mục **Build and deployment $\rightarrow$ Source**, chọn **GitHub Actions**.
4. Xong! Web Dashboard sẽ tự động được xuất bản và bạn có đường link web công khai để gửi cho toàn công ty.

### Cách B: Đưa lên Vercel (Có link dạng `https://vikoda-sellin.vercel.app`)
1. Truy cập [vercel.com](https://vercel.com) $\rightarrow$ Đăng nhập bằng tài khoản GitHub.
2. Bấm **Add New... $\rightarrow$ Project** $\rightarrow$ Chọn repository dự án này.
3. Vercel sẽ tự nhận diện file `vercel.json` và build trang web trong 15 giây.

---

## 📌 4. CÁCH NHÚNG WEB DASHBOARD VÀO SHAREPOINT PAGE NỘI BỘ

Nếu muốn Sếp và nhân viên xem ngay bên trong cổng thông tin nội bộ SharePoint của công ty:

1. Mở trang SharePoint của phòng Kinh doanh (ví dụ: `https://vikoda.sharepoint.com/sites/sales`).
2. Bấm nút **Edit (Chỉnh sửa trang)** ở góc trên bên phải.
3. Bấm dấu **`+`** để thêm Web Part mới $\rightarrow$ Tìm và chọn **Embed (Nhúng)**.
4. Dán đoạn mã sau vào ô Website address or embed code:
   ```html
   <iframe src="https://<link_web_dashboard_cua_ban>" width="100%" height="800px" frameborder="0" scrolling="no"></iframe>
   ```
5. Bấm **Republish (Xuất bản lại trang)**.

👉 Toàn bộ Ban Giám Đốc và nhân viên khi vào SharePoint sẽ thấy ngay bảng điều khiển tương tác bán hàng Vikoda trực tiếp trên giao diện SharePoint công ty!
