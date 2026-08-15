"""Tạo tài liệu Word (.docx) chuyên nghiệp trình bày Sơ đồ & Quy trình Tự động hóa Web Dashboard Vikoda."""

import docx
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn
from pathlib import Path


def set_cell_background(cell, fill_hex):
    """Đặt màu nền cho ô trong bảng."""
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)


def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    """Đặt lề trong cho ô."""
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{m}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)


def create_document(output_path: Path):
    doc = Document()

    # Cấu hình lề trang tiêu chuẩn (1 inch)
    sections = doc.sections
    for s in sections:
        s.top_margin = Inches(0.8)
        s.bottom_margin = Inches(0.8)
        s.left_margin = Inches(0.9)
        s.right_margin = Inches(0.9)

    # Đổi font chữ mặc định thành Arial
    style = doc.styles['Normal']
    font = style.font
    font.name = 'Arial'
    font.size = Pt(10.5)
    font.color.rgb = RGBColor(0x33, 0x41, 0x55) # Slate 700

    # --------------------------------------------------------------------------
    # HEADER & BANNER TIÊU ĐỀ
    # --------------------------------------------------------------------------
    title_p = doc.add_paragraph()
    title_p.paragraph_format.space_before = Pt(0)
    title_p.paragraph_format.space_after = Pt(4)
    run_company = title_p.add_run("CÔNG TY CỔ PHẦN NƯỚC KHOÁNG KHÁNH HÒA — VIKODA 1979\n")
    run_company.font.size = Pt(11)
    run_company.font.bold = True
    run_company.font.color.rgb = RGBColor(0x02, 0x84, 0xC7) # Sky blue

    run_title = title_p.add_run("SƠ ĐỒ QUY TRÌNH TỰ ĐỘNG HÓA BÁO CÁO SELL-IN\nVÀ HỆ THỐNG WEB DASHBOARD ĐIỀU HÀNH 24/7")
    run_title.font.size = Pt(18)
    run_title.font.bold = True
    run_title.font.color.rgb = RGBColor(0x10, 0x2A, 0x43) # Navy

    meta_p = doc.add_paragraph()
    meta_p.paragraph_format.space_after = Pt(16)
    meta_run = meta_p.add_run("Tác giả: Ban Điều Hành & Dự Án Tự Động Hóa Dữ Liệu | Phiên bản: Cloud Pro 2026 | Ngày: 15/08/2026")
    meta_run.font.size = Pt(9.5)
    meta_run.font.italic = True
    meta_run.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)

    # Đường kẻ ngăn cách
    p_line = doc.add_paragraph()
    p_line.paragraph_format.space_after = Pt(16)
    run_hr = p_line.add_run("―" * 60)
    run_hr.font.color.rgb = RGBColor(0xCB, 0xD5, 0xE1)

    # --------------------------------------------------------------------------
    # 1. TỔNG QUAN HỆ THỐNG
    # --------------------------------------------------------------------------
    h1 = doc.add_heading(level=1)
    h1.paragraph_format.space_before = Pt(12)
    h1.paragraph_format.space_after = Pt(6)
    r1 = h1.add_run("1. TỔNG QUAN HỆ THỐNG TỰ ĐỘNG HÓA CLOUD 24/7")
    r1.font.size = Pt(13)
    r1.font.bold = True
    r1.font.color.rgb = RGBColor(0x10, 0x2A, 0x43)

    p_desc = doc.add_paragraph(
        "Hệ thống báo cáo điều hành Sell In Vikoda được xây dựng theo kiến trúc Đám mây (Cloud) khép kín, "
        "hoạt động 24/7 hoàn toàn tự động mà không cần duy trì máy chủ cục bộ hay cắm máy tính. "
        "Ngay khi kế toán tải file Excel từ phần mềm ERP lên thư mục SharePoint, chuỗi xử lý ETL sẽ tự động kích hoạt, "
        "làm sạch dữ liệu, tách báo cáo tháng và cập nhật tức thì lên Web Dashboard riêng của công ty."
    )
    p_desc.paragraph_format.line_spacing = 1.25
    p_desc.paragraph_format.space_after = Pt(12)

    # Bảng tóm tắt thông số hệ thống
    table_meta = doc.add_table(rows=5, cols=2)
    table_meta.alignment = WD_TABLE_ALIGNMENT.CENTER
    table_meta.autofit = False

    meta_rows = [
        ("Nguồn dữ liệu đầu vào", "SharePoint Online / Thư mục 'Data ERP' (File .xlsm thô từ ERP VKD & Vikoda)"),
        ("Cơ chế kích hoạt tự động", "Power Automate Cloud Flow (Phát hiện file mới qua Webhook)"),
        ("Máy chủ tính toán ETL", "GitHub Actions Cloud Server (Chạy ngầm Python 3.11 trong 30-45 giây)"),
        ("Giao diện người dùng (Web)", "Web Dashboard tương tác đa chiều (ECharts, Mobile-First, Tự động phân trang)"),
        ("Địa chỉ truy cập & Bảo mật", "https://huanpro1239.github.io/vikoda-sellin-dashboard/ (Mật khẩu: vikoda1979)"),
    ]

    for idx, (label, val) in enumerate(meta_rows):
        row = table_meta.rows[idx]
        c0, c1 = row.cells[0], row.cells[1]
        c0.width = Inches(2.2)
        c1.width = Inches(4.5)
        
        p0 = c0.paragraphs[0]
        r0 = p0.add_run(label)
        r0.font.bold = True
        r0.font.size = Pt(9.5)
        r0.font.color.rgb = RGBColor(0x1E, 0x29, 0x3B)

        p1 = c1.paragraphs[0]
        r1 = p1.add_run(val)
        r1.font.size = Pt(9.5)
        r1.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)

        fill_color = "F8FAFC" if idx % 2 == 0 else "FFFFFF"
        set_cell_background(c0, fill_color)
        set_cell_background(c1, fill_color)
        set_cell_margins(c0, 60, 60, 100, 100)
        set_cell_margins(c1, 60, 60, 100, 100)

    doc.add_paragraph().paragraph_format.space_after = Pt(12)

    # --------------------------------------------------------------------------
    # 2. SƠ ĐỒ QUY TRÌNH 4 BƯỚC KHÉP KÍN
    # --------------------------------------------------------------------------
    h2 = doc.add_heading(level=1)
    h2.paragraph_format.space_before = Pt(14)
    h2.paragraph_format.space_after = Pt(6)
    r2 = h2.add_run("2. SƠ ĐỒ QUY TRÌNH 4 BƯỚC KHÉP KÍN")
    r2.font.size = Pt(13)
    r2.font.bold = True
    r2.font.color.rgb = RGBColor(0x10, 0x2A, 0x43)

    # Bảng biểu diễn sơ đồ các bước
    table_steps = doc.add_table(rows=5, cols=3)
    table_steps.alignment = WD_TABLE_ALIGNMENT.CENTER
    table_steps.autofit = False

    headers = ["Bước", "Thành phần & Trách nhiệm", "Nội dung & Hành động tự động"]
    for i, title in enumerate(headers):
        cell = table_steps.rows[0].cells[i]
        set_cell_background(cell, "102A43") # Navy header
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(title)
        r.font.bold = True
        r.font.size = Pt(10)
        r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        set_cell_margins(cell, 80, 80, 100, 100)

    table_steps.rows[0].cells[0].width = Inches(1.0)
    table_steps.rows[0].cells[1].width = Inches(2.2)
    table_steps.rows[0].cells[2].width = Inches(3.5)

    step_data = [
        ("BƯỚC 1", "Kế toán / Sales Admin\n(Nguồn dữ liệu)", "Xuất file báo cáo đơn hàng bán trong kỳ từ phần mềm ERP (.xlsm) và thả vào thư mục 'Data ERP' trên SharePoint công ty."),
        ("BƯỚC 2", "Power Automate Cloud\n(Kích hoạt thời gian thực)", "Phát hiện có file .xlsm mới tải lên hoặc chỉnh sửa trong thư mục SharePoint. Ngay lập tức gửi HTTP Webhook POST sang GitHub Actions."),
        ("BƯỚC 3", "GitHub Actions Cloud\n(ETL Python tự động)", "Khởi động máy chủ ảo: Chạy chuỗi 'Tách data', đọc dữ liệu thô, làm sạch, quy đổi két/thùng/bình, đối chiếu Target, và nén dữ liệu cho Web Dashboard."),
        ("BƯỚC 4", "Web Dashboard 24/7\n(Xuất bản & Điều hành)", "Tự động xuất bản phiên bản mới lên GitHub Pages. Ban Giám Đốc và Quản lý vùng mở link web xem báo cáo ngay trên điện thoại hoặc máy tính."),
    ]

    for idx, (b, comp, act) in enumerate(step_data):
        row = table_steps.rows[idx + 1]
        c0, c1, c2 = row.cells[0], row.cells[1], row.cells[2]
        c0.width = Inches(1.0)
        c1.width = Inches(2.2)
        c2.width = Inches(3.5)

        # Cột Bước
        p0 = c0.paragraphs[0]
        p0.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r0 = p0.add_run(b)
        r0.font.bold = True
        r0.font.size = Pt(9.5)
        r0.font.color.rgb = RGBColor(0x02, 0x84, 0xC7)

        # Cột Thành phần
        p1 = c1.paragraphs[0]
        r1 = p1.add_run(comp)
        r1.font.bold = True
        r1.font.size = Pt(9.5)
        r1.font.color.rgb = RGBColor(0x1E, 0x29, 0x3B)

        # Cột Hành động
        p2 = c2.paragraphs[0]
        r2 = p2.add_run(act)
        r2.font.size = Pt(9.5)
        r2.font.color.rgb = RGBColor(0x33, 0x41, 0x55)

        bg = "F1F5F9" if idx % 2 == 0 else "FFFFFF"
        for c in [c0, c1, c2]:
            set_cell_background(c, bg)
            set_cell_margins(c, 80, 80, 100, 100)

    doc.add_paragraph().paragraph_format.space_after = Pt(12)

    # --------------------------------------------------------------------------
    # 3. CHI TIẾT XỬ LÝ DỮ LIỆU TỪ THƯ MỤC "DATA ERP"
    # --------------------------------------------------------------------------
    h3 = doc.add_heading(level=1)
    h3.paragraph_format.space_before = Pt(14)
    h3.paragraph_format.space_after = Pt(6)
    r3 = h3.add_run("3. CHI TIẾT XỬ LÝ DỮ LIỆU TRONG THƯ MỤC 'DATA ERP'")
    r3.font.size = Pt(13)
    r3.font.bold = True
    r3.font.color.rgb = RGBColor(0x10, 0x2A, 0x43)

    p_erp = doc.add_paragraph(
        "Kịch bản tự động hóa đám mây (run_cloud_pipeline.py) được trang bị các thuật toán thông minh "
        "để chuẩn hóa hoàn toàn dữ liệu thô từ hệ thống ERP:"
    )
    p_erp.paragraph_format.space_after = Pt(6)

    erp_points = [
        ("Xử lý đa nguồn pháp nhân:", "Tự động phân biệt và gộp chung dữ liệu từ 2 nguồn: VKD (NPP) và Vikoda (Trực tiếp), loại bỏ hoàn toàn trùng lặp."),
        ("Phân loại nghiệp vụ hóa đơn:", "Tự động nhận diện Đơn hàng bán và Đơn hàng trả lại (ghi nhận doanh thu âm chính xác). Loại bỏ các chứng từ điều chuyển kho nội bộ hoặc mẫu thử."),
        ("Chuẩn hóa Danh mục & Vùng miền:", "Ánh xạ mã khách hàng về đúng 20 Vùng bán hàng và 5 Miền (Bắc, Trung 1, Trung 2, Nam, KA, B2C). Tách riêng kênh KA khỏi kênh NPP."),
        ("Quy đổi sản lượng bao bì:", "Tự động tổng hợp chính xác số lượng theo 3 nhóm quy cách: Két, Thùng và Bình 19L dựa trên danh mục sản phẩm chuẩn."),
        ("So sánh Target & Nhịp độ Run-rate:", "Tự động tính tỷ lệ đạt kế hoạch (% Target), chênh lệch Gap còn thiếu, và tốc độ bán hàng cần đạt mỗi ngày để về đích."),
    ]

    for title, detail in erp_points:
        p = doc.add_paragraph(style='List Bullet')
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.line_spacing = 1.15
        r_b = p.add_run(f"{title} ")
        r_b.font.bold = True
        r_b.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)
        r_d = p.add_run(detail)
        r_d.font.color.rgb = RGBColor(0x33, 0x41, 0x55)

    doc.add_paragraph().paragraph_format.space_after = Pt(10)

    # --------------------------------------------------------------------------
    # 4. HỆ THỐNG GIAO DIỆN WEB DASHBOARD (MOBILE-FIRST)
    # --------------------------------------------------------------------------
    h4 = doc.add_heading(level=1)
    h4.paragraph_format.space_before = Pt(14)
    h4.paragraph_format.space_after = Pt(6)
    r4 = h4.add_run("4. TÍNH NĂNG WEB DASHBOARD & TRẢI NGHIỆM DI ĐỘNG")
    r4.font.size = Pt(13)
    r4.font.bold = True
    r4.font.color.rgb = RGBColor(0x10, 0x2A, 0x43)

    p_web = doc.add_paragraph(
        "Giao diện Web Dashboard được thiết kế theo tiêu chuẩn Executive Dashboard chuyên nghiệp, "
        "hỗ trợ 100% các thiết bị Điện thoại (iPhone/Android) và Máy tính bảng/Laptop:"
    )
    p_web.paragraph_format.space_after = Pt(6)

    web_points = [
        ("Màn hình bảo mật (Security Gate):", "Bảo vệ báo cáo bằng mã hóa SHA-256 (Mật khẩu mặc định: vikoda1979), có tùy chọn 'Ghi nhớ đăng nhập trên thiết bị này'."),
        ("Thanh điều hướng di động (Bottom Navigation Bar):", "6 nút bấm nhanh ở đáy màn hình điện thoại giúp chuyển đổi giữa 6 trang chỉ bằng một tay."),
        ("Ngăn kéo bộ lọc (Filter Drawer):", "Nút 'Bộ lọc' thông minh cho phép chỉnh khoảng ngày tháng và lọc Miền/Kênh mà không chiếm diện tích màn hình điện thoại."),
        ("Lọc chéo đa chiều (Cross-Filtering):", "Nhấp vào bất kỳ cột biểu đồ hoặc thanh kênh nào, toàn bộ số liệu và các trang khác sẽ tự động lọc theo."),
        ("Xuất báo cáo Excel phẳng (Trang 05):", "Tải bảng chi tiết khách hàng & sản phẩm về máy tính hoặc điện thoại chỉ với 1 cú nhấp chuột."),
    ]

    for title, detail in web_points:
        p = doc.add_paragraph(style='List Bullet')
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.line_spacing = 1.15
        r_b = p.add_run(f"{title} ")
        r_b.font.bold = True
        r_b.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)
        r_d = p.add_run(detail)
        r_d.font.color.rgb = RGBColor(0x33, 0x41, 0x55)

    doc.add_paragraph().paragraph_format.space_after = Pt(10)

    # --------------------------------------------------------------------------
    # 5. SO SÁNH HIỆU QUẢ TRƯỚC VÀ SAU KHI TRIỂN KHAI
    # --------------------------------------------------------------------------
    h5 = doc.add_heading(level=1)
    h5.paragraph_format.space_before = Pt(14)
    h5.paragraph_format.space_after = Pt(6)
    r5 = h5.add_run("5. HIỆU QUẢ VẬN HÀNH SAU KHI TỰ ĐỘNG HÓA")
    r5.font.size = Pt(13)
    r5.font.bold = True
    r5.font.color.rgb = RGBColor(0x10, 0x2A, 0x43)

    table_comp = doc.add_table(rows=6, cols=3)
    table_comp.alignment = WD_TABLE_ALIGNMENT.CENTER
    table_comp.autofit = False

    comp_headers = ["Tiêu chí đánh giá", "Quy trình thủ công trước đây", "Hệ thống tự động hóa Cloud hiện tại"]
    for i, title in enumerate(comp_headers):
        cell = table_comp.rows[0].cells[i]
        set_cell_background(cell, "0369A1") # Sky blue dark
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(title)
        r.font.bold = True
        r.font.size = Pt(10)
        r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        set_cell_margins(cell, 80, 80, 100, 100)

    table_comp.rows[0].cells[0].width = Inches(1.8)
    table_comp.rows[0].cells[1].width = Inches(2.4)
    table_comp.rows[0].cells[2].width = Inches(2.5)

    comp_data = [
        ("Thời gian xử lý báo cáo", "Mất 1 - 2 ngày kế toán xử lý Excel thủ công", "Tự động 100% trong vòng 30 - 45 giây"),
        ("Tần suất cập nhật số liệu", "Mỗi tháng chỉ xem được 1 lần khi đóng sổ", "Cập nhật liên tục bất cứ khi nào có file mới"),
        ("Thiết bị truy cập", "Phải mở máy tính cá nhân cài Power BI/Excel", "Mở trên điện thoại di động, máy tính bảng, PC 24/7"),
        ("Chi phí bản quyền phần mềm", "Tốn phí mua Power BI Pro ($10/người/tháng)", "0đ chi phí (GitHub Pages & Power Automate sẵn có)"),
        ("Độ chính xác dữ liệu", "Dễ nhầm lẫn khi copy-paste thủ công", "Chuẩn hóa thuật toán Python, kiểm thử tự động 174 test"),
    ]

    for idx, (crit, old, new) in enumerate(comp_data):
        row = table_comp.rows[idx + 1]
        c0, c1, c2 = row.cells[0], row.cells[1], row.cells[2]
        c0.width = Inches(1.8)
        c1.width = Inches(2.4)
        c2.width = Inches(2.5)

        p0 = c0.paragraphs[0]
        r0 = p0.add_run(crit)
        r0.font.bold = True
        r0.font.size = Pt(9.5)
        r0.font.color.rgb = RGBColor(0x1E, 0x29, 0x3B)

        p1 = c1.paragraphs[0]
        r1 = p1.add_run(old)
        r1.font.size = Pt(9.5)
        r1.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)

        p2 = c2.paragraphs[0]
        r2 = p2.add_run(new)
        r2.font.bold = True
        r2.font.size = Pt(9.5)
        r2.font.color.rgb = RGBColor(0x16, 0xA3, 0x4A) # Green

        bg = "F8FAFC" if idx % 2 == 0 else "FFFFFF"
        for c in [c0, c1, c2]:
            set_cell_background(c, bg)
            set_cell_margins(c, 70, 70, 90, 90)

    # Footer note
    p_foot = doc.add_paragraph()
    p_foot.paragraph_format.space_before = Pt(20)
    r_foot = p_foot.add_run("― Hết tài liệu quy trình ―")
    r_foot.font.italic = True
    r_foot.font.size = Pt(9)
    p_foot.alignment = WD_ALIGN_PARAGRAPH.CENTER

    doc.save(str(output_path))
    print(f"Da xuat tai lieu Word thanh cong: {output_path}")


if __name__ == "__main__":
    out_file = Path("D:/Vikoda/Bao cao Sell in/Quy_Trinh_Tu_Dong_Hoa_Bao_Cao_SellIn_Vikoda.docx")
    create_document(out_file)
