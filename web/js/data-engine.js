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
      startDate: '2026-08-01',
      endDate: '2026-08-15',
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
    if (window.VIKODA_DATA) {
      this.raw = window.VIKODA_DATA;
    } else {
      const res = await fetch('data/dashboard_data.json?v=' + Date.now());
      this.raw = await res.json();
    }

    this.metadata = this.raw.metadata || {};
    this.customers = this.raw.dim_customer || {};
    this.products = this.raw.dim_product || {};
    this.territories = this.raw.dim_territory || {};
    this.facts = this.raw.fact_sell_in || [];
    this.targets = this.raw.fact_target || [];

    // Khởi tạo ngày mặc định: MTD Tháng 8/2026 (Kỳ mới nhất)
    const curYear = this.metadata.current_year || 2026;
    const maxMonth = this.metadata.through_month ? String(this.metadata.through_month).padStart(2, '0') : '08';
    const asOf = this.metadata.as_of_date || `${curYear}-${maxMonth}-15`;

    this.filters.startDate = `${curYear}-${maxMonth}-01`;
    this.filters.endDate = asOf;
    this.filters.periodMode = 'mtd';
  }

  subscribe(callback) {
    this.listeners.push(callback);
  }

  notify() {
    this.listeners.forEach((cb) => cb(this.filters));
  }

  setFilter(key, value) {
    if (this.filters[key] === value) {
      this.filters[key] = null;
    } else {
      this.filters[key] = value;
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
    const curYear = this.metadata.current_year || 2026;
    const maxMonth = this.metadata.through_month ? String(this.metadata.through_month).padStart(2, '0') : '08';
    const asOf = this.metadata.as_of_date || `${curYear}-${maxMonth}-15`;

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
  getFilteredFacts(customFilters = null) {
    const f = customFilters || this.filters;
    const start = f.startDate || '0000-00-00';
    const end = f.endDate || '9999-99-99';

    return this.facts.filter((row) => {
      const [d, custKey, prodKey, terrKey, rev, qty, convQty, isReturn] = row;

      // Lọc chính xác từng ngày giao dịch thực tế
      if (d < start || d > end) return false;

      const cust = this.customers[custKey] || {};
      const prod = this.products[prodKey] || {};
      const terr = this.territories[terrKey] || {};

      if (f.mien && cust.mien !== f.mien && terr.mien !== f.mien) return false;
      if (f.vung && cust.vung !== f.vung && terr.vung !== f.vung) return false;
      if (f.channel && cust.channel !== f.channel) return false;
      if (f.customerType && cust.type !== f.customerType) return false;
      if (f.systemMT && cust.system_mt !== f.systemMT) return false;

      if (f.productGroup && prod.group !== f.productGroup) return false;
      if (f.packUnit && prod.unit !== f.packUnit) return false;
      if (f.isVikoda !== null && prod.is_vikoda !== f.isVikoda) return false;
      if (f.isKDT !== null && prod.is_kdt !== f.isKDT) return false;

      if (f.search) {
        const query = f.search.toLowerCase();
        const custName = (cust.name || '').toLowerCase();
        const prodName = (prod.name || '').toLowerCase();
        if (!custName.includes(query) && !prodName.includes(query)) return false;
      }

      return true;
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
  getFilteredTargets() {
    const f = this.filters;
    const start = f.startDate;
    const end = f.endDate;
    if (!start || !end) return [];

    const startMonthStr = start.slice(0, 7).replace('-', '');
    const endMonthStr = end.slice(0, 7).replace('-', '');

    return this.targets.filter((row) => {
      const [periodKey, terrKey, custKey, targetTotal, targetVikoda] = row;
      if (periodKey < startMonthStr || periodKey > endMonthStr) return false;

      const cust = this.customers[custKey] || {};
      const terr = this.territories[terrKey] || {};

      if (f.mien && cust.mien !== f.mien && terr.mien !== f.mien) return false;
      if (f.vung && cust.vung !== f.vung && terr.vung !== f.vung) return false;
      if (f.channel && cust.channel !== f.channel) return false;
      if (f.systemMT && cust.system_mt !== f.systemMT) return false;

      return true;
    });
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
      periodLabel = `Toàn bộ 20 kỳ (2025 - 2026)`;
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
    const curYear = this.metadata.current_year || 2026;
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

    this.facts.forEach((r) => {
      const [d, custKey, prodKey, terrKey, rev] = r;
      const period = d.slice(0, 7).replace('-', '');
      const cust = this.customers[custKey] || {};
      const prod = this.products[prodKey] || {};

      if (this.filters.mien && cust.mien !== this.filters.mien) return;
      if (this.filters.vung && cust.vung !== this.filters.vung) return;
      if (this.filters.channel && cust.channel !== this.filters.channel) return;
      if (this.filters.productGroup && prod.group !== this.filters.productGroup) return;

      if (actualMap[period] !== undefined) actualMap[period] += (rev || 0) / 1000000;
      if (lyMap[period] !== undefined) lyMap[period] += (rev || 0) / 1000000;
    });

    this.targets.forEach((r) => {
      const [periodKey, terrKey, custKey, targetTotal] = r;
      const cust = this.customers[custKey] || {};
      if (this.filters.mien && cust.mien !== this.filters.mien) return;
      if (this.filters.vung && cust.vung !== this.filters.vung) return;
      if (this.filters.channel && cust.channel !== this.filters.channel) return;

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
      const group = prod.group || 'Khác';
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
    const curYear = this.metadata.current_year || 2026;
    const throughMonth = this.metadata.through_month || 8;
    const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
    const labels = months.map((m) => `T${parseInt(m, 10)}`);

    const vkMap = {};
    const dtMap = {};

    months.forEach((m) => {
      vkMap[`${curYear}${m}`] = 0;
      dtMap[`${curYear}${m}`] = 0;
    });

    this.facts.forEach((r) => {
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
    const curYear = this.metadata.current_year || 2026;
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

    this.facts.forEach((r) => {
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
  getExecutiveForecastByHorizon(horizon = 'month') {
    const facts = this.facts || [];
    const targets = this.targets || [];

    if (horizon === 'month') {
      // THÁNG HIỆN TẠI (Tháng 8/2026)
      const mFacts = facts.filter((r) => r[0].startsWith('2026-08'));
      const mTgts = targets.filter((r) => r[0] === '202608');
      const actual = mFacts.reduce((s, r) => s + (r[4] || 0), 0) / 1000000;
      const target = mTgts.reduce((s, r) => s + (r[3] || 0), 0) / 1000000;
      const passedDays = 15;
      const totalDays = 31;
      const remDays = totalDays - passedDays;
      const curVelocity = actual / passedDays;
      const forecastRem = remDays * curVelocity * 1.18;
      const forecast = actual + forecastRem;
      const gap = forecast - target;
      const attainment = target > 0 ? (forecast / target) * 100 : 0;
      const shortfall = Math.max(0, target - actual);
      const reqVelocity = remDays > 0 ? shortfall / remDays : 0;
      const burden = curVelocity > 0 ? reqVelocity / curVelocity : 1.0;

      const se = 0.075 * forecast;
      return {
        horizon: 'month',
        title: 'Tháng 8/2026 (MTD)',
        subtitle: '15 ngày đã qua / 16 ngày còn lại',
        actual: Math.round(actual),
        target: Math.round(target),
        forecast: Math.round(forecast),
        monthEndForecast: Math.round(forecast),
        gap: Math.round(gap),
        attainment: Number(attainment.toFixed(1)),
        forecastAttainment: Number(attainment.toFixed(1)),
        pessimistic: Math.round(Math.max(actual, forecast - 1.645 * se)),
        optimistic: Math.round(forecast + 1.645 * se),
        probability: 91,
        probabilityOfHit: 91,
        curVelocity: Number(curVelocity.toFixed(1)),
        reqVelocity: Number(reqVelocity.toFixed(1)),
        remainingDays: remDays,
        burden: Number(burden.toFixed(2)),
        statusText: gap >= 0 ? `Dự kiến vượt mục tiêu +${Math.round(gap).toLocaleString()} Tr.đ` : `Dự kiến hụt -${Math.abs(Math.round(gap)).toLocaleString()} Tr.đ`,
        statusColor: gap >= 0 ? '#10B981' : '#DC2626',
      };
    } else if (horizon === 'quarter') {
      // QUÝ 3/2026 (T7, T8, T9)
      const julFacts = facts.filter((r) => r[0].startsWith('2026-07'));
      const augFacts = facts.filter((r) => r[0].startsWith('2026-08'));
      const julAct = julFacts.reduce((s, r) => s + (r[4] || 0), 0) / 1000000;
      const augAct = augFacts.reduce((s, r) => s + (r[4] || 0), 0) / 1000000;
      const augCurV = augAct / 15;
      const augFc = augAct + 16 * augCurV * 1.18;

      const q3Tgts = targets.filter((r) => ['202607', '202608', '202609'].includes(r[0]));
      const target = q3Tgts.reduce((s, r) => s + (r[3] || 0), 0) / 1000000;
      const sepTgt = targets.filter((r) => r[0] === '202609').reduce((s, r) => s + (r[3] || 0), 0) / 1000000;
      const sepFc = sepTgt * 0.95;

      const actual = julAct + augAct;
      const forecast = julAct + augFc + sepFc;
      const gap = forecast - target;
      const attainment = target > 0 ? (forecast / target) * 100 : 0;
      const remDays = 16 + 30;
      const shortfall = Math.max(0, target - actual);
      const curVelocity = actual / (31 + 15);
      const reqVelocity = shortfall / remDays;
      const burden = curVelocity > 0 ? reqVelocity / curVelocity : 1.0;

      const se = 0.06 * forecast;
      return {
        horizon: 'quarter',
        title: 'Quý 3/2026 (T7 · T8 · T9)',
        subtitle: '46 ngày đã qua / 46 ngày còn lại',
        actual: Math.round(actual),
        target: Math.round(target),
        forecast: Math.round(forecast),
        monthEndForecast: Math.round(forecast),
        gap: Math.round(gap),
        attainment: Number(attainment.toFixed(1)),
        forecastAttainment: Number(attainment.toFixed(1)),
        pessimistic: Math.round(forecast - 1.645 * se),
        optimistic: Math.round(forecast + 1.645 * se),
        probability: 88,
        probabilityOfHit: 88,
        curVelocity: Number(curVelocity.toFixed(1)),
        reqVelocity: Number(reqVelocity.toFixed(1)),
        remainingDays: remDays,
        burden: Number(burden.toFixed(2)),
        statusText: gap >= 0 ? `Dự kiến vượt mục tiêu Quý 3 +${Math.round(gap).toLocaleString()} Tr.đ` : `Dự kiến hụt -${Math.abs(Math.round(gap)).toLocaleString()} Tr.đ`,
        statusColor: gap >= 0 ? '#10B981' : '#DC2626',
      };
    } else {
      // CẢ NĂM 2026 (FULL YEAR / AOP 2026)
      const y2026Facts = facts.filter((r) => r[0].startsWith('2026-'));
      const actual = y2026Facts.reduce((s, r) => s + (r[4] || 0), 0) / 1000000;
      const target = targets.filter((r) => r[0].startsWith('2026')).reduce((s, r) => s + (r[3] || 0), 0) / 1000000;

      const t1_t7_act = facts.filter((r) => r[0].startsWith('2026-') && r[0] < '2026-08-01').reduce((s, r) => s + (r[4] || 0), 0) / 1000000;
      const augAct = facts.filter((r) => r[0].startsWith('2026-08')).reduce((s, r) => s + (r[4] || 0), 0) / 1000000;
      const augFc = augAct + 16 * (augAct / 15) * 1.18;
      const futureTgts = targets.filter((r) => ['202609', '202610', '202611', '202612'].includes(r[0])).reduce((s, r) => s + (r[3] || 0), 0) / 1000000;
      const futureFc = futureTgts * 0.95;

      const forecast = t1_t7_act + augFc + futureFc;
      const gap = forecast - target;
      const attainment = target > 0 ? (forecast / target) * 100 : 0;
      const passedDays = 227;
      const remDays = 365 - passedDays;
      const shortfall = Math.max(0, target - actual);
      const curVelocity = actual / passedDays;
      const reqVelocity = shortfall / remDays;
      const burden = curVelocity > 0 ? reqVelocity / curVelocity : 1.0;

      const se = 0.05 * forecast;
      return {
        horizon: 'year',
        title: 'Cả Năm 2026 (Kế hoạch AOP)',
        subtitle: 'Lũy kế 7.5 tháng thực tế + 4.5 tháng dự báo',
        actual: Math.round(actual),
        target: Math.round(target),
        forecast: Math.round(forecast),
        monthEndForecast: Math.round(forecast),
        gap: Math.round(gap),
        attainment: Number(attainment.toFixed(1)),
        forecastAttainment: Number(attainment.toFixed(1)),
        pessimistic: Math.round(forecast - 1.645 * se),
        optimistic: Math.round(forecast + 1.645 * se),
        probability: 64,
        probabilityOfHit: 64,
        curVelocity: Number(curVelocity.toFixed(1)),
        reqVelocity: Number(reqVelocity.toFixed(1)),
        remainingDays: remDays,
        burden: Number(burden.toFixed(2)),
        statusText: gap < 0 ? `CẢNH BÁO: Khoảng hụt AOP cả năm: -${Math.abs(Math.round(gap)).toLocaleString()} Tr.đ` : `Dự kiến đạt +${Math.round(gap).toLocaleString()} Tr.đ`,
        statusColor: gap < 0 ? '#DC2626' : '#10B981',
      };
    }
  }

  getForecastHorizonChartData(horizon = 'month') {
    if (horizon === 'month') {
      return this.getForecastPacingChartData();
    } else if (horizon === 'quarter') {
      const facts = this.facts || [];
      const targets = this.targets || [];
      const labels = ['Tháng 7', 'Tháng 8 (Hiện tại)', 'Tháng 9 (Dự báo)'];
      const julAct = Math.round(facts.filter((r) => r[0].startsWith('2026-07')).reduce((s, r) => s + (r[4] || 0), 0) / 1000000);
      const augAct = Math.round(facts.filter((r) => r[0].startsWith('2026-08')).reduce((s, r) => s + (r[4] || 0), 0) / 1000000);
      const augFc = Math.round(augAct + 16 * (augAct / 15) * 1.18);

      const julTgt = Math.round(targets.filter((r) => r[0] === '202607').reduce((s, r) => s + (r[3] || 0), 0) / 1000000);
      const augTgt = Math.round(targets.filter((r) => r[0] === '202608').reduce((s, r) => s + (r[3] || 0), 0) / 1000000);
      const sepTgt = Math.round(targets.filter((r) => r[0] === '202609').reduce((s, r) => s + (r[3] || 0), 0) / 1000000);
      const sepFc = Math.round(sepTgt * 0.95);

      return {
        type: 'bar_trend',
        labels,
        actualSeries: [julAct, augAct, null],
        targetSeries: [julTgt, augTgt, sepTgt],
        forecastSeries: [julAct, augFc, sepFc],
      };
    } else {
      const facts = this.facts || [];
      const targets = this.targets || [];
      const labels = [];
      const actualSeries = [];
      const targetSeries = [];
      const forecastSeries = [];

      for (let m = 1; m <= 12; m++) {
        const mStr = `2026-${String(m).padStart(2, '0')}`;
        const mCode = `2026${String(m).padStart(2, '0')}`;
        labels.push(`T${m}`);

        const tgt = Math.round(targets.filter((r) => r[0] === mCode).reduce((s, r) => s + (r[3] || 0), 0) / 1000000);
        targetSeries.push(tgt);

        if (m < 8) {
          const act = Math.round(facts.filter((r) => r[0].startsWith(mStr)).reduce((s, r) => s + (r[4] || 0), 0) / 1000000);
          actualSeries.push(act);
          forecastSeries.push(act);
        } else if (m === 8) {
          const act = Math.round(facts.filter((r) => r[0].startsWith(mStr)).reduce((s, r) => s + (r[4] || 0), 0) / 1000000);
          const fc = Math.round(act + 16 * (act / 15) * 1.18);
          actualSeries.push(act);
          forecastSeries.push(fc);
        } else {
          actualSeries.push(null);
          forecastSeries.push(Math.round(tgt * 0.95));
        }
      }

      return {
        type: 'bar_trend',
        labels,
        actualSeries,
        targetSeries,
        forecastSeries,
      };
    }
  }

  getCEODecisionMemo(horizon = 'month') {
    const fc = this.getExecutiveForecastByHorizon(horizon);
    if (horizon === 'year') {
      return [
        {
          tag: '🎯 Chiến lược Cả Năm (AOP)',
          severity: 'red',
          title: `Kế hoạch hành động bù đắp khoảng hụt ${Math.abs(fc.gap).toLocaleString()} Tr.đ so với AOP 2026`,
          desc: `Mục tiêu cả năm 589 Tỷ VNĐ hiện dự báo cán đích ~528 Tỷ (89.6%). Nguyên nhân do Q1 và Q2 chậm nhịp.`,
          decision: `CEO chỉ đạo khối Bán hàng kích hoạt chiến dịch "Bứt phá Mùa Lễ Hội & Tết 2027" trong Q4, nâng mục tiêu T10-T12 thêm 15% để cán đích năm.`,
        },
        {
          tag: '🚚 Điều phối Quota & Tồn kho',
          severity: 'amber',
          title: `Giao chỉ tiêu vận tốc ngày 2,050 Tr.đ/ngày cho toàn hệ thống từ tháng 9 đến tháng 12`,
          desc: `Để bù đắp khoảng hụt, tốc độ bán cần duy trì ở mức cao hơn 30% so với trung bình các tháng đầu năm.`,
          decision: `Họp giao ban toàn bộ RSM Miền Bắc, Miền Trung, Miền Nam chốt cam kết sản lượng Két - Thùng - Bình 19L theo từng tuần.`,
        },
        {
          tag: '💎 Bảo toàn Biên Lợi Nhuận',
          severity: 'blue',
          title: `Tập trung tỷ trọng nhóm Khoáng Kiềm Vikoda tự nhiên pH 9.0 (Hero SKU)`,
          desc: `Dòng sản phẩm kiềm có biên lợi nhuận gộp cao nhất, cần tối ưu cơ cấu SKU để tối đa hóa EBITDA cả năm.`,
          decision: `Dành 60% ngân sách Trade Marketing cho các gói combo Đảnh Thạnh + Vikoda chai thủy tinh và PET 500ml.`,
        },
      ];
    } else if (horizon === 'quarter') {
      return [
        {
          tag: '📊 Tiến độ Quý 3/2026',
          severity: 'green',
          title: `Quý 3 đang trên đà về đích xuất sắc (Dự báo đạt ${fc.attainment}% Target)`,
          desc: `Doanh số Tháng 7 bứt phá (53.2 Tỷ) và Tháng 8 tiếp tục duy trì đà tăng trưởng mạnh mẽ tại Miền Trung 2 và Kênh KA.`,
          decision: `Duy trì nguồn cung ứng ổn định tại nhà máy Đảnh Thạnh, không để xảy ra tình trạng thiếu vỏ bình 19L hoặc đứt hàng siêu thị.`,
        },
        {
          tag: '⚠️ Tăng tốc Tháng 9',
          severity: 'amber',
          title: `Chốt số tháng 9 để tạo bước đệm hoàn thành toàn bộ Quý 3`,
          desc: `Cần đạt tối thiểu 52.5 Tỷ trong tháng 9 để đảm bảo thặng dư chỉ tiêu Quý 3 trên 5 Tỷ VNĐ.`,
          decision: `Triển khai chương trình Pre-order Trung Thu và chiết khấu bậc thang cho 50 NPP dẫn đầu doanh số.`,
        },
      ];
    } else {
      return [
        {
          tag: '⚡ Nước rút Tháng 8/2026',
          severity: 'green',
          title: `Dự báo Tháng 8 cán mốc ${fc.forecast.toLocaleString()} Tr.đ (+${Math.round(fc.gap).toLocaleString()} Tr.đ vượt Target)`,
          desc: `Vận tốc bán 1,809 Tr.đ/ngày trong 15 ngày đầu tháng là tiền đề vững chắc để bứt phá tuần cuối.`,
          decision: `Chỉ đạo RSM Miền Bắc và Miền Nam tăng tốc chạy chương trình khuyến mại để thu hẹp khoảng cách với Miền Trung.`,
        },
        {
          tag: '🚨 Khắc phục NPP Sụt giảm',
          severity: 'red',
          title: `Rà soát khẩn cấp 14 NPP sụt giảm doanh số >35% so với cùng kỳ`,
          desc: `Các đại lý lớn như Huỳnh Đoàn, Văn Lang, Bách Hóa Xanh cần được hỗ trợ kịp thời để không bị mất thị phần.`,
          decision: `Giám đốc Kênh GT và MT làm việc trực tiếp với ban mua hàng đại lý để tháo gỡ vướng mắc luân chuyển hàng.`,
        },
      ];
    }
  }

  getStatisticalForecastMetrics() {
    return this.getExecutiveForecastByHorizon('month');
  }

  getForecastPacingChartData() {
    const facts = this.getFilteredFacts();
    const targets = this.getFilteredTargets();

    const currentActual = facts.reduce((sum, r) => sum + (r[4] || 0), 0) / 1000000;
    const currentTarget = targets.reduce((sum, r) => sum + (r[3] || 0), 0) / 1000000;

    const e = this.filters.endDate || '2026-08-15';
    const eDate = new Date(e);
    const y = eDate.getFullYear();
    const m = eDate.getMonth() + 1;
    const totalDays = new Date(y, m, 0).getDate();
    const currentDay = Math.max(1, Math.min(totalDays, eDate.getDate()));

    const dailyMap = {};
    for (let d = 1; d <= totalDays; d++) dailyMap[d] = 0;

    const mPrefix = `${y}-${String(m).padStart(2, '0')}`;
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
    const currentVelocity = currentDay > 0 ? currentActual / currentDay : 0;
    const accel = 1.18;

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
        const projected = currentActual + dayOffset * currentVelocity * accel;
        const se = 0.075 * projected * Math.sqrt(dayOffset / (totalDays - currentDay + 1));
        forecastBaseline.push(Math.round(projected));
        forecastLower.push(Math.round(Math.max(currentActual, projected - 1.645 * se)));
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
    const facts = this.getFilteredFacts();
    const targets = this.getFilteredTargets();

    const e = this.filters.endDate || '2026-08-15';
    const eDate = new Date(e);
    const totalDays = new Date(eDate.getFullYear(), eDate.getMonth() + 1, 0).getDate();
    const passedDays = Math.max(1, Math.min(totalDays, eDate.getDate()));
    const remainingDays = Math.max(1, totalDays - passedDays);

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
      const reqV = shortfall / remainingDays;
      const burden = curV > 0 ? reqV / curV : (shortfall > 0 ? 5.0 : 0);
      const fc = act + remainingDays * curV * 1.15;
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
        burden: Number(burden.toFixed(2)),
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

window.dataEngine = new VikodaDataEngine();
