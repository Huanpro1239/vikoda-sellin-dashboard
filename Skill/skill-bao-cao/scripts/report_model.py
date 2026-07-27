"""Mô hình dữ liệu dùng chung cho PIVOT, PVT_DATA và các sheet BC_.

Tách riêng khỏi phần dựng sheet để quy tắc gộp số liệu chỉ có đúng một bản:
ánh xạ khách hàng vào Miền/Vùng, nhận diện Vikoda/KDT theo tên sản phẩm, và
phạm vi ba kỳ (tháng hiện tại, cùng kỳ năm trước, tháng liền trước).

Chuyển từ `build_pivot_sheet.mjs` sang Python để luồng báo cáo không còn cần
Node kèm `@oai/artifact-tool`.
"""

from __future__ import annotations

import unicodedata
from typing import Any, Iterable


# Thứ tự miền và vùng trong báo cáo. 8 miền, 20 vùng bán hàng.
REPORTING_STRUCTURE: list[tuple[str, list[str]]] = [
    ("Miền Bắc", ["Bắc Miền Trung", "Đông Bắc", "Hà Nội", "Tây Bắc"]),
    ("Miền Nam", ["Miền Đông", "Miền Tây", "TP. HCM 1", "TP. HCM 2"]),
    ("Miền Trung 1", ["Miền Trung 1A", "Miền Trung 1B", "Tây Nguyên"]),
    ("Miền Trung 2", ["Miền Trung 2A", "Miền Trung 2B"]),
    ("KA", ["KA Miền Bắc", "KA Miền Trung 1", "KA Miền Trung 2", "KA Miền Nam"]),
    ("MT", ["MT"]),
    ("B2C", ["B2C"]),
    ("Other", ["Other"]),
]

PVT_HEADERS = [
    "MIEN",
    "VUNG",
    "MaKH",
    "KhachHang",
    "SanPham",
    "Actual",
    "CungKyLY",
    "ThangTruoc",
    "Vikoda",
    "TargetTong",
    "TargetVikoda",
    "KDT",
    "VikodaLY",
    "VikodaThangTruoc",
]

# Cột trong PVT_DATA, 1-based, dùng để dựng công thức SUMIFS.
PVT_COLUMN = {name: index for index, name in enumerate(PVT_HEADERS, start=1)}

NO_PRODUCT = "-"


def _region_lookup() -> dict[str, tuple[str, str]]:
    lookup: dict[str, tuple[str, str]] = {}
    for area, regions in REPORTING_STRUCTURE:
        for region in regions:
            lookup[normalize_key(region)] = (area, region)
    lookup["XK"] = ("Other", "Other")
    return lookup


def normalize_key(value: Any) -> str:
    text = "" if value is None else str(value)
    text = " ".join(text.replace(" ", " ").split())
    text = text.replace("Đ", "D").replace("đ", "d")
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return text.upper()


REGION_LOOKUP = _region_lookup()


def normalize_reporting_pair(area_value: Any, region_value: Any) -> tuple[str, str]:
    area_key = normalize_key(area_value)
    region_key = normalize_key(region_value)

    if area_key == "KA":
        if region_key in {"MIEN TRUNG 1", "MIEN TRUNG 1A"}:
            region_key = "KA MIEN TRUNG 1"
        elif region_key in {"MIEN TRUNG 2", "MIEN TRUNG 2A"}:
            region_key = "KA MIEN TRUNG 2"
        elif region_key == "MIEN BAC":
            region_key = "KA MIEN BAC"
        elif region_key == "MIEN NAM":
            region_key = "KA MIEN NAM"

    if region_key in REGION_LOOKUP:
        return REGION_LOOKUP[region_key]
    if area_key in REGION_LOOKUP:
        return REGION_LOOKUP[area_key]
    return ("Other", "Other")


def period_key(year: Any, month: Any) -> str:
    return f"{int(year)}{int(month):02d}"


def previous_period(year: int, month: int) -> str:
    if month > 1:
        return period_key(year, month - 1)
    return period_key(year - 1, 12)


def safe_number(value: Any) -> float:
    number = float(value or 0)
    if number != number or number in (float("inf"), float("-inf")):
        raise ValueError(f"Giá trị số không hợp lệ trong staging: {value!r}")
    return number


def customer_label(name: Any, code: Any) -> str:
    clean_name = str(name or "").strip()
    clean_code = str(code or "").strip()
    if not clean_code:
        return clean_name
    return f"{clean_name or 'Không rõ tên'} ({clean_code})"


def is_vikoda(product: Any) -> bool:
    return "VIKODA" in normalize_key(product)


def is_kdt(product: Any) -> bool:
    return "KDT" in normalize_key(product)


def build_customer_map(dmkh_rows: Iterable[list]) -> dict[str, tuple[str, str]]:
    """Ánh xạ mã khách hàng sang (Miền, Vùng) từ DMKH.

    Một mã có hai Miền/Vùng mâu thuẫn là lỗi dữ liệu, không được đoán.
    """
    customer_map: dict[str, tuple[str, str]] = {}
    conflicts: list[dict[str, Any]] = []
    for row in dmkh_rows:
        code = str(row[0] or "").strip()
        if not code:
            continue
        pair = normalize_reporting_pair(row[7], row[8])
        existing = customer_map.get(code)
        if existing is None:
            customer_map[code] = pair
        elif existing != pair:
            conflicts.append({"code": code, "first": existing, "duplicate": pair})
    if conflicts:
        raise ValueError(
            f"DMKH còn {len(conflicts)} mã trùng có Miền/Vùng mâu thuẫn: "
            + ", ".join(item["code"] for item in conflicts[:5])
        )
    return customer_map


class ReportModel:
    """Gộp Sell In và Target thành các dòng chi tiết của PVT_DATA."""

    def __init__(self, current_year: int, current_month: int) -> None:
        self.current_year = current_year
        self.current_month = current_month
        self.current_period = period_key(current_year, current_month)
        self.last_year_period = period_key(current_year - 1, current_month)
        self.prior_month_period = previous_period(current_year, current_month)
        self._items: dict[tuple, dict[str, Any]] = {}
        self.mapping_stats = {
            "data_from_dmkh": 0,
            "data_fallback_other": 0,
            "target_from_special_code": 0,
            "target_from_staging": 0,
            "target_from_dmkh": 0,
            "target_fallback_other": 0,
        }

    def _item(
        self,
        kind: str,
        area: str,
        region: str,
        code: str,
        customer: str,
        product: str,
    ) -> dict[str, Any]:
        key = (kind, area, region, code, customer, product)
        item = self._items.get(key)
        if item is None:
            item = {
                "area": area,
                "region": region,
                "code": code,
                "customer": customer,
                "product": product,
                "actual": 0.0,
                "last_year": 0.0,
                "prior_month": 0.0,
                "vikoda": 0.0,
                "vikoda_last_year": 0.0,
                "vikoda_prior_month": 0.0,
                "kdt": 0.0,
                "target_total": 0.0,
                "target_vikoda": 0.0,
            }
            self._items[key] = item
        return item

    def add_sell_in_rows(self, rows: Iterable[list]) -> None:
        """Cộng doanh thu Sell In vào đúng kỳ; bỏ qua kỳ ngoài phạm vi."""
        for row in rows:
            row_period = period_key(row[13], row[12])
            if row_period not in (
                self.current_period,
                self.last_year_period,
                self.prior_month_period,
            ):
                continue
            code = str(row[3] or "").strip()
            mapped = self.customer_map.get(code)
            if mapped is None:
                area, region = "Other", "Other"
                self.mapping_stats["data_fallback_other"] += 1
            else:
                area, region = mapped
                self.mapping_stats["data_from_dmkh"] += 1

            product = str(row[6] or "").strip() or NO_PRODUCT
            amount = safe_number(row[9])
            item = self._item(
                "actual", area, region, code,
                customer_label(row[4], code), product,
            )
            vikoda = is_vikoda(product)
            if row_period == self.current_period:
                item["actual"] += amount
                if vikoda:
                    item["vikoda"] += amount
                if is_kdt(product):
                    item["kdt"] += amount
            elif row_period == self.last_year_period:
                item["last_year"] += amount
                if vikoda:
                    item["vikoda_last_year"] += amount
            else:
                item["prior_month"] += amount
                if vikoda:
                    item["vikoda_prior_month"] += amount

    def add_target_records(self, records: Iterable[dict]) -> None:
        """Cộng Target của kỳ hiện tại; B2C và Other không bao giờ lẫn vùng khác."""
        for record in records:
            if str(record.get("Ky")) != self.current_period:
                continue
            code = str(record.get("MaKhachHangMoi") or "").strip()
            target_name = str(record.get("TenKhachHang") or "").strip()

            if normalize_key(code) == "B2C" or normalize_key(target_name) == "B2C":
                pair = ("B2C", "B2C")
                self.mapping_stats["target_from_special_code"] += 1
            elif normalize_key(target_name) == "OTHER":
                pair = ("Other", "Other")
                self.mapping_stats["target_from_special_code"] += 1
            elif record.get("MienBaoCao") or record.get("VungBaoCao"):
                pair = normalize_reporting_pair(
                    record.get("MienBaoCao"), record.get("VungBaoCao")
                )
                self.mapping_stats["target_from_staging"] += 1
            elif code in self.customer_map:
                pair = self.customer_map[code]
                self.mapping_stats["target_from_dmkh"] += 1
            else:
                pair = ("Other", "Other")
                self.mapping_stats["target_fallback_other"] += 1

            area, region = pair
            item = self._item(
                "target", area, region, code,
                customer_label(target_name, code), NO_PRODUCT,
            )
            item["target_total"] += safe_number(record.get("TargetTong"))
            item["target_vikoda"] += safe_number(record.get("TargetVikoda"))

    def rows(self) -> list[list]:
        """Dòng PVT_DATA đã sắp xếp theo thứ tự miền/vùng của báo cáo."""
        area_order = {area: index for index, (area, _) in enumerate(REPORTING_STRUCTURE)}
        region_order = {
            (area, region): index
            for area, regions in REPORTING_STRUCTURE
            for index, region in enumerate(regions)
        }

        def sort_key(item: dict[str, Any]) -> tuple:
            return (
                area_order.get(item["area"], 999),
                region_order.get((item["area"], item["region"]), 999),
                item["code"],
                item["product"],
                item["customer"],
            )

        return [
            [
                item["area"],
                item["region"],
                item["code"],
                item["customer"],
                item["product"],
                item["actual"],
                item["last_year"],
                item["prior_month"],
                item["vikoda"],
                item["target_total"],
                item["target_vikoda"],
                item["kdt"],
                item["vikoda_last_year"],
                item["vikoda_prior_month"],
            ]
            for item in sorted(self._items.values(), key=sort_key)
        ]


def build_model(
    sell_in_payload: dict,
    target_payload: dict,
    dmkh_payload: dict,
) -> ReportModel:
    current_year = int(sell_in_payload["current_year"])
    current_month = int(sell_in_payload["through_month"])
    if not 1 <= current_month <= 12:
        raise ValueError("Không xác định được kỳ hiện tại từ staging Sell In.")

    model = ReportModel(current_year, current_month)
    model.customer_map = build_customer_map(dmkh_payload["rows"])
    model.add_sell_in_rows(sell_in_payload["rows"])
    model.add_target_records(target_payload["records"])
    return model
