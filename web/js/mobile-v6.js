/**
 * VIKODA SELL-IN — MOBILE EXPERIENCE V6
 * Adds mobile navigation, filter-drawer behavior and horizontal chart affordance.
 */
(() => {
  'use strict';

  const BREAKPOINT = 900;
  const WIDE_CHART_IDS = [
    'chart_p1_trend',
    'chart_p2_channel',
    'chart_p3_trend',
    'chart_p4_volume_trend',
    'chart_p6_trend',
    'chart_sales_region',
    'chart_sales_channel',
  ];

  const NAV_ITEMS = [
    ['page_01', '⌂', 'Tổng quan'],
    ['page_04', '◫', 'Vùng'],
    ['page_02', '♙', 'Khách hàng'],
    ['page_05', '◎', 'Sale'],
    ['page_03', '◇', 'Sản phẩm'],
    ['page_06', '±', 'Gap'],
  ];

  const isMobile = () => window.matchMedia(`(max-width: ${BREAKPOINT}px)`).matches;

  function debounce(fn, wait = 120) {
    let timer;
    return (...args) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn(...args), wait);
    };
  }

  function ensureBackdrop() {
    let backdrop = document.getElementById('mobile_filter_backdrop');
    if (backdrop) return backdrop;
    backdrop = document.createElement('div');
    backdrop.id = 'mobile_filter_backdrop';
    backdrop.className = 'mobile-filter-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.appendChild(backdrop);
    return backdrop;
  }

  function ensureBottomNav() {
    let nav = document.querySelector('.mobile-bottom-nav');
    if (!nav) {
      nav = document.createElement('nav');
      nav.className = 'mobile-bottom-nav';
      nav.setAttribute('aria-label', 'Điều hướng dashboard trên điện thoại');
      document.body.appendChild(nav);
    }

    if (!nav.dataset.mobileV6) {
      nav.dataset.mobileV6 = 'true';
      nav.innerHTML = NAV_ITEMS.map(([page, icon, label], index) => `
        <button type="button" class="mobile-nav-btn ${index === 0 ? 'active' : ''}" data-page="${page}" aria-pressed="${index === 0 ? 'true' : 'false'}">
          <span class="mobile-nav-icon" aria-hidden="true">${icon}</span>
          <span>${label}</span>
        </button>
      `).join('');

      nav.querySelectorAll('.mobile-nav-btn').forEach((button) => {
        button.addEventListener('click', () => {
          const page = button.getAttribute('data-page');
          if (page && window.app?.switchPage) window.app.switchPage(page);
          closeFilterDrawer();
          window.setTimeout(() => window.charts?.resizeAll?.(), 80);
        });
      });
    }
    return nav;
  }

  function setDrawerState(open) {
    const sidebar = document.querySelector('.app-sidebar');
    const button = document.getElementById('btn_toggle_mobile_filter');
    const backdrop = ensureBackdrop();
    if (!sidebar) return;

    sidebar.classList.toggle('mobile-open', open);
    document.body.classList.toggle('mobile-filter-open', open);
    backdrop.setAttribute('aria-hidden', String(!open));
    if (button) {
      button.setAttribute('aria-expanded', String(open));
      const label = button.querySelector('span');
      if (label) label.textContent = open ? 'Đóng lọc' : 'Bộ lọc';
    }
  }

  function closeFilterDrawer() {
    setDrawerState(false);
  }

  function bindDrawerUX() {
    const sidebar = document.querySelector('.app-sidebar');
    const button = document.getElementById('btn_toggle_mobile_filter');
    const backdrop = ensureBackdrop();
    if (!sidebar || !button || button.dataset.mobileV6Bound) return;
    button.dataset.mobileV6Bound = 'true';

    // Existing app.js toggles the sidebar. This listener runs after it and
    // synchronizes backdrop/body state with the resulting class.
    button.addEventListener('click', () => {
      window.setTimeout(() => setDrawerState(sidebar.classList.contains('mobile-open')), 0);
    });

    backdrop.addEventListener('click', closeFilterDrawer);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && sidebar.classList.contains('mobile-open')) {
        closeFilterDrawer();
        button.focus();
      }
    });

    sidebar.querySelectorAll('.nav-item').forEach((item) => {
      item.addEventListener('click', () => {
        if (isMobile()) closeFilterDrawer();
      });
    });
  }

  function syncBottomNav() {
    const nav = ensureBottomNav();
    const activePage = window.app?.activePage || document.querySelector('.nav-item.active')?.getAttribute('data-page') || 'page_01';
    nav.querySelectorAll('.mobile-nav-btn').forEach((button) => {
      const active = button.getAttribute('data-page') === activePage;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
      if (active) button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }

  function wrapWideChart(node) {
    if (!node || node.dataset.mobileV6Wrapped) return;
    node.dataset.mobileV6Wrapped = 'true';
    node.classList.add('mobile-chart-wide');

    const wrapper = document.createElement('div');
    wrapper.className = 'mobile-chart-scroll';
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', 'Biểu đồ có thể vuốt ngang trên điện thoại');
    wrapper.tabIndex = 0;

    const hint = document.createElement('div');
    hint.className = 'mobile-scroll-hint';
    hint.textContent = 'Vuốt ngang để xem đầy đủ dữ liệu.';

    const parent = node.parentNode;
    if (!parent) return;
    parent.insertBefore(hint, node);
    parent.insertBefore(wrapper, node);
    wrapper.appendChild(node);
  }

  function prepareWideCharts() {
    WIDE_CHART_IDS.forEach((id) => wrapWideChart(document.getElementById(id)));
  }

  function annotateScrollableTables() {
    document.querySelectorAll('.table-responsive, .reference-matrix-wrap').forEach((node) => {
      if (node.dataset.mobileV6Scroll) return;
      node.dataset.mobileV6Scroll = 'true';
      node.setAttribute('role', 'region');
      node.setAttribute('aria-label', 'Bảng dữ liệu có thể cuộn ngang và dọc');
      node.tabIndex = 0;
    });
  }

  function resizeCharts() {
    window.charts?.resizeAll?.();
  }

  function observeDynamicContent() {
    const root = document.getElementById('main_content');
    if (!root || root.dataset.mobileV6Observed) return;
    root.dataset.mobileV6Observed = 'true';
    const observer = new MutationObserver(debounce(() => {
      prepareWideCharts();
      annotateScrollableTables();
      syncBottomNav();
      resizeCharts();
    }, 80));
    observer.observe(root, { childList: true, subtree: true });
  }

  function observeNavigation() {
    const sidebar = document.querySelector('.nav-menu');
    if (!sidebar || sidebar.dataset.mobileV6Observed) return;
    sidebar.dataset.mobileV6Observed = 'true';
    const observer = new MutationObserver(syncBottomNav);
    observer.observe(sidebar, { attributes: true, subtree: true, attributeFilter: ['class', 'aria-current'] });
  }

  function applyViewportClass() {
    document.body.classList.toggle('mobile-dashboard', isMobile());
    if (!isMobile()) closeFilterDrawer();
  }

  function install() {
    if (window.__vikodaMobileV6Installed) return;
    window.__vikodaMobileV6Installed = true;

    ensureBackdrop();
    ensureBottomNav();
    bindDrawerUX();
    prepareWideCharts();
    annotateScrollableTables();
    observeDynamicContent();
    observeNavigation();
    applyViewportClass();
    syncBottomNav();

    const onViewportChange = debounce(() => {
      applyViewportClass();
      syncBottomNav();
      window.setTimeout(resizeCharts, 60);
    }, 100);

    window.addEventListener('resize', onViewportChange, { passive: true });
    window.addEventListener('orientationchange', () => window.setTimeout(onViewportChange, 180), { passive: true });

    if (window.dataEngine && !window.dataEngine.__mobileV6Subscribed) {
      window.dataEngine.__mobileV6Subscribed = true;
      window.dataEngine.subscribe(() => {
        window.setTimeout(() => {
          prepareWideCharts();
          annotateScrollableTables();
          syncBottomNav();
          resizeCharts();
        }, 80);
      });
    }
  }

  function wait(attempt = 0) {
    if (document.body && window.app) {
      install();
      return;
    }
    if (attempt < 160) window.setTimeout(() => wait(attempt + 1), 50);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => wait(), { once: true });
  } else {
    wait();
  }
})();
