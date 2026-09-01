/**
 * VIKODA WEB DASHBOARD - ADVANCED IN-MEMORY ANALYTICS DATA ENGINE
 * Thiết kế chuẩn Power BI DAX Commercial Analytics:
 * - Lọc thời gian thực theo từng ngày giao dịch thực tế (383 ngày phân bổ).
 * - Tự động Prorate Target và so sánh Cùng kỳ (LY) chuẩn từng ngày.
 * - Tốc độ phản hồi <2ms.
 */

class VikodaDataEngine {
  constructor() {
    this.raw = null;
    this.facts = [];
    this.targets = [];
    this.customers = {};
    this.products = {};
    this.territories = {};
    this.metadata = {};

    // Global Filter State
    this.filters = {
      startDate: '',
      endDate: '',
      periodMode: 'mtd', // 'mtd', 'qtd', 'ytd', 'all', 'custom'
      mien: null,
      vung: null,
      channel: null,
      customerType: null,
      systemMT: null,
      productGroup: null,
      packUnit: null,
      isVikoda: null,
      isKDT: null,
      search: '',
    };

    this.listeners = [];
  }

  async load() {
    try {
      if (window.VIKODA_DATA) {
        this.raw = window.VIKODA_DATA;
      } else {
        const res = await fetch('data/dashboard_data.json?v=' + Date.now());
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        this.raw = await res.json();
      }

      if (!this.raw) return false;

      this.metadata = this.raw.metadata || {};
      this.customers = this.raw.dim_customer || {};
      this.products = this.raw.dim_product || {};
      this.territories = this.raw.dim_territory || {};
      this.facts = this.raw.fact_sell_in || [];
      this.targets = this.raw.fact_target || [];

      // Khởi tạo MTD theo ngày chốt dữ liệu, không gắn cứng một kỳ báo cáo.
      const asOf = this.getReportingAsOfDate();
      const curYear = asOf.slice(0, 4);
      const maxMonth = asOf.slice(5, 7);

      this.filters.startDate = `${curYear}-${maxMonth}-01`;
      this.filters.endDate = asOf;
      this.filters.periodMode = 'mtd';
      return true;
    } catch (err) {
      console.error('Lỗi nạp dữ liệu data-engine:', err);
      return false;
    }
  }

  subscribe(callback) {
    this.listeners.push(callback);
  }

  notify() {
    this.listeners.forEach((cb) => cb(this.filters));
  }

  getRegionsForMien(mien = null) {
    const dimensions = [
      ...Object.values(this.customers || {}),
      ...Object.values(this.territories || {}),
    ];
    return [...new Set(dimensions
      .filter((item) => !mien || item.mien === mien)
      .map((item) => String(item.vung || '').trim())
      .filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'vi'));
  }

  setFilter(key, value) {
    const normalizedValue = value === '' || value === undefined ? null : value;
    const nextValue = this.filters[key] === normalizedValue ? null : normalizedValue;

    if (key === 'mien') {
      this.filters.mien = nextValue;
      const validRegions = this.getRegionsForMien(nextValue);
      if (nextValue && this.filters.vung && !validRegions.includes(this.filters.vung)) {
        this.filters.vung = null;
      }
    } else if (key === 'vung') {
      if (nextValue && this.filters.mien && !this.getRegionsForMien(this.filters.mien).includes(nextValue)) {
        this.filters.mien = null;
      }
      this.filters.vung = nextValue;
    } else {
      this.filters[key] = nextValue;
    }
    this.notify();
  }

  setDateRange(start, end, mode = 'custom') {
    if (!start || !end) return;
    this.filters.startDate = start;
    this.filters.endDate = end;
    this.filters.periodMode = mode;
    this.notify();
  }

  clearAllFilters() {
    const asOf = this.getReportingAsOfDate();
    const curYear = asOf.slice(0, 4);
    const maxMonth = asOf.slice(5, 7);

    this.filters.startDate = `${curYear}-${maxMonth}-01`;
    this.filters.endDate = asOf;
    this.filters.periodMode = 'mtd';
    this.filters.mien = null;
    this.filters.vung = null;
    this.filters.channel = null;
    this.filters.customerType = null;
    this.filters.systemMT = null;
    this.filters.productGroup = null;
    this.filters.packUnit = null;
    this.filters.isVikoda = null;
    this.filters.isKDT = null;
    this.filters.search = '';
    this.notify();
  }

  // ------------------------------------------------------------------------
  // LỌC TẬP DỮ LIỆU FACT SELL IN THEO TỪNG NGÀY GIAO DỊCH THỰC TẾ (POWER BI STANDARD)
  // ------------------------------------------------------------------------
  normalizeProductGroup(group) {
    const value = String(group || '').normalize('NFC').trim();
    return value === 'Khoáng ngọt Đảnh Thạnh' ? 'Đảnh Thạnh' : value;
  }

  parseISODate(dateStr) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) return null;
    return date;
  }

  formatISODate(date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }

  daysInclusive(startDate, endDate) {
    const start = this.parseISODate(startDate);
    const end = this.parseISODate(endDate);
    if (!start || !end || end < start) return 0;
    return Math.floor((end - start) / 86400000) + 1;
  }

  getReportingAsOfDate() {
    const declaredDates = [
      this.metadata.as_of_date,
      this.metadata.source_latest_date,
      this.filters.endDate,
    ];
    for (const value of declaredDates) {
      if (this.parseISODate(value)) return value;
    }

    const factDates = this.facts
      .map((row) => row[0])
      .filter((value) => this.parseISODate(value))
      .sort();
    if (factDates.length) return factDates[factDates.length - 1];
    return this.formatISODate(new Date());
  }

  getDataDateBounds() {
    const factDates = this.facts
      .map((row) => row[0])
      .filter((value) => this.parseISODate(value))
      .sort();
    const declaredStart = this.metadata.data_start_date || this.metadata.source_start_date;
    const declaredEnd = this.metadata.as_of_date || this.metadata.source_latest_date;
    const minDate = this.parseISODate(declaredStart)
      ? declaredStart
      : (factDates[0] || this.getReportingAsOfDate());
    const maxDate = this.parseISODate(declaredEnd)
      ? declaredEnd
      : (factDates[factDates.length - 1] || this.getReportingAsOfDate());
    const availableMonths = Array.from(new Set([
      ...factDates.filter((date) => date <= maxDate).map((date) => date.slice(0, 7)),
      maxDate.slice(0, 7),
    ])).sort();

    return {
      minDate,
      maxDate,
      minMonth: minDate.slice(0, 7),
      maxMonth: maxDate.slice(0, 7),
      availableMonths,
    };
  }

  getDataDateRange() {
    return this.getDataDateBounds();
  }

  getPeriodBounds(horizon = 'month', asOfDate = this.getReportingAsOfDate()) {
    const asOf = this.parseISODate(asOfDate);
    if (!asOf) throw new Error(`Ngày chốt dữ liệu không hợp lệ: ${asOfDate}`);

    const year = asOf.getUTCFullYear();
    const monthIndex = asOf.getUTCMonth();
    let start;
    let end;
    if (horizon === 'year') {
      start = new Date(Date.UTC(year, 0, 1));
      end = new Date(Date.UTC(year, 11, 31));
    } else if (horizon === 'quarter') {
      const quarterStart = Math.floor(monthIndex / 3) * 3;
      start = new Date(Date.UTC(year, quarterStart, 1));
      end = new Date(Date.UTC(year, quarterStart + 3, 0));
    } else {
      start = new Date(Date.UTC(year, monthIndex, 1));
      end = new Date(Date.UTC(year, monthIndex + 1, 0));
    }

    return {
      year,
      month: monthIndex + 1,
      quarter: Math.floor(monthIndex / 3) + 1,
      startDate: this.formatISODate(start),
      endDate: this.formatISODate(end),
      asOfDate: this.formatISODate(asOf),
    };
  }

  matchesFactDimensionFilters(row, filters = this.filters) {
    const [, custKey, prodKey, terrKey] = row;
    const cust = this.customers[custKey] || {};
    const prod = this.products[prodKey] || {};
    const terr = this.territories[terrKey] || {};

    if (filters.mien && cust.mien !== filters.mien && terr.mien !== filters.mien) return false;
    if (filters.vung && cust.vung !== filters.vung && terr.vung !== filters.vung) return false;
    if (filters.channel && cust.channel !== filters.channel) return false;
    if (filters.customerType && cust.type !== filters.customerType) return false;
    if (filters.systemMT && cust.system_mt !== filters.systemMT) return false;

    if (filters.productGroup) {
      if (this.normalizeProductGroup(prod.group) !== this.normalizeProductGroup(filters.productGroup)) return false;
    }
    if (filters.packUnit && prod.unit !== filters.packUnit) return false;
    if (filters.isVikoda !== null && filters.isVikoda !== undefined && prod.is_vikoda !== filters.isVikoda) return false;
    if (filters.isKDT !== null && filters.isKDT !== undefined && prod.is_kdt !== filters.isKDT) return false;

    if (filters.search) {
      const query = String(filters.search).trim().toLowerCase();
      const custName = String(cust.name || '').toLowerCase();
      const prodName = String(prod.name || '').toLowerCase();
      if (query && !custName.includes(query) && !prodName.includes(query)) return false;
    }
    return true;
  }

  matchesTargetDimensionFilters(row, filters = this.filters) {
    const [, terrKey, custKey] = row;
    const cust = this.customers[custKey] || {};
    const terr = this.territories[terrKey] || {};
    if (filters.mien && cust.mien !== filters.mien && terr.mien !== filters.mien) return false;
    if (filters.vung && cust.vung !== filters.vung && terr.vung !== filters.vung) return false;
    if (filters.channel && cust.channel !== filters.channel) return false;
    if (filters.customerType && cust.type !== filters.customerType) return false;
    if (filters.systemMT && cust.system_mt !== filters.systemMT) return false;
    if (filters.search) {
      const query = String(filters.search).trim().toLowerCase();
      if (query && !String(cust.name || '').toLowerCase().includes(query)) return false;
    }
    return true;
  }

  getFilteredFacts(customFilters = null) {
    const f = customFilters || this.filters;
    const start = f.startDate || '0000-00-00';
    const end = f.endDate || '9999-99-99';

    return this.facts.filter((row) => {
      const [d] = row;

      // Lọc chính xác từng ngày giao dịch thực tế
      if (d < start || d > end) return false;

      return this.matchesFactDimensionFilters(row, f);
    });
  }

  // ------------------------------------------------------------------------
  // LỌC TẬP DỮ LIỆU CÙNG KỲ NĂM TRƯỚC (SAME PERIOD LAST YEAR - DAX SPLY)
  // ------------------------------------------------------------------------
  getLYFilteredFacts() {
    if (!this.filters.startDate || !this.filters.endDate) return [];
    const lyStart = this.shiftYear(this.filters.startDate, -1);
    const lyEnd = this.shiftYear(this.filters.endDate, -1);

    const lyFilters = { ...this.filters, startDate: lyStart, endDate: lyEnd };
    return this.getFilteredFacts(lyFilters);
  }

  shiftYear(dateStr, offsetYears) {
    if (!dateStr) return '';
    const parts = dateStr.split('-').map(Number);
    const y = parts[0] + offsetYears;
    const m = String(parts[1] || 1).padStart(2, '0');
    const d = String(parts[2] || 1).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // ------------------------------------------------------------------------
  // TÍNH TARGET PHÂN BỔ (TARGET PRORATION DAX PATTERN)
  // ------------------------------------------------------------------------
  getTargetProrationFactor(periodKey, startDate, endDate) {
    const key = String(periodKey || '');
    if (!/^\d{6}$/.test(key)) return 0;
    const year = Number(key.slice(0, 4));
    const month = Number(key.slice(4, 6));
    if (month < 1 || month > 12) return 0;
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const monthEnd = this.formatISODate(new Date(Date.UTC(year, month, 0)));
    const overlapStart = startDate > monthStart ? startDate : monthStart;
    const overlapEnd = endDate < monthEnd ? endDate : monthEnd;
    const overlapDays = this.daysInclusive(overlapStart, overlapEnd);
    const monthDays = this.daysInclusive(monthStart, monthEnd);
    return monthDays > 0 ? overlapDays / monthDays : 0;
  }

  getFilteredTargets(customFilters = null, options = {}) {
    const f = customFilters || this.filters;
    // KPI attainment luôn so với target trọn tháng. Prorate chỉ bật tường minh
    // cho biểu đồ pacing hoặc use case có nhãn "target lũy kế theo ngày".
    const { prorate = false } = options;
    const start = f.startDate;
    const end = f.endDate;
    if (!start || !end) return [];

    const startMonthStr = start.slice(0, 7).replace('-', '');
    const endMonthStr = end.slice(0, 7).replace('-', '');

    return this.targets.reduce((rows, row) => {
      const [periodKey, , , targetTotal, targetVikoda] = row;
      const periodText = String(periodKey);
      if (periodText < startMonthStr || periodText > endMonthStr) return rows;
      if (!this.matchesTargetDimensionFilters(row, f)) return rows;

      const normalizedGroup = this.normalizeProductGroup(f.productGroup);
      const wantsVikoda = f.isVikoda === true || normalizedGroup === 'Khoáng kiềm Vikoda';
      const excludesVikoda = f.isVikoda === false;
      let selectedTarget = Number(targetTotal || 0);
      if (wantsVikoda && excludesVikoda) selectedTarget = 0;
      else if (wantsVikoda) selectedTarget = Number(targetVikoda || 0);
      else if (excludesVikoda) selectedTarget = Math.max(0, selectedTarget - Number(targetVikoda || 0));

      const factor = prorate ? this.getTargetProrationFactor(periodText, start, end) : 1;
      if (factor <= 0) return rows;
      const projected = row.slice();
      projected[3] = selectedTarget * factor;
      projected[4] = Number(targetVikoda || 0) * factor;
      rows.push(projected);
      return rows;
    }, []);
  }

  // ------------------------------------------------------------------------
  // TÍNH TOÁN CÁC CHỈ SỐ KPI ĐIỀU HÀNH CHÍNH (HERO EXECUTIVE KPIS)
  // ------------------------------------------------------------------------
  getSummaryKPIs() {
    const facts = this.getFilteredFacts();
    const lyFacts = this.getLYFilteredFacts();
    const targets = this.getFilteredTargets();

    const actualVND = facts.reduce((sum, r) => sum + (r[4] || 0), 0);
    const actualMillion = actualVND / 1000000;

    const lyVND = lyFacts.reduce((sum, r) => sum + (r[4] || 0), 0);
    const lyMillion = lyVND / 1000000;

    const targetTotalVND = targets.reduce((sum, r) => sum + (r[3] || 0), 0);
    const targetMillion = targetTotalVND / 1000000;

    const attainment = targetMillion > 0 ? (actualMillion / targetMillion) * 100 : 0;
    const yoy = lyMillion > 0 ? ((actualMillion - lyMillion) / lyMillion) * 100 : 0;
    const yoyAbsolute = actualMillion - lyMillion;

    const distinctCustomers = new Set(facts.map((r) => r[1])).size;
    const distinctLYCustomers = new Set(lyFacts.map((r) => r[1])).size;

    // Sản lượng quy đổi (Két/Thùng/Bình)
    const totalConvertedQty = facts.reduce((sum, r) => sum + (r[6] || r[5] || 0), 0);
    const lyConvertedQty = lyFacts.reduce((sum, r) => sum + (r[6] || r[5] || 0), 0);
    const volumeYoY = lyConvertedQty > 0 ? ((totalConvertedQty - lyConvertedQty) / lyConvertedQty) * 100 : 0;

    const s = this.filters.startDate;
    const e = this.filters.endDate;

    // Format ngày hiển thị tiếng Việt
    const formatVN = (dStr) => {
      if (!dStr) return '';
      const [y, m, d] = dStr.split('-');
      return `${d}/${m}/${y}`;
    };

    let periodLabel = `${formatVN(s)} - ${formatVN(e)}`;
    if (this.filters.periodMode === 'mtd') {
      const [y, m] = s.split('-');
      periodLabel = `MTD Tháng ${parseInt(m, 10)}/${y} (${formatVN(s)} - ${formatVN(e)})`;
    } else if (this.filters.periodMode === 'qtd') {
      const [y, m] = e.split('-');
      const q = Math.floor((parseInt(m, 10) - 1) / 3) + 1;
      periodLabel = `QTD Quý ${q}/${y} (${formatVN(s)} - ${formatVN(e)})`;
    } else if (this.filters.periodMode === 'ytd') {
      const y = s.split('-')[0];
      periodLabel = `YTD Năm ${y} (${formatVN(s)} - ${formatVN(e)})`;
    } else if (this.filters.periodMode === 'all') {
      periodLabel = `Toàn bộ dữ liệu (${formatVN(s)} - ${formatVN(e)})`;
    }

    const shortfall = Math.max(0, targetMillion - actualMillion);
    const dropSize = distinctCustomers > 0 ? actualMillion / distinctCustomers : 0;

    return {
      actualMillion,
      targetMillion,
      attainment,
      lyMillion,
      yoy,
      yoyAbsolute,
      distinctCustomers,
      distinctLYCustomers,
      totalConvertedQty,
      volumeYoY,
      shortfall,
      dropSize,
      periodLabel,
    };
  }

  // ------------------------------------------------------------------------
  // TRANG 01: BIỂU ĐỒ TỔNG QUAN ĐIỀU HÀNH
  // ------------------------------------------------------------------------
  getMonthlyTrend() {
    const curYear = Number(this.getReportingAsOfDate().slice(0, 4));
    const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
    const labels = months.map((m) => `T${parseInt(m, 10)}`);

    const actualMap = {};
    const lyMap = {};
    const targetMap = {};

    months.forEach((m) => {
      actualMap[`${curYear}${m}`] = 0;
      lyMap[`${curYear - 1}${m}`] = 0;
      targetMap[`${curYear}${m}`] = 0;
    });

    const currentFacts = this.getFilteredFacts({
      ...this.filters,
      startDate: `${curYear}-01-01`,
      endDate: `${curYear}-12-31`,
    });
    const priorFacts = this.getFilteredFacts({
      ...this.filters,
      startDate: `${curYear - 1}-01-01`,
      endDate: `${curYear - 1}-12-31`,
    });
    const yearTargets = this.getFilteredTargets({
      ...this.filters,
      startDate: `${curYear}-01-01`,
      endDate: `${curYear}-12-31`,
    });

    currentFacts.forEach((r) => {
      const [d, , , , rev] = r;
      const period = d.slice(0, 7).replace('-', '');
      if (actualMap[period] !== undefined) actualMap[period] += (rev || 0) / 1000000;
    });

    priorFacts.forEach((r) => {
      const [d, , , , rev] = r;
      const period = d.slice(0, 7).replace('-', '');
      if (lyMap[period] !== undefined) lyMap[period] += (rev || 0) / 1000000;
    });

    yearTargets.forEach((r) => {
      const [periodKey, , , targetTotal] = r;
      if (targetMap[periodKey] !== undefined) targetMap[periodKey] += (targetTotal || 0) / 1000000;
    });

    const actualSeries = months.map((m) => Math.round(actualMap[`${curYear}${m}`] || 0));
    const lySeries = months.map((m) => Math.round(lyMap[`${curYear - 1}${m}`] || 0));
    const targetSeries = months.map((m) => Math.round(targetMap[`${curYear}${m}`] || 0));
    const attainmentSeries = months.map((m, i) => {
      const tgt = targetSeries[i];
      const act = actualSeries[i];
      return tgt > 0 ? Number(((act / tgt) * 100).toFixed(1)) : null;
    });

    return { labels, actualSeries, lySeries, targetSeries, attainmentSeries };
  }

  getProductGroupMix() {
    const facts = this.getFilteredFacts();
    const map = {};
    facts.forEach((r) => {
      const prod = this.products[r[2]] || {};
      let group = prod.group || 'Khác';
      if (group === 'Khoáng ngọt Đảnh Thạnh') group = 'Đảnh Thạnh';
      map[group] = (map[group] || 0) + (r[4] || 0) / 1000000;
    });

    return Object.entries(map).map(([name, value]) => ({
      name,
      value: Math.round(value),
    }));
  }

  getChannelMix() {
    const facts = this.getFilteredFacts();
    const map = {};
    facts.forEach((r) => {
      const cust = this.customers[r[1]] || {};
      const channel = cust.channel || 'GT';
      map[channel] = (map[channel] || 0) + (r[4] || 0) / 1000000;
    });

    return Object.entries(map).map(([name, value]) => ({
      name,
      value: Math.round(value),
    }));
  }

  getRegionGapWaterfall() {
    const facts = this.getFilteredFacts();
    const targets = this.getFilteredTargets();

    const regions = ['Miền Bắc', 'Miền Trung 1', 'Miền Trung 2', 'Miền Nam', 'KA', 'MT', 'B2C'];
    const actMap = {};
    const tgtMap = {};

    facts.forEach((r) => {
      const cust = this.customers[r[1]] || {};
      const terr = this.territories[r[3]] || {};
      const mien = cust.mien || terr.mien || 'Khác';
      actMap[mien] = (actMap[mien] || 0) + (r[4] || 0) / 1000000;
    });

    targets.forEach((r) => {
      const cust = this.customers[r[2]] || {};
      const terr = this.territories[r[1]] || {};
      const mien = cust.mien || terr.mien || 'Khác';
      tgtMap[mien] = (tgtMap[mien] || 0) + (r[3] || 0) / 1000000;
    });

    return regions.map((m) => {
      const gap = Math.round((actMap[m] || 0) - (tgtMap[m] || 0));
      return { name: m, value: gap };
    });
  }

  // ------------------------------------------------------------------------
  // TRANG 02: KÊNH & KHÁCH HÀNG
  // ------------------------------------------------------------------------
  getChannelPerformance() {
    const facts = this.getFilteredFacts();
    const lyFacts = this.getLYFilteredFacts();
    const channels = ['GT', 'MT', 'KA', 'B2C'];

    const actMap = {};
    const lyMap = {};

    facts.forEach((r) => {
      const cust = this.customers[r[1]] || {};
      const ch = cust.channel || 'GT';
      actMap[ch] = (actMap[ch] || 0) + (r[4] || 0) / 1000000;
    });

    lyFacts.forEach((r) => {
      const cust = this.customers[r[1]] || {};
      const ch = cust.channel || 'GT';
      lyMap[ch] = (lyMap[ch] || 0) + (r[4] || 0) / 1000000;
    });

    const actuals = channels.map((c) => Math.round(actMap[c] || 0));
    const lys = channels.map((c) => Math.round(lyMap[c] || 0));
    const yoys = channels.map((c, i) => {
      const ly = lys[i];
      const act = actuals[i];
      return ly > 0 ? Number((((act - ly) / ly) * 100).toFixed(1)) : 0;
    });

    return { categories: channels, actuals, lys, yoys };
  }

  getSystemMTRevenue() {
    const facts = this.getFilteredFacts();
    const map = {};
    facts.forEach((r) => {
      const cust = this.customers[r[1]] || {};
      if (cust.system_mt) {
        map[cust.system_mt] = (map[cust.system_mt] || 0) + (r[4] || 0) / 1000000;
      }
    });

    return Object.entries(map)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }

  getTopCustomers(limit = 15, mode = 'all') {
    const facts = this.getFilteredFacts();
    const lyFacts = this.getLYFilteredFacts();

    const actMap = {};
    const lyMap = {};

    facts.forEach((r) => {
      const k = r[1];
      actMap[k] = (actMap[k] || 0) + (r[4] || 0) / 1000000;
    });

    lyFacts.forEach((r) => {
      const k = r[1];
      lyMap[k] = (lyMap[k] || 0) + (r[4] || 0) / 1000000;
    });

    const totalRev = Object.values(actMap).reduce((a, b) => a + b, 0);
    const allKeys = new Set([...Object.keys(actMap), ...Object.keys(lyMap)]);

    const list = Array.from(allKeys).map((key) => {
      const cust = this.customers[key] || {};
      const actual = actMap[key] || 0;
      const ly = lyMap[key] || 0;
      const diff = actual - ly;
      const yoy = ly > 0 ? ((actual - ly) / ly) * 100 : (actual > 0 ? 100 : 0);
      const share = totalRev > 0 ? (actual / totalRev) * 100 : 0;
      return {
        key,
        name: cust.name || key,
        channel: cust.channel || 'GT',
        mien: cust.mien || '',
        actual: Math.round(actual),
        ly: Math.round(ly),
        diff: Math.round(diff),
        yoy: Number(yoy.toFixed(1)),
        share: Number(share.toFixed(1)),
      };
    });

    if (mode === 'drop') {
      return list.filter((c) => c.ly >= 100).sort((a, b) => a.diff - b.diff).slice(0, limit);
    } else if (mode === 'growth') {
      return list.filter((c) => c.actual > 0).sort((a, b) => b.diff - a.diff).slice(0, limit);
    }
    return list.filter((c) => c.actual > 0).sort((a, b) => b.actual - a.actual).slice(0, limit);
  }

  getCustomerMovement() {
    const facts = this.getFilteredFacts();
    const lyFacts = this.getLYFilteredFacts();

    const curCusts = new Set(facts.map((r) => r[1]));
    const lyCusts = new Set(lyFacts.map((r) => r[1]));

    const channels = ['GT', 'MT', 'KA', 'B2C'];
    const newMap = {};
    const churnMap = {};

    curCusts.forEach((k) => {
      if (!lyCusts.has(k)) {
        const ch = (this.customers[k] || {}).channel || 'GT';
        newMap[ch] = (newMap[ch] || 0) + 1;
      }
    });

    lyCusts.forEach((k) => {
      if (!curCusts.has(k)) {
        const ch = (this.customers[k] || {}).channel || 'GT';
        churnMap[ch] = (churnMap[ch] || 0) + 1;
      }
    });

    return {
      channels,
      newCustomers: channels.map((c) => newMap[c] || 0),
      churnCustomers: channels.map((c) => churnMap[c] || 0),
    };
  }

  // ------------------------------------------------------------------------
  // TRANG 03: SẢN PHẨM & DANH MỤC
  // ------------------------------------------------------------------------
  getVikodaVsKDTTrend() {
    const asOf = this.getReportingAsOfDate();
    const curYear = Number(asOf.slice(0, 4));
    const throughMonth = Number(asOf.slice(5, 7));
    const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
    const labels = months.map((m) => `T${parseInt(m, 10)}`);

    const vkMap = {};
    const dtMap = {};

    months.forEach((m) => {
      vkMap[`${curYear}${m}`] = 0;
      dtMap[`${curYear}${m}`] = 0;
    });

    const yearFacts = this.getFilteredFacts({
      ...this.filters,
      startDate: `${curYear}-01-01`,
      endDate: `${curYear}-12-31`,
    });
    yearFacts.forEach((r) => {
      const [d, custKey, prodKey, terrKey, rev] = r;
      if (!d.startsWith(String(curYear))) return;
      const period = d.slice(0, 7).replace('-', '');
      const prod = this.products[prodKey] || {};

      if (prod.group === 'Khoáng kiềm Vikoda' || prod.is_vikoda) {
        if (vkMap[period] !== undefined) vkMap[period] += (rev || 0) / 1000000;
      } else {
        if (dtMap[period] !== undefined) dtMap[period] += (rev || 0) / 1000000;
      }
    });

    const vikodaSeries = months.map((m, idx) => (idx < throughMonth ? Math.round(vkMap[`${curYear}${m}`] || 0) : 0));
    const dtSeries = months.map((m, idx) => (idx < throughMonth ? Math.round(dtMap[`${curYear}${m}`] || 0) : 0));
    const vikodaShareSeries = months.map((m, idx) => {
      if (idx >= throughMonth) return null;
      const total = vikodaSeries[idx] + dtSeries[idx];
      return total > 0 ? Number(((vikodaSeries[idx] / total) * 100).toFixed(1)) : null;
    });

    return { labels, vikodaSeries, dtSeries, vikodaShareSeries };
  }

  getBrandMix() {
    const facts = this.getFilteredFacts();
    const map = {};
    facts.forEach((r) => {
      const prod = this.products[r[2]] || {};
      const brand = prod.brand || 'Vikoda';
      map[brand] = (map[brand] || 0) + (r[4] || 0) / 1000000;
    });

    return Object.entries(map).map(([name, value]) => ({
      name,
      value: Math.round(value),
    }));
  }

  getHeroSKUs(limit = 10) {
    const facts = this.getFilteredFacts();
    const map = {};
    facts.forEach((r) => {
      const prod = this.products[r[2]] || {};
      const label = prod.short_name || prod.name || r[2];
      map[label] = (map[label] || 0) + (r[4] || 0) / 1000000;
    });

    return Object.entries(map)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, limit);
  }

  getDecliningSKUs(limit = 10) {
    const facts = this.getFilteredFacts();
    const lyFacts = this.getLYFilteredFacts();

    const actMap = {};
    const lyMap = {};

    facts.forEach((r) => {
      const prod = this.products[r[2]] || {};
      const label = prod.short_name || prod.name || r[2];
      actMap[label] = (actMap[label] || 0) + (r[4] || 0) / 1000000;
    });

    lyFacts.forEach((r) => {
      const prod = this.products[r[2]] || {};
      const label = prod.short_name || prod.name || r[2];
      lyMap[label] = (lyMap[label] || 0) + (r[4] || 0) / 1000000;
    });

    return Object.keys(lyMap)
      .filter((k) => lyMap[k] > 20)
      .map((name) => {
        const act = actMap[name] || 0;
        const ly = lyMap[name];
        const yoy = ((act - ly) / ly) * 100;
        return { name, value: Number(yoy.toFixed(1)) };
      })
      .sort((a, b) => a.value - b.value)
      .slice(0, limit);
  }

  // ------------------------------------------------------------------------
  // TRANG 04: VÙNG MIỀN & SẢN LƯỢNG
  // ------------------------------------------------------------------------
  getPackagingVolumeTrend() {
    const curYear = Number(this.getReportingAsOfDate().slice(0, 4));
    const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
    const labels = months.map((m) => `T${parseInt(m, 10)}`);

    const ketMap = {};
    const thungMap = {};
    const binhMap = {};

    months.forEach((m) => {
      ketMap[`${curYear}${m}`] = 0;
      thungMap[`${curYear}${m}`] = 0;
      binhMap[`${curYear}${m}`] = 0;
    });

    const yearFacts = this.getFilteredFacts({
      ...this.filters,
      startDate: `${curYear}-01-01`,
      endDate: `${curYear}-12-31`,
    });
    yearFacts.forEach((r) => {
      const [d, custKey, prodKey, terrKey, rev, qty, convQty] = r;
      const period = d.slice(0, 7).replace('-', '');
      const prod = this.products[prodKey] || {};
      const val = convQty || qty || 0;

      if (prod.unit === 'Két' && ketMap[period] !== undefined) ketMap[period] += val;
      if (prod.unit === 'Thùng' && thungMap[period] !== undefined) thungMap[period] += val;
      if (prod.unit === 'Bình' && binhMap[period] !== undefined) binhMap[period] += val;
    });

    return {
      labels,
      ketSeries: months.map((m) => Math.round(ketMap[`${curYear}${m}`] || 0)),
      thungSeries: months.map((m) => Math.round(thungMap[`${curYear}${m}`] || 0)),
      binhSeries: months.map((m) => Math.round(binhMap[`${curYear}${m}`] || 0)),
    };
  }

  getTerritoryTreemap() {
    const facts = this.getFilteredFacts();
    const tree = {};

    facts.forEach((r) => {
      const cust = this.customers[r[1]] || {};
      const mien = cust.mien || 'Khác';
      const vung = cust.vung || 'Khác';
      const rev = (r[4] || 0) / 1000000;

      if (!tree[mien]) tree[mien] = {};
      tree[mien][vung] = (tree[mien][vung] || 0) + rev;
    });

    return Object.entries(tree).map(([mien, vungs]) => ({
      name: mien,
      children: Object.entries(vungs).map(([vung, val]) => ({
        name: vung,
        value: Math.round(val),
      })),
    }));
  }

  getPackagingMix() {
    const facts = this.getFilteredFacts();
    const map = {};
    facts.forEach((r) => {
      const prod = this.products[r[2]] || {};
      const unit = prod.unit || 'Khác';
      map[unit] = (map[unit] || 0) + (r[6] || r[5] || 0);
    });

    return Object.entries(map).map(([name, value]) => ({
      name,
      value: Math.round(value),
    }));
  }

  getRegionTargetAttainment() {
    const facts = this.getFilteredFacts();
    const targets = this.getFilteredTargets();

    const actMap = {};
    const tgtMap = {};

    facts.forEach((r) => {
      const cust = this.customers[r[1]] || {};
      const vung = cust.vung || 'Khác';
      actMap[vung] = (actMap[vung] || 0) + (r[4] || 0) / 1000000;
    });

    targets.forEach((r) => {
      const cust = this.customers[r[2]] || {};
      const vung = cust.vung || 'Khác';
      tgtMap[vung] = (tgtMap[vung] || 0) + (r[3] || 0) / 1000000;
    });

    return Object.keys(tgtMap)
      .map((vung) => {
        const act = actMap[vung] || 0;
        const tgt = tgtMap[vung] || 0;
        const attain = tgt > 0 ? (act / tgt) * 100 : 0;
        return { name: vung, value: Number(attain.toFixed(1)) };
      })
      .sort((a, b) => a.value - b.value);
  }

  // ------------------------------------------------------------------------
  // TRANG 05: BẢNG CHI TIẾT
  // ------------------------------------------------------------------------
  getDetailRows() {
    const facts = this.getFilteredFacts();
    const lyFacts = this.getLYFilteredFacts();

    const agg = {};
    facts.forEach((r) => {
      const [d, custKey, prodKey, terrKey, rev, qty, convQty, isReturn] = r;
      const key = `${custKey}__${prodKey}`;
      const cust = this.customers[custKey] || {};
      const prod = this.products[prodKey] || {};

      if (!agg[key]) {
        agg[key] = {
          custCode: cust.code || '',
          custName: cust.name || custKey || 'Khách hàng',
          channel: cust.channel || 'GT',
          mien: cust.mien || '',
          vung: cust.vung || '',
          prodName: prod.short_name || prod.name || prodKey || 'Sản phẩm',
          unit: prod.unit || 'Khác',
          actual: 0,
          ly: 0,
          qtyKet: 0,
          qtyThung: 0,
          qtyBinh: 0,
          returnRev: 0,
        };
      }

      agg[key].actual += (rev || 0) / 1000000;
      if (prod.unit === 'Két') agg[key].qtyKet += convQty || qty || 0;
      if (prod.unit === 'Thùng') agg[key].qtyThung += convQty || qty || 0;
      if (prod.unit === 'Bình') agg[key].qtyBinh += convQty || qty || 0;
      if (isReturn) agg[key].returnRev += Math.abs(rev || 0) / 1000000;
    });

    lyFacts.forEach((r) => {
      const key = `${r[1]}__${r[2]}`;
      if (agg[key]) {
        agg[key].ly += (r[4] || 0) / 1000000;
      }
    });

    return Object.values(agg).map((row) => {
      const yoy = row.ly > 0 ? ((row.actual - row.ly) / row.ly) * 100 : 0;
      const returnRate = row.actual > 0 ? (row.returnRev / row.actual) * 100 : 0;
      return {
        ...row,
        actual: Number(row.actual.toFixed(2)),
        ly: Number(row.ly.toFixed(2)),
        yoy: Number(yoy.toFixed(1)),
        qtyKet: Math.round(row.qtyKet),
        qtyThung: Math.round(row.qtyThung),
        qtyBinh: Math.round(row.qtyBinh),
        returnRate: Number(returnRate.toFixed(1)),
      };
    });
  }

  // ------------------------------------------------------------------------
  // TRANG 06: HỆ THỐNG DỰ BÁO ĐIỀU HÀNH CEO THEO THÁNG / QUÝ / NĂM
  // ------------------------------------------------------------------------
  normalCdf(value) {
    const x = Math.abs(value);
    const t = 1 / (1 + 0.2316419 * x);
    const density = 0.3989422804014327 * Math.exp(-0.5 * x * x);
    const tail = density * t * (
      0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)))
    );
    const cdf = 1 - tail;
    return value >= 0 ? cdf : 1 - cdf;
  }

  getForecastContext(horizon = 'month') {
    const safeHorizon = ['month', 'quarter', 'year'].includes(horizon) ? horizon : 'month';
    const bounds = this.getPeriodBounds(safeHorizon);
    const factFilters = {
      ...this.filters,
      startDate: bounds.startDate,
      endDate: bounds.asOfDate,
    };
    const targetFilters = {
      ...this.filters,
      startDate: bounds.startDate,
      endDate: bounds.endDate,
    };
    const facts = this.getFilteredFacts(factFilters);
    const targets = this.getFilteredTargets(targetFilters);
    const actual = facts.reduce((sum, row) => sum + Number(row[4] || 0), 0) / 1000000;
    const target = targets.reduce((sum, row) => sum + Number(row[3] || 0), 0) / 1000000;
    const passedDays = this.daysInclusive(bounds.startDate, bounds.asOfDate);
    const totalDays = this.daysInclusive(bounds.startDate, bounds.endDate);
    const remainingDays = Math.max(0, totalDays - passedDays);

    const dailyRevenue = Array.from({ length: passedDays }, () => 0);
    const startDate = this.parseISODate(bounds.startDate);
    facts.forEach((row) => {
      const date = this.parseISODate(row[0]);
      if (!date || !startDate) return;
      const index = Math.floor((date - startDate) / 86400000);
      if (index >= 0 && index < dailyRevenue.length) {
        dailyRevenue[index] += Number(row[4] || 0) / 1000000;
      }
    });

    const curVelocity = passedDays > 0 ? actual / passedDays : 0;
    const variance = passedDays > 1
      ? dailyRevenue.reduce((sum, value) => sum + ((value - curVelocity) ** 2), 0) / (passedDays - 1)
      : 0;
    const dailyStdDev = Math.sqrt(Math.max(0, variance));
    const forecast = actual + remainingDays * curVelocity;
    const forecastStdError = dailyStdDev * Math.sqrt(remainingDays);
    const confidenceDelta = 1.645 * forecastStdError;
    const pessimistic = Math.max(0, forecast - confidenceDelta);
    const optimistic = Math.max(pessimistic, forecast + confidenceDelta);
    const gap = forecast - target;
    const attainment = target > 0 ? (forecast / target) * 100 : 0;
    const shortfall = Math.max(0, target - actual);
    const reqVelocity = remainingDays > 0 ? shortfall / remainingDays : 0;
    const burden = curVelocity > 0
      ? reqVelocity / curVelocity
      : (shortfall > 0 ? Number.POSITIVE_INFINITY : 0);

    let probabilityOfHit;
    if (target <= 0 || actual >= target) {
      probabilityOfHit = 100;
    } else if (remainingDays === 0) {
      probabilityOfHit = 0.1;
    } else if (forecastStdError > 0) {
      const z = (target - forecast) / forecastStdError;
      probabilityOfHit = Math.min(99.9, Math.max(0.1, (1 - this.normalCdf(z)) * 100));
    } else {
      probabilityOfHit = forecast >= target ? 99.9 : 0.1;
    }

    let title;
    if (safeHorizon === 'year') {
      title = `Cả Năm ${bounds.year} (Kế hoạch AOP)`;
    } else if (safeHorizon === 'quarter') {
      title = `Quý ${bounds.quarter}/${bounds.year}`;
    } else {
      title = `Tháng ${bounds.month}/${bounds.year} (MTD)`;
    }
    const statusScope = safeHorizon === 'year'
      ? `AOP ${bounds.year}`
      : (safeHorizon === 'quarter' ? `Quý ${bounds.quarter}` : `Tháng ${bounds.month}`);

    return {
      horizon: safeHorizon,
      title,
      subtitle: `${passedDays} ngày đã qua / ${remainingDays} ngày còn lại · chốt ${bounds.asOfDate.split('-').reverse().join('/')}`,
      actual,
      target,
      forecast,
      gap,
      attainment,
      pessimistic,
      optimistic,
      probabilityOfHit,
      curVelocity,
      reqVelocity,
      remainingDays,
      passedDays,
      totalDays,
      burden,
      dailyStdDev,
      forecastStdError,
      facts,
      targets,
      bounds,
      statusText: target <= 0
        ? `Chưa có Target cho ${statusScope}`
        : (gap >= 0
          ? `Dự kiến vượt mục tiêu ${statusScope} +${Math.round(gap).toLocaleString()} Tr.đ`
          : `Dự kiến hụt mục tiêu ${statusScope} -${Math.abs(Math.round(gap)).toLocaleString()} Tr.đ`),
      statusColor: target > 0 && gap < 0 ? '#DC2626' : '#10B981',
    };
  }

  getExecutiveForecastByHorizon(horizon = 'month') {
    const context = this.getForecastContext(horizon);
    const roundedBurden = Number.isFinite(context.burden)
      ? Number(context.burden.toFixed(2))
      : context.burden;
    return {
      horizon: context.horizon,
      title: context.title,
      subtitle: context.subtitle,
      actual: Math.round(context.actual),
      target: Math.round(context.target),
      forecast: Math.round(context.forecast),
      monthEndForecast: Math.round(context.forecast),
      gap: Math.round(context.gap),
      attainment: Number(context.attainment.toFixed(1)),
      forecastAttainment: Number(context.attainment.toFixed(1)),
      pessimistic: Math.round(context.pessimistic),
      optimistic: Math.round(context.optimistic),
      probability: Number(context.probabilityOfHit.toFixed(1)),
      probabilityOfHit: Number(context.probabilityOfHit.toFixed(1)),
      curVelocity: Number(context.curVelocity.toFixed(1)),
      reqVelocity: Number(context.reqVelocity.toFixed(1)),
      remainingDays: context.remainingDays,
      burden: roundedBurden,
      statusText: context.statusText,
      statusColor: context.statusColor,
      asOfDate: context.bounds.asOfDate,
      periodStart: context.bounds.startDate,
      periodEnd: context.bounds.endDate,
    };
  }

  getMonthlyForecastPoint(year, month, asOfDate, fallbackVelocity) {
    const monthText = String(month).padStart(2, '0');
    const startDate = `${year}-${monthText}-01`;
    const endDate = this.formatISODate(new Date(Date.UTC(year, month, 0)));
    const monthDays = this.daysInclusive(startDate, endDate);
    const isFuture = startDate > asOfDate;
    const isPast = endDate < asOfDate;
    const observedEnd = isFuture ? null : (isPast ? endDate : asOfDate);
    const facts = observedEnd
      ? this.getFilteredFacts({ ...this.filters, startDate, endDate: observedEnd })
      : [];
    const actual = facts.reduce((sum, row) => sum + Number(row[4] || 0), 0) / 1000000;
    const target = this.getFilteredTargets({ ...this.filters, startDate, endDate })
      .reduce((sum, row) => sum + Number(row[3] || 0), 0) / 1000000;

    let forecast;
    if (isPast) {
      forecast = actual;
    } else if (isFuture) {
      forecast = fallbackVelocity * monthDays;
    } else {
      const passedDays = this.daysInclusive(startDate, asOfDate);
      forecast = actual + Math.max(0, monthDays - passedDays) * fallbackVelocity;
    }

    return {
      label: `Tháng ${month}${isFuture ? ' (Dự báo)' : (!isPast ? ' (Hiện tại)' : '')}`,
      actual: isFuture ? null : Math.round(actual),
      target: Math.round(target),
      forecast: Math.round(forecast),
    };
  }

  getForecastHorizonChartData(horizon = 'month') {
    if (horizon === 'month') {
      return this.getForecastPacingChartData();
    }

    const safeHorizon = horizon === 'quarter' ? 'quarter' : 'year';
    const context = this.getForecastContext(safeHorizon);
    const firstMonth = safeHorizon === 'quarter'
      ? Number(context.bounds.startDate.slice(5, 7))
      : 1;
    const monthCount = safeHorizon === 'quarter' ? 3 : 12;
    const points = Array.from({ length: monthCount }, (_, index) => (
      this.getMonthlyForecastPoint(
        context.bounds.year,
        firstMonth + index,
        context.bounds.asOfDate,
        context.curVelocity,
      )
    ));

    return {
      type: 'bar_trend',
      labels: points.map((point) => point.label),
      actualSeries: points.map((point) => point.actual),
      targetSeries: points.map((point) => point.target),
      forecastSeries: points.map((point) => point.forecast),
    };
  }

  getCEODecisionMemo(horizon = 'month') {
    const fc = this.getExecutiveForecastByHorizon(horizon);
    const isOnTrack = fc.target > 0 && fc.gap >= 0;
    const severity = fc.target <= 0 ? 'blue' : (isOnTrack ? 'green' : (fc.attainment >= 85 ? 'amber' : 'red'));
    const scopeTag = horizon === 'year'
      ? `🎯 AOP ${fc.asOfDate.slice(0, 4)}`
      : (horizon === 'quarter'
        ? `📊 Quý ${Math.floor((Number(fc.asOfDate.slice(5, 7)) - 1) / 3) + 1}/${fc.asOfDate.slice(0, 4)}`
        : `⚡ Tháng ${Number(fc.asOfDate.slice(5, 7))}/${fc.asOfDate.slice(0, 4)}`);
    const gapText = fc.gap >= 0
      ? `vượt ${fc.gap.toLocaleString()} Tr.đ`
      : `hụt ${Math.abs(fc.gap).toLocaleString()} Tr.đ`;
    const paceGap = fc.reqVelocity - fc.curVelocity;

    return [
      {
        tag: scopeTag,
        severity,
        title: fc.target > 0
          ? `Dự báo ${fc.forecast.toLocaleString()} Tr.đ, ${gapText} so với Target`
          : `Dự báo ${fc.forecast.toLocaleString()} Tr.đ; chưa có Target để đối chiếu`,
        desc: `Lũy kế ${fc.actual.toLocaleString()} Tr.đ; dự báo đạt ${fc.attainment}% Target. Xác suất đạt theo biến động doanh thu ngày: ${fc.probabilityOfHit}%.`,
        decision: isOnTrack
          ? `Duy trì nhịp bán hiện tại ${fc.curVelocity.toLocaleString()} Tr.đ/ngày và theo dõi chênh lệch thực tế so với dải dự báo mỗi ngày.`
          : `Phân bổ phần thiếu hụt theo vùng và khách hàng; cập nhật cam kết ngày theo vận tốc yêu cầu ${fc.reqVelocity.toLocaleString()} Tr.đ/ngày.`,
      },
      {
        tag: '🚚 Nhịp độ về đích',
        severity: paceGap > 0 ? 'amber' : 'green',
        title: fc.remainingDays > 0
          ? `Còn ${fc.remainingDays} ngày; vận tốc yêu cầu ${fc.reqVelocity.toLocaleString()} Tr.đ/ngày`
          : 'Kỳ báo cáo đã kết thúc',
        desc: `Vận tốc thực tế ${fc.curVelocity.toLocaleString()} Tr.đ/ngày; chênh lệch so với mức cần thiết ${paceGap >= 0 ? '+' : ''}${paceGap.toFixed(1)} Tr.đ/ngày.`,
        decision: paceGap > 0
          ? 'Ưu tiên nguồn lực cho các vùng có hệ số tải cao và kiểm tra tiến độ theo ngày.'
          : 'Giữ ổn định nguồn cung và xác nhận chất lượng đơn hàng để bảo toàn nhịp đạt kế hoạch.',
      },
    ];
  }

  getStatisticalForecastMetrics() {
    return this.getExecutiveForecastByHorizon('month');
  }

  getForecastPacingChartData() {
    const context = this.getForecastContext('month');
    const facts = context.facts;
    const currentActual = context.actual;
    const currentTarget = context.target;
    const totalDays = context.totalDays;
    const currentDay = context.passedDays;

    const dailyMap = {};
    for (let d = 1; d <= totalDays; d++) dailyMap[d] = 0;

    const mPrefix = context.bounds.startDate.slice(0, 7);
    facts.forEach((r) => {
      if (r[0].startsWith(mPrefix)) {
        const dayNum = parseInt(r[0].split('-')[2], 10);
        if (dailyMap[dayNum] !== undefined) dailyMap[dayNum] += (r[4] || 0) / 1000000;
      }
    });

    const labels = [];
    const actualCumulative = [];
    const targetPacing = [];
    const forecastBaseline = [];
    const forecastLower = [];
    const forecastUpper = [];

    let cumAct = 0;
    const dailyTargetStep = currentTarget / totalDays;
    const currentVelocity = context.curVelocity;

    for (let d = 1; d <= totalDays; d++) {
      labels.push(`N${d}`);
      targetPacing.push(Math.round(dailyTargetStep * d));

      if (d <= currentDay) {
        cumAct += dailyMap[d];
        actualCumulative.push(Math.round(cumAct));
        forecastBaseline.push(Math.round(cumAct));
        forecastLower.push(Math.round(cumAct));
        forecastUpper.push(Math.round(cumAct));
      } else {
        actualCumulative.push(null);
        const dayOffset = d - currentDay;
        const projected = currentActual + dayOffset * currentVelocity;
        const se = context.dailyStdDev * Math.sqrt(dayOffset);
        forecastBaseline.push(Math.round(projected));
        forecastLower.push(Math.round(Math.max(0, projected - 1.645 * se)));
        forecastUpper.push(Math.round(projected + 1.645 * se));
      }
    }

    return {
      labels,
      actualCumulative,
      targetPacing,
      forecastBaseline,
      forecastLower,
      forecastUpper,
      currentDay,
      totalDays,
    };
  }

  getRegionBurdenAnalysis() {
    const context = this.getForecastContext('month');
    const facts = context.facts;
    const targets = context.targets;
    const passedDays = Math.max(1, context.passedDays);
    const remainingDays = context.remainingDays;

    const regions = ['Miền Bắc', 'Miền Trung 1', 'Miền Trung 2', 'Miền Nam', 'KA', 'MT', 'B2C'];
    const actMap = {};
    const tgtMap = {};

    facts.forEach((r) => {
      const cust = this.customers[r[1]] || {};
      const terr = this.territories[r[3]] || {};
      const m = cust.mien || terr.mien || 'Khác';
      actMap[m] = (actMap[m] || 0) + (r[4] || 0) / 1000000;
    });

    targets.forEach((r) => {
      const cust = this.customers[r[2]] || {};
      const terr = this.territories[r[1]] || {};
      const m = cust.mien || terr.mien || 'Khác';
      tgtMap[m] = (tgtMap[m] || 0) + (r[3] || 0) / 1000000;
    });

    return regions.map((m) => {
      const act = actMap[m] || 0;
      const tgt = tgtMap[m] || 0;
      const curV = act / passedDays;
      const shortfall = Math.max(0, tgt - act);
      const reqV = remainingDays > 0 ? shortfall / remainingDays : 0;
      const burden = curV > 0
        ? reqV / curV
        : (shortfall > 0 ? Number.POSITIVE_INFINITY : 0);
      const fc = act + remainingDays * curV;
      const fcAttainment = tgt > 0 ? (fc / tgt) * 100 : 0;

      let riskLevel = 'green';
      let riskLabel = 'An toàn';
      if (burden > 1.3 || fcAttainment < 85) {
        riskLevel = 'red';
        riskLabel = 'Cảnh báo đỏ';
      } else if (burden > 0.95 || fcAttainment < 100) {
        riskLevel = 'amber';
        riskLabel = 'Cần tăng tốc';
      }

      return {
        name: m,
        actual: Math.round(act),
        target: Math.round(tgt),
        shortfall: Math.round(shortfall),
        currentVelocity: Number(curV.toFixed(1)),
        requiredVelocity: Number(reqV.toFixed(1)),
        burden: Number.isFinite(burden) ? Number(burden.toFixed(2)) : burden,
        forecastAttainment: Number(fcAttainment.toFixed(1)),
        riskLevel,
        riskLabel,
      };
    });
  }

  getComprehensiveEarlyWarnings() {
    const facts = this.getFilteredFacts();
    const lyFacts = this.getLYFilteredFacts();

    const warnings = [];

    // 1. CẢNH BÁO NGUY CƠ HỤT TARGET THEO MIỀN (RED/AMBER)
    const regionBurden = this.getRegionBurdenAnalysis();
    const criticalRegions = regionBurden.filter((r) => r.riskLevel === 'red' && r.shortfall > 400);
    criticalRegions.forEach((r) => {
      warnings.push({
        type: 'critical',
        severity: 'red',
        badge: '🚨 Nguy cơ vỡ Target',
        title: `${r.name}: Thiếu hụt ${r.shortfall.toLocaleString()} Tr.đ`,
        desc: `Vận tốc hiện tại ${r.currentVelocity} Tr.đ/ngày, cần tăng lên ${r.requiredVelocity} Tr.đ/ngày (Áp lực tải ${r.burden}x). Dự báo đạt ${r.forecastAttainment}% Target.`,
        action: `Giao KPI ngày cho RSM ${r.name}, tập trung giải phóng đơn hàng tồn và đẩy chương trình khuyến mại cuối tháng.`,
      });
    });

    // 2. CẢNH BÁO ĐẠI LÝ / KHÁCH HÀNG SỤT GIẢM SÂU (ATTRITION / CHURN)
    const actCustMap = {};
    const lyCustMap = {};
    facts.forEach((r) => { actCustMap[r[1]] = (actCustMap[r[1]] || 0) + (r[4] || 0) / 1000000; });
    lyFacts.forEach((r) => { lyCustMap[r[1]] = (lyCustMap[r[1]] || 0) + (r[4] || 0) / 1000000; });

    const churnCandidates = [];
    Object.entries(lyCustMap).forEach(([cid, lyVal]) => {
      if (lyVal >= 150) {
        const actVal = actCustMap[cid] || 0;
        const drop = lyVal - actVal;
        const pctDrop = ((actVal - lyVal) / lyVal) * 100;
        if (pctDrop <= -35 && drop >= 100) {
          const c = this.customers[cid] || {};
          churnCandidates.push({
            name: c.name || cid,
            channel: c.channel || 'GT',
            mien: c.mien || '',
            actVal: Math.round(actVal),
            lyVal: Math.round(lyVal),
            drop: Math.round(drop),
            pctDrop: Math.round(pctDrop),
          });
        }
      }
    });

    churnCandidates.sort((a, b) => b.drop - a.drop);
    if (churnCandidates.length > 0) {
      const topChurn = churnCandidates.slice(0, 3);
      const names = topChurn.map((c) => `${c.name} (-${c.drop} Tr.đ / ${c.pctDrop}%)`).join('; ');
      warnings.push({
        type: 'warning',
        severity: 'amber',
        badge: '⚠️ Churn & Drop Đại lý',
        title: `Phát hiện ${churnCandidates.length} NPP & Đại lý lớn sụt giảm > 35% doanh số`,
        desc: `Các đối tác sụt giảm sâu: ${names}.`,
        action: `Trưởng kênh GT/MT và Sales Sup tiếp cận trực tiếp kiểm tra sức mua điểm bán và hỗ trợ luân chuyển hàng.`,
      });
    }

    // 3. CẢNH BÁO CÂN ĐỐI CƠ CẤU SẢN PHẨM (CORE PRODUCT MIX)
    let vkRev = 0;
    let dtRev = 0;
    facts.forEach((r) => {
      const p = this.products[r[2]] || {};
      if (p.group === 'Khoáng kiềm Vikoda' || p.is_vikoda) vkRev += (r[4] || 0) / 1000000;
      else dtRev += (r[4] || 0) / 1000000;
    });
    const totalRev = vkRev + dtRev;
    const vkShare = totalRev > 0 ? (vkRev / totalRev) * 100 : 0;
    if (vkShare < 45) {
      warnings.push({
        type: 'info',
        severity: 'blue',
        badge: '📦 Tỷ Trọng Sản Phẩm',
        title: `Khoáng Kiềm Vikoda đạt ${vkShare.toFixed(1)}% tổng doanh thu (Kỳ vọng >= 45%)`,
        desc: `Dòng Khoáng ngọt Đảnh Thạnh đang áp đảo. Dòng Khoáng kiềm có biên lợi nhuận cao cần được thúc đẩy thêm.`,
        action: `Tăng cường chính sách thưởng Sell-in cho dòng Vikoda chai thủy tinh 350ml và chai PET 500ml.`,
      });
    }

    // 4. ĐIỂM SÁNG TĂNG TRƯỞNG & CƠ HỘI ĐỘT PHÁ (OPPORTUNITY)
    const strongRegions = regionBurden.filter((r) => r.forecastAttainment >= 110);
    if (strongRegions.length > 0) {
      const strongNames = strongRegions.map((r) => `${r.name} (${r.forecastAttainment}% Target)`).join(', ');
      warnings.push({
        type: 'success',
        severity: 'green',
        badge: '🚀 Cơ Hội Bứt Phá',
        title: `Đạt vượt tiến độ xuất sắc: ${strongNames}`,
        desc: `Khu vực có nhịp độ bán hàng mạnh mẽ, duy trì khả năng về đích sớm.`,
        action: `Bổ sung tồn kho đệm và phương án vận tải đảm bảo cung ứng thông suốt không gián đoạn.`,
      });
    }

    return warnings;
  }

  getPlanForecastByRegion() {
    return this.getRegionBurdenAnalysis().map((r) => ({
      name: r.name,
      value: r.forecastAttainment,
    }));
  }

  getPlanShortfallByArea() {
    const facts = this.getFilteredFacts();
    const targets = this.getFilteredTargets();

    const actMap = {};
    const tgtMap = {};

    facts.forEach((r) => {
      const cust = this.customers[r[1]] || {};
      const v = cust.vung || 'Khác';
      actMap[v] = (actMap[v] || 0) + (r[4] || 0) / 1000000;
    });

    targets.forEach((r) => {
      const cust = this.customers[r[2]] || {};
      const v = cust.vung || 'Khác';
      tgtMap[v] = (tgtMap[v] || 0) + (r[3] || 0) / 1000000;
    });

    return Object.keys(tgtMap)
      .map((vung) => {
        const act = actMap[vung] || 0;
        const tgt = tgtMap[vung] || 0;
        const gap = Math.max(0, tgt - act);
        return {
          vung,
          shortfall: Math.round(gap),
        };
      })
      .sort((a, b) => b.shortfall - a.shortfall)
      .slice(0, 10);
  }
}

if (typeof window !== 'undefined') {
  window.VikodaDataEngine = VikodaDataEngine;
  window.dataEngine = new VikodaDataEngine();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VikodaDataEngine };
}
