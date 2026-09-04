"""Regression tests for the pure production scheduling engine."""

from __future__ import annotations

import unittest
from datetime import date

from code.production_planning.engine import (
    PlanRow,
    calculate_daily_plans,
    normalized_difference,
)


class ProductionPlanningEngineTests(unittest.TestCase):
    def test_pet_khs_half_shift_setup_is_preserved(self):
        rows = [
            PlanRow(4, 1001, "KHS", "A", 100, 100, 3, 200, date(2026, 1, 1), "K1"),
            PlanRow(5, 1002, "KHS", "A", 100, 100, 3, 300, date(2026, 1, 1), "K2"),
        ]
        plans = calculate_daily_plans(rows)
        self.assertEqual(plans[4][0], 200)
        self.assertEqual(plans[5][0], 50)
        self.assertEqual(plans[5][1], 250)
        self.assertAlmostEqual(sum(plans[5]), 300)

    def test_galon_other_starts_on_calculated_day(self):
        row = PlanRow(4, 2001, "Galon", "Galon", 100, 100, 2, 250, date(2026, 1, 3), None)
        plan = calculate_daily_plans([row])[4]
        self.assertEqual(plan[0], 0)
        self.assertEqual(plan[1], 0)
        self.assertEqual(plan[2], 200)
        self.assertEqual(plan[3], 50)
        self.assertAlmostEqual(sum(plan), 250)

    def test_galon_19l_skips_sunday_and_preserves_total(self):
        row = PlanRow(4, 130100006, "Galon", "Galon", 100, 100, 1, 500, date(2026, 1, 1), None)
        plan = calculate_daily_plans([row])[4]
        first = date(2026, 1, 1)
        for index, quantity in enumerate(plan):
            current = first.fromordinal(first.toordinal() + index)
            if current.weekday() == 6:
                self.assertEqual(quantity, 0)
        self.assertAlmostEqual(sum(plan), 500)

    def test_rgb_gas_rows_share_shift_capacity(self):
        rows = [
            PlanRow(4, 3001, "RGB", "RGB có gas", 100, 100, 2, 400, date(2026, 1, 1), None),
            PlanRow(5, 3002, "RGB", "RGB có gas", 100, 100, 2, 400, date(2026, 1, 1), None),
        ]
        plans = calculate_daily_plans(rows)
        self.assertAlmostEqual(sum(plans[4]), 400)
        self.assertAlmostEqual(sum(plans[5]), 400)
        first = date(2026, 1, 1)
        for day in range(31):
            self.assertLessEqual(plans[4][day] / 100 + plans[5][day] / 100, 2)
            current = first.fromordinal(first.toordinal() + day)
            if current.weekday() == 6:
                self.assertEqual(plans[4][day], 0)
                self.assertEqual(plans[5][day], 0)

    def test_rgb_nogas_is_blocked_when_pet_is_busy(self):
        rows = [
            PlanRow(4, 4001, "PET 9000", "PET", 100, 100, 1, 100, date(2026, 1, 1), "P"),
            PlanRow(5, 4002, "RGB", "RGB không gas", 100, 100, 2, 200, date(2026, 1, 1), None),
        ]
        plans = calculate_daily_plans(rows)
        self.assertEqual(plans[4][0], 100)
        self.assertEqual(plans[5][0], 0)
        self.assertAlmostEqual(sum(plans[5]), 200)

    def test_difference_blank_for_non_positive_plan(self):
        self.assertIsNone(normalized_difference(0, 0))
        self.assertIsNone(normalized_difference(0, -100))
        self.assertEqual(normalized_difference(100, 100), 0.0)
        self.assertEqual(normalized_difference(110, 100), 10)


if __name__ == "__main__":
    unittest.main()
