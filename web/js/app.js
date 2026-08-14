/**
 * VIKODA WEB DASHBOARD - MAIN APPLICATION CONTROLLER
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

  async init() {
    try {
      this.initAuth();
      await window.dataEngine.load();
      this.initDateSlicer();
      this.initSidebarDropdowns();
      this.initNavigation();
      this.initFilterPills();
      this.initTableControls();

      // Đăng ký nhận sự kiện khi bộ lọc thay đổi
      window.dataEngine.subscribe(() => {
        this.render();
      });

      // Lần render đầu tiên
      this.render();
    } catch (err) {
      console.error('Loi khoi tao Dashboard:', err);
    }
  }

  initAuth() {
    const overlay = document.getElementById('auth-overlay');
    const form = document.getElementById('login_form');
    const input = document.getElementById('input_password');
    const remember = document.getElementById('remember_me');
    const errorMsg = document.getElementById('login_error_msg');

    if (!overlay || !form) return;

    if (window.auth.isAuthenticated()) {
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
        }, 250);
      } else {
        if (errorMsg) errorMsg.style.display = 'block';
        input.value = '';
        input.focus();
      }
    });
  }

  // ------------------------------------------------------------------------
  // ĐIỀU HƯỚNG 6 TRANG
  // ------------------------------------------------------------------------
  initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const targetPage = btn.getAttribute('data-page');
        this.switchPage(targetPage);
      });
    });
  }

  switchPage(pageId) {
    this.activePage = pageId;

    // Active nav item
    document.querySelectorAll('.nav-item').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-page') === pageId);
    });

    // Active view container
    document.querySelectorAll('.view-page').forEach((v) => {
      v.classList.toggle('active', v.id === `view_${pageId}`);
    });

    // Render nội dung cho trang vừa chọn
    if (pageId === 'page_05') {
      this.renderTablePage();
    } else {
      this.renderActivePageCharts();
    }
  }

  // ------------------------------------------------------------------------
  // BỘ LỌC NGÀY THÁNG
  // ------------------------------------------------------------------------
  initDateSlicer() {
    const startInput = document.getElementById('filter_start_date');
    const endInput = document.getElementById('filter_end_date');

    if (startInput && endInput) {
      startInput.value = window.dataEngine.filters.startDate || '';
      endInput.value = window.dataEngine.filters.endDate || '';

      const handleDateChange = () => {
        window.dataEngine.setDateRange(startInput.value, endInput.value);
      };

      startInput.addEventListener('change', handleDateChange);
      endInput.addEventListener('change', handleDateChange);
    }

    // Nút chọn nhanh
    document.querySelectorAll('.quick-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-quick');
        const curYear = window.dataEngine.metadata.current_year || new Date().getFullYear();
        const asOf = window.dataEngine.metadata.as_of_date || `${curYear}-12-31`;

        document.querySelectorAll('.quick-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        let start = `${curYear}-01-01`;
        let end = asOf;

        if (type === 'mtd') {
          const m = asOf.slice(5, 7);
          start = `${curYear}-${m}-01`;
        } else if (type === 'qtd') {
          const m = parseInt(asOf.slice(5, 7), 10);
          const qStartMonth = String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, '0');
          start = `${curYear}-${qStartMonth}-01`;
        } else if (type === 'ytd') {
          start = `${curYear}-01-01`;
        } else if (type === 'all') {
          start = '2025-01-01';
        }

        if (startInput) startInput.value = start;
        if (endInput) endInput.value = end;
        window.dataEngine.setDateRange(start, end);
      });
    });
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

        // Reset dropdowns
        const mienSelect = document.getElementById('select_mien');
        const channelSelect = document.getElementById('select_channel');
        const groupSelect = document.getElementById('select_group');
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
        <span class="remove-pill" onclick="window.dataEngine.setFilter('${p.key}', null)">✕</span>
      </span>
    `).join('');
  }

  // ------------------------------------------------------------------------
  // RENDER DỮ LIỆU TOÀN BỘ TRANG
  // ------------------------------------------------------------------------
  render() {
    this.updateKPIs();
    this.updateFilterPillsUI();
    this.renderActivePageCharts();
    if (this.activePage === 'page_05') {
      this.renderTablePage();
    }
  }

  updateKPIs() {
    const kpis = window.dataEngine.getSummaryKPIs();

    // Actual MTD
    const elActual = document.getElementById('kpi_actual');
    if (elActual) elActual.innerText = `${Math.round(kpis.actualMillion).toLocaleString()} Tr.đ`;

    // Target Attainment
    const elAttain = document.getElementById('kpi_attainment');
    if (elAttain) elAttain.innerText = `${kpis.attainment.toFixed(1)}%`;

    // Attainment Sub (Target Value)
    const elAttainSub = document.getElementById('kpi_attainment_sub');
    if (elAttainSub) elAttainSub.innerText = `Target: ${Math.round(kpis.targetMillion).toLocaleString()} Tr.đ`;

    // YoY Growth
    const elYoY = document.getElementById('kpi_yoy');
    if (elYoY) {
      elYoY.innerText = `${kpis.yoy >= 0 ? '+' : ''}${kpis.yoy.toFixed(1)}%`;
      elYoY.className = `kpi-value ${kpis.yoy >= 0 ? 'positive' : 'negative'}`;
    }

    // YoY Sub
    const elYoYSub = document.getElementById('kpi_yoy_sub');
    if (elYoYSub) elYoYSub.innerText = `Cùng kỳ: ${Math.round(kpis.lyMillion).toLocaleString()} Tr.đ`;

    // Pacing & Run-rate
    const elForecast = document.getElementById('kpi_forecast');
    if (elForecast) elForecast.innerText = `${kpis.pacing.toFixed(0)}%`;

    const elForecastSub = document.getElementById('kpi_forecast_sub');
    if (elForecastSub) elForecastSub.innerText = `Dự báo: ${Math.round(kpis.runRateForecast).toLocaleString()} Tr.đ (${kpis.forecastAttainment.toFixed(0)}%)`;
  }

  renderActivePageCharts() {
    setTimeout(() => {
      if (this.activePage === 'page_01') window.charts.renderPage1();
      else if (this.activePage === 'page_02') window.charts.renderPage2();
      else if (this.activePage === 'page_03') window.charts.renderPage3();
      else if (this.activePage === 'page_04') window.charts.renderPage4();
      else if (this.activePage === 'page_06') window.charts.renderPage6();
      window.charts.resizeAll();
    }, 50);
  }

  // ------------------------------------------------------------------------
  // TRANG 05: BẢNG DỮ LIỆU PHẲNG & XUẤT EXCEL
  // ------------------------------------------------------------------------
  initTableControls() {
    const searchInput = document.getElementById('table_search_input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.tablePage = 1;
        this.renderTablePage();
      });
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
    const tbody = document.getElementById('detail_table_tbody');
    if (!tbody) return;

    let rows = window.dataEngine.getDetailRows();
    const query = (document.getElementById('table_search_input')?.value || '').toLowerCase().trim();

    if (query) {
      rows = rows.filter((r) =>
        (r.custName || '').toLowerCase().includes(query) ||
        (r.prodName || '').toLowerCase().includes(query) ||
        (r.channel || '').toLowerCase().includes(query) ||
        (r.vung || '').toLowerCase().includes(query) ||
        (r.unit || '').toLowerCase().includes(query)
      );
    }

    // Sắp xếp an toàn
    rows.sort((a, b) => {
      const va = a[this.tableSortCol] ?? '';
      const vb = b[this.tableSortCol] ?? '';
      if (typeof va === 'string' || typeof vb === 'string') {
        const sa = String(va).toLowerCase();
        const sb = String(vb).toLowerCase();
        return this.tableSortAsc ? sa.localeCompare(sb) : sb.localeCompare(sa);
      }
      return this.tableSortAsc ? Number(va) - Number(vb) : Number(vb) - Number(va);
    });

    this.tableData = rows;
    const totalRows = rows.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / this.tablePageSize));
    if (this.tablePage > totalPages) this.tablePage = totalPages;
    if (this.tablePage < 1) this.tablePage = 1;

    const startIdx = (this.tablePage - 1) * this.tablePageSize;
    const pageRows = rows.slice(startIdx, startIdx + this.tablePageSize);

    if (pageRows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="13" style="text-align: center; padding: 28px; color: #64748B; font-weight: 500;">Không có dữ liệu phù hợp với bộ lọc hiện tại.</td></tr>`;
    } else {
      tbody.innerHTML = pageRows.map((r, i) => `
        <tr>
          <td><strong>${startIdx + i + 1}</strong></td>
          <td><strong>${r.custName || ''}</strong></td>
          <td><span class="meta-badge">${r.channel || 'GT'}</span></td>
          <td>${r.vung || ''}</td>
          <td>${r.prodName || ''}</td>
          <td>${r.unit || ''}</td>
          <td class="num"><strong>${Number(r.actual || 0).toLocaleString()}</strong></td>
          <td class="num">${Number(r.ly || 0).toLocaleString()}</td>
          <td class="num" style="color: ${(r.yoy || 0) >= 0 ? '#16A34A' : '#DC2626'}; font-weight: 700;">${(r.yoy || 0) >= 0 ? '+' : ''}${r.yoy || 0}%</td>
          <td class="num">${Number(r.qtyKet || 0).toLocaleString()}</td>
          <td class="num">${Number(r.qtyThung || 0).toLocaleString()}</td>
          <td class="num">${Number(r.qtyBinh || 0).toLocaleString()}</td>
          <td class="num">${r.returnRate || 0}%</td>
        </tr>
      `).join('');
    }

    // Pagination info
    const info = document.getElementById('table_page_info');
    if (info) {
      info.innerText = `Hiển thị ${totalRows > 0 ? startIdx + 1 : 0} - ${Math.min(startIdx + this.tablePageSize, totalRows)} trên tổng số ${totalRows.toLocaleString()} dòng (Trang ${this.tablePage}/${totalPages})`;
    }

    const prevBtn = document.getElementById('btn_prev_page');
    const nextBtn = document.getElementById('btn_next_page');
    if (prevBtn) {
      prevBtn.disabled = this.tablePage <= 1;
      prevBtn.onclick = () => { if (this.tablePage > 1) { this.tablePage--; this.renderTablePage(); } };
    }
    if (nextBtn) {
      nextBtn.disabled = this.tablePage >= totalPages;
      nextBtn.onclick = () => { if (this.tablePage < totalPages) { this.tablePage++; this.renderTablePage(); } };
    }
  }

  exportTableToExcel() {
    if (!window.XLSX || !this.tableData.length) return;

    const exportRows = this.tableData.map((r) => ({
      'Mã Khách Hàng': r.custCode,
      'Tên Khách Hàng': r.custName,
      'Kênh': r.channel,
      'Miền': r.mien,
      'Vùng': r.vung,
      'Tên Sản Phẩm': r.prodName,
      'Đơn Vị Tính': r.unit,
      'Doanh Thu Actual (Tr.đ)': r.actual,
      'Doanh Thu Cùng Kỳ (Tr.đ)': r.ly,
      'Tăng Trưởng YoY (%)': r.yoy,
      'SL Két': r.qtyKet,
      'SL Thùng': r.qtyThung,
      'SL Bình': r.qtyBinh,
      'Tỷ Lệ Trả Hàng (%)': r.returnRate,
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Vikoda_SellIn_ChiTiet');
    XLSX.writeFile(wb, `Vikoda_SellIn_ChiTiet_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new VikodaApp();
  window.app.init();
});
