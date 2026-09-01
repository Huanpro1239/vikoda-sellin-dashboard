/**
 * VIKODA ACCOUNTING CHARTS V9
 * Final presentation-only normalization for ECharts visuals.
 * It never recalculates business measures or rewrites filter logic.
 */
(() => {
  'use strict';

  const T = {
    ink: '#223443',
    muted: '#66798a',
    navy: '#183b56',
    blue: '#2f6b9a',
    slate: '#a6b2bd',
    plan: '#b47716',
    positive: '#1f7a5a',
    negative: '#b33a3a',
    teal: '#3f7f7a',
    grid: '#e7ecef',
    axis: '#cbd5dc',
    border: '#d7dfe6',
    surface: '#ffffff',
    palette: ['#183b56', '#2f6b9a', '#3f7f7a', '#7f919f', '#b47716', '#b33a3a'],
  };

  const PAGE_METHODS = {
    renderPage1: 'page_01',
    renderPage2: 'page_02',
    renderPage3: 'page_03',
    renderPage4: 'page_04',
    renderPage5: 'page_05',
    renderPage6: 'page_06',
  };

  const PAGE_CHARTS = {
    page_01: ['chart_p1_trend', 'chart_p1_product_mix', 'chart_p1_channel_mix', 'chart_p1_waterfall'],
    page_02: ['chart_p2_channel', 'chart_p2_system_mt', 'chart_p2_movement'],
    page_03: ['chart_p3_trend', 'chart_p3_brand_mix', 'chart_p3_hero_sku', 'chart_p3_declining_sku'],
    page_04: ['chart_p4_volume_trend', 'chart_p4_treemap', 'chart_p4_priority_regions', 'chart_p4_pack_mix'],
    page_05: ['chart_p5_region', 'chart_p5_channel', 'chart_p5_sales'],
    page_06: ['chart_p6_variance', 'chart_p6_target_gap', 'chart_p6_growth'],
  };

  const toArray = (value) => Array.isArray(value) ? value : (value ? [value] : []);
  const text = (value) => String(value ?? '').toLocaleLowerCase('vi-VN');

  function semanticColor(name, index = 0) {
    const label = text(name);
    if (/cùng kỳ|last year|\bly\b/.test(label)) return T.slate;
    if (/target|kế hoạch|plan/.test(label)) return T.plan;
    if (/ngừng|churn|hụt|giảm|âm|negative/.test(label)) return T.negative;
    if (/khách.*mới|new customer|đạt target|attainment|% đạt/.test(label)) return T.positive;
    if (/growth|yoy|tăng trưởng/.test(label)) return T.blue;
    if (/actual|thực hiện|doanh thu|sell.?in/.test(label)) return T.navy;
    return T.palette[index % T.palette.length];
  }

  function componentStyle(component, extra = {}) {
    return {
      ...component,
      ...extra,
      textStyle: {
        ...(component?.textStyle || {}),
        color: extra.textStyle?.color || T.muted,
        fontFamily: 'Segoe UI, Arial, sans-serif',
        fontSize: extra.textStyle?.fontSize || component?.textStyle?.fontSize || 10,
        ...(extra.textStyle || {}),
      },
    };
  }

  function styleTooltip(tooltip) {
    return {
      ...tooltip,
      confine: true,
      backgroundColor: T.surface,
      borderColor: T.border,
      borderWidth: 1,
      padding: [9, 11],
      textStyle: {
        ...(tooltip?.textStyle || {}),
        color: T.ink,
        fontFamily: 'Segoe UI, Arial, sans-serif',
        fontSize: 11,
      },
      extraCssText: 'border-radius:5px;box-shadow:0 7px 22px rgba(20,42,58,.12);',
      axisPointer: tooltip?.axisPointer ? {
        ...tooltip.axisPointer,
        lineStyle: { ...(tooltip.axisPointer.lineStyle || {}), color: '#9aaab6', width: 1, type: 'dashed' },
        shadowStyle: { ...(tooltip.axisPointer.shadowStyle || {}), color: 'rgba(24,59,86,.055)' },
      } : tooltip?.axisPointer,
    };
  }

  function styleLegend(legend) {
    return componentStyle(legend, {
      itemWidth: Math.min(Number(legend?.itemWidth) || 12, 14),
      itemHeight: Math.min(Number(legend?.itemHeight) || 8, 10),
      itemGap: Math.max(Number(legend?.itemGap) || 12, 12),
      textStyle: {
        ...(legend?.textStyle || {}),
        color: '#526778',
        fontSize: 9.5,
        fontWeight: 600,
      },
    });
  }

  function styleAxis(axis, isValueAxis) {
    const axisLabel = {
      ...(axis?.axisLabel || {}),
      color: '#5e7181',
      fontFamily: 'Segoe UI, Arial, sans-serif',
      fontSize: Math.max(9.5, Number(axis?.axisLabel?.fontSize) || 0),
      hideOverlap: true,
    };
    const nameTextStyle = {
      ...(axis?.nameTextStyle || {}),
      color: '#70808f',
      fontFamily: 'Segoe UI, Arial, sans-serif',
      fontSize: 9,
      fontWeight: 500,
    };

    return {
      ...axis,
      axisLine: {
        ...(axis?.axisLine || {}),
        show: axis?.axisLine?.show === false ? false : true,
        lineStyle: { ...(axis?.axisLine?.lineStyle || {}), color: T.axis, width: 1 },
      },
      axisTick: { ...(axis?.axisTick || {}), show: false },
      axisLabel,
      nameTextStyle,
      splitLine: isValueAxis
        ? { ...(axis?.splitLine || {}), show: axis?.splitLine?.show === false ? false : true, lineStyle: { ...(axis?.splitLine?.lineStyle || {}), color: T.grid, width: 1, type: 'solid' } }
        : { ...(axis?.splitLine || {}), show: false },
    };
  }

  function normalizedDataItems(series, seriesColor) {
    const data = toArray(series?.data);
    if (!data.some((item) => item && typeof item === 'object' && !Array.isArray(item) && item.itemStyle)) return undefined;

    return data.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item) || !item.itemStyle) return item;
      const rawValue = Array.isArray(item.value) ? Number(item.value[1]) : Number(item.value);
      const signedColor = Number.isFinite(rawValue) && rawValue < 0
        ? T.negative
        : Number.isFinite(rawValue) && /gap|variance|chênh|waterfall/i.test(String(series?.name || ''))
          ? T.positive
          : seriesColor;
      return {
        ...item,
        itemStyle: {
          ...item.itemStyle,
          color: signedColor,
          borderColor: item.itemStyle.borderColor || 'transparent',
          borderWidth: Number(item.itemStyle.borderWidth) || 0,
        },
      };
    });
  }

  function styleBar(series, index, horizontal, categoryCount, chartId) {
    const color = semanticColor(series?.name, index);
    const data = normalizedDataItems(series, color);
    const isOverview = chartId === 'chart_p1_trend';
    const label = { ...(series?.label || {}) };

    if (!isOverview) {
      if (horizontal) {
        label.show = series?.label?.show !== false;
        label.position = series?.label?.position || 'right';
        label.color = '#4f6475';
        label.fontSize = 9;
        label.fontWeight = 600;
      } else if (categoryCount > 6) {
        label.show = false;
      }
    }

    return {
      ...series,
      barMaxWidth: Math.min(Number(series?.barMaxWidth) || 24, 26),
      itemStyle: {
        ...(series?.itemStyle || {}),
        color,
        borderRadius: horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0],
      },
      emphasis: {
        ...(series?.emphasis || {}),
        focus: series?.emphasis?.focus || 'series',
        itemStyle: {
          ...(series?.emphasis?.itemStyle || {}),
          shadowBlur: 0,
          opacity: 0.9,
        },
      },
      label,
      labelLayout: { ...(series?.labelLayout || {}), hideOverlap: true },
      ...(data ? { data } : {}),
    };
  }

  function styleLine(series, index, chartId) {
    const color = semanticColor(series?.name, index);
    const target = /target|kế hoạch|plan/i.test(String(series?.name || ''));
    const isOverview = chartId === 'chart_p1_trend';
    return {
      ...series,
      smooth: target ? false : (series?.smooth ?? 0.08),
      showSymbol: isOverview ? series?.showSymbol : false,
      symbol: series?.symbol || 'circle',
      symbolSize: Math.min(Number(series?.symbolSize) || 5, 6),
      lineStyle: {
        ...(series?.lineStyle || {}),
        color,
        width: target ? 2 : Math.min(Math.max(Number(series?.lineStyle?.width) || 2, 2), 2.4),
        type: target ? 'dashed' : (series?.lineStyle?.type || 'solid'),
      },
      itemStyle: {
        ...(series?.itemStyle || {}),
        color,
        borderColor: T.surface,
        borderWidth: 1.5,
      },
      emphasis: { ...(series?.emphasis || {}), focus: series?.emphasis?.focus || 'series' },
      labelLayout: { ...(series?.labelLayout || {}), hideOverlap: true },
    };
  }

  function stylePie(series) {
    const data = toArray(series?.data).map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
      return {
        ...item,
        itemStyle: {
          ...(item.itemStyle || {}),
          color: T.palette[index % T.palette.length],
          borderColor: T.surface,
          borderWidth: 2,
        },
      };
    });

    return {
      ...series,
      avoidLabelOverlap: true,
      itemStyle: { ...(series?.itemStyle || {}), borderColor: T.surface, borderWidth: 2 },
      label: {
        ...(series?.label || {}),
        show: true,
        position: 'outside',
        color: '#4f6475',
        fontFamily: 'Segoe UI, Arial, sans-serif',
        fontSize: 9.5,
        fontWeight: 600,
        formatter: series?.label?.formatter || '{b}  {d}%',
      },
      labelLine: {
        ...(series?.labelLine || {}),
        show: true,
        length: 8,
        length2: 5,
        lineStyle: { ...(series?.labelLine?.lineStyle || {}), color: '#b5c0c9', width: 1 },
      },
      data,
    };
  }

  function styleTreemap(series) {
    return {
      ...series,
      breadcrumb: { ...(series?.breadcrumb || {}), show: false },
      itemStyle: {
        ...(series?.itemStyle || {}),
        borderColor: '#ffffff',
        borderWidth: 2,
        gapWidth: 2,
      },
      label: {
        ...(series?.label || {}),
        fontFamily: 'Segoe UI, Arial, sans-serif',
        fontWeight: 650,
      },
      upperLabel: {
        ...(series?.upperLabel || {}),
        fontFamily: 'Segoe UI, Arial, sans-serif',
        fontWeight: 700,
      },
    };
  }

  function styleSeries(series, index, context) {
    if (series?.type === 'bar') return styleBar(series, index, context.horizontal, context.categoryCount, context.chartId);
    if (series?.type === 'line') return styleLine(series, index, context.chartId);
    if (series?.type === 'pie') return stylePie(series);
    if (series?.type === 'treemap') return styleTreemap(series);
    return {
      ...series,
      itemStyle: { ...(series?.itemStyle || {}), color: series?.itemStyle?.color || semanticColor(series?.name, index) },
      labelLayout: { ...(series?.labelLayout || {}), hideOverlap: true },
    };
  }

  function applyAccountingStyle(chartId) {
    const chart = window.charts?.instances?.[chartId];
    if (!chart || chart.isDisposed?.()) return;
    const option = chart.getOption?.();
    if (!option || !toArray(option.series).length) return;

    const xAxes = toArray(option.xAxis);
    const yAxes = toArray(option.yAxis);
    const horizontal = yAxes.some((axis) => axis?.type === 'category') && xAxes.some((axis) => axis?.type === 'value');
    const categoryAxis = horizontal
      ? yAxes.find((axis) => axis?.type === 'category')
      : xAxes.find((axis) => axis?.type === 'category');
    const categoryCount = toArray(categoryAxis?.data).length;

    const patch = {
      backgroundColor: 'transparent',
      textStyle: {
        ...(option.textStyle || {}),
        color: T.ink,
        fontFamily: 'Segoe UI, Arial, sans-serif',
      },
      animationDuration: Math.min(Number(option.animationDuration) || 220, 240),
      tooltip: toArray(option.tooltip).map(styleTooltip),
      legend: toArray(option.legend).map(styleLegend),
      xAxis: xAxes.map((axis) => styleAxis(axis, axis?.type === 'value')),
      yAxis: yAxes.map((axis) => styleAxis(axis, axis?.type === 'value')),
      series: toArray(option.series).map((series, index) => styleSeries(series, index, {
        horizontal,
        categoryCount,
        chartId,
      })),
    };

    chart.setOption(patch, false, true);
  }

  function chartIdsForPage(pageId) {
    const configured = PAGE_CHARTS[pageId] || [];
    const visible = [...document.querySelectorAll(`#view_${pageId} .chart-container[id]`)].map((node) => node.id);
    return [...new Set([...configured, ...visible])];
  }

  function applyPage(pageId) {
    chartIdsForPage(pageId).forEach(applyAccountingStyle);
  }

  function applyAllRendered() {
    Object.keys(window.charts?.instances || {}).forEach(applyAccountingStyle);
  }

  function wrapRenderers(charts) {
    Object.entries(PAGE_METHODS).forEach(([method, pageId]) => {
      if (typeof charts[method] !== 'function' || charts[method].__accountingV9Wrapped) return;
      const original = charts[method].bind(charts);
      const wrapped = (...args) => {
        const result = original(...args);
        window.setTimeout(() => applyPage(pageId), 0);
        return result;
      };
      wrapped.__accountingV9Wrapped = true;
      charts[method] = wrapped;
    });
  }

  function install() {
    const charts = window.charts;
    const engine = window.dataEngine;
    const app = window.app;
    if (!charts || !engine || !app || !window.echarts || !window.__vikodaFidelityV4Installed) return false;
    if (window.__vikodaAccountingChartsV9Installed) return true;
    window.__vikodaAccountingChartsV9Installed = true;

    document.body.classList.add('accounting-report-v9');
    wrapRenderers(charts);

    if (!engine.__accountingV9Subscribed && typeof engine.subscribe === 'function') {
      engine.__accountingV9Subscribed = true;
      engine.subscribe(() => {
        window.setTimeout(() => applyPage(window.app?.activePage || 'page_01'), 0);
      });
    }

    document.addEventListener('vikoda:pagechange', (event) => {
      const pageId = event.detail?.pageId || window.app?.activePage || 'page_01';
      window.setTimeout(() => applyPage(pageId), 0);
    });

    [0, 120, 350, 800, 1500].forEach((delay) => window.setTimeout(applyAllRendered, delay));
    return true;
  }

  function wait(attempt = 0) {
    if (install()) return;
    if (attempt < 200) window.setTimeout(() => wait(attempt + 1), 50);
  }

  wait();
})();
