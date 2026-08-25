/**
 * VIKODA EXECUTIVE DASHBOARD SHELL
 * Presentation layer inspired by the Power BI-style management views used by
 * the commercial team. It does not own business calculations; KPI values still
 * come from VikodaDataEngine so one calculation contract serves every view.
 */
(() => {
  'use strict';

  const PAGE_CONFIG = {
    page_01: { order: 1, label: 'Tổng quan', title: 'TỔNG QUAN' },
    page_04: { order: 2, label: 'Vùng - Miền', title: 'VÙNG - MIỀN' },
    page_02: { order: 3, label: 'Khách hàng', title: 'KHÁCH HÀNG' },
    page_05: { order: 4, label: 'Sale quản lý', title: 'SALE QUẢN LÝ' },
    page_03: { order: 5, label: 'Sản phẩm', title: 'SẢN PHẨM' },
    page_06: { order: 6, label: 'Chênh lệch', title: 'PHÂN TÍCH CHÊNH LỆCH' },
  };

  const fmtMillion = (value) => `${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 1 })} tr`;
  const fmtPercent = (value) => `${Number(value || 0).toFixed(1)}%`;

  function loadPowerBiTheme() {
    if (document.querySelector('link[data-vikoda-powerbi-theme]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/vikoda-powerbi-theme.css?v=2.6.0';
    link.dataset.vikodaPowerbiTheme = 'true';
    document.head.appendChild(link);
  }

  function tagFilterBlocks() {
    const mapping = {
      select_channel: 'channel',
      select_mien: 'mien',
      select_vung: 'vung',
      select_group: 'group',
    };
    Object.entries(mapping).forEach(([id, key]) => {
      const select = document.getElementById(id);
      const block = select?.closest('.filter-select-group');
      if (block) {
        block.classList.add(`filter-block-${key}`);
        block.dataset.filterBlock = key;
      }
    });
  }

  function pageIdFromActiveNav() {
    return document.querySelector('.nav-item.active')?.getAttribute('data-page') || 'page_01';
  }

  function setPageContext(pageId = pageIdFromActiveNav()) {
    document.body.dataset.dashboardPage = pageId;
  }

  function getReportingYear() {
    const metadata = window.dataEngine?.metadata || {};
    if (Number(metadata.current_year)) return Number(metadata.current_year);
    const asOf = String(metadata.as_of_date || metadata.source_latest_date || '');
    if (/^\d{4}-/.test(asOf)) return Number(asOf.slice(0, 4));
    return new Date().getFullYear();
  }

  function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function updateTitle() {
    const pageId = pageIdFromActiveNav();
    const page = PAGE_CONFIG[pageId] || PAGE_CONFIG.page_01;
    const year = getReportingYear();
    const title = document.querySelector('.brand-title');
    const subtitle = document.querySelector('.brand-subtitle');
    setPageContext(pageId);
    if (title) title.textContent = `VIKODA SELL-IN | ${page.title}${page.order === 1 ? ` ${year}` : ''}`;
    if (subtitle) subtitle.textContent = `Năm ${year} · Actual so với cùng kỳ ${year - 1} và Target · Đơn vị: triệu đồng`;
    document.title = `Vikoda Sell-In | ${page.title}`;
  }

  function updateKpis() {
    if (!window.dataEngine?.raw || typeof window.dataEngine.getSummaryKPIs !== 'function') return;
    const kpis = window.dataEngine.getSummaryKPIs();
    setText('kpi_ly', fmtMillion(kpis.lyMillion));
    setText('kpi_target', fmtMillion(kpis.targetMillion));

    const actual = document.getElementById('kpi_actual');
    if (actual) actual.textContent = fmtMillion(kpis.actualMillion);

    const attainment = document.getElementById('kpi_attainment');
    if (attainment) attainment.textContent = fmtPercent(kpis.attainment);

    const growth = document.getElementById('kpi_yoy');
    if (growth) {
      growth.textContent = fmtPercent(kpis.yoy);
      growth.classList.toggle('positive', Number(kpis.yoy) >= 0);
      growth.classList.toggle('negative', Number(kpis.yoy) < 0);
    }

    const year = getReportingYear();
    const asOf = String(window.dataEngine.metadata.as_of_date || window.dataEngine.metadata.source_latest_date || '');
    const generated = String(window.dataEngine.metadata.generated_at || '');
    const status = document.getElementById('data_sync_status');
    if (status) {
      const stamp = generated ? new Date(generated) : null;
      const timeText = stamp && !Number.isNaN(stamp.getTime())
        ? stamp.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
        : 'mới nhất';
      status.textContent = `AUTO SYNC · dữ liệu đến ${asOf || year} · ${timeText}`;
      status.title = 'Dashboard được build tự động từ dữ liệu SharePoint sau khi pipeline kiểm tra thành công.';
    }
  }

  function uniqueValues(source) {
    return [...new Set(source.map((value) => String(value || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'vi'));
  }

  function replaceOptions(select, values, allLabel) {
    if (!select) return;
    const current = select.value;
    select.replaceChildren();
    const all = document.createElement('option');
    all.value = '';
    all.textContent = allLabel;
    select.appendChild(all);
    values.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
    if (values.includes(current)) select.value = current;
  }

  function populateBusinessFilters() {
    if (!window.dataEngine?.raw) return;
    const customers = Object.values(window.dataEngine.customers || {});
    const territories = Object.values(window.dataEngine.territories || {});
    const products = Object.values(window.dataEngine.products || {});

    replaceOptions(
      document.getElementById('select_mien'),
      uniqueValues([...customers.map((item) => item.mien), ...territories.map((item) => item.mien)]),
      'All',
    );
    replaceOptions(
      document.getElementById('select_vung'),
      uniqueValues([...customers.map((item) => item.vung), ...territories.map((item) => item.vung)]),
      'All',
    );
    replaceOptions(
      document.getElementById('select_channel'),
      uniqueValues(customers.map((item) => item.channel)),
      'All',
    );
    replaceOptions(
      document.getElementById('select_group'),
      uniqueValues(products.map((item) => window.dataEngine.normalizeProductGroup?.(item.group) || item.group)),
      'All',
    );
  }

  function syncFilterControls() {
    if (!window.dataEngine) return;
    const mapping = {
      select_mien: 'mien',
      select_vung: 'vung',
      select_channel: 'channel',
      select_group: 'productGroup',
    };
    Object.entries(mapping).forEach(([id, key]) => {
      const select = document.getElementById(id);
      if (select) select.value = window.dataEngine.filters[key] || '';
    });
  }

  function bindExtraFilters() {
    const region = document.getElementById('select_vung');
    if (region && !region.dataset.boundExecutive) {
      region.dataset.boundExecutive = 'true';
      region.addEventListener('change', (event) => {
        window.dataEngine?.setFilter('vung', event.target.value || null);
      });
    }
  }

  function bindNavigationTitle() {
    document.querySelectorAll('.nav-item, .mobile-nav-btn').forEach((item) => {
      if (item.dataset.boundExecutiveTitle) return;
      item.dataset.boundExecutiveTitle = 'true';
      item.addEventListener('click', () => {
        const requestedPage = item.getAttribute('data-page');
        if (requestedPage) setPageContext(requestedPage);
        window.setTimeout(updateTitle, 0);
      });
    });
  }

  function update() {
    updateTitle();
    updateKpis();
    syncFilterControls();
  }

  function waitForData(attempt = 0) {
    if (window.dataEngine?.raw) {
      populateBusinessFilters();
      bindExtraFilters();
      update();
      if (!window.dataEngine.__executiveUiSubscribed) {
        window.dataEngine.__executiveUiSubscribed = true;
        window.dataEngine.subscribe(update);
      }
      return;
    }
    if (attempt < 120) window.setTimeout(() => waitForData(attempt + 1), 100);
  }

  function init() {
    loadPowerBiTheme();
    tagFilterBlocks();
    bindNavigationTitle();
    bindExtraFilters();
    setPageContext();
    updateTitle();
    waitForData();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
