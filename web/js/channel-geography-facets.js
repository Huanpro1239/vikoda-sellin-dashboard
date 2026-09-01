/**
 * VIKODA CHANNEL -> GEOGRAPHY FACETS
 * Extends the smart slicer controller so Kênh becomes the parent facet for
 * Miền/Vùng. Geography options are derived from currently eligible Sell-In
 * facts, not from the full static customer/territory dictionaries.
 */
(function (root, factory) {
  'use strict';

  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) {
    root.VikodaChannelGeographyFacets = api;
    const boot = (attempt = 0) => {
      const smart = root.dataEngine?.__vikodaSmartSlicerController;
      if (root.dataEngine && root.app && root.document && smart) {
        api.installChannelGeographyFacets(root.dataEngine, root.app, root.document);
        return;
      }
      if (attempt < 200) root.setTimeout(() => boot(attempt + 1), 50);
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

  class ChannelGeographyFacetController {
    constructor(engine, app, doc) {
      this.engine = engine;
      this.app = app;
      this.doc = doc;
      this.smart = null;
      this.originals = {};
    }

    install() {
      if (!this.engine || !this.app || !this.doc) return null;
      if (this.engine.__vikodaChannelGeographyFacets) {
        return this.engine.__vikodaChannelGeographyFacets;
      }

      this.smart = this.engine.__vikodaSmartSlicerController;
      if (!this.smart) return null;

      this.patchSmartHierarchy();
      this.patchApp();
      this.ensureChannelHint();
      this.smart.reconcileHierarchy(false);
      this.app.syncBusinessFilterControls?.();

      this.engine.__vikodaChannelGeographyFacets = this;
      return this;
    }

    facetFilters() {
      return {
        ...(this.engine.filters || {}),
        mien: null,
        vung: null,
      };
    }

    facetFacts() {
      if (!this.engine.filters?.channel || typeof this.engine.getFilteredFacts !== 'function') return [];
      try {
        return this.engine.getFilteredFacts(this.facetFilters()) || [];
      } catch (_error) {
        return [];
      }
    }

    geographyForFact(row) {
      const customer = this.engine.customers?.[row?.[1]] || {};
      const territory = this.engine.territories?.[row?.[3]] || {};
      return {
        mien: normalizeText(customer.mien || territory.mien),
        vung: normalizeText(customer.vung || territory.vung),
      };
    }

    facetedGeographyRows() {
      return this.facetFacts()
        .map((row) => this.geographyForFact(row))
        .filter((geo) => geo.mien || geo.vung);
    }

    getAvailableMiens() {
      if (!this.engine.filters?.channel) return [];
      return uniqueSorted(this.facetedGeographyRows().map((geo) => geo.mien));
    }

    getAvailableRegions(mien = null) {
      if (!this.engine.filters?.channel) return [];
      const parent = normalizeKey(mien);
      return uniqueSorted(this.facetedGeographyRows()
        .filter((geo) => !parent || normalizeKey(geo.mien) === parent)
        .map((geo) => geo.vung));
    }

    getAvailableMienForRegion(vung) {
      if (!this.engine.filters?.channel) return null;
      const child = normalizeKey(vung);
      if (!child) return null;
      const parents = uniqueSorted(this.facetedGeographyRows()
        .filter((geo) => normalizeKey(geo.vung) === child)
        .map((geo) => geo.mien));
      if (parents.length === 1) return parents[0];
      const current = normalizeText(this.engine.filters?.mien);
      return current && parents.some((parent) => sameValue(parent, current)) ? current : null;
    }

    reconcileChannelGeography() {
      const filters = this.engine.filters || {};
      if (!filters.channel) return false;

      let changed = false;
      const availableMiens = this.getAvailableMiens();

      if (filters.vung) {
        const parent = this.getAvailableMienForRegion(filters.vung);
        if (!parent) {
          filters.vung = null;
          changed = true;
        } else if (!sameValue(filters.mien, parent)) {
          filters.mien = parent;
          changed = true;
        }
      }

      if (filters.mien && !availableMiens.some((mien) => sameValue(mien, filters.mien))) {
        filters.mien = null;
        if (filters.vung) filters.vung = null;
        changed = true;
      }

      if (filters.vung) {
        const availableRegions = this.getAvailableRegions(filters.mien);
        if (!availableRegions.some((region) => sameValue(region, filters.vung))) {
          filters.vung = null;
          changed = true;
        }
      }

      return changed;
    }

    patchSmartHierarchy() {
      const smart = this.smart;
      const controller = this;
      if (smart.__vikodaChannelFacetPatched) return;
      smart.__vikodaChannelFacetPatched = true;

      this.originals.getRegionsForMien = smart.getRegionsForMien.bind(smart);
      this.originals.getMienForRegion = smart.getMienForRegion.bind(smart);
      this.originals.reconcileHierarchy = smart.reconcileHierarchy.bind(smart);

      smart.getRegionsForMien = function (mien = null) {
        if (!controller.engine.filters?.channel) return controller.originals.getRegionsForMien(mien);
        return controller.getAvailableRegions(mien);
      };

      smart.getMienForRegion = function (vung) {
        if (!controller.engine.filters?.channel) return controller.originals.getMienForRegion(vung);
        return controller.getAvailableMienForRegion(vung);
      };

      smart.reconcileHierarchy = function (notify = false) {
        let changed = controller.originals.reconcileHierarchy(false);
        if (controller.reconcileChannelGeography()) changed = true;
        if (changed && notify && typeof controller.engine.notify === 'function') controller.engine.notify();
        return changed;
      };

      this.engine.getMiensForChannel = () => controller.getAvailableMiens();
      this.engine.getRegionsForChannel = (mien = null) => controller.getAvailableRegions(mien);
    }

    replaceOptions(select, values, allLabel, selectedValue = '') {
      if (!select) return;
      if (typeof this.app.replaceBusinessFilterOptions === 'function') {
        this.app.replaceBusinessFilterOptions(select, values, allLabel, selectedValue);
        return;
      }
      if (!this.doc.createElement || !select.replaceChildren) return;
      select.replaceChildren();
      const all = this.doc.createElement('option');
      all.value = '';
      all.textContent = allLabel;
      select.appendChild(all);
      values.forEach((value) => {
        const option = this.doc.createElement('option');
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
      });
      select.value = values.some((value) => sameValue(value, selectedValue)) ? selectedValue : '';
    }

    syncChannelGeographyControls() {
      const channel = normalizeText(this.engine.filters?.channel);
      if (!channel) return;

      const mienSelect = this.doc.getElementById?.('select_mien');
      const regionSelect = this.doc.getElementById?.('select_vung');
      const miens = this.getAvailableMiens();
      const regions = this.getAvailableRegions(this.engine.filters?.mien);

      this.replaceOptions(
        mienSelect,
        miens,
        miens.length ? `Tất cả miền · ${channel}` : `Không có miền có dữ liệu · ${channel}`,
        this.engine.filters?.mien || '',
      );
      this.replaceOptions(
        regionSelect,
        regions,
        regions.length ? `Tất cả vùng · ${channel}` : `Không có vùng có dữ liệu · ${channel}`,
        this.engine.filters?.vung || '',
      );

      if (mienSelect) mienSelect.disabled = miens.length === 0;
      if (regionSelect) regionSelect.disabled = regions.length === 0;
    }

    patchApp() {
      const controller = this;
      if (this.app.__vikodaChannelFacetAppPatched) return;
      this.app.__vikodaChannelFacetAppPatched = true;

      this.originals.syncBusinessFilterControls = this.app.syncBusinessFilterControls?.bind(this.app);
      this.originals.initSidebarDropdowns = this.app.initSidebarDropdowns?.bind(this.app);

      if (this.originals.syncBusinessFilterControls) {
        this.app.syncBusinessFilterControls = function () {
          controller.smart.reconcileHierarchy(false);
          controller.originals.syncBusinessFilterControls();
          controller.syncChannelGeographyControls();
        };
      }

      if (this.originals.initSidebarDropdowns) {
        this.app.initSidebarDropdowns = function () {
          controller.originals.initSidebarDropdowns();
          controller.syncChannelGeographyControls();
        };
      }
    }

    ensureChannelHint() {
      const channelSelect = this.doc.getElementById?.('select_channel');
      const wrapper = channelSelect?.closest?.('.filter-select-group');
      if (!wrapper || wrapper.querySelector?.('[data-channel-facet-hint]') || !this.doc.createElement) return;
      const hint = this.doc.createElement('span');
      hint.className = 'filter-smart-hint';
      hint.dataset.channelFacetHint = 'true';
      hint.textContent = 'Kênh → Miền → Vùng: danh sách tự thu hẹp theo dữ liệu đang có trong kỳ và các bộ lọc khác.';
      wrapper.appendChild(hint);
    }
  }

  function installChannelGeographyFacets(engine, app, doc) {
    return new ChannelGeographyFacetController(engine, app, doc).install();
  }

  return { ChannelGeographyFacetController, installChannelGeographyFacets, normalizeText, sameValue };
});