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

  function appendStylesheet(href, dataAttribute) {
    if (document.querySelector(`link[${dataAttribute}]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute(dataAttribute, 'true');
    document.head.appendChild(link);
  }

  function appendScript(src, dataAttribute) {
    if (document.querySelector(`script[${dataAttribute}]`)) return;
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.setAttribute(dataAttribute, 'true');
    document.head.appendChild(script);
  }

  function loadPowerBiTheme() {
    appendStylesheet('css/vikoda-powerbi-theme.css?v=2.8.0', 'data-vikoda-powerbi-theme');
    appendStylesheet('css/reference-dashboard-v3.css?v=3.0.0', 'data-vikoda-reference-theme');
    appendStylesheet('css/reference-fidelity-v4.css?v=4.2.0', 'data-vikoda-reference-fidelity');
    appendStylesheet('css/page05-sale-v5.css?v=5.0.0', 'data-vikoda-sale-v5');
    appendStylesheet('css/mobile-v6.css?v=6.1.0', 'data-vikoda-mobile-v6');
    appendScript('js/reference-analytics.js?v=3.0.0', 'data-vikoda-reference-analytics');
    appendScript('js/reference-fidelity-v4.js?v=4.3.0', 'data-vikoda-reference-fidelity');
    appendScript('js/reference-geography-v4.js?v=4.0.0', 'data-vikoda-reference-geography');
    appendScript('js/page05-sale-v5.js?v=5.0.0', 'data-vikoda-sale-v5');
    appendScript('js/mobile-v6.js?v=6.0.0', 'data-vikoda-mobile-v6');
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

  function updateDataStatus() {
    if (!window.dataEngine?.raw) return;
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

  function bindPageChangeTitle() {
    if (document.body.dataset.boundExecutivePageChange) return;
    document.body.dataset.boundExecutivePageChange = 'true';
    document.addEventListener('vikoda:pagechange', (event) => {
      const requestedPage = event.detail?.pageId;
      if (requestedPage) setPageContext(requestedPage);
      updateTitle();
    });
  }

  function update() {
    updateTitle();
    updateDataStatus();
  }

  function waitForData(attempt = 0) {
    if (window.dataEngine?.raw) {
      update();
      return;
    }
    if (attempt < 120) window.setTimeout(() => waitForData(attempt + 1), 100);
  }

  function init() {
    loadPowerBiTheme();
    tagFilterBlocks();
    bindNavigationTitle();
    bindPageChangeTitle();
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
