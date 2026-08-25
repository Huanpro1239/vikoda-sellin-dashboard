/** Add the real DMKH province hierarchy to the Vùng–Miền reference matrix. */
(() => {
  'use strict';

  const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[char]);
  const fmt = (value, digits = 0) => Number(value || 0).toLocaleString('vi-VN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

  function rowsByProvince(engine) {
    const map = new Map();
    const ensure = (customer, territory) => {
      const mien = customer.mien || territory.mien || 'Khác';
      const vung = customer.vung || territory.vung || mien;
      const province = customer.province || 'Chưa phân tỉnh';
      const key = `${mien}|||${vung}|||${province}`;
      if (!map.has(key)) map.set(key, { mien, vung, province, actual: 0, ly: 0, target: 0 });
      return map.get(key);
    };

    engine.getFilteredFacts().forEach((row) => {
      const customer = engine.customers[row[1]] || {};
      const territory = engine.territories[row[3]] || {};
      ensure(customer, territory).actual += Number(row[4] || 0) / 1000000;
    });
    engine.getLYFilteredFacts().forEach((row) => {
      const customer = engine.customers[row[1]] || {};
      const territory = engine.territories[row[3]] || {};
      ensure(customer, territory).ly += Number(row[4] || 0) / 1000000;
    });
    engine.getFilteredTargets().forEach((row) => {
      const customer = engine.customers[row[2]] || {};
      const territory = engine.territories[row[1]] || {};
      ensure(customer, territory).target += Number(row[3] || 0) / 1000000;
    });

    return [...map.values()].map((row) => ({
      ...row,
      growth: row.ly > 0 ? (row.actual - row.ly) / row.ly * 100 : (row.actual > 0 ? 100 : 0),
      attainment: row.target > 0 ? row.actual / row.target * 100 : 0,
      gap: row.actual - row.target,
    })).filter((row) => row.actual || row.ly || row.target).sort((a, b) => b.actual - a.actual);
  }

  function render(engine) {
    const card = document.getElementById('reference_region_matrix');
    const wrap = card?.querySelector('.reference-matrix-wrap');
    if (!wrap || !engine?.raw) return;
    const rows = rowsByProvince(engine);
    const totals = rows.reduce((sum, row) => ({
      actual: sum.actual + row.actual,
      ly: sum.ly + row.ly,
      target: sum.target + row.target,
    }), { actual: 0, ly: 0, target: 0 });
    const growth = totals.ly > 0 ? (totals.actual - totals.ly) / totals.ly * 100 : 0;
    const attainment = totals.target > 0 ? totals.actual / totals.target * 100 : 0;
    const gap = totals.actual - totals.target;

    const title = card.querySelector('.reference-matrix-title');
    const subtitle = card.querySelector('.reference-matrix-subtitle');
    if (title) title.textContent = '2 · HIỆU QUẢ THEO MIỀN - VÙNG - TỈNH';
    if (subtitle) subtitle.textContent = 'Actual · Cùng kỳ · Tăng trưởng · Target · % đạt · Gap Target';

    wrap.innerHTML = `<table class="reference-matrix"><thead><tr><th class="text-col">Miền</th><th class="text-col">Vùng</th><th class="text-col">Tỉnh</th><th>Actual kỳ chọn</th><th>Cùng kỳ</th><th>Tăng trưởng</th><th>Target kỳ chọn</th><th>% đạt Target</th><th>Gap Target</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHTML(row.mien)}</td><td>${escapeHTML(row.vung)}</td><td>${escapeHTML(row.province)}</td><td class="num">${fmt(row.actual)} tr</td><td class="num">${fmt(row.ly)} tr</td><td class="num ${row.growth >= 0 ? 'positive' : 'negative'}">${row.growth < 0 ? '(' : ''}${fmt(Math.abs(row.growth), 1)}%${row.growth < 0 ? ')' : ''}</td><td class="num">${fmt(row.target)} tr</td><td class="num ${row.attainment >= 100 ? 'positive' : row.attainment < 85 ? 'negative' : ''}">${fmt(row.attainment, 1)}%</td><td class="num ${row.gap >= 0 ? 'positive' : 'negative'}">${row.gap < 0 ? `(${fmt(Math.abs(row.gap))})` : fmt(row.gap)} tr</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="3">Total</td><td class="num">${fmt(totals.actual)} tr</td><td class="num">${fmt(totals.ly)} tr</td><td class="num">${fmt(growth, 1)}%</td><td class="num">${fmt(totals.target)} tr</td><td class="num">${fmt(attainment, 1)}%</td><td class="num">${gap < 0 ? `(${fmt(Math.abs(gap))})` : fmt(gap)} tr</td></tr></tfoot></table>`;
  }

  function install() {
    if (!window.__vikodaFidelityV4Installed || !window.charts || !window.dataEngine) return false;
    if (window.__vikodaGeographyV4Installed) return true;
    window.__vikodaGeographyV4Installed = true;
    const charts = window.charts;
    const original = charts.renderPage4.bind(charts);
    charts.renderPage4 = () => {
      original();
      render(window.dataEngine);
    };
    if (window.dataEngine.raw) render(window.dataEngine);
    return true;
  }

  function wait(attempt = 0) {
    if (install()) return;
    if (attempt < 160) window.setTimeout(() => wait(attempt + 1), 50);
  }
  wait();
})();
