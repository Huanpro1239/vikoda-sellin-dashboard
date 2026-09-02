/**
 * VIKODA OVERVIEW PERFORMANCE V8
 * Focused overview visual: Actual, same-period revenue and Target share one
 * readable scale. Performance ratios stay available in labels and tooltip.
 */
(() => {
  'use strict';

  const COLORS = {
    actual: '#2F6BDE',
    ly: '#B8C4CF',
    target: '#D98200',
    ink: '#24384A',
    muted: '#708196',
    grid: '#E6EBF0',
    border: '#D8E0E8',
  };

  const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[char]);

  const fmt = (value, digits = 0) => Number(value || 0).toLocaleString('vi-VN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

  function compactMoney(value) {
    const number = Number(value || 0);
    if (Math.abs(number) >= 1000) return `${fmt(number / 1000, 1)}k`;
    return fmt(number);
  }

  function asOfMonth(engine) {
    const asOf = String(engine.metadata?.as_of_date || engine.metadata?.source_latest_date || engine.getReportingAsOfDate?.() || '');
    return Math.max(1, Math.min(12, Number(asOf.slice(5, 7)) || Number(engine.metadata?.through_month) || 12));
  }

  function buildMonthlyData(engine) {
    const base = engine.getMonthlyTrend();
    const through = asOfMonth(engine);
    const labels = base.labels.map((label) => String(label).replace(/^T/i, ''));
    const actual = base.actualSeries.map((value, index) => index < through ? Number(value || 0) : null);
    const ly = base.lySeries.map((value, index) => index < through ? Number(value || 0) : null);
    const target = base.targetSeries.map((value) => Number(value || 0));
    const attainment = target.map((value, index) => index < through && value > 0
      ? Number((((actual[index] || 0) / value) * 100).toFixed(1))
      : null);
    const growth = ly.map((value, index) => index < through && value > 0
      ? Number(((((actual[index] || 0) - value) / value) * 100).toFixed(1))
      : null);

    const revenueValues = [...actual, ...ly, ...target].filter((value) => Number.isFinite(value));
    const maxRevenue = Math.max(1, ...revenueValues);
    const revenueStep = maxRevenue >= 50000 ? 10000 : maxRevenue >= 20000 ? 5000 : maxRevenue >= 5000 ? 1000 : 500;
    const revenueMax = Math.ceil((maxRevenue * 1.08) / revenueStep) * revenueStep;

    return {
      labels,
      actual,
      ly,
      target,
      attainment,
      growth,
      through,
      revenueMax,
    };
  }

  function configureCard() {
    const chartHost = document.getElementById('chart_p1_trend');
    const card = chartHost?.closest('.chart-card');
    if (!card) return;
    card.classList.add('overview-performance-v8');
    const title = card.querySelector('.chart-title');
    const subtitle = card.querySelector('.chart-subtitle');
    if (title) title.textContent = 'Hiệu quả Sell-In theo tháng';
    if (subtitle) subtitle.textContent = 'Actual, cùng kỳ và Target · Chạm hoặc rê để xem tỷ lệ';
  }

  function tooltipFormatter(params, data) {
    const valid = (params || []).filter((item) => item.value !== null && item.value !== undefined && item.value !== '');
    if (!valid.length) return '';
    const month = escapeHTML(valid[0]?.axisValueLabel || valid[0]?.name || '');
    const index = Number.isInteger(valid[0]?.dataIndex) ? valid[0].dataIndex : 0;
    const rows = valid.map((item) => {
      return `<div style="display:flex;align-items:center;justify-content:space-between;gap:22px;margin-top:6px;white-space:nowrap"><span>${item.marker}${escapeHTML(item.seriesName)}</span><strong>${fmt(item.value)} tr</strong></div>`;
    }).join('');
    const ratios = [
      data.attainment[index] === null ? '' : `<div style="display:flex;justify-content:space-between;gap:22px;margin-top:7px;padding-top:7px;border-top:1px solid #edf1f4"><span>% đạt Target</span><strong>${fmt(data.attainment[index], 1)}%</strong></div>`,
      data.growth[index] === null ? '' : `<div style="display:flex;justify-content:space-between;gap:22px;margin-top:6px"><span>Tăng trưởng</span><strong>${fmt(data.growth[index], 1)}%</strong></div>`,
    ].join('');
    return `<div style="min-width:190px"><div style="font-weight:700;color:#213547;margin-bottom:2px">Tháng ${month}</div>${rows}${ratios}</div>`;
  }

  function renderOverviewPerformance(charts) {
    const chart = charts.getOrCreate('chart_p1_trend');
    if (!chart || !charts.engine?.raw) return;
    const data = buildMonthlyData(charts.engine);
    const futureStart = data.through < data.labels.length ? data.labels[data.through] : null;

    configureCard();

    chart.setOption({
      animationDuration: 220,
      animationEasing: 'cubicOut',
      color: [COLORS.actual, COLORS.ly, COLORS.target],
      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: '#FFFFFF',
        borderColor: COLORS.border,
        borderWidth: 1,
        padding: [9, 11],
        textStyle: { color: COLORS.ink, fontSize: 11 },
        extraCssText: 'border-radius:6px;box-shadow:0 8px 24px rgba(33,53,71,.12);',
        axisPointer: { type: 'line', lineStyle: { color: '#AAB7C4', width: 1, type: 'dashed' } },
        formatter: (params) => tooltipFormatter(params, data),
      },
      legend: {
        top: 3,
        left: 8,
        itemWidth: 12,
        itemHeight: 8,
        itemGap: 18,
        textStyle: { color: '#5E7185', fontSize: 10 },
        data: ['Actual', 'Cùng kỳ', 'Target'],
      },
      grid: { left: 66, right: 24, top: 48, bottom: 38, containLabel: false },
      xAxis: {
        type: 'category',
        data: data.labels,
        boundaryGap: true,
        axisLine: { lineStyle: { color: '#C8D2DC' } },
        axisTick: { show: false },
        axisLabel: {
          color: '#5F7286',
          fontSize: 10,
          margin: 9,
          formatter: (value, index) => index >= data.through ? `{future|${value}}` : value,
          rich: { future: { color: '#B3BEC8' } },
        },
        name: 'Tháng',
        nameLocation: 'middle',
        nameGap: 25,
        nameTextStyle: { color: '#66798D', fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: data.revenueMax,
        splitNumber: 4,
        name: 'Doanh thu · triệu đồng',
        nameGap: 12,
        nameTextStyle: { color: '#718296', fontSize: 9, align: 'left' },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#65778A', fontSize: 10, formatter: (value) => compactMoney(value) },
        splitLine: { show: true, lineStyle: { color: COLORS.grid, width: 1 } },
      },
      series: [
        {
          name: 'Actual',
          type: 'bar',
          data: data.actual,
          barMaxWidth: 26,
          barGap: '12%',
          itemStyle: { color: COLORS.actual, borderRadius: [3, 3, 0, 0] },
          emphasis: { focus: 'series' },
          label: {
            show: true,
            position: 'top',
            distance: 5,
            fontSize: 9,
            formatter: (params) => {
              if (params.value === null || params.value === undefined) return '';
              const attained = data.attainment[params.dataIndex];
              if (attained === null) return compactMoney(params.value);
              const state = attained >= 100 ? 'good' : attained >= 85 ? 'warn' : 'bad';
              return `{value|${compactMoney(params.value)}}\n{${state}|${fmt(attained, 1)}%}`;
            },
            rich: {
              value: { color: '#4E6378', fontSize: 9, fontWeight: 600, lineHeight: 15 },
              good: { color: '#087f6d', backgroundColor: '#e7f6f2', borderRadius: 7, padding: [2, 5], fontSize: 8, fontWeight: 700 },
              warn: { color: '#9a5b00', backgroundColor: '#fff4d8', borderRadius: 7, padding: [2, 5], fontSize: 8, fontWeight: 700 },
              bad: { color: '#b43b42', backgroundColor: '#fdebed', borderRadius: 7, padding: [2, 5], fontSize: 8, fontWeight: 700 },
            },
          },
          labelLayout: { hideOverlap: true },
        },
        {
          name: 'Cùng kỳ',
          type: 'bar',
          data: data.ly,
          barMaxWidth: 26,
          itemStyle: { color: COLORS.ly, borderRadius: [3, 3, 0, 0] },
          emphasis: { focus: 'series' },
        },
        {
          name: 'Target',
          type: 'line',
          data: data.target,
          symbol: 'none',
          smooth: false,
          lineStyle: { color: COLORS.target, width: 2, type: 'dashed' },
          itemStyle: { color: COLORS.target },
          emphasis: { focus: 'series' },
          markArea: futureStart ? {
            silent: true,
            itemStyle: { color: 'rgba(120, 136, 153, .055)' },
            label: { show: true, position: 'insideTop', color: '#97A4B1', fontSize: 9, formatter: 'Kế hoạch' },
            data: [[{ xAxis: futureStart }, { xAxis: data.labels[data.labels.length - 1] }]],
          } : undefined,
        },
      ],
    }, true);
  }

  function install() {
    const charts = window.charts;
    const engine = window.dataEngine;
    const app = window.app;
    if (!charts || !engine || !app || !window.__vikodaFidelityV4Installed) return false;
    if (window.__vikodaOverviewPerformanceV8Installed) return true;
    window.__vikodaOverviewPerformanceV8Installed = true;

    const previousRenderPage1 = typeof charts.renderPage1 === 'function' ? charts.renderPage1.bind(charts) : null;
    charts.renderPage1 = () => {
      previousRenderPage1?.();
      renderOverviewPerformance(charts);
    };

    if (!engine.__overviewPerformanceV8Subscribed && typeof engine.subscribe === 'function') {
      engine.__overviewPerformanceV8Subscribed = true;
      engine.subscribe(() => {
        if (window.app?.activePage === 'page_01') renderOverviewPerformance(charts);
      });
    }

    document.addEventListener('vikoda:pagechange', (event) => {
      if (event.detail?.pageId === 'page_01') {
        window.setTimeout(() => renderOverviewPerformance(charts), 0);
      }
    });

    configureCard();
    if (engine.raw) window.setTimeout(() => renderOverviewPerformance(charts), 0);
    return true;
  }

  function wait(attempt = 0) {
    if (install()) return;
    if (attempt < 180) window.setTimeout(() => wait(attempt + 1), 50);
  }

  wait();
})();
