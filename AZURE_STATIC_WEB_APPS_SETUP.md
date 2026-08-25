# Azure Static Web Apps — Vikoda Sell-In Dashboard

Tài liệu này cấu hình dashboard production theo kiến trúc:

```text
SharePoint change
  -> GitHub Actions OIDC
  -> incremental Data_Goc
  -> dashboard_data.json
  -> web regression tests
  -> Azure Static Web Apps Free
  -> Microsoft Entra sign-in
  -> role vikoda-user
```

## 1. Security model

- Dữ liệu production **không được commit vào Git**.
- Dashboard production **không dùng GitHub Pages**.
- Azure Static Web Apps phục vụ toàn bộ `web/` sau khi pipeline build dữ liệu.
- `web/staticwebapp.config.json` khóa `/*` và `/data/*` bằng custom role `vikoda-user`.
- `web/login.html` dùng Microsoft Entra ID qua `/.auth/login/aad`.
- GitHub login provider bị chặn.
- Client-side password cũ chỉ là UX fallback cho local development và không phải security boundary.

## 2. Tạo Azure Static Web App

Trong Azure Portal:

1. Chọn **Create a resource** -> **Static Web App**.
2. Subscription: dùng subscription Azure hiện có.
3. Resource Group: tạo hoặc chọn một resource group, ví dụ `rg-vikoda-dashboard`.
4. Name: ví dụ `vikoda-sellin-dashboard`.
5. Hosting plan: **Free**.
6. Region: chọn region gần Việt Nam nếu Azure Portal cung cấp.
7. Deployment source: chọn **Other** nếu có, vì repository đã có workflow production riêng và không cần Azure tự sinh thêm workflow.
8. Create resource.

Không bật public GitHub Pages cho dữ liệu thật.

## 3. Lấy deployment token

Trong Static Web App vừa tạo:

1. Mở **Overview**.
2. Chọn **Manage deployment token**.
3. Copy token.

Không commit token vào repository và không gửi token trong issue/chat công khai.

## 4. Cấu hình GitHub

Vào repository:

```text
Settings
-> Secrets and variables
-> Actions
```

### Repository Secret

Tạo:

```text
AZURE_STATIC_WEB_APPS_API_TOKEN = <deployment token từ Azure>
```

### Repository Variable

Tạo:

```text
ENABLE_SWA_DEPLOY = true
```

Giữ public Pages đóng cho production:

```text
ENABLE_PAGES_DEPLOY = false
WEB_DATA_CLASSIFICATION = internal
```

## 5. Cấp quyền người dùng

Dashboard không dùng role `authenticated` vì provider Microsoft Entra dựng sẵn có thể cho nhiều Microsoft account đăng nhập. Production dùng custom role:

```text
vikoda-user
```

Trong Azure Portal:

1. Static Web App -> **Settings** -> **Role Management**.
2. Chọn **Invite**.
3. Authorization provider: **Microsoft Entra ID**.
4. Nhập email Microsoft của người được phép truy cập.
5. Role: `vikoda-user`.
6. Generate invitation.
7. Gửi invitation link cho người dùng.
8. Người dùng mở link và đăng nhập Microsoft để nhận role.

Chỉ user có `vikoda-user` mới truy cập được `index.html`, JavaScript và `data/dashboard_data.json`.

## 6. Lần deploy đầu tiên

Sau khi Secret và Variable đã có:

```text
Actions
-> Vikoda Sell-In Pipeline
-> Run workflow
```

Chọn:

```text
Branch: main
run_cloud_refresh: true
publish_dashboard: false
```

`publish_dashboard=false` chỉ giữ GitHub Pages public đóng. Azure Static Web Apps vẫn deploy khi `ENABLE_SWA_DEPLOY=true`.

Các step cần PASS:

```text
Validate generated web dashboard
Validate Azure Static Web Apps security configuration
Evaluate authenticated Azure Static Web Apps deployment gate
Validate Azure Static Web Apps deployment token
Deploy authenticated dashboard to Azure Static Web Apps
Commit successful SharePoint source manifest
```

## 7. Tự động cập nhật

Schedule hiện kiểm tra SharePoint định kỳ.

```text
Không đổi nguồn
  -> watcher STOP
  -> không ETL
  -> không deploy web

Có đổi nguồn
  -> xác định period thay đổi
  -> incremental rebuild
  -> Data_Goc delta upload
  -> rebuild dashboard_data.json
  -> web tests
  -> Azure Static Web Apps deploy
```

Không cần Power Automate Premium.

## 8. Login / logout

Unauthenticated user được đưa tới:

```text
/login.html
```

Login Microsoft:

```text
/.auth/login/aad
```

Logout:

```text
/.auth/logout?post_logout_redirect_uri=/login.html
```

Nếu user đã đăng nhập Microsoft nhưng chưa có role `vikoda-user`, trang login hiển thị thông báo chưa được cấp quyền thay vì mở dashboard.

## 9. Kiểm tra sau triển khai

1. Mở URL `https://<app>.azurestaticapps.net/` trong cửa sổ ẩn danh.
2. Xác nhận bị chuyển tới login.
3. Đăng nhập user chưa được mời -> không vào dashboard.
4. Mở invitation bằng user được cấp `vikoda-user`.
5. Mở lại dashboard -> truy cập thành công.
6. Bấm **Đăng xuất** -> quay về `/login.html`.
7. Sửa một file ERP trên SharePoint và chờ watcher -> web phải tự cập nhật sau pipeline kế tiếp.

## 10. Free plan notes

Free plan phù hợp cho giai đoạn hiện tại nhưng không có private endpoint/SLA. Nếu sau này policy công ty yêu cầu tenant-only custom identity provider, private endpoint hoặc SLA production, đánh giá nâng lên Standard trước khi mở rộng phạm vi sử dụng.
