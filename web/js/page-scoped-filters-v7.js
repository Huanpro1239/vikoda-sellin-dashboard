/**
 * VIKODA PAGE-SCOPED FILTERS V7
 * Power BI-style report pages: each page owns its own slicer snapshot.
 * Switching pages restores that page's filters instead of leaking selections
 * across the whole dashboard.
 */
(function (root, factory) {
  'use strict';

  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  if (root) {
    root.VikodaPageScopedFilters = api;
    const boot = (attempt = 0) => {
      if (root.dataEngine?.raw && root.app && root.document) {
        api.installPageScopedFilters(root.dataEngine, root.app, root.document);
        return;
      }
      if (attempt < 200) root.setTimeout(() => boot(attempt + 1), 50);
    };
    boot();
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const PAGE_LABELS = {
    page_01: 'Tổng quan',
    page_04: 'Vùng - Miền',
    page_02: 'Khách hàng',
    page_05: 'Sale quản lý',
    page_03: 'Sản phẩm',
    page_06: 'Chênh lệch',
  };

  const clone = (value) => JSON.parse(JSON.stringify(value || {}));

  class PageScopedFilterController {
    constructor(engine, app, doc) {
      this.engine = engine;
      this.app = app;
      this.doc = doc;
      this.pageFilters = new Map();
      this.defaultFilters = null;
      this.originalSwitchPage = null;
    }

    install() {
      if (!this.engine || !this.app || !this.doc) return null;
      if (this.engine.__vikodaPageScopedFilterController) {
        return this.engine.__vikodaPageScopedFilterController;
      }

      if (!Object.prototype.hasOwnProperty.call(this.engine.filters || {}, 'productKey')) {
        this.engine.filters.productKey = null;
      }

      this.defaultFilters = this.captureFilters();
      this.savePage(this.app.activePage || 'page_01');
      this.patchPageSwitch();
      this.bindFilterPersistence();
      this.ensureScopeUI();
      this.syncFilterControls();
      this.syncScopeUI();

      this.engine.__vikodaPageScopedFilterController = this;
      return this;
    }

    captureFilters() {
      const snapshot = clone(this.engine.filters || {});
      if (!Object.prototype.hasOwnProperty.call(snapshot, 'productKey')) snapshot.productKey = null;
      return snapshot;
    }

    savePage(pageId) {
      if (!pageId) return;
      this.pageFilters.set(pageId, this.captureFilters());
    }

    getPageFilters(pageId) {
      if (!pageId) return clone(this.defaultFilters);
      return clone(this.pageFilters.get(pageId) || this.defaultFilters || this.captureFilters());
    }

    applyFilters(snapshot) {
      if (!this.engine.filters) this.engine.filters = {};
      const target = this.engine.filters;
      Object.keys(target).forEach((key) => delete target[key]);
      Object.assign(target, clone(snapshot || this.defaultFilters || {}));
      if (!Object.prototype.hasOwnProperty.call(target, 'productKey')) target.productKey = null;

      const smartController = this.engine.__vikodaSmartSlicerController;
      if (smartController?.reconcileHierarchy) smartController.reconcileHierarchy(false);
    }

    restorePage(pageId, { notify = true } = {}) {
      this.applyFilters(this.getPageFilters(pageId));
      this.syncFilterControls();
      this.syncScopeUI(pageId);
      if (notify && typeof this.engine.notify === 'function') this.engine.notify();
    }

    patchPageSwitch() {
      if (this.app.__vikodaPageScopedSwitchPatched || typeof this.app.switchPage !== 'function') return;
      this.app.__vikodaPageScopedSwitchPatched = true;
      this.originalSwitchPage = this.app.switchPage.bind(this.app);
      const controller = this;

      this.app.switchPage = function (pageId) {
        const destination = pageId || 'page_01';
        const current = this.activePage || 'page_01';

        controller.savePage(current);
        controller.applyFilters(controller.getPageFilters(destination));

        controller.originalSwitchPage(destination);
        controller.syncFilterControls();
        controller.syncScopeUI(destination);

        // Notify only after the destination is active so every subscriber renders
        // against the destination page's slicer state.
        if (typeof controller.engine.notify === 'function') controller.engine.notify();
      };
    }

    bindFilterPersistence() {
      if (this.engine.__vikodaPageScopedPersistenceBound || typeof this.engine.subscribe !== 'function') return;
      this.engine.__vikodaPageScopedPersistenceBound = true;
      this.engine.subscribe(() => {
        const pageId = this.app.activePage || 'page_01';
        this.pageFilters.set(pageId, this.captureFilters());
        this.syncScopeUI(pageId);
      });
    }

    syncFilterControls() {
      const filters = this.engine.filters || {};
      const startInput = this.doc.getElementById?.('filter_start_date');
      const endInput = this.doc.getElementById?.('filter_end_date');
      const monthSelect = this.doc.getElementById?.('select_month');

      if (startInput) startInput.value = filters.startDate || '';
      if (endInput) endInput.value = filters.endDate || '';
      if (monthSelect) {
        const startMonth = String(filters.startDate || '').slice(0, 7);
        const endMonth = String(filters.endDate || '').slice(0, 7);
        monthSelect.value = startMonth && startMonth === endMonth ? startMonth : '';
      }

      this.doc.querySelectorAll?.('.quick-btn[data-quick]').forEach((button) => {
        const isActive = button.getAttribute?.('data-quick') === filters.periodMode;
        button.classList?.toggle('active', Boolean(isActive));
        button.setAttribute?.('aria-pressed', String(Boolean(isActive)));
      });

      this.app.syncBusinessFilterControls?.();
      this.app.updateFilterPillsUI?.();
    }

    ensureScopeUI() {
      const headerLabel = this.doc.querySelector?.('.business-filter-header > span');
      if (headerLabel) headerLabel.textContent = 'Bộ lọc trang';

      const feedbackLabel = this.doc.querySelector?.('.filter-feedback-label');
      if (feedbackLabel) feedbackLabel.textContent = 'Bộ lọc trang này';

      const panel = this.doc.getElementById?.('business_filter_panel');
      if (panel && !this.doc.getElementById?.('page_filter_scope_note') && this.doc.createElement) {
        const note = this.doc.createElement('div');
        note.id = 'page_filter_scope_note';
        note.className = 'page-filter-scope-note';
        note.setAttribute?.('role', 'status');
        note.setAttribute?.('aria-live', 'polite');
        const fields = this.doc.getElementById?.('business_filter_fields');
        if (fields && panel.insertBefore) panel.insertBefore(note, fields);
        else panel.appendChild?.(note);
      }

      const feedback = this.doc.querySelector?.('.filter-feedback-copy');
      if (feedback && !this.doc.getElementById?.('page_filter_scope_chip') && this.doc.createElement) {
        const chip = this.doc.createElement('span');
        chip.id = 'page_filter_scope_chip';
        chip.className = 'page-filter-scope-chip';
        feedback.insertBefore?.(chip, feedback.firstChild || null);
      }
    }

    syncScopeUI(pageId = this.app.activePage || 'page_01') {
      const label = PAGE_LABELS[pageId] || pageId;
      const note = this.doc.getElementById?.('page_filter_scope_note');
      const chip = this.doc.getElementById?.('page_filter_scope_chip');
      if (note) note.textContent = `Chỉ áp dụng cho trang: ${label}`;
      if (chip) chip.textContent = label;
      if (this.doc.body?.dataset) this.doc.body.dataset.filterScope = 'page';
    }
  }

  function installPageScopedFilters(engine, app, doc) {
    return new PageScopedFilterController(engine, app, doc).install();
  }

  return {
    PAGE_LABELS,
    PageScopedFilterController,
    installPageScopedFilters,
  };
});
