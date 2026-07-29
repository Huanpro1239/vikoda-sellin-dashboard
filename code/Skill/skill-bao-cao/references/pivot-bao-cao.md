# Báo cáo PIVOT theo Miền/Vùng

## Mục tiêu

Tạo sheet `PIVOT` tương tự sheet cùng tên trong
`Sell_in_report_chuan.xlsb`, nhưng giữ các chỉ số kết quả bằng công thức để dễ
đối soát.

## Kỳ tính

Lấy kỳ từ `current_year` và `through_month` trong staging Sell In:

- `Actual`: tháng hiện tại.
- `LY`: cùng tháng năm trước.
- `Previous Month`: tháng liền trước.
- `Target`: Target của tháng hiện tại.

Ba chỉ tiêu Sell In `Actual`, `LY` và `Previous Month` chỉ tổng hợp các dòng
đã qua bộ lọc loại hóa đơn: `Đơn hàng bán` và `Đơn trả hàng`. Các loại khác
không được đưa vào `PVT_DATA`.

Nếu kỳ hiện tại là tháng 1, kỳ tháng trước là tháng 12 của năm trước. Khi nguồn
không có kỳ này, giá trị tháng trước bằng `0`.

## Ánh xạ Miền/Vùng

Dùng đúng thứ tự:

1. Miền Bắc: Bắc Miền Trung, Đông Bắc, Hà Nội, Tây Bắc.
2. Miền Nam: Miền Đông, Miền Tây, TP. HCM 1, TP. HCM 2.
3. Miền Trung 1: Miền Trung 1A, Miền Trung 1B, Tây Nguyên.
4. Miền Trung 2: Miền Trung 2A, Miền Trung 2B.
5. KA: KA Miền Bắc, KA Miền Trung 1, KA Miền Trung 2, KA Miền Nam.
6. MT: MT.
7. B2C: B2C.
8. Other: Other.

Với Sell In, tra `MaKhachHangMoi` trong DMKH. Với Target, ưu tiên
`MienBaoCao`/`VungBaoCao` từ staging, sau đó mới tra DMKH. Chuẩn hóa các biến thể
viết hoa/thường như `Ka Miền Trung 1`, `Miền tây`; chuyển `XK` và mọi cặp không
hợp lệ vào `Other`.

Riêng Target có mã hoặc tên `B2C` phải ánh xạ trực tiếp vào `B2C/B2C`, kể cả
khi metadata staging hoặc DMKH bị thiếu. Dừng kiểm tra nếu Target B2C còn xuất
hiện trong `Other`.

Riêng Target có tên `Other` phải ánh xạ trực tiếp vào `Other/Other`. Dừng kiểm
tra nếu dòng Target này bị bỏ hoặc xuất hiện trong vùng khác.

Dừng quy trình nếu DMKH còn cùng mã khách hàng nhưng có Miền/Vùng mâu thuẫn.

## PVT_DATA

Để sheet `PVT_DATA` ẩn và lưu các cột:

`MIEN, VUNG, MaKH, KhachHang, SanPham, Actual, CungKyLY, ThangTruoc,
Vikoda, TargetTong, TargetVikoda, KDT, VikodaLY, VikodaThangTruoc`

- Gộp Sell In theo Miền, Vùng, khách hàng và sản phẩm trên ba kỳ cần tính.
- Thêm một dòng sản phẩm `-` cho mỗi dòng Target của kỳ hiện tại.
- `Vikoda`: Actual nếu tên sản phẩm chứa `Vikoda`, ngược lại bằng `0`.
- `KDT`: Actual nếu tên sản phẩm chứa `KDT`, ngược lại bằng `0`.
- `VikodaLY` và `VikodaThangTruoc`: doanh thu Vikoda ở kỳ tương ứng.

## PIVOT

Vùng báo cáo `A1:S34`, bố cục theo file mẫu `Sell_in_report_chuan.xlsb`:

- Hàng 1: `DAILY REVENUE SELL IN REPORT: VIKODA`.
- Hàng 2: `Report for:` kèm ngày cập nhật và
  `Period: MM/YYYY | Unit: VND mn | Sales + Returns`.
- Hàng 3: nhóm cột `MARKET STRUCTURE`, `TARGET`, `MTD / GAP`, `LAST YEAR`,
  `LAST MONTH`.
- Hàng 4: tên cột.
- Hàng 5: số thứ tự cột `(1)`…`(17)` cho các cột từ C tới S.
- Hàng 6-33: 20 vùng xen 8 dòng tổng miền.
- Hàng 34: `Grand Total`.

Cột A là Miền (nhãn `Sales Region`), cột B là Vùng (nhãn `Area`) — đúng theo
cách gọi của file mẫu.

17 cột chỉ tiêu, đánh số để tên cột phần trăm tham chiếu được:

| Số | Cột | Nội dung |
| --- | --- | --- |
| (1) | C | Total Target |
| (2) | D | Vikoda Target |
| (3) | E | Total MTD |
| (4) | F | Total % (3) vs (1) |
| (5) | G | Total Gap |
| (6) | H | Vikoda MTD |
| (7) | I | Vikoda % (6) vs (2) |
| (8) | J | Vikoda Gap |
| (9) | K | KDT MTD |
| (10) | L | Total Last Year |
| (11) | M | Total % (3) vs (10) |
| (12) | N | Vikoda Last Year |
| (13) | O | Vikoda % (6) vs (12) |
| (14) | P | Total Last Month |
| (15) | Q | Total % (3) vs (14) |
| (16) | R | Vikoda Last Month |
| (17) | S | Vikoda % (6) vs (16) |

Dùng `SUMIFS`, `SUM` và `IFERROR` với phạm vi hữu hạn trong `PVT_DATA`. Hiển thị
doanh thu theo triệu đồng bằng định dạng `#,##0,,`, nhưng giữ giá trị ô theo VND
để cộng trừ không sinh sai số làm tròn.

## Sheet báo cáo theo miền

Tám sheet `BC_<Miền>` theo đúng thứ tự miền của báo cáo. Mỗi sheet:

- Hàng 2-3: tiêu đề và dòng thông tin kỳ.
- Hàng 5-8: hai hàng thẻ KPI, lấy thẳng từ dòng `Grand Total` của chính sheet.
  Hàng 5-6 là kết quả chung, hàng 7-8 là phần Vikoda:

  | Cột | Hàng 5-6 | Hàng 7-8 |
  | --- | --- | --- |
  | B | `ACTUAL` | `VIKODA` |
  | D | `CÙNG KỲ LY` | `TARGET` |
  | F | `% VS LY` | `% ĐẠT TARGET` |
  | H | `THÁNG TRƯỚC` | `TARGET VIKODA` |
  | J | `% VS THÁNG TRƯỚC` | `% ĐẠT TG VIKODA` |

  Phải có đủ cả `TARGET VIKODA` và `% ĐẠT TG VIKODA`: xem Vikoda đạt bao nhiêu
  phần trăm target riêng của nó là mục đích chính của sheet này.

- Hàng 10: tiêu đề bảng, 11 cột:
  `Vùng / Khách hàng / Sản phẩm`, `Actual`, `Cùng kỳ LY`, `% vs LY`,
  `Tháng trước`, `% vs TT`, `Vikoda`, `Target`, `% đạt Target`,
  `Target Vikoda`, `% đạt TG Vikoda`.
- Từ hàng 11: ba cấp Vùng → Khách hàng → Sản phẩm, kết thúc bằng `Grand Total`.

Cấp sản phẩm mặc định thu gọn. Dòng tổng nằm **trên** dòng chi tiết nên
`summaryBelow` phải để `False`, nếu không Excel sẽ gộp nhóm lệch một dòng.

Dòng vùng và dòng khách hàng dùng `SUMIFS` về `PVT_DATA` để luôn khớp `PIVOT`.
Dòng sản phẩm là dữ liệu lá nên ghi thẳng giá trị: dùng `SUMIFS` cho cả ba nghìn
dòng sản phẩm sẽ làm Excel mở rất chậm mà không thêm thông tin gì.

Gom khách hàng theo **mã**, không theo tên hiển thị. Cùng một mã có thể có hai
cách viết tên giữa Sell In và Target; nếu tách đôi thì dòng khách hàng dùng
`SUMIFS` theo mã sẽ đếm gộp cả hai trong khi dòng sản phẩm con chỉ có một phần.
Tên hiển thị chọn bản đầy đủ nhất trong các cách viết.

Dòng Target chưa gắn sản phẩm nằm ở sản phẩm `-`, hiển thị là
`(chưa gắn sản phẩm)`.

## Đối soát

- Tổng từng chỉ tiêu trong `PVT_DATA` phải khớp Target và Sell In nguồn.
- Từng dòng vùng trong `PIVOT` phải khớp tổng theo Miền/Vùng từ `PVT_DATA`.
- `Grand Total` phải khớp nguồn cho chín chỉ tiêu tiền.
- Các tỷ lệ phải dùng mẫu số đúng và trả `0` khi mẫu số bằng `0`.
- Mỗi dòng khách hàng trong `BC_` phải bằng tổng các dòng sản phẩm con.
- `Grand Total` của từng sheet `BC_` phải khớp dòng tổng miền trong `PIVOT`;
  tổng tám sheet phải khớp `Grand Total`.
- Tô màu tỷ lệ hoàn thành: đỏ dưới 80%, vàng từ 80% đến dưới 100%, xanh từ 100%.
- Tô chữ variance âm màu đỏ và variance dương màu xanh.

Vùng tô màu điều kiện phải **dừng trước dòng `Grand Total`**. Dòng đó nền xanh
đậm chữ trắng; nếu phủ thêm chữ đỏ hoặc nền đỏ nhạt lên trên thì gần như không
đọc được. Riêng dòng `Grand Total` dùng luật màu sáng: vàng nhạt `FFD966` cho
giá trị âm hoặc dưới target, xanh lá nhạt `A9D08E` cho phần còn lại.

`openpyxl` chỉ ghi công thức chứ không ghi kèm giá trị đã tính, nên đọc workbook
bằng `data_only=True` sẽ ra `None` cho tới khi Excel mở và lưu lại. Bộ kiểm tra
tự tính lại công thức bằng `scripts/formula_eval.py` thay vì tin vào giá trị
Excel đệm sẵn.
