/**
 * VIKODA OVERVIEW PERFORMANCE V8
 * Power BI-inspired overview visual: revenue comparison and rate trends are
 * separated into two synchronized plotting areas to avoid dual-axis clutter.
 */
(() => {
  'use strict';

  const COLORS = {
    actual: '#2F6BDE',
    ly: '#B8C4CF',
    target: '#D98200',
    attainment: '#13877E',
    growth: '#6F4AE8',
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

    const percentValues = [...attainment, ...growth].filter((value) => Number.isFinite(value));
    const minPercent = Math.min(0, ...percentValues);
    const maxPercent = Math.max(100, ...percentValues);
    const percentMin = Math.min(-20, Math.floor((minPercent - 5) / 20) * 20);
    const percentMax = Math.max(120, Math.ceil((maxPercent + 5) / 20) * 20);

    return {
      labels,
      actual,
      ly,
      target,
      attainment,
      growth,
      through,
      revenueMax,
      percentMin,
      percentMax,
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
    if (subtitle) subtitle.textContent = 'Actual & Cùng kỳ so với Target · Tỷ lệ đạt Target và Growth';
  }

  function tooltipFormatter(params) {
    const valid = (params || []).filter((item) => item.value !== null && item.value !== undefined && item.value !== '');
    if (!valid.length) return '';
    const month = escapeHTML(valid[0]?.axisValueLabel || valid[0]?.name || '');
    const rows = valid.map((item) => {
      const isPercent = String(item.seriesName).includes('%');
      const value = isPercent ? `${fmt(item.value, 1)}%` : `${fmt(item.value)} tr`;
      return `<div style="display:flex;align-items:center;justify-content:space-between;gap:22px;margin-top:6px;white-space:nowrap"><span>${item.marker}${escapeHTML(item.seriesName)}</span><strong>${value}</strong></div>`;
    }).join('');
    return `<div style="min-width:190px"><div style="font-weight:700;color:#213547;margin-bottom:2px">Tháng ${month}</div>${rows}</div>`;
  }

  function renderOverviewPerformance(charts) {
    const chart = charts.getOrCreate('chart_p1_trend');
    if (!chart || !charts.engine?.raw) return;
    const data = buildMonthlyData(charts.engine);
    const latestIndex = data.through - 1;
    const futureStart = data.through < data.labels.length ? data.labels[data.through] : null;

    configureCard();

    chart.setOption({
      animationDuration: 220,
      animationEasing: 'cubicOut',
      color: [COLORS.actual, COLORS.ly, COLORS.target, COLORS.attainment, COLORS.growth],
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
        formatter: tooltipFormatter,
      },
      axisPointer: { link: [{ xAxisIndex: [0, 1] }] },
      legend: {
        top: 3,
        left: 8,
        itemWidth: 12,
        itemHeight: 8,
        itemGap: 18,
        textStyle: { color: '#5E7185', fontSize: 10 },
        data: ['Actual', 'Cùng kỳ', 'Target', '% đạt Target', '% Growth'],
      },
      grid: [
        { left: 66, right: 24, top: 42, height: '51%', containLabel: false },
        { left: 66, right: 24, top: '70%', bottom: 32, containLabel: false },
      ],
      xAxis: [
        {
          type: 'category',
          gridIndex: 0,
          data: data.labels,
          boundaryGap: true,
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { show: false },
        },
        {
          type: 'category',
          gridIndex: 1,
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
      ],
      yAxis: [
        {
          type: 'value',
          gridIndex: 0,
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
        {
          type: 'value',
          gridIndex: 1,
          min: data.percentMin,
          max: data.percentMax,
          splitNumber: 4,
          name: 'Hiệu suất · %',
          nameGap: 12,
          nameTextStyle: { color: '#718296', fontSize: 9, align: 'left' },
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { color: '#65778A', fontSize: 10, formatter: (value) => `${fmt(value)}%` },
          splitLine: { show: true, lineStyle: { color: '#EDF1F4', width: 1 } },
        },
      ],
      series: [
        {
          name: 'Actual',
          type: 'bar',
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: data.actual,
          barMaxWidth: 26,
          barGap: '12%',
          itemStyle: { color: COLORS.actual, borderRadius: [3, 3, 0, 0] },
          emphasis: { focus: 'series' },
          label: {
            show: true,
            position: 'top',
            distance: 5,
            color: '#4E6378',
            fontSize: 9,
            fontWeight: 600,
            formatter: (params) => params.value === null ? '' : compactMoney(params.value),
          },
          labelLayout: { hideOverlap: true },
        },
        {
          name: 'Cùng kỳ',
          type: 'bar',
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: data.ly,
          barMaxWidth: 26,
          itemStyle: { color: COLORS.ly, borderRadius: [3, 3, 0, 0] },
          emphasis: { focus: 'series' },
        },
        {
          name: 'Target',
          type: 'line',
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: data.target,
          symbol: 'none',
          smooth: false,
          lineStyle: { color: COLORS.target, width: 2, type: 'dashed' },
          itemStyle: { color: COLORS.target },
          emphasis: { focus: 'series' },
          markArea: futureStart ? {
            silent: true,
            itemStyle: { color: 'rgba(120, 136, 153, .055)' },
            label: { show: true, position: 'insideTop', color: '#97A4B1', fontSize: 9, formatter: 'Kế hoạch còn lại' },
            data: [[{ xAxis: futureStart }, { xAxis: data.labels[data.labels.length - 1] }]],
          } : undefined,
        },
        {
          name: '% đạt Target',
          type: 'line',
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: data.attainment,
          symbol: 'circle',
          symbolSize: 6,
          connectNulls: false,
          smooth: 0.15,
          lineStyle: { color: COLORS.attainment, width: 2.4 },
          itemStyle: { color: COLORS.attainment, borderColor: '#FFFFFF', borderWidth: 1.5 },
          emphasis: { focus: 'series' },
          label: {
            show: true,
            position: 'top',
            distance: 7,
            color: COLORS.attainment,
            fontSize: 10,
            fontWeight: 700,
            formatter: (params) => params.dataIndex === latestIndex && params.value !== null ? `${fmt(params.value, 1)}%` : '',
          },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: '#9EB7B4', width: 1, type: 'dashed' },
            label: { show: true, position: 'insideEndTop', color: '#6F8785', fontSize: 8, formatter: '100% Target' },
            data: [{ yAxis: 100 }],
          },
        },
        {
          name: '% Growth',
          type: 'line',
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: data.growth,
          symbol: 'circle',
          symbolSize: 6,
          connectNulls: false,
          smooth: 0.12,
          lineStyle: { color: COLORS.growth, width: 2.2 },
          itemStyle: { color: COLORS.growth, borderColor: '#FFFFFF', borderWidth: 1.5 },
          emphasis: { focus: 'series' },
          label: {
            show: true,
            position: 'bottom',
            distance: 7,
            color: COLORS.growth,
            fontSize: 10,
            fontWeight: 700,
            formatter: (params) => params.dataIndex === latestIndex && params.value !== null ? `${fmt(params.value, 1)}%` : '',
          },
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