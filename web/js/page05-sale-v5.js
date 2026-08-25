/**
 * VIKODA SELL-IN — SALE MANAGEMENT PAGE V5
 * Rebuilds menu 04 into a coherent management view while preserving the
 * canonical data engine and the existing detail/export workflow.
 */
(() => {
  'use strict';

  const C = {
    blue: '#2f67e8',
    gray: '#bcc8d2',
    orange: '#e58a16',
    teal: '#19877e',
    green: '#15945b',
    red: '#dc3545',
    navy: '#0b304d',
    grid: '#e2e9ef',
    muted: '#60768b',
    ink: '#19354c',
  };

  const fmt = (value, digits = 0) => Number(value || 0).toLocaleString('vi-VN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const fmtTr = (value) => `${fmt(value)} tr`;
  const signed = (value, digits = 0) => `${Number(value || 0) >= 0 ? '+' : ''}${fmt(value, digits)}`;
  const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[char]);

  function tooltip() {
    return {
      backgroundColor: 'rgba(11,48,77,.96)',
      borderColor: '#3f637d',
      borderWidth: 1,
      textStyle: { color: '#fff', fontSize: 11 },
      padding: [7, 9],
      extraCssText: 'border-radius:3px;box-shadow:0 4px 12px rgba(0,0,0,.16);',
    };
  }

  function axisText() {
    return { color: '#586f83', fontSize: 9.5 };
  }

  function splitLine() {
    return { show: true, lineStyle: { color: C.grid, width: 1 } };
  }

  function ensurePanel() {
    const page = document.getElementById('view_page_05');
    if (!page) return null;
    let panel = document.getElementById('sales_management_panel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'sales_management_panel';
      panel.className = 'sales-management-panel';
      page.insertBefore(panel, page.firstChild);
    }

    if (!panel.dataset.saleV5) {
      panel.dataset.saleV5 = 'true';
      panel.innerHTML = `
        <div class="sale-page-heading">
          <div>
            <h2>HIỆU QUẢ SALE THEO ĐƠN VỊ QUẢN LÝ</h2>
            <p>Actual · Cùng kỳ · Target · tăng trưởng · mức hoàn thành theo Vùng và Kênh</p>
          </div>
          <span class="sale-period-note" id="sale_period_note">Theo kỳ báo cáo đang chọn</span>
        </div>
        <div class="analysis-summary-grid" id="sales_management_summary"></div>
        <div class="sales-management-grid">
          <section class="chart-card">
            <div class="chart-card-header">
              <span class="chart-title">1 · XẾP HẠNG VÙNG THEO ACTUAL / TARGET</span>
              <span class="chart-subtitle">Actual và Target theo Vùng · màu nhãn thể hiện % hoàn thành</span>
            </div>
            <div id="chart_sales_region" class="chart-container" data-cross-filter="true"></div>
          </section>
          <section class="chart-card">
            <div class="chart-card-header">
              <span class="chart-title">2 · HIỆU QUẢ THEO KÊNH</span>
              <span class="chart-subtitle">Actual · Cùng kỳ · % Growth</span>
            </div>
            <div id="chart_sales_channel" class="chart-container" data-cross-filter="true"></div>
          </section>
        </div>
        <section class="sale-performance-matrix">
          <div class="reference-matrix-title">3 · MA TRẬN HIỆU QUẢ ĐƠN VỊ</div>
          <div class="reference-matrix-subtitle">Actual · Cùng kỳ · Growth · Target · % đạt · Gap · khách hàng hoạt động</div>
          <div class="reference-matrix-wrap" id="sale_management_matrix"></div>
        </section>`;
    }

    const detailCard = page.querySelector(':scope > .table-card');
    if (detailCard && !detailCard.querySelector('.sale-detail-heading')) {
      const heading = document.createElement('div');
      heading.className = 'sale-detail-heading';
      heading.innerHTML = '<strong>4 · CHI TIẾT KHÁCH HÀNG / SẢN PHẨM</strong><span>Tìm kiếm · sắp xếp · xuất Excel</span>';
      detailCard.insertBefore(heading, detailCard.firstChild);
    }
    return panel;
  }

  function aggregate(engine) {
    const byRegion = new Map();
    const byChannel = new Map();
    const activeCustomersByRegion = new Map();

    const ensure = (map, key) => {
      const label = key || 'Khác';
      if (!map.has(label)) map.set(label, { name: label, actual: 0, ly: 0, target: 0 });
      return map.get(label);
    };

    engine.getFilteredFacts().forEach((row) => {
      const customer = engine.customers[row[1]] || {};
      const territory = engine.territories[row[3]] || {};
      const region = customer.vung || territory.vung || customer.mien || territory.mien || 'Khác';
      const channel = customer.channel || 'GT';
      ensure(byRegion, region).actual += Number(row[4] || 0) / 1000000;
      ensure(byChannel, channel).actual += Number(row[4] || 0) / 1000000;
      if (!activeCustomersByRegion.has(region)) activeCustomersByRegion.set(region, new Set());
      activeCustomersByRegion.get(region).add(row[1]);
    });

    engine.getLYFilteredFacts().forEach((row) => {
      const customer = engine.customers[row[1]] || {};
      const territory = engine.territories[row[3]] || {};
      const region = customer.vung || territory.vung || customer.mien || territory.mien || 'Khác';
      const channel = customer.channel || 'GT';
      ensure(byRegion, region).ly += Number(row[4] || 0) / 1000000;
      ensure(byChannel, channel).ly += Number(row[4] || 0) / 1000000;
    });

    engine.getFilteredTargets().forEach((row) => {
      const customer = engine.customers[row[2]] || {};
      const territory = engine.territories[row[1]] || {};
      const region = customer.vung || territory.vung || customer.mien || territory.mien || 'Khác';
      const channel = customer.channel || 'GT';
      ensure(byRegion, region).target += Number(row[3] || 0) / 1000000;
      ensure(byChannel, channel).target += Number(row[3] || 0) / 1000000;
    });

    const regions = [...byRegion.values()].map((row) => ({
      ...row,
      growth: row.ly > 0 ? (row.actual - row.ly) / row.ly * 100 : (row.actual > 0 ? 100 : 0),
      attainment: row.target > 0 ? row.actual / row.target * 100 : 0,
      gap: row.actual - row.target,
      customers: activeCustomersByRegion.get(row.name)?.size || 0,
    })).filter((row) => row.actual || row.ly || row.target).sort((a, b) => b.actual - a.actual);

    const channels = [...byChannel.values()].map((row) => ({
      ...row,
      growth: row.ly > 0 ? (row.actual - row.ly) / row.ly * 100 : (row.actual > 0 ? 100 : 0),
      attainment: row.target > 0 ? row.actual / row.target * 100 : 0,
    })).filter((row) => row.actual || row.ly || row.target).sort((a, b) => b.actual - a.actual);

    return { regions, channels };
  }

  function summaryCard(label, value, note, tone) {
    return `<div class="analysis-summary-card ${tone}"><span class="analysis-summary-label">${escapeHTML(label)}</span><span class="analysis-summary-value">${escapeHTML(value)}</span><span class="analysis-summary-note">${escapeHTML(note)}</span></div>`;
  }

  function renderSummary(engine, regions) {
    const summary = document.getElementById('sales_management_summary');
    if (!summary) return;
    const kpi = engine.getSummaryKPIs();
    const best = regions.filter((r) => r.target > 0).slice().sort((a, b) => b.attainment - a.attainment)[0];
    const weak = regions.filter((r) => r.target > 0).slice().sort((a, b) => a.attainment - b.attainment)[0];
    const gap = Number(kpi.actualMillion || 0) - Number(kpi.targetMillion || 0);
    summary.innerHTML = [
      summaryCard('Doanh thu kỳ chọn', fmtTr(kpi.actualMillion), `${signed(kpi.yoy, 1)}% vs cùng kỳ`, kpi.yoy >= 0 ? 'good' : 'bad'),
      summaryCard('Gap so với Target', `${gap >= 0 ? '+' : ''}${fmtTr(gap)}`, `${fmt(kpi.attainment, 1)}% kế hoạch`, gap >= 0 ? 'good' : kpi.attainment >= 85 ? 'warn' : 'bad'),
      summaryCard('Vùng dẫn đầu', best ? best.name : '—', best ? `${fmt(best.attainment, 1)}% Target` : 'Chưa có Target', best?.attainment >= 100 ? 'good' : 'warn'),
      summaryCard('Vùng cần ưu tiên', weak ? weak.name : '—', weak ? `${fmt(weak.attainment, 1)}% Target` : 'Chưa có Target', weak?.attainment >= 85 ? 'warn' : 'bad'),
    ].join('');
  }

  function renderRegionChart(charts, regions) {
    const chart = charts.getOrCreate('chart_sales_region');
    if (!chart) return;
    const rows = regions.slice(0, 12).reverse();
    chart.setOption({
      animationDuration: 300,
      tooltip: {
        ...tooltip(),
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params) => {
          const row = rows[params[0]?.dataIndex] || {};
          return `<strong>${escapeHTML(row.name || '')}</strong><br/>Actual: <strong>${fmtTr(row.actual)}</strong><br/>Target: <strong>${fmtTr(row.target)}</strong><br/>% đạt: <strong>${fmt(row.attainment, 1)}%</strong><br/>Gap: <strong>${signed(row.gap)} tr</strong>`;
        },
      },
      legend: {
        top: 3, left: 4, itemWidth: 11, itemHeight: 8, itemGap: 14,
        textStyle: { color: C.muted, fontSize: 9.5 }, data: ['Actual', 'Target'],
      },
      grid: { left: 118, right: 74, top: 39, bottom: 23 },
      xAxis: { type: 'value', splitLine: splitLine(), axisLabel: { ...axisText(), formatter: (v) => v ? `${fmt(v)} tr` : '-' } },
      yAxis: { type: 'category', data: rows.map((r) => r.name), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { ...axisText(), color: '#2a4358', width: 108, overflow: 'truncate' } },
      series: [
        {
          name: 'Actual', type: 'bar', barMaxWidth: 16,
          data: rows.map((r) => ({ value: Math.round(r.actual), itemStyle: { color: r.attainment >= 100 ? C.green : C.blue } })),
          label: { show: true, position: 'right', color: '#50697e', fontSize: 8.5, formatter: (p) => `${fmt(rows[p.dataIndex]?.attainment, 0)}%` },
        },
        { name: 'Target', type: 'bar', barMaxWidth: 16, data: rows.map((r) => Math.round(r.target)), itemStyle: { color: '#e9a14d' } },
      ],
    }, true);
    chart.off('click');
    chart.on('click', (params) => charts.engine.setFilter('vung', params.name));
  }

  function renderChannelChart(charts, channels) {
    const chart = charts.getOrCreate('chart_sales_channel');
    if (!chart) return;
    chart.setOption({
      animationDuration: 300,
      tooltip: { ...tooltip(), trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: {
        top: 3, left: 4, itemWidth: 11, itemHeight: 8, itemGap: 12,
        textStyle: { color: C.muted, fontSize: 9.5 }, data: ['Actual', 'Cùng kỳ', 'Growth %'],
      },
      grid: { left: 48, right: 46, top: 39, bottom: 31 },
      xAxis: { type: 'category', data: channels.map((r) => r.name), axisLine: { lineStyle: { color: '#afbfcc' } }, axisTick: { show: false }, axisLabel: { ...axisText(), color: '#2b4358' } },
      yAxis: [
        { type: 'value', splitLine: splitLine(), axisLabel: { ...axisText(), formatter: (v) => v ? `${fmt(v)} tr` : '-' } },
        { type: 'value', splitLine: { show: false }, axisLabel: { ...axisText(), formatter: (v) => `${fmt(v)}%` } },
      ],
      series: [
        { name: 'Actual', type: 'bar', barMaxWidth: 22, data: channels.map((r) => Math.round(r.actual)), itemStyle: { color: C.blue } },
        { name: 'Cùng kỳ', type: 'bar', barMaxWidth: 22, data: channels.map((r) => Math.round(r.ly)), itemStyle: { color: C.gray } },
        {
          name: 'Growth %', type: 'line', yAxisIndex: 1,
          data: channels.map((r) => Number(r.growth.toFixed(1))),
          symbol: 'circle', symbolSize: 5,
          lineStyle: { color: C.orange, width: 2 }, itemStyle: { color: C.orange },
          label: { show: true, position: 'top', fontSize: 8, color: '#8c5c16', formatter: (p) => `${signed(p.value, 0)}%` },
        },
      ],
    }, true);
    chart.off('click');
    chart.on('click', (params) => charts.engine.setFilter('channel', params.name));
  }

  function renderMatrix(regions) {
    const host = document.getElementById('sale_management_matrix');
    if (!host) return;
    const totals = regions.reduce((sum, row) => ({
      actual: sum.actual + row.actual,
      ly: sum.ly + row.ly,
      target: sum.target + row.target,
      customers: sum.customers + row.customers,
    }), { actual: 0, ly: 0, target: 0, customers: 0 });
    const growth = totals.ly > 0 ? (totals.actual - totals.ly) / totals.ly * 100 : 0;
    const attainment = totals.target > 0 ? totals.actual / totals.target * 100 : 0;
    const gap = totals.actual - totals.target;

    host.innerHTML = `<table class="reference-matrix"><thead><tr><th class="text-col">Vùng</th><th>Actual</th><th>Cùng kỳ</th><th>Growth</th><th>Target</th><th>% đạt Target</th><th>Gap Target</th><th>KH hoạt động</th></tr></thead><tbody>${regions.map((r) => `<tr><td>${escapeHTML(r.name)}</td><td class="num">${fmt(r.actual)} tr</td><td class="num">${fmt(r.ly)} tr</td><td class="num ${r.growth >= 0 ? 'positive' : 'negative'}">${signed(r.growth, 1)}%</td><td class="num">${fmt(r.target)} tr</td><td class="num ${r.attainment >= 100 ? 'positive' : r.attainment < 85 ? 'negative' : ''}">${fmt(r.attainment, 1)}%</td><td class="num ${r.gap >= 0 ? 'positive' : 'negative'}">${signed(r.gap)} tr</td><td class="num">${fmt(r.customers)}</td></tr>`).join('')}</tbody><tfoot><tr><td>Total</td><td class="num">${fmt(totals.actual)} tr</td><td class="num">${fmt(totals.ly)} tr</td><td class="num">${signed(growth, 1)}%</td><td class="num">${fmt(totals.target)} tr</td><td class="num">${fmt(attainment, 1)}%</td><td class="num">${signed(gap)} tr</td><td class="num">${fmt(totals.customers)}</td></tr></tfoot></table>`;
  }

  function updatePeriodNote(engine) {
    const node = document.getElementById('sale_period_note');
    if (!node) return;
    const start = engine.filters?.startDate || '';
    const end = engine.filters?.endDate || '';
    node.textContent = start && end ? `${start.split('-').reverse().join('/')} → ${end.split('-').reverse().join('/')}` : 'Theo kỳ báo cáo đang chọn';
  }

  function render() {
    const engine = window.dataEngine;
    const charts = window.charts;
    if (!engine?.raw || !charts) return;
    ensurePanel();
    const { regions, channels } = aggregate(engine);
    renderSummary(engine, regions);
    renderRegionChart(charts, regions);
    renderChannelChart(charts, channels);
    renderMatrix(regions);
    updatePeriodNote(engine);
    window.setTimeout(() => charts.resizeAll(), 30);
  }

  function install() {
    if (!window.__vikodaReferenceAnalyticsInstalled || !window.dataEngine || !window.charts || !window.app) return false;
    if (window.__vikodaSaleV5Installed) return true;
    window.__vikodaSaleV5Installed = true;
    ensurePanel();
    if (!window.dataEngine.__saleV5Subscribed) {
      window.dataEngine.__saleV5Subscribed = true;
      window.dataEngine.subscribe(() => {
        if (window.app.activePage === 'page_05') window.setTimeout(render, 0);
      });
    }
    document.querySelectorAll('[data-page="page_05"]').forEach((node) => {
      if (node.dataset.saleV5Bound) return;
      node.dataset.saleV5Bound = 'true';
      node.addEventListener('click', () => window.setTimeout(render, 40));
    });
    if (window.dataEngine.raw) render();
    return true;
  }

  function wait(attempt = 0) {
    if (install()) return;
    if (attempt < 180) window.setTimeout(() => wait(attempt + 1), 50);
  }

  wait();
})();
