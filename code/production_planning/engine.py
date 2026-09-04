"""Pure-Python production scheduling engine for Vikoda weekly planning.

This module ports the business logic currently implemented in Excel columns T:AX
of sheet ``Ke hoach SX tuan``. It deliberately contains no workbook or network
dependencies so the calculation can be regression-tested independently.

Compatibility contract
----------------------
- PET 9000 / KHS use the same two-line shift timeline and 0.5-shift setup rule
  as ``Helper_SX_2Line``.
- Galon code 130100006 uses the same weekday distribution as the Excel formula.
- Other Galon SKUs run continuously from their calculated start day.
- RGB "có gas" and "không gas" reproduce the named LAMBDA functions
  ``SX_RGB_GAS_NGAY`` and ``SX_RGB_NOGAS_NGAY``.
- The scheduling date anchor follows the Excel formulas exactly: the month comes
  from each row's start date. This is intentional for first-release parity.
"""

from __future__ import annotations

import calendar
import math
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Iterable


PET_LINES = {"PET 9000", "KHS"}
RGB_GAS = "RGB có gas"
RGB_NOGAS = "RGB không gas"
GALON_19L_CODE = 130100006
DAYS = 31


@dataclass(frozen=True)
class PlanRow:
    """Minimal row contract required to calculate daily production."""

    source_row: int
    code: int | str
    line: str
    group: str
    batch_qty: float
    shift_qty: float
    shifts_per_day: float
    planned_qty: float
    start_date: date | None
    setup_key: object = None


class PlanningError(RuntimeError):
    """Raised when a source row cannot be scheduled safely."""


def coerce_date(value: object) -> date | None:
    """Coerce common Excel/openpyxl date representations to ``date``."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, (int, float)):
        return (datetime(1899, 12, 30) + timedelta(days=int(float(value)))).date()
    text = str(value).strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            pass
    raise PlanningError(f"Unsupported start date value: {value!r}")


def _excel_round_positive(value: float) -> int:
    return math.floor(value + 0.5)


def _build_pet_helper(rows: list[PlanRow]) -> dict[int, tuple[float, float]]:
    eligible = [
        row
        for row in rows
        if row.line in PET_LINES and row.planned_qty > 0 and row.start_date is not None
    ]
    eligible.sort(key=lambda row: (row.line, row.start_date, row.source_row))

    helper: dict[int, tuple[float, float]] = {}
    previous: PlanRow | None = None
    for row in eligible:
        assert row.start_date is not None
        if row.shift_qty <= 0 or row.shifts_per_day <= 0:
            raise PlanningError(
                f"Invalid PET/KHS capacity for product {row.code}: "
                f"shift_qty={row.shift_qty}, shifts_per_day={row.shifts_per_day}"
            )
        first = row.start_date.replace(day=1)
        earliest_shift = (row.start_date - first).days * row.shifts_per_day
        setup_shift = (
            0.5
            if previous is not None
            and row.line == previous.line
            and row.setup_key != previous.setup_key
            else 0.0
        )
        if previous is not None and row.line == previous.line:
            start_shift = max(earliest_shift, helper[previous.source_row][1]) + setup_shift
        else:
            start_shift = max(earliest_shift, 0.0) + setup_shift
        end_shift = start_shift + row.planned_qty / row.shift_qty
        helper[row.source_row] = (start_shift, end_shift)
        previous = row
    return helper


def _plan_pet_or_khs(row: PlanRow, helper: dict[int, tuple[float, float]]) -> list[float]:
    result = [0.0] * DAYS
    bounds = helper.get(row.source_row)
    if bounds is None or row.planned_qty <= 0 or row.start_date is None:
        return result
    start_shift, end_shift = bounds
    for index in range(DAYS):
        day_no = index + 1
        shifts = max(
            0.0,
            min(end_shift, day_no * row.shifts_per_day)
            - max(start_shift, (day_no - 1) * row.shifts_per_day),
        )
        result[index] = shifts * row.shift_qty if shifts > 0 else 0.0
    return result


def _plan_galon_19l(row: PlanRow) -> list[float]:
    result = [0.0] * DAYS
    if row.planned_qty <= 0 or row.start_date is None or row.batch_qty <= 0:
        return result
    first = row.start_date.replace(day=1)
    days_in_month = calendar.monthrange(first.year, first.month)[1]
    work_days = sum(
        1 for offset in range(days_in_month)
        if (first + timedelta(days=offset)).weekday() != 6
    )
    if work_days <= 0:
        return result
    base = row.planned_qty / work_days if row.planned_qty <= work_days * row.batch_qty else row.batch_qty
    extra_qty = max(0.0, row.planned_qty - work_days * row.batch_qty)
    for index in range(DAYS):
        day_no = index + 1
        current = first + timedelta(days=index)
        rank = sum(
            1 for offset in range(day_no)
            if (first + timedelta(days=offset)).weekday() != 6
        )
        extra_today = 0.0
        if extra_qty:
            extra_today = (
                math.floor(extra_qty / row.batch_qty * rank / work_days)
                - math.floor(extra_qty / row.batch_qty * (rank - 1) / work_days)
            ) * row.batch_qty
        if current.weekday() != 6:
            result[index] = base + extra_today
    return result


def _plan_galon_other(row: PlanRow) -> list[float]:
    result = [0.0] * DAYS
    if row.planned_qty <= 0 or row.start_date is None or row.batch_qty <= 0 or row.shifts_per_day <= 0:
        return result
    first = row.start_date.replace(day=1)
    start_day = (row.start_date - first).days + 1
    for index in range(DAYS):
        day_no = index + 1
        run_day = day_no - start_day
        raw = max(
            0.0,
            min(row.planned_qty, (run_day + 1) * row.shifts_per_day * row.batch_qty)
            - max(0.0, run_day * row.shifts_per_day * row.batch_qty),
        )
        result[index] = raw if raw > 0 else 0.0
    return result


def _previous_rows(rows: list[PlanRow], source_row: int) -> list[PlanRow]:
    return [row for row in rows if row.source_row < source_row]


def _plan_rgb_gas(row: PlanRow, rows: list[PlanRow], plans: dict[int, list[float]]) -> list[float]:
    result = [0.0] * DAYS
    if (
        row.line != "RGB" or row.group != RGB_GAS or row.planned_qty <= 0
        or row.start_date is None or row.batch_qty <= 0 or row.shifts_per_day <= 0
    ):
        return result
    first = row.start_date.replace(day=1)
    days_in_month = calendar.monthrange(first.year, first.month)[1]
    last_day = first + timedelta(days=days_in_month - 1)
    dates = [first + timedelta(days=index) for index in range(DAYS)]
    previous_gas = [
        candidate for candidate in _previous_rows(rows, row.source_row)
        if candidate.line == "RGB" and candidate.group == RGB_GAS
    ]
    available_by_day: list[int] = []
    for index in range(DAYS):
        used_units = sum(
            plans[candidate.source_row][index] / candidate.shift_qty
            for candidate in previous_gas if candidate.shift_qty > 0
        )
        available_by_day.append(max(0, math.floor(row.shifts_per_day - used_units)))
    total_units = math.ceil(row.planned_qty / row.batch_qty)
    active = [
        int(dates[index] >= first and dates[index] <= last_day and index + 1 <= days_in_month)
        for index in range(DAYS)
    ]
    normal = [int(current.weekday() != 6) for current in dates]
    normal_capacity = sum(active[i] * normal[i] * available_by_day[i] for i in range(DAYS))
    allow_sunday = total_units > normal_capacity
    eligible = [
        active[i] * int(dates[i].weekday() != 6 or allow_sunday) * int(available_by_day[i] > 0)
        for i in range(DAYS)
    ]
    active_weeks = max(1, math.ceil(days_in_month / 7))
    for index in range(DAYS):
        day_no = index + 1
        current = dates[index]
        used_today = sum(
            plans[candidate.source_row][index] / candidate.shift_qty
            for candidate in previous_gas if candidate.shift_qty > 0
        )
        available_today = max(0, math.floor(row.shifts_per_day - used_today))
        future_eligible = sum(eligible[index + 1 :])
        future_capacity = sum(eligible[pos] * available_by_day[pos] for pos in range(index + 1, DAYS))
        week = min(active_weeks, math.ceil(day_no / 7))
        done_units = _excel_round_positive(sum(result[:index]) / row.batch_qty)
        needed_units = max(0, total_units - done_units)
        target_units = total_units if future_eligible == 0 else math.ceil(total_units * week / active_weeks)
        must_run_now = max(0, needed_units - future_capacity)
        wanted_units = max(must_run_now, max(0, target_units - done_units))
        run_units = min(available_today, needed_units, wanted_units)
        if (
            current < first or current > last_day or current.month != first.month
            or run_units <= 0 or (current.weekday() == 6 and not allow_sunday)
        ):
            continue
        result[index] = run_units * row.batch_qty
    return result


def _plan_rgb_nogas(row: PlanRow, rows: list[PlanRow], plans: dict[int, list[float]]) -> list[float]:
    result = [0.0] * DAYS
    if (
        row.line != "RGB" or row.group != RGB_NOGAS or row.planned_qty <= 0
        or row.start_date is None or row.batch_qty <= 0 or row.shifts_per_day <= 0
    ):
        return result
    start = row.start_date
    first = start.replace(day=1)
    days_in_month = calendar.monthrange(first.year, first.month)[1]
    dates = [first + timedelta(days=index) for index in range(DAYS)]
    previous = _previous_rows(rows, row.source_row)
    available_by_day: list[int] = []
    for index in range(DAYS):
        pet_busy = any(
            candidate.line == "PET 9000" and plans[candidate.source_row][index] > 0
            for candidate in previous
        )
        rgb_other_units = sum(
            plans[candidate.source_row][index] / candidate.shift_qty
            for candidate in previous
            if candidate.line == "RGB" and candidate.group != RGB_NOGAS and candidate.shift_qty > 0
        )
        raw_available = math.floor(row.shifts_per_day - rgb_other_units)
        available_by_day.append(0 if pet_busy else max(0, raw_available))
    active = [int(dates[i] >= start and i + 1 <= days_in_month) for i in range(DAYS)]
    normal = [int(current.weekday() != 6) for current in dates]
    total_units = math.ceil(row.planned_qty / row.batch_qty)
    normal_capacity = sum(active[i] * normal[i] * available_by_day[i] for i in range(DAYS))
    allow_sunday = total_units > normal_capacity
    eligible = [
        active[i] * int(dates[i].weekday() != 6 or allow_sunday) * int(available_by_day[i] > 0)
        for i in range(DAYS)
    ]
    active_weeks = max(1, math.ceil((days_in_month - start.day + 1) / 7))
    for index in range(DAYS):
        day_no = index + 1
        current = dates[index]
        pet_busy = any(
            candidate.line == "PET 9000" and plans[candidate.source_row][index] > 0
            for candidate in previous
        )
        rgb_other_units = sum(
            plans[candidate.source_row][index] / candidate.shift_qty
            for candidate in previous
            if candidate.line == "RGB" and candidate.group != RGB_NOGAS and candidate.shift_qty > 0
        )
        available_today = 0 if pet_busy else max(0, math.floor(row.shifts_per_day - rgb_other_units))
        future_eligible = sum(eligible[index + 1 :])
        future_capacity = sum(eligible[pos] * available_by_day[pos] for pos in range(index + 1, DAYS))
        week = min(active_weeks, math.ceil((day_no - start.day + 1) / 7))
        done_units = _excel_round_positive(sum(result[:index]) / row.batch_qty)
        needed_units = max(0, total_units - done_units)
        target_units = total_units if future_eligible == 0 else math.ceil(total_units * week / active_weeks)
        must_run_now = max(0, needed_units - future_capacity)
        wanted_units = max(must_run_now, max(0, target_units - done_units))
        run_units = min(available_today, needed_units, wanted_units)
        if (
            current < start or current.month != start.month or run_units <= 0
            or (current.weekday() == 6 and not allow_sunday)
        ):
            continue
        result[index] = run_units * row.batch_qty
    return result


def calculate_daily_plans(rows: Iterable[PlanRow]) -> dict[int, list[float]]:
    """Calculate 31 daily quantities keyed by source row."""
    ordered = sorted(list(rows), key=lambda row: row.source_row)
    if not ordered:
        return {}
    seen: set[int] = set()
    duplicate_rows: set[int] = set()
    for row in ordered:
        if row.source_row in seen:
            duplicate_rows.add(row.source_row)
        seen.add(row.source_row)
    if duplicate_rows:
        raise PlanningError(f"Duplicate source row(s): {sorted(duplicate_rows)}")

    helper = _build_pet_helper(ordered)
    plans: dict[int, list[float]] = {row.source_row: [0.0] * DAYS for row in ordered}
    for row in ordered:
        if row.line in PET_LINES:
            plans[row.source_row] = _plan_pet_or_khs(row, helper)
        elif row.line == "Galon":
            plans[row.source_row] = _plan_galon_19l(row) if row.code == GALON_19L_CODE else _plan_galon_other(row)
    for row in ordered:
        if row.line == "RGB" and row.group == RGB_GAS:
            plans[row.source_row] = _plan_rgb_gas(row, ordered, plans)
    for row in ordered:
        if row.line == "RGB" and row.group == RGB_NOGAS:
            plans[row.source_row] = _plan_rgb_nogas(row, ordered, plans)
    return plans


def normalized_difference(total: float, planned_qty: float) -> float | None:
    """Return Excel-style AZ difference, blank when planned quantity <= 0."""
    if planned_qty <= 0:
        return None
    diff = total - planned_qty
    return 0.0 if abs(diff) < 1e-6 else diff
