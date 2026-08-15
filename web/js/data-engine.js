/**
 * VIKODA WEB DASHBOARD - ADVANCED IN-MEMORY ANALYTICS DATA ENGINE
 * Thiết kế chuẩn FMCG Commercial Analytics với tốc độ xử lý tức thì (<2ms).
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
      startDate: '2026-01-01',
      endDate: '2026-08-11',
      periodMode: 'ytd', // 'mtd', 'qtd', 'ytd', 'all', 'custom'
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

    // Khởi tạo ngày mặc định: YTD 2026
    const curYear = this.metadata.current_year || 2026;
    const maxD = this.metadata.as_of_date || `${curYear}-08-11`;
    this.filters.startDate = `${curYear}-01-01`;
    this.filters.endDate = maxD;
    this.filters.periodMode = 'ytd';
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
    this.filters.startDate = `${curYear}-01-01`;
    this.filters.endDate = this.metadata.as_of_date || `${curYear}-08-11`;
    this.filters.periodMode = 'ytd';
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
  // LỌC TẬP DỮ LIỆU FACT SELL IN
  // ------------------------------------------------------------------------
  getFilteredFacts(customFilters = null) {
    const f = customFilters || this.filters;
    const start = f.startDate;
    const end = f.endDate;

    return this.facts.filter((row) => {
      const [d, custKey, prodKey, terrKey, rev, qty, convQty, isReturn] = row;

      if (start && d < start) return false;
      if (end && d > end) return false;

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
  // LỌC TẬP DỮ LIỆU CÙNG KỲ NĂM TRƯỚC (LY)
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
    const [y, m, d] = dateStr.split('-').map(Number);
    const newY = y + offsetYears;
    const pad = (n) => String(n).padStart(2, '0');
    return `${newY}-${pad(m)}-${pad(d)}`;
  }

  // ------------------------------------------------------------------------
  // LỌC TẬP DỮ LIỆU TARGET (KẾ HOẠCH DOANH SỐ)
  // ------------------------------------------------------------------------
  getFilteredTargets() {
    const f = this.filters;
    const startPeriod = f.startDate ? f.startDate.slice(0, 7).replace('-', '') : '000000';
    const endPeriod = f.endDate ? f.endDate.slice(0, 7).replace('-', '') : '999999';

    return this.targets.filter((row) => {
      const [periodKey, terrKey, custKey, targetTotal, targetVikoda] = row;
      if (periodKey < startPeriod || periodKey > endPeriod) return false;

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

    // Tính Pacing & Dự báo Run-rate
    const sDate = new Date(this.filters.startDate);
    const eDate = new Date(this.filters.endDate);
    const timeDiffDays = Math.max(1, Math.round((eDate - sDate) / (1000 * 60 * 60 * 24)) + 1);

    const dayOfMonth = eDate.getDate();
    const lastDayOfMonth = new Date(eDate.getFullYear(), eDate.getMonth() + 1, 0).getDate();
    const timeElapsedPercent = (dayOfMonth / lastDayOfMonth) * 100;
    const pacing = timeElapsedPercent > 0 ? (attainment / timeElapsedPercent) * 100 : 0;

    const dailyActual = timeDiffDays > 0 ? actualMillion / timeDiffDays : 0;
    const daysInMonth = lastDayOfMonth;
    const runRateForecast = dailyActual * daysInMonth;
    const forecastAttainment = targetMillion > 0 ? (runRateForecast / targetMillion) * 100 : 0;

    const shortfall = Math.max(0, targetMillion - actualMillion);
    const dropSize = distinctCustomers > 0 ? actualMillion / distinctCustomers : 0;

    // Xác định nhãn khoảng thời gian đang lọc
    let periodLabel = `${this.formatDateVN(this.filters.startDate)} - ${this.formatDateVN(this.filters.endDate)}`;
    if (this.filters.periodMode === 'mtd') {
      periodLabel = `MTD Tháng ${eDate.getMonth() + 1}/${eDate.getFullYear()} (${periodLabel})`;
    } else if (this.filters.periodMode === 'qtd') {
      const q = Math.floor(eDate.getMonth() / 3) + 1;
      periodLabel = `QTD Quý ${q}/${eDate.getFullYear()} (${periodLabel})`;
    } else if (this.filters.periodMode === 'ytd') {
      periodLabel = `YTD Năm ${eDate.getFullYear()} (${periodLabel})`;
    } else if (this.filters.periodMode === 'all') {
      periodLabel = `Toàn bộ 20 kỳ 2025 - 2026 (${periodLabel})`;
    }

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
      pacing,
      runRateForecast,
      forecastAttainment,
      shortfall,
      dropSize,
      timeDiffDays,
      periodLabel,
    };
  }

  formatDateVN(str) {
    if (!str) return '';
    const parts = str.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return str;
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

    // Lọc theo các bộ lọc khác (Miền, Kênh, Nhóm SP...) nhưng quét qua toàn bộ các tháng
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

    const regions = ['Miền Bắc', 'Miền Trung 1', 'Miền Trung 2', 'Miền Nam', 'B2C'];
    const actMap = {};
    const tgtMap = {};

    facts.forEach((r) => {
      const cust = this.customers[r[1]] || {};
      const mien = cust.mien || 'Khác';
      actMap[mien] = (actMap[mien] || 0) + (r[4] || 0) / 1000000;
    });

    targets.forEach((r) => {
      const cust = this.customers[r[2]] || {};
      const mien = cust.mien || 'Khác';
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

  getTopCustomers(limit = 15) {
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

    return Object.entries(actMap)
      .map(([key, actual]) => {
        const cust = this.customers[key] || {};
        const ly = lyMap[key] || 0;
        const yoy = ly > 0 ? ((actual - ly) / ly) * 100 : 0;
        const share = totalRev > 0 ? (actual / totalRev) * 100 : 0;
        return {
          key,
          name: cust.name || key,
          channel: cust.channel || 'GT',
          mien: cust.mien || '',
          actual: Math.round(actual),
          ly: Math.round(ly),
          yoy: Number(yoy.toFixed(1)),
          share: Number(share.toFixed(1)),
        };
      })
      .sort((a, b) => b.actual - a.actual)
      .slice(0, limit);
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
    const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
    const labels = months.map((m) => `T${parseInt(m, 10)}`);

    const vkMap = {};
    const kdtMap = {};

    months.forEach((m) => {
      vkMap[`${curYear}${m}`] = 0;
      kdtMap[`${curYear}${m}`] = 0;
    });

    this.facts.forEach((r) => {
      const [d, custKey, prodKey, terrKey, rev] = r;
      const period = d.slice(0, 7).replace('-', '');
      const prod = this.products[prodKey] || {};

      if (prod.is_vikoda && vkMap[period] !== undefined) vkMap[period] += (rev || 0) / 1000000;
      if (prod.is_kdt && kdtMap[period] !== undefined) kdtMap[period] += (rev || 0) / 1000000;
    });

    const vikodaSeries = months.map((m) => Math.round(vkMap[`${curYear}${m}`] || 0));
    const kdtSeries = months.map((m) => Math.round(kdtMap[`${curYear}${m}`] || 0));
    const vikodaShareSeries = months.map((m, i) => {
      const total = vikodaSeries[i] + kdtSeries[i];
      return total > 0 ? Number(((vikodaSeries[i] / total) * 100).toFixed(1)) : 0;
    });

    return { labels, vikodaSeries, kdtSeries, vikodaShareSeries };
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
  // TRANG 06: KẾ HOẠCH & DỰ BÁO
  // ------------------------------------------------------------------------
  getPlanForecastByRegion() {
    const facts = this.getFilteredFacts();
    const targets = this.getFilteredTargets();

    const mienList = ['Miền Bắc', 'Miền Trung 1', 'Miền Trung 2', 'Miền Nam', 'B2C'];
    const actMap = {};
    const tgtMap = {};

    facts.forEach((r) => {
      const cust = this.customers[r[1]] || {};
      const m = cust.mien || 'Khác';
      actMap[m] = (actMap[m] || 0) + (r[4] || 0) / 1000000;
    });

    targets.forEach((r) => {
      const cust = this.customers[r[2]] || {};
      const m = cust.mien || 'Khác';
      tgtMap[m] = (tgtMap[m] || 0) + (r[3] || 0) / 1000000;
    });

    const endDate = new Date(this.filters.endDate || this.metadata.as_of_date);
    const day = endDate.getDate();
    const lastDay = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0).getDate();

    return mienList.map((m) => {
      const act = actMap[m] || 0;
      const tgt = tgtMap[m] || 0;
      const runRate = day > 0 ? (act / day) * lastDay : 0;
      const forecastPercent = tgt > 0 ? (runRate / tgt) * 100 : 0;
      return { name: m, value: Number(forecastPercent.toFixed(1)) };
    });
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

    const endDate = new Date(this.filters.endDate || this.metadata.as_of_date);
    const daysLeft = Math.max(1, new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0).getDate() - endDate.getDate());

    return Object.keys(tgtMap)
      .map((vung) => {
        const act = actMap[vung] || 0;
        const tgt = tgtMap[vung] || 0;
        const gap = Math.max(0, tgt - act);
        const reqDaily = gap / daysLeft;
        return {
          vung,
          shortfall: Math.round(gap),
          dailyRequired: Number(reqDaily.toFixed(1)),
        };
      })
      .sort((a, b) => b.shortfall - a.shortfall)
      .slice(0, 10);
  }
}

window.dataEngine = new VikodaDataEngine();
