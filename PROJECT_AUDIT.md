# BÁO CÁO AUDIT HỆ THỐNG VIKODA SELL-IN DASHBOARD

**Repository:** `Huanpro1239/vikoda-sellin-dashboard`  
**Ngày cập nhật:** 25/08/2026  
**Phạm vi:** Kiến trúc dữ liệu, CI/CD, SharePoint, bảo mật và repo hygiene

## 1. Kiến trúc hiện hành

Pipeline chính thức:

```text
SharePoint Online
    ↓
Microsoft Graph
    ↓
GitHub Actions
    ↓
Python ETL --strict
    ↓
Validation + Health Check
    ↓
Data/Data_Goc
    ↓
Microsoft Graph Upload
    ↓
SharePoint/Data_Goc
```

Không có lớp Flow/webhook trung gian trong pipeline production.

## 2. Workflow

Dự án chỉ dùng workflow chính:

```text
.github/workflows/vikoda_pipeline.yml
```

| Event | Hành vi |
|---|---|
| Pull request | Repository hygiene + read-only CI |
| Push `main` | Repository hygiene + read-only CI |
| Schedule 18:00 VN | CI → SharePoint refresh → ETL → upload `Data_Goc` |
| Manual | Có thể refresh ngay; publish dashboard chỉ khi được phê duyệt |

## 3. Trạng thái kiểm thử

Run CI sau khi chuẩn hóa kiến trúc đã đạt:

- `sell-in-monthly`: 69 tests PASS.
- `skill-bao-cao`: 135 tests PASS.
- `production-hardening`: 20 tests PASS.
- Tổng Python: 224 tests PASS.
- Web regression: 16 tests PASS.
- Repository hygiene: PASS.

Cloud refresh bị skip trên push là đúng thiết kế; cloud chỉ chạy theo schedule hoặc manual dispatch.

## 4. Kiểm soát dữ liệu

- Không commit workbook production trong `Data/`.
- Không commit payload production trong `web/data/`.
- Không lưu `.env`, Client Secret hoặc token trong repository.
- Cloud pipeline fail-closed nếu thiếu credential hoặc SharePoint không trả workbook hợp lệ.
- `run_cloud_pipeline.py --strict` yêu cầu artifact của chính lượt chạy hiện tại.
- `Data_Goc` chỉ được upload sau khi ETL và health check thành công.

## 5. Microsoft Entra / Graph

Repository Secrets bắt buộc:

```text
AZURE_TENANT_ID
AZURE_CLIENT_ID
AZURE_CLIENT_SECRET
```

SharePoint site/drive có thể được tự resolve bởi `code/common/sharepoint_bootstrap.py`.

Khuyến nghị permission:

```text
Microsoft Graph Application permission: Sites.Selected
Site Planning: write
```

## 6. Dashboard hosting

Static hosting không phải ranh giới bảo mật cho dữ liệu nội bộ. Job publish chỉ được phép chạy khi đồng thời có:

```text
ENABLE_PAGES_DEPLOY=true
WEB_DATA_CLASSIFICATION=public-or-sanitized
```

và người vận hành chủ động chọn `publish_dashboard=true` trong manual workflow.

## 7. Thành phần legacy đã loại bỏ

Đã xóa khỏi cây `main`:

- Hai workflow cũ chồng chéo.
- Hướng dẫn SharePoint legacy.
- Helper Flow Studio.
- PAD/MCP server.
- Bộ `.agents/skills` legacy.
- Tài liệu Word binary cũ; script sinh Word đã được viết lại theo kiến trúc Graph hiện hành.

## 8. Việc còn phải hoàn tất trước production cloud

1. Tạo đủ ba GitHub Repository Secrets.
2. Xác nhận Entra App được Admin consent.
3. Xác nhận App có quyền `write` trên site `Planning`.
4. Chạy manual workflow với `run_cloud_refresh=true`, `publish_dashboard=false`.
5. Kiểm tra `Data_Goc` trên SharePoint có Modified time mới.
6. Chỉ sau khi end-to-end refresh PASS mới để schedule vận hành ổn định.

## 9. Lệnh kiểm tra local

```bash
python code/run_all_tests.py --quiet
npm run verify:web
python code/health_check.py
```

Dependency tạo Word guide là tùy chọn:

```bash
python -m pip install -r requirements-optional.txt
```

Chi tiết vận hành xem [`HUONG_DAN_SHAREPOINT_GITHUB_ACTIONS.md`](HUONG_DAN_SHAREPOINT_GITHUB_ACTIONS.md).
