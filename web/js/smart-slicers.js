/**
 * VIKODA SMART SLICER CONTROLLER
 * One controller reconciles hierarchical geography/product filters across
 * dropdowns, removable pills, and chart cross-filter actions.
 */
(function (root, factory) {
  'use strict';

  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) {
    root.VikodaSmartSlicers = api;
    const boot = (attempt = 0) => {
      if (root.dataEngine && root.app && root.document) {
        api.installSmartSlicers(root.dataEngine, root.app, root.document);
        return;
      }
      if (attempt < 160) root.setTimeout(() => boot(attempt + 1), 50);
    };
    boot();
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const normalizeText = (value) => String(value ?? '').normalize('NFC').trim();
  const normalizeKey = (value) => normalizeText(value).toLocaleLowerCase('vi');
  const sameValue = (left, right) => normalizeKey(left) === normalizeKey(right);
  const uniqueSorted = (values) => [...new Map(values
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .map((value) => [normalizeKey(value), value])).values()]
    .sort((a, b) => a.localeCompare(b, 'vi'));

  class SmartSlicerController {
    constructor(engine, app, doc) {
      this.engine = engine;
      this.app = app;
      this.doc = doc;
      this.originals = {};
    }

    install() {
      if (!this.engine || !this.app || !this.doc) return null;
      if (this.engine.__vikodaSmartSlicerController) {
        return this.engine.__vikodaSmartSlicerController;
      }

      if (!Object.prototype.hasOwnProperty.call(this.engine.filters || {}, 'productKey')) {
        this.engine.filters.productKey = null;
      }

      this.patchEngine();
      this.patchApp();
      this.ensureSmartStyles();
      this.ensureSkuControl();
      this.bindSkuControl();
      this.reconcileHierarchy(false);
      this.app.syncBusinessFilterControls?.();
      this.app.updateFilterPillsUI?.();
      this.renderNoDataState();

      if (!this.engine.__vikodaSmartSlicerSubscribed && typeof this.engine.subscribe === 'function') {
        this.engine.__vikodaSmartSlicerSubscribed = true;
        this.engine.subscribe(() => {
          this.reconcileHierarchy(false);
          this.renderNoDataState();
        });
      }

      if (!this.doc.body?.dataset?.smartSlicerPageChangeBound && this.doc.addEventListener) {
        if (this.doc.body?.dataset) this.doc.body.dataset.smartSlicerPageChangeBound = 'true';
        this.doc.addEventListener('vikoda:pagechange', () => {
          const schedule = typeof window !== 'undefined' && window.setTimeout ? window.setTimeout : setTimeout;
          schedule(() => this.renderNoDataState(), 0);
        });
      }

      this.engine.__vikodaSmartSlicerController = this;
      return this;
    }

    geographyDimensions() {
      return [
        ...Object.values(this.engine.customers || {}),
        ...Object.values(this.engine.territories || {}),
      ];
    }

    getRegionsForMien(mien = null) {
      const parent = normalizeKey(mien);
      return uniqueSorted(this.geographyDimensions()
        .filter((item) => !parent || normalizeKey(item.mien) === parent)
        .map((item) => item.vung));
    }

    getMienForRegion(vung) {
      const child = normalizeKey(vung);
      if (!child) return null;
      const parents = uniqueSorted(this.geographyDimensions()
        .filter((item) => normalizeKey(item.vung) === child)
        .map((item) => item.mien));
      if (parents.length === 1) return parents[0];
      const current = normalizeText(this.engine.filters?.mien);
      return current && parents.some((item) => sameValue(item, current)) ? current : null;
    }

    normalizeProductGroup(group) {
      if (typeof this.engine.normalizeProductGroup === 'function') {
        return normalizeText(this.engine.normalizeProductGroup(group));
      }
      return normalizeText(group);
    }

    getProductKeysForGroup(group = null) {
      const selectedGroup = normalizeKey(this.normalizeProductGroup(group));
      return Object.entries(this.engine.products || {})
        .filter(([, product]) => {
          if (!selectedGroup) return true;
          return normalizeKey(this.normalizeProductGroup(product.group)) === selectedGroup;
        })
        .sort(([, a], [, b]) => {
          const aLabel = normalizeText(a.short_name || a.name || a.code);
          const bLabel = normalizeText(b.short_name || b.name || b.code);
          return aLabel.localeCompare(bLabel, 'vi');
        })
        .map(([key]) => key);
    }

    getGroupForProductKey(productKey) {
      const product = this.engine.products?.[productKey];
      return product ? this.normalizeProductGroup(product.group) : null;
    }

    isRegionValidForMien(vung, mien) {
      if (!vung) return true;
      return this.getRegionsForMien(mien).some((region) => sameValue(region, vung));
    }

    isProductValidForGroup(productKey, group) {
      if (!productKey) return true;
      if (!group) return true;
      const productGroup = this.getGroupForProductKey(productKey);
      return productGroup && sameValue(productGroup, this.normalizeProductGroup(group));
    }

    reconcileHierarchy(notify = false) {
      const filters = this.engine.filters || {};
      let changed = false;

      if (filters.vung) {
        const parent = this.getMienForRegion(filters.vung);
        if (parent && !sameValue(filters.mien, parent)) {
          filters.mien = parent;
          changed = true;
        } else if (filters.mien && !this.isRegionValidForMien(filters.vung, filters.mien)) {
          filters.vung = null;
          changed = true;
        }
      }

      if (filters.productKey) {
        const group = this.getGroupForProductKey(filters.productKey);
        if (!group) {
          filters.productKey = null;
          changed = true;
        } else if (!sameValue(filters.productGroup, group)) {
          filters.productGroup = group;
          changed = true;
        }
      }

      if (changed && notify && typeof this.engine.notify === 'function') this.engine.notify();
      return changed;
    }

    patchEngine() {
      const engine = this.engine;
      const controller = this;
      if (engine.__vikodaSmartSlicerEnginePatched) return;
      engine.__vikodaSmartSlicerEnginePatched = true;

      this.originals.matchesFactDimensionFilters = engine.matchesFactDimensionFilters?.bind(engine);
      this.originals.clearAllFilters = engine.clearAllFilters?.bind(engine);

      engine.getRegionsForMien = (mien = null) => controller.getRegionsForMien(mien);
      engine.getMienForRegion = (vung) => controller.getMienForRegion(vung);
      engine.getProductKeysForGroup = (group = null) => controller.getProductKeysForGroup(group);
      engine.getGroupForProductKey = (productKey) => controller.getGroupForProductKey(productKey);

      if (this.originals.matchesFactDimensionFilters) {
        engine.matchesFactDimensionFilters = function (row, filters = this.filters) {
          if (!controller.originals.matchesFactDimensionFilters(row, filters)) return false;
          if (filters.productKey && String(row?.[2] ?? '') !== String(filters.productKey)) return false;
          return true;
        };
      }

      engine.setFilter = function (key, value) {
        const normalizedValue = value === '' || value === undefined ? null : value;
        const currentValue = this.filters[key] ?? null;
        const nextValue = normalizedValue !== null && sameValue(currentValue, normalizedValue)
          ? null
          : normalizedValue;

        if (key === 'mien') {
          this.filters.mien = nextValue;
          if (!nextValue) {
            this.filters.vung = null;
          } else if (this.filters.vung && !controller.isRegionValidForMien(this.filters.vung, nextValue)) {
            this.filters.vung = null;
          }
        } else if (key === 'vung') {
          this.filters.vung = nextValue;
          if (nextValue) {
            const parent = controller.getMienForRegion(nextValue);
            if (parent) this.filters.mien = parent;
          }
        } else if (key === 'productGroup') {
          const group = nextValue ? controller.normalizeProductGroup(nextValue) : null;
          this.filters.productGroup = group;
          if (!group) {
            this.filters.productKey = null;
          } else if (this.filters.productKey && !controller.isProductValidForGroup(this.filters.productKey, group)) {
            this.filters.productKey = null;
          }
        } else if (key === 'productKey') {
          this.filters.productKey = nextValue;
          if (nextValue) {
            const group = controller.getGroupForProductKey(nextValue);
            if (group) this.filters.productGroup = group;
          }
        } else {
          this.filters[key] = nextValue;
        }

        controller.reconcileHierarchy(false);
        this.notify();
      };

      if (this.originals.clearAllFilters) {
        engine.clearAllFilters = function () {
          this.filters.productKey = null;
          return controller.originals.clearAllFilters();
        };
      }
    }

    patchApp() {
      const app = this.app;
      const controller = this;
      if (app.__vikodaSmartSlicerAppPatched) return;
      app.__vikodaSmartSlicerAppPatched = true;

      this.originals.syncBusinessFilterControls = app.syncBusinessFilterControls?.bind(app);
      this.originals.initSidebarDropdowns = app.initSidebarDropdowns?.bind(app);
      this.originals.updateFilterPillsUI = app.updateFilterPillsUI?.bind(app);

      if (this.originals.syncBusinessFilterControls) {
        app.syncBusinessFilterControls = function () {
          controller.reconcileHierarchy(false);
          controller.originals.syncBusinessFilterControls();
          controller.ensureSkuControl();
          controller.bindSkuControl();
          controller.syncSkuControl();
        };
      }

      if (this.originals.initSidebarDropdowns) {
        app.initSidebarDropdowns = function () {
          controller.originals.initSidebarDropdowns();
          controller.ensureSkuControl();
          controller.bindSkuControl();
          controller.syncSkuControl();
        };
      }

      if (this.originals.updateFilterPillsUI) {
        app.updateFilterPillsUI = function () {
          controller.originals.updateFilterPillsUI();
          controller.appendSkuPill();
        };
      }
    }

    ensureSmartStyles() {
      if (!this.doc.head || this.doc.getElementById?.('vikoda_smart_slicer_styles')) return;
      const style = this.doc.createElement('style');
      style.id = 'vikoda_smart_slicer_styles';
      style.textContent = `
        .filter-smart-hint{display:block;margin-top:4px;color:#88a6bc;font-size:9px;line-height:1.35}
        .chart-smart-empty{position:absolute;inset:10px;display:flex;align-items:center;justify-content:center;padding:16px;border:1px dashed #c6d4df;border-radius:8px;background:rgba(255,255,255,.94);color:#5f7388;font-size:12px;text-align:center;z-index:5}
        .chart-container.smart-empty-host{position:relative}
      `;
      this.doc.head.appendChild(style);
    }

    ensureSkuControl() {
      if (this.doc.getElementById?.('select_product')) return this.doc.getElementById('select_product');
      const groupSelect = this.doc.getElementById?.('select_group');
      const groupWrapper = groupSelect?.closest?.('.filter-select-group');
      if (!groupWrapper?.parentNode || !this.doc.createElement) return null;

      const wrapper = this.doc.createElement('div');
      wrapper.className = 'filter-select-group filter-block-product';
      wrapper.dataset.filterBlock = 'product';

      const label = this.doc.createElement('label');
      label.setAttribute('for', 'select_product');
      label.textContent = 'SKU / Sản phẩm';

      const select = this.doc.createElement('select');
      select.id = 'select_product';
      select.className = 'filter-select';
      const option = this.doc.createElement('option');
      option.value = '';
      option.textContent = 'Tất cả SKU';
      select.appendChild(option);

      const hint = this.doc.createElement('span');
      hint.className = 'filter-smart-hint';
      hint.textContent = 'SKU tự giới hạn theo Nhóm SP; chọn SKU sẽ tự nhận Nhóm SP.';

      wrapper.appendChild(label);
      wrapper.appendChild(select);
      wrapper.appendChild(hint);
      groupWrapper.parentNode.insertBefore(wrapper, groupWrapper.nextSibling);

      const regionSelect = this.doc.getElementById?.('select_vung');
      const regionWrapper = regionSelect?.closest?.('.filter-select-group');
      if (regionWrapper && !regionWrapper.querySelector?.('.filter-smart-hint')) {
        const regionHint = this.doc.createElement('span');
        regionHint.className = 'filter-smart-hint';
        regionHint.textContent = 'Vùng tự giới hạn theo Miền; chọn Vùng sẽ tự nhận đúng Miền.';
        regionWrapper.appendChild(regionHint);
      }
      return select;
    }

    bindSkuControl() {
      const select = this.doc.getElementById?.('select_product');
      if (!select || select.dataset?.boundSmartProduct) return;
      if (select.dataset) select.dataset.boundSmartProduct = 'true';
      select.addEventListener?.('change', (event) => {
        this.engine.setFilter('productKey', event.target.value || null);
      });
    }

    productLabel(productKey) {
      const product = this.engine.products?.[productKey] || {};
      const name = normalizeText(product.short_name || product.name || product.code || productKey);
      const code = normalizeText(product.code);
      return code && !sameValue(code, name) ? `${name} · ${code}` : name;
    }

    syncSkuControl() {
      const select = this.doc.getElementById?.('select_product');
      if (!select || !this.doc.createElement) return;
      const selected = this.engine.filters?.productKey || '';
      const keys = this.getProductKeysForGroup(this.engine.filters?.productGroup);

      select.replaceChildren?.();
      const all = this.doc.createElement('option');
      all.value = '';
      all.textContent = this.engine.filters?.productGroup ? 'Tất cả SKU trong nhóm' : 'Tất cả SKU';
      select.appendChild(all);
      keys.forEach((key) => {
        const option = this.doc.createElement('option');
        option.value = key;
        option.textContent = this.productLabel(key);
        select.appendChild(option);
      });
      select.value = keys.includes(selected) ? selected : '';
    }

    appendSkuPill() {
      const productKey = this.engine.filters?.productKey;
      if (!productKey) return;
      const container = this.doc.getElementById?.('filter_pills_container');
      if (!container || container.querySelector?.('[data-key="productKey"]')) return;

      const pill = this.doc.createElement('span');
      pill.className = 'filter-pill';
      pill.appendChild(this.doc.createTextNode(`SKU: ${this.productLabel(productKey)} `));
      const button = this.doc.createElement('button');
      button.type = 'button';
      button.className = 'remove-pill';
      button.dataset.key = 'productKey';
      button.setAttribute('aria-label', `Xóa SKU ${this.productLabel(productKey)}`);
      button.textContent = '✕';
      button.addEventListener('click', () => this.engine.setFilter('productKey', null));
      pill.appendChild(button);
      container.appendChild(pill);
    }

    renderNoDataState() {
      if (!this.doc.querySelectorAll || typeof this.engine.getFilteredFacts !== 'function') return;
      let facts = [];
      try {
        facts = this.engine.getFilteredFacts() || [];
      } catch (_error) {
        return;
      }
      const noData = facts.length === 0;
      this.doc.querySelectorAll('.chart-container').forEach((container) => {
        container.classList?.toggle('smart-empty-host', noData);
        let overlay = container.querySelector?.('.chart-smart-empty');
        if (noData) {
          if (!overlay && this.doc.createElement) {
            overlay = this.doc.createElement('div');
            overlay.className = 'chart-smart-empty';
            overlay.setAttribute('role', 'status');
            overlay.textContent = 'Không có dữ liệu cho tổ hợp bộ lọc hiện tại. Hãy đổi Miền, Vùng, Kênh hoặc Nhóm SP.';
            container.appendChild(overlay);
          }
        } else if (overlay) {
          overlay.remove();
        }
      });
    }
  }

  function installSmartSlicers(engine, app, doc) {
    return new SmartSlicerController(engine, app, doc).install();
  }

  return { SmartSlicerController, installSmartSlicers, normalizeText, sameValue };
});
