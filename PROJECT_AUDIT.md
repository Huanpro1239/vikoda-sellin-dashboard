# BÁO CÁO AUDIT HỆ THỐNG VIKODA SELL-IN DASHBOARD

**Repository:** `https://github.com/Huanpro1239/vikoda-sellin-dashboard`  
**Ngày cập nhật:** 15/08/2026
**Phạm vi:** Kiến trúc dữ liệu, kiểm thử, CI/CD, bảo mật và repo hygiene

---

> **Kết luận:** Chưa production-ready cho public hosting. Repo/lịch sử và static
> web payload từng chứa dữ liệu nghiệp vụ chi tiết; prompt mật khẩu phía client
> không phải access control. Hardening CI giảm nguy cơ tái diễn nhưng không xóa
> dữ liệu đã commit hoặc đã publish. Xem `SECURITY.md` trước mọi lần deploy.

## 1. Tổng quan

- **Pipeline:** ERP Excel → Python ETL → staging/quality report → Excel/web artifact.
- **Nguồn:** Sell-In ERP, danh mục khách hàng/sản phẩm, target bán hàng.
- **Cloud:** Microsoft Graph/SharePoint và GitHub Actions.
- **Web:** Static HTML/CSS/JavaScript. Mô hình này không thể bảo vệ file dữ liệu
  bằng JavaScript chạy trong trình duyệt.

## 2. Trạng thái sau hardening

| Hạng mục | Trạng thái | Bằng chứng / việc còn lại |
| :--- | :---: | :--- |
| Architecture | Cải thiện | Có validation và atomic build; vẫn phải tách data lifecycle khỏi source lifecycle. |
| Data correctness | Có kiểm thử | Reconciliation/quality report có sẵn; phải chạy lại trên nguồn được phê duyệt cho từng kỳ. |
| Reliability | Cải thiện | Graph retry 429/5xx; cloud sync fail khi thiếu credential hoặc không có workbook nguồn hợp lệ. |
| Security | **BLOCKED P0** | Dữ liệu từng nằm trong repo/static hosting phải xem là đã lộ cho tới khi containment và history cleanup hoàn tất. |
| Maintainability | Cải thiện | Dependency lõi được pin; dependency Word/MCP tách riêng. Một số launcher/tài liệu cũ vẫn cần rà tiếp. |
| Testing | Bắt buộc trước merge | Pull request chạy read-only CI; số test lấy từ run hiện hành, không hardcode trong tài liệu. |
| CI/CD | Hardened, gated | Không còn bot commit data về `main`; deploy cần `ENABLE_PAGES_DEPLOY=true` và event được duyệt. |
| Governance | Cải thiện | Có `SECURITY.md`, proprietary notice và Dependabot. Branch/environment protection cần xác nhận trên GitHub. |
| Kết luận | **CHƯA PRODUCTION-READY CHO PUBLIC DATA** | Chỉ gỡ blocker sau khi xử lý public access, lịch sử dữ liệu và auth thật. |

## 3. Vấn đề theo mức ưu tiên

### P0 — Critical

1. **Public data boundary — chưa hoàn tất:** `.gitignore` mới chỉ ngăn file mới;
   không xóa file đã tracked. Cần hạn chế public access, kiểm kê/thu hồi, di
   chuyển dữ liệu và lập kế hoạch rewrite history riêng có backup.
2. **Client-side auth — chưa hoàn tất:** Prompt/hash phía client không chặn tải
   file trực tiếp. Cần server-side authentication hoặc identity-aware proxy
   trước khi xuất bản dữ liệu nội bộ.
3. **CI stale-data fallback — đã giảm thiểu:** Cloud sync giờ fail closed nếu CI
   thiếu toàn bộ/một phần secret hoặc SharePoint không trả về workbook
   `.xlsm`/`.xlsx` hợp lệ, không rỗng.

### P1 — Important

1. **CI tách quyền:** Pull request dùng `contents: read`, không có production
   secrets; job deploy chỉ có `contents: read`, `pages: write`, `id-token: write`.
2. **Không push artifact:** Đã bỏ bước `git add/commit/push` cho `Data/`, workbook
   và `web/data/`; checkout cũng không lưu credential ghi Git.
3. **Deploy secure-by-default:** Push vào `main` chỉ test. Deploy chỉ chạy khi
   repository variable `ENABLE_PAGES_DEPLOY=true` và workflow dispatch/lịch được
   duyệt. Chỉ bật biến sau khi artifact đã qua data-classification review và
   được phê duyệt publish.
4. **Dependency:** Pin dependency lõi trong `requirements.txt`; Word/MCP nằm
   trong `requirements-optional.txt`; Dependabot theo dõi pip/GitHub Actions.
5. **Việc còn lại:** Quét/strip macro, external link và metadata Office; bật
   secret scanning/private vulnerability reporting; xác nhận branch/environment
   protection trên GitHub.

### P2 — Improvement

1. `code/health_check.py` kiểm tra sáu thành phần hệ thống.
2. Có regression test riêng cho CI thiếu credential, partial credential,
   zero-download/no-workbook, local no-op và upload rỗng.
3. Số liệu kiểm thử và dữ liệu kinh doanh không được chép cố định vào tài liệu
   public; dùng log CI và quality artifact nội bộ của đúng run.

## 4. Điều kiện đối soát và phát hành

Không lưu con số doanh thu, target, khách hàng hoặc sản lượng sản xuất trong tài
liệu public. Kết quả chi tiết thuộc artifact nội bộ của từng run và phải được lưu
trong SharePoint/approved storage. Điều kiện phát hành:

- `Source - Excluded = Output` khớp theo số dòng và giá trị tiền;
- quality report có trạng thái `PASS`;
- nguồn đúng kỳ, tải được ít nhất một file và không dùng fallback từ run trước;
- artifact đã qua phân loại dữ liệu, kiểm tra macro/external link và phê duyệt;
- nơi publish có access control phù hợp với mức phân loại dữ liệu.

## 5. Lệnh kiểm tra

```powershell
py -3.12 -m pip install -r requirements.txt
py -3.12 code/run_all_tests.py --quiet
py -3.12 code/health_check.py
```

Dependency tùy chọn cho Word/local MCP server:

```powershell
py -3.12 -m pip install -r requirements-optional.txt
```

Chạy ETL local chỉ với dữ liệu đã được cấp quyền:

```powershell
py -3.12 code/Skill/skill-bao-cao/scripts/run_cloud_pipeline.py --project-root .
```
