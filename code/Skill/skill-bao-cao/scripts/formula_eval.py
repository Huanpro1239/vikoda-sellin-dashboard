"""Tính giá trị các công thức mà báo cáo dùng, ngay trong Python.

openpyxl ghi công thức nhưng không ghi kèm giá trị đã tính, nên đọc workbook
bằng `data_only=True` sẽ ra `None` cho tới khi Excel mở và lưu lại file. Thay vì
tin vào giá trị Excel đệm sẵn, bộ kiểm tra tự tính lại công thức rồi đối chiếu
với dữ liệu nguồn — chặt hơn, và không cần cài Excel để kiểm tra.

Chỉ hỗ trợ đúng những dạng công thức mà `build_pivot_sheet.py` tạo ra:
`SUMIFS`, `SUM` (dải hoặc danh sách ô), `IFERROR`, phép chia và phép trừ giữa
hai ô. Gặp dạng khác thì báo lỗi thay vì đoán.
"""

from __future__ import annotations

import re
from typing import Any

from openpyxl.utils import column_index_from_string


CELL = re.compile(r"^\$?([A-Z]{1,3})\$?(\d+)$")
RANGE = re.compile(r"^\$?([A-Z]{1,3})\$?(\d+):\$?([A-Z]{1,3})\$?(\d+)$")
SHEET_RANGE = re.compile(
    r"^'([^']+)'!\$?([A-Z]{1,3})\$?(\d+):\$?([A-Z]{1,3})\$?(\d+)$"
)


class FormulaError(ValueError):
    """Công thức nằm ngoài phạm vi hỗ trợ của bộ kiểm tra."""


def split_arguments(text: str) -> list[str]:
    """Tách tham số theo dấu phẩy ở ngoài cùng, bỏ qua dấu phẩy trong ngoặc."""
    parts: list[str] = []
    depth = 0
    in_quote = False
    current: list[str] = []
    for character in text:
        if character == '"':
            in_quote = not in_quote
        if not in_quote:
            if character == "(":
                depth += 1
            elif character == ")":
                depth -= 1
            elif character == "," and depth == 0:
                parts.append("".join(current).strip())
                current = []
                continue
        current.append(character)
    parts.append("".join(current).strip())
    return parts


class WorkbookEvaluator:
    def __init__(self, workbook) -> None:
        self.workbook = workbook
        self._cache: dict[tuple[str, int, int], Any] = {}
        self._columns: dict[tuple[str, int, int, int], list] = {}

    # -- đọc dữ liệu -------------------------------------------------------
    def _column_values(
        self, sheet_name: str, column: int, first_row: int, last_row: int
    ) -> list:
        key = (sheet_name, column, first_row, last_row)
        if key not in self._columns:
            ws = self.workbook[sheet_name]
            self._columns[key] = [
                ws.cell(row, column).value
                for row in range(first_row, last_row + 1)
            ]
        return self._columns[key]

    def _parse_range(self, token: str, default_sheet: str):
        match = SHEET_RANGE.match(token)
        if match:
            sheet, c1, r1, c2, r2 = match.groups()
        else:
            match = RANGE.match(token)
            if not match:
                raise FormulaError(f"Không đọc được dải ô: {token}")
            sheet = default_sheet
            c1, r1, c2, r2 = match.groups()
        column = column_index_from_string(c1)
        if column_index_from_string(c2) != column:
            raise FormulaError(f"Chỉ hỗ trợ dải một cột: {token}")
        return sheet, column, int(r1), int(r2)

    # -- tính giá trị ------------------------------------------------------
    def cell_value(self, sheet_name: str, row: int, column: int) -> Any:
        key = (sheet_name, row, column)
        if key in self._cache:
            return self._cache[key]
        raw = self.workbook[sheet_name].cell(row, column).value
        self._cache[key] = 0  # chặn đệ quy vòng
        value = self.evaluate(raw, sheet_name) if isinstance(raw, str) else raw
        self._cache[key] = value
        return value

    def evaluate(self, formula: Any, sheet_name: str) -> Any:
        if not isinstance(formula, str) or not formula.startswith("="):
            return formula
        return self._expression(formula[1:].strip(), sheet_name)

    def _expression(self, text: str, sheet: str) -> Any:
        text = text.strip()
        if text.upper().startswith("SUMIFS(") and text.endswith(")"):
            return self._sumifs(split_arguments(text[7:-1]), sheet)
        if text.upper().startswith("SUM(") and text.endswith(")"):
            return self._sum(split_arguments(text[4:-1]), sheet)
        if text.upper().startswith("IFERROR(") and text.endswith(")"):
            arguments = split_arguments(text[8:-1])
            try:
                value = self._expression(arguments[0], sheet)
            except ZeroDivisionError:
                return self._expression(arguments[1], sheet)
            if value is None:
                return self._expression(arguments[1], sheet)
            return value

        for operator in ("/", "-", "+", "*"):
            parts = split_top_level(text, operator)
            if parts is None:
                continue
            left = self._operand(parts[0], sheet)
            right = self._operand(parts[1], sheet)
            if operator == "/":
                if not right:
                    raise ZeroDivisionError
                return left / right
            if operator == "-":
                return left - right
            if operator == "+":
                return left + right
            return left * right

        return self._operand(text, sheet)

    def _operand(self, token: str, sheet: str) -> Any:
        token = token.strip()
        if token.startswith('"') and token.endswith('"'):
            return token[1:-1].replace('""', '"')
        match = CELL.match(token)
        if match:
            column = column_index_from_string(match.group(1))
            return self.cell_value(sheet, int(match.group(2)), column) or 0
        try:
            return float(token)
        except ValueError as error:
            raise FormulaError(f"Không tính được: {token}") from error

    def _sum(self, arguments: list[str], sheet: str) -> float:
        total = 0.0
        for token in arguments:
            if ":" in token:
                name, column, first, last = self._parse_range(token, sheet)
                for row in range(first, last + 1):
                    total += float(self.cell_value(name, row, column) or 0)
            else:
                total += float(self._operand(token, sheet) or 0)
        return total

    def _sumifs(self, arguments: list[str], sheet: str) -> float:
        name, sum_column, first, last = self._parse_range(arguments[0], sheet)
        values = self._column_values(name, sum_column, first, last)
        keep = [True] * len(values)
        for index in range(1, len(arguments) - 1, 2):
            crit_name, crit_column, crit_first, crit_last = self._parse_range(
                arguments[index], sheet
            )
            if (crit_first, crit_last) != (first, last):
                raise FormulaError("Dải điều kiện SUMIFS lệch dải tính tổng")
            criteria = self._operand(arguments[index + 1], sheet)
            column_values = self._column_values(
                crit_name, crit_column, crit_first, crit_last
            )
            wanted = str(criteria)
            for position, value in enumerate(column_values):
                if keep[position] and str(value) != wanted:
                    keep[position] = False
        return sum(
            float(value or 0)
            for position, value in enumerate(values)
            if keep[position]
        )


def split_top_level(text: str, operator: str) -> tuple[str, str] | None:
    """Tách `A-B` hoặc `A/B` ở mức ngoài cùng; trả None nếu không có."""
    depth = 0
    in_quote = False
    for index, character in enumerate(text):
        if character == '"':
            in_quote = not in_quote
        if in_quote:
            continue
        if character == "(":
            depth += 1
        elif character == ")":
            depth -= 1
        elif character == operator and depth == 0 and index > 0:
            return text[:index], text[index + 1:]
    return None
