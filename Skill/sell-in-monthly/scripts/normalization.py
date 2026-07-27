from __future__ import annotations

import math
from typing import Any


def clean_number(value: Any) -> int | float | None:
    """Return a numeric value and collapse whole-number floats to integers."""
    if value in (None, ""):
        return None
    if isinstance(value, bool):
        return int(value)

    number: int | float
    if isinstance(value, (int, float)):
        number = value
    else:
        text = str(value).strip().replace(" ", "")
        if not text:
            return None
        try:
            number = float(text.replace(",", ""))
        except ValueError:
            return None

    if isinstance(number, float):
        if not math.isfinite(number):
            return None
        if number.is_integer():
            return int(number)
    return number


def quantity_number_format(value: Any) -> str:
    """Use decimals only when the quantity actually has a fractional part."""
    if (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and not float(value).is_integer()
    ):
        return "#,##0.##"
    return "#,##0"
