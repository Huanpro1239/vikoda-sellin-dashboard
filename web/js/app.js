/**
 * VIKODA WEB DASHBOARD - MAIN APPLICATION CONTROLLER
 * Điều khiển tương tác, điều hướng 6 trang, lọc tức thì và xuất báo cáo.
 */

class VikodaApp {
  constructor() {
    this.activePage = 'page_01';
    this.tableData = [];
    this.tablePage = 1;
    this.tablePageSize = 25;
    this.tableSortCol = 'actual';
    this.tableSortAsc = false;
  }

  debounce(func, wait = 200) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  async init() {
    try {
      this.initAuth();
      const loadSuccess = await window.dataEngine.load();
      if (!loadSuccess) {
        this.showErrorState('Không thể nạp dữ liệu dashboard. Vui lòng kiểm tra lại pipeline hoặc làm mới trang.');
        return;
      }

      // Đăng ký nhận sự kiện khi bộ lọc thay đổi -> Tự động re-render tức thì
      window.dataEngine.subscribe(() => {
        this.render();
      });

      this.initDateSlicer();
      this.initSidebarDropdowns();
      this.initNavigation();
      this.initFilterPills();
      this.initTableControls();

      // Lần render đầu tiên
      this.render();
    } catch (err) {
      console.error('Lỗi khởi tạo Dashboard:', err);
      this.showErrorState(`Đã xảy ra lỗi khởi tạo giao diện: ${err.message}`);
    }
  }

  showErrorState(msg) {
    const main = document.querySelector('.app-main');
    if (main) {
      main.innerHTML = `
        <div style="margin: 40px auto; max-width: 600px; padding: 28px; background: #fff1f2; border: 1px solid #fda4af; border-radius: 12px; text-align: center; color: #9f1239; box-shadow: 0 10px 25px rgba(0,0,0,0.05); font-family: 'Segoe UI', system-ui, sans-serif;">
          <div style="font-size: 40px; margin-bottom: 12px;">⚠️</div>
          <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 8px;">Thông Báo Hệ Thống Dữ Liệu</h3>
          <p style="font-size: 13px; line-height: 1.6; color: #4b5563; margin-bottom: 20px;">${msg}</p>
          <button onclick="window.location.reload()" style="padding: 9px 20px; background: #e11d48; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; transition: opacity 0.2s;">Tải Lại Trang</button>
        </div>
      `;
    }
  }

  initAuth() {
    const overlay = document.getElementById('auth-overlay');
    const form = document.getElementById('login_form');
    const input = document.getElementById('input_password');
    const remember = document.getElementById('remember_me');
    const errorMsg = document.getElementById('login_error_msg');

    if (!overlay || !form) return;

    if (window.auth && window.auth.isAuthenticated()) {
      overlay.style.display = 'none';
      return;
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pwd = input.value;
      const rememberMe = remember ? remember.checked : true;
      const success = await window.auth.login(pwd, rememberMe);

      if (success) {
        overlay.style.opacity = '0';
        setTimeout(() => {
          overlay.style.display = 'none';
          this.render();
          if (window.charts && window.charts.resizeAll) {
            window.charts.resizeAll();
          }
        }, 250);
      } else {
        if (errorMsg) errorMsg.style.display = 'block';
        input.value = '';
        input.focus();
      }
    });
  }

  // ------------------------------------------------------------------------
  // ĐIỀU HƯỚNG 6 TRANG & DI ĐỘNG
  // ------------------------------------------------------------------------
  initNavigation() {
    const navItems = document.querySelectorAll('.nav-item, .mobile-nav-btn');
    navItems.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const targetPage = btn.getAttribute('data-page');
        if (targetPage) this.switchPage(targetPage);
      });
    });

    // Nút mở/đóng bộ lọc trên di động
    const mobileFilterBtn = document.getElementById('btn_toggle_mobile_filter');
    const sidebar = document.querySelector('.app-sidebar');
    if (mobileFilterBtn && sidebar) {
      mobileFilterBtn.addEventListener('click', () => {
        sidebar.classList.toggle('mobile-open');
        const isOpen = sidebar.classList.contains('mobile-open');
        const span = mobileFilterBtn.querySelector('span');
        if (span) span.innerText = isOpen ? 'Đóng lọc' : 'Bộ lọc';
      });
    }
  }

  switchPage(pageId) {
    this.activePage = pageId;

    // Active nav items (Cả Sidebar và Mobile Bottom Nav)
    document.querySelectorAll('.nav-item, .mobile-nav-btn').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-page') === pageId);
    });

    // Active view container
    document.querySelectorAll('.view-page').forEach((v) => {
      v.classList.toggle('active', v.id === `view_${pageId}`);
    });

    // Tự động cuộn lên đầu trang trên điện thoại
    const content = document.querySelector('.app-content');
    if (content) content.scrollTop = 0;

    // Render nội dung cho trang vừa chọn
    if (pageId === 'page_05') {
      this.renderTablePage();
    } else {
      this.renderActivePageCharts();
      if (pageId === 'page_06') this.updateP6PredictiveMetrics();
    }
  }

  // ------------------------------------------------------------------------
  // BỘ LỌC NGÀY THÁNG - PHẢN HỒI TỨC THÌ (INSTANT REACTIVE SLICER)
  // ------------------------------------------------------------------------
  initDateSlicer() {
    const startInput = document.getElementById('filter_start_date');
    const endInput = document.getElementById('filter_end_date');
    const monthSelect = document.getElementById('select_month');

    if (startInput && endInput) {
      startInput.value = window.dataEngine.filters.startDate || '';
      endInput.value = window.dataEngine.filters.endDate || '';

      const handleEvt = () => this.handleDateInput();
      startInput.addEventListener('input', handleEvt);
      startInput.addEventListener('change', handleEvt);
      endInput.addEventListener('input', handleEvt);
      endInput.addEventListener('change', handleEvt);
    }

    if (monthSelect) {
      monthSelect.value = window.dataEngine.filters.startDate.slice(0, 7);
      monthSelect.addEventListener('change', (e) => {
        this.setMonthPeriod(e.target.value);
      });
    }

    // Nút chọn nhanh MTD / QTD / YTD / Tất cả
    document.querySelectorAll('.quick-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const type = btn.getAttribute('data-quick');
        if (type) this.setQuickPeriod(type);
      });
    });
  }

  handleDateInput() {
    const startInput = document.getElementById('filter_start_date');
    const endInput = document.getElementById('filter_end_date');
    const monthSelect = document.getElementById('select_month');

    if (!startInput || !endInput) return;
    const s = startInput.value;
    const e = endInput.value;

    if (!s || !e) return;

    document.querySelectorAll('.quick-btn').forEach((b) => b.classList.remove('active'));
    if (monthSelect) {
      if (s.slice(0, 7) === e.slice(0, 7)) {
        monthSelect.value = s.slice(0, 7);
      } else {
        monthSelect.value = '';
      }
    }

    window.dataEngine.setDateRange(s, e, 'custom');
  }

  setQuickPeriod(type) {
    const curYear = window.dataEngine.metadata.current_year || 2026;
    const maxMonth = window.dataEngine.metadata.through_month ? String(window.dataEngine.metadata.through_month).padStart(2, '0') : '08';
    const asOf = window.dataEngine.metadata.as_of_date || `${curYear}-${maxMonth}-15`;

    let start = `${curYear}-01-01`;
    let end = asOf;

    const startInput = document.getElementById('filter_start_date');
    const endInput = document.getElementById('filter_end_date');
    const monthSelect = document.getElementById('select_month');

    if (type === 'mtd') {
      start = `${curYear}-${maxMonth}-01`;
      end = asOf;
      if (monthSelect) monthSelect.value = `${curYear}-${maxMonth}`;
    } else if (type === 'qtd') {
      const m = parseInt(maxMonth, 10);
      const qStartMonth = String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, '0');
      start = `${curYear}-${qStartMonth}-01`;
      end = asOf;
      if (monthSelect) monthSelect.value = '';
    } else if (type === 'ytd') {
      start = `${curYear}-01-01`;
      end = asOf;
      if (monthSelect) monthSelect.value = '';
    } else if (type === 'all') {
      start = '2025-01-01';
      end = asOf;
      if (monthSelect) monthSelect.value = '';
    }

    if (startInput) startInput.value = start;
    if (endInput) endInput.value = end;

    document.querySelectorAll('.quick-btn').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-quick') === type);
    });

    window.dataEngine.setDateRange(start, end, type);
  }

  setMonthPeriod(val) {
    if (!val) return;
    const start = `${val}-01`;
    const end = `${val}-31`;
    const startInput = document.getElementById('filter_start_date');
    const endInput = document.getElementById('filter_end_date');
    if (startInput) startInput.value = start;
    if (endInput) endInput.value = end;

    document.querySelectorAll('.quick-btn').forEach((b) => b.classList.remove('active'));
    window.dataEngine.setDateRange(start, end, 'mtd');
  }

  // ------------------------------------------------------------------------
  // BỘ LỌC DROPDOWN BÊN TRÁI
  // ------------------------------------------------------------------------
  initSidebarDropdowns() {
    const mienSelect = document.getElementById('select_mien');
    const channelSelect = document.getElementById('select_channel');
    const groupSelect = document.getElementById('select_group');

    if (mienSelect) {
      mienSelect.addEventListener('change', (e) => {
        window.dataEngine.setFilter('mien', e.target.value || null);
      });
    }
    if (channelSelect) {
      channelSelect.addEventListener('change', (e) => {
        window.dataEngine.setFilter('channel', e.target.value || null);
      });
    }
    if (groupSelect) {
      groupSelect.addEventListener('change', (e) => {
        window.dataEngine.setFilter('productGroup', e.target.value || null);
      });
    }
  }

  // ------------------------------------------------------------------------
  // THANH HIỂN THỊ CÁC BỘ LỌC ĐANG CHỌN (FILTER PILLS)
  // ------------------------------------------------------------------------
  initFilterPills() {
    const clearBtn = document.getElementById('btn_clear_filters');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        window.dataEngine.clearAllFilters();

        const startInput = document.getElementById('filter_start_date');
        const endInput = document.getElementById('filter_end_date');
        if (startInput) startInput.value = window.dataEngine.filters.startDate;
        if (endInput) endInput.value = window.dataEngine.filters.endDate;

        document.querySelectorAll('.quick-btn').forEach((b) => {
          b.classList.toggle('active', b.getAttribute('data-quick') === 'ytd');
        });

        const monthSelect = document.getElementById('select_month');
        const mienSelect = document.getElementById('select_mien');
        const channelSelect = document.getElementById('select_channel');
        const groupSelect = document.getElementById('select_group');
        if (monthSelect) monthSelect.value = '';
        if (mienSelect) mienSelect.value = '';
        if (channelSelect) channelSelect.value = '';
        if (groupSelect) groupSelect.value = '';
      });
    }
  }

  updateFilterPillsUI() {
    const container = document.getElementById('filter_pills_container');
    if (!container) return;

    const f = window.dataEngine.filters;
    const pills = [];

    if (f.mien) pills.push({ key: 'mien', label: `Miền: ${f.mien}` });
    if (f.vung) pills.push({ key: 'vung', label: `Vùng: ${f.vung}` });
    if (f.channel) pills.push({ key: 'channel', label: `Kênh: ${f.channel}` });
    if (f.customerType) pills.push({ key: 'customerType', label: `Loại: ${f.customerType}` });
    if (f.systemMT) pills.push({ key: 'systemMT', label: `Hệ thống: ${f.systemMT}` });
    if (f.productGroup) pills.push({ key: 'productGroup', label: `Nhóm SP: ${f.productGroup}` });
    if (f.packUnit) pills.push({ key: 'packUnit', label: `ĐVT: ${f.packUnit}` });

    container.innerHTML = pills.map((p) => `
      <span class="filter-pill">
        ${p.label}
        <span class="remove-pill" data-key="${p.key}">✕</span>
      </span>
    `).join('');

    container.querySelectorAll('.remove-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        const k = btn.getAttribute('data-key');
        window.dataEngine.setFilter(k, null);

        if (k === 'mien') {
          const s = document.getElementById('select_mien');
          if (s) s.value = '';
        } else if (k === 'channel') {
          const s = document.getElementById('select_channel');
          if (s) s.value = '';
        } else if (k === 'productGroup') {
          const s = document.getElementById('select_group');
          if (s) s.value = '';
        }
      });
    });
  }

  // ------------------------------------------------------------------------
  // RENDER DỮ LIỆU TOÀN BỘ TRANG
  // ------------------------------------------------------------------------
  render() {
    try {
      this.updateKPIs();
    } catch (e) {
      console.error('Lỗi updateKPIs:', e);
    }
    try {
      this.updateFilterPillsUI();
    } catch (e) {
      console.error('Lỗi updateFilterPillsUI:', e);
    }
    try {
      this.renderActivePageCharts();
    } catch (e) {
      console.error('Lỗi renderActivePageCharts:', e);
    }
    try {
      if (this.activePage === 'page_05') {
        this.renderTablePage();
      } else if (this.activePage === 'page_06') {
        this.updateP6PredictiveMetrics();
      }
    } catch (e) {
      console.error('Lỗi page specific render:', e);
    }
  }

  updateP6PredictiveMetrics() {
    const horizon = (window.charts && window.charts.forecastHorizon) || 'month';
    const m = window.dataEngine.getExecutiveForecastByHorizon(horizon);

    const elTitle = document.getElementById('p6_horizon_title');
    const elSub = document.getElementById('p6_horizon_sub');
    if (elTitle) elTitle.innerText = `Dự báo & Kế hoạch: ${m.title}`;
    if (elSub) elSub.innerText = m.subtitle;

    const elFc = document.getElementById('p6_forecast_val');
    const elFcSub = document.getElementById('p6_forecast_sub');
    const elProb = document.getElementById('p6_prob_val');
    const elProbSub = document.getElementById('p6_prob_sub');
    const elVelo = document.getElementById('p6_velocity_val');
    const elVeloSub = document.getElementById('p6_velocity_sub');

    if (elFc) elFc.innerText = `${m.forecast.toLocaleString()} Tr.đ`;
    if (elFcSub) elFcSub.innerText = `Dự báo đạt ${m.attainment}% Target (Target: ${m.target.toLocaleString()} Tr · CI 90%: ${m.pessimistic.toLocaleString()} - ${m.optimistic.toLocaleString()} Tr)`;

    if (elProb) {
      elProb.innerText = `${m.attainment}%`;
      elProb.style.color = m.attainment >= 100 ? '#10B981' : (m.attainment >= 85 ? '#D97706' : '#DC2626');
    }
    if (elProbSub) {
      elProbSub.innerText = m.statusText;
      elProbSub.style.color = m.statusColor;
    }

    if (elVelo) elVelo.innerText = `${m.curVelocity.toLocaleString()} Tr.đ/ngày`;
    if (elVeloSub) {
      elVeloSub.innerText = `Cần ${m.reqVelocity.toLocaleString()} Tr.đ/ngày (${m.remainingDays} ngày còn lại · Tải: ${m.burden}x)`;
      elVeloSub.style.color = m.burden > 1.3 ? '#DC2626' : (m.burden > 1.0 ? '#D97706' : '#10B981');
    }
  }

  updateKPIs() {
    const kpis = window.dataEngine.getSummaryKPIs();

    // Executive AI Alert Strip Text on Page 1
    const elExecAlert = document.getElementById('exec_alert_text');
    if (elExecAlert) {
      try {
        const pred = window.dataEngine.getStatisticalForecastMetrics() || {};
        const warnings = window.dataEngine.getComprehensiveEarlyWarnings() || [];
        const criticalCount = warnings.filter((w) => w.severity === 'red').length;
        const warnCount = warnings.filter((w) => w.severity === 'amber').length;
        const fcVal = pred.forecast || pred.monthEndForecast || 0;
        const attVal = pred.attainment || pred.forecastAttainment || 0;
        const probVal = pred.probability || pred.probabilityOfHit || 90;

        let alertSummary = `🎯 Dự báo cuối kỳ: ${fcVal.toLocaleString()} Tr.đ (${attVal}% Target · Xác suất ${probVal}%)`;
        if (criticalCount > 0) {
          alertSummary = `🚨 ${criticalCount} khu vực áp lực tải cao · ${warnCount} NPP giảm sâu · ${alertSummary}`;
        }
        elExecAlert.innerText = alertSummary;
      } catch (e) {
        console.warn('Lỗi cập nhật banner cảnh báo:', e);
      }
    }

    // Actual MTD / Selected Period
    const elActual = document.getElementById('kpi_actual');
    if (elActual) {
      elActual.innerText = `${Math.round(kpis.actualMillion).toLocaleString()} Tr.đ`;
      this.pulseElement(elActual);
    }

    // Target Attainment
    const elAttain = document.getElementById('kpi_attainment');
    if (elAttain) {
      elAttain.innerText = `${kpis.attainment.toFixed(1)}%`;
      this.pulseElement(elAttain);
    }

    // Attainment Sub (Target Value & Gap)
    const elAttainSub = document.getElementById('kpi_attainment_sub');
    if (elAttainSub) {
      const gapText = kpis.shortfall > 0 ? ` (Hụt: ${Math.round(kpis.shortfall).toLocaleString()} Tr)` : ' (Đạt KH)';
      elAttainSub.innerText = `Target: ${Math.round(kpis.targetMillion).toLocaleString()} Tr.đ${gapText}`;
    }

    // YoY Growth
    const elYoY = document.getElementById('kpi_yoy');
    if (elYoY) {
      elYoY.innerText = `${kpis.yoy >= 0 ? '+' : ''}${kpis.yoy.toFixed(1)}%`;
      elYoY.className = `kpi-value ${kpis.yoy >= 0 ? 'positive' : 'negative'}`;
      this.pulseElement(elYoY);
    }

    // YoY Sub
    const elYoYSub = document.getElementById('kpi_yoy_sub');
    if (elYoYSub) {
      const absText = kpis.yoyAbsolute >= 0 ? `+${Math.round(kpis.yoyAbsolute).toLocaleString()}` : `${Math.round(kpis.yoyAbsolute).toLocaleString()}`;
      elYoYSub.innerText = `Cùng kỳ: ${Math.round(kpis.lyMillion).toLocaleString()} Tr.đ (${absText} Tr)`;
    }

    // Converted Volume (Sản lượng Két/Thùng/Bình)
    const elVolume = document.getElementById('kpi_volume');
    if (elVolume) {
      elVolume.innerText = `${Math.round(kpis.totalConvertedQty).toLocaleString()} Két/Thùng`;
      this.pulseElement(elVolume);
    }

    const elVolumeSub = document.getElementById('kpi_volume_sub');
    if (elVolumeSub) {
      elVolumeSub.innerText = `Tăng trưởng SL: ${kpis.volumeYoY >= 0 ? '+' : ''}${kpis.volumeYoY.toFixed(1)}% vs CK`;
    }

    // Cập nhật nhãn trạng thái khoảng thời gian
    const elPeriodInfo = document.getElementById('period_info_badge');
    if (elPeriodInfo) {
      elPeriodInfo.innerText = `📅 Đang xem: ${kpis.periodLabel}`;
    }
  }

  pulseElement(el) {
    el.classList.remove('number-pulse');
    void el.offsetWidth;
    el.classList.add('number-pulse');
  }

  renderActivePageCharts() {
    setTimeout(() => {
      if (!window.charts) return;
      if (this.activePage === 'page_01') window.charts.renderPage1();
      else if (this.activePage === 'page_02') window.charts.renderPage2();
      else if (this.activePage === 'page_03') window.charts.renderPage3();
      else if (this.activePage === 'page_04') window.charts.renderPage4();
      else if (this.activePage === 'page_06') window.charts.renderPage6();
      window.charts.resizeAll();
    }, 40);
  }

  // ------------------------------------------------------------------------
  // TRANG 05: BẢNG DỮ LIỆU PHẲNG & XUẤT EXCEL
  // ------------------------------------------------------------------------
  initTableControls() {
    const searchInput = document.getElementById('table_search_input');
    if (searchInput) {
      const debouncedSearch = this.debounce(() => {
        this.tablePage = 1;
        this.renderTablePage();
      }, 200);
      searchInput.addEventListener('input', debouncedSearch);
    }

    const exportBtn = document.getElementById('btn_export_excel');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportTableToExcel());
    }

    // Bắt sự kiện click vào Header bảng để sắp xếp
    document.querySelectorAll('.data-table th[data-col]').forEach((th) => {
      th.addEventListener('click', () => {
        const col = th.getAttribute('data-col');
        if (this.tableSortCol === col) {
          this.tableSortAsc = !this.tableSortAsc;
        } else {
          this.tableSortCol = col;
          this.tableSortAsc = false;
        }
        this.renderTablePage();
      });
    });
  }

  renderTablePage() {
    const tbody = document.getElementById('table_tbody');
    const pageInfo = document.getElementById('table_page_info');
    const searchInput = document.getElementById('table_search_input');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

    let rows = window.dataEngine.getDetailRows();

    // Lọc theo tìm kiếm bảng
    if (query) {
      rows = rows.filter((r) =>
        r.custName.toLowerCase().includes(query) ||
        r.custCode.toLowerCase().includes(query) ||
        r.prodName.toLowerCase().includes(query) ||
        r.mien.toLowerCase().includes(query) ||
        r.vung.toLowerCase().includes(query)
      );
    }

    // Sắp xếp
    rows.sort((a, b) => {
      const vA = a[this.tableSortCol];
      const vB = b[this.tableSortCol];
      if (typeof vA === 'string') {
        return this.tableSortAsc ? vA.localeCompare(vB) : vB.localeCompare(vA);
      }
      return this.tableSortAsc ? vA - vB : vB - vA;
    });

    this.tableData = rows;

    // Phân trang
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / this.tablePageSize));
    if (this.tablePage > totalPages) this.tablePage = totalPages;

    const startIdx = (this.tablePage - 1) * this.tablePageSize;
    const endIdx = Math.min(startIdx + this.tablePageSize, total);
    const pagedRows = rows.slice(startIdx, endIdx);

    if (pageInfo) {
      pageInfo.innerText = `Hiển thị ${startIdx + 1} - ${endIdx} trên tổng số ${total.toLocaleString()} dòng (Trang ${this.tablePage}/${totalPages})`;
    }

    if (tbody) {
      if (pagedRows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 24px; color: #94A3B8;">Không tìm thấy bản ghi nào phù hợp với bộ lọc.</td></tr>`;
      } else {
        tbody.innerHTML = pagedRows.map((r, i) => `
          <tr>
            <td>${startIdx + i + 1}</td>
            <td><strong>${r.custName}</strong><br><small style="color:#64748B;">${r.custCode}</small></td>
            <td><span class="meta-badge">${r.channel}</span></td>
            <td>${r.mien} - ${r.vung}</td>
            <td>${r.prodName}</td>
            <td>${r.unit}</td>
            <td class="num"><strong>${r.actual.toLocaleString()}</strong></td>
            <td class="num">${r.ly.toLocaleString()}</td>
            <td class="num" style="color: ${r.yoy >= 0 ? '#16A34A' : '#DC2626'}; font-weight: 700;">${r.yoy >= 0 ? '+' : ''}${r.yoy}%</td>
            <td class="num">${(r.qtyKet + r.qtyThung + r.qtyBinh).toLocaleString()}</td>
          </tr>
        `).join('');
      }
    }

    this.renderPaginationControls(totalPages);
  }

  renderPaginationControls(totalPages) {
    const container = document.getElementById('table_pagination');
    if (!container) return;

    let html = '';
    html += `<button class="btn-page ${this.tablePage === 1 ? 'disabled' : ''}" onclick="window.app.setTablePage(${this.tablePage - 1})">‹ Trước</button>`;

    for (let p = Math.max(1, this.tablePage - 2); p <= Math.min(totalPages, this.tablePage + 2); p++) {
      html += `<button class="btn-page ${p === this.tablePage ? 'active' : ''}" onclick="window.app.setTablePage(${p})">${p}</button>`;
    }

    html += `<button class="btn-page ${this.tablePage === totalPages ? 'disabled' : ''}" onclick="window.app.setTablePage(${this.tablePage + 1})">Sau ›</button>`;
    container.innerHTML = html;
  }

  setTablePage(p) {
    if (p < 1 || p > Math.ceil(this.tableData.length / this.tablePageSize)) return;
    this.tablePage = p;
    this.renderTablePage();
  }

  exportTableToExcel() {
    if (!window.XLSX || !this.tableData.length) {
      alert('Không có dữ liệu để xuất Excel!');
      return;
    }

    const exportRows = this.tableData.map((r, i) => ({
      'STT': i + 1,
      'Mã Khách Hàng': r.custCode,
      'Tên Khách Hàng': r.custName,
      'Kênh Phân Phối': r.channel,
      'Miền': r.mien,
      'Vùng': r.vung,
      'Tên Sản Phẩm': r.prodName,
      'Đơn Vị Tính': r.unit,
      'Doanh Thu Actual (Tr.đ)': r.actual,
      'Doanh Thu LY (Tr.đ)': r.ly,
      'Tăng Trưởng YoY (%)': r.yoy,
      'SL Két': r.qtyKet,
      'SL Thùng': r.qtyThung,
      'SL Bình': r.qtyBinh,
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Chi_Tiet_Sell_In');

    const f = window.dataEngine.filters;
    const fileName = `Bao_Cao_Sell_In_Vikoda_${f.startDate}_den_${f.endDate}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }
}

window.app = new VikodaApp();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.app.init();
  });
} else {
  window.app.init();
}
