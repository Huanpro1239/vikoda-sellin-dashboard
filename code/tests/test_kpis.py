"""Unit tests for Core Sell-In Business Logic & KPI formulas."""

import unittest


class TestCoreSellInKPIs(unittest.TestCase):
    """Kiểm tra các công thức toán tài chính & chỉ số điều hành cốt lõi."""

    def test_attainment_calculation(self):
        actual = 32254328965.0
        target = 55327415785.0
        attainment = (actual / target) * 100
        self.assertAlmostEqual(attainment, 58.297, places=2)

    def test_yoy_growth_calculation(self):
        actual_cur = 32254.33
        actual_ly = 27485.92
        yoy = ((actual_cur - actual_ly) / actual_ly) * 100
        self.assertAlmostEqual(yoy, 17.35, places=2)

    def test_pacing_and_required_run_rate(self):
        actual = 32254.0 # Triệu VNĐ
        target = 55327.0 # Triệu VNĐ
        days_passed = 15
        days_remaining = 16
        
        current_run_rate = actual / days_passed # ~2150.27 Tr.đ / ngày
        remaining_gap = target - actual # 23073.0 Tr.đ
        required_run_rate = remaining_gap / days_remaining # ~1442.06 Tr.đ / ngày
        
        # Burden ratio: req / cur
        burden = required_run_rate / current_run_rate
        
        self.assertAlmostEqual(current_run_rate, 2150.27, places=1)
        self.assertAlmostEqual(required_run_rate, 1442.06, places=1)
        self.assertLess(burden, 1.0) # Nhịp độ yêu cầu nhẹ hơn nhịp độ hiện tại -> Xác suất đạt cao

    def test_linear_extrapolation_forecast(self):
        actual = 32254.0
        days_in_month = 31
        days_passed = 15
        forecast = (actual / days_passed) * days_in_month
        self.assertAlmostEqual(forecast, 66658.27, places=1)


if __name__ == "__main__":
    unittest.main()
