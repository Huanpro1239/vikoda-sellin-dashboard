/**
 * VIKODA ACCOUNTING LAYOUT FIX V9.1
 * Repairs combo-chart plotting geometry after the V9 accounting visual layer.
 * Presentation only: no business measure or filter logic is recalculated.
 */
(() => {
  'use strict';

  const WATCHED_CHARTS = new Set([
    'chart_p2_channel',
    'chart_p3_trend',
  ]);

  const toArray = (value) => Array.isArray(value) ? value : (value ? [value] : []);
  const numeric = (value) => {
    if (value === null || value === undefined || value === '') return null;
    if (Array.isArray(value)) return numeric(value[value.length - 1]);
    if (typeof value === 'object' && value !== null && 'value' in value) return numeric(value.value);
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };

  function seriesValues(series) {
    return toArray(series?.data).map(numeric).filter((value) => value !== null);
  }

  function niceRevenueMax(value) {
    const raw = Math.max(1, Number(value || 0) * 1.12);
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const normalized = raw / magnitude;
    const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return step * magnitude;
  }

  function percentBounds(values) {
    if (!values.length) return null;
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = Math.max(20, maxValue - minValue);
    const pad = Math.max(10, range * 0.16);
    const min = Math.floor((Math.min(0, minValue) - pad) / 10) * 10;
    const max = Math.ceil((Math.max(100, maxValue) + pad) / 10) * 10;
    return { min, max: Math.max(min + 20, max) };
  }

  function latestNonNullIndex(series) {
    const data = toArray(series?.data);
    for (let index = data.length - 1; index >= 0; index -= 1) {
      if (numeric(data[index]) !== null) return index;
    }
    return -1;
  }

  function reducePercentLabelClutter(series) {
    const label = series?.label || {};
    if (!label.show) return series;
    const latestIndex = latestNonNullIndex(series);
    const originalFormatter = label.formatter;
    return {
      ...series,
      label: {
        ...label,
        position: 'top',
        distance: 7,
        formatter: (params) => {
          if (params.dataIndex !== latestIndex) return '';
          if (typeof originalFormatter === 'function') return originalFormatter(params);
          const value = numeric(params.value);
          return value === null ? '' : `${value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
        },
      },
      labelLayout: { ...(series?.labelLayout || {}), hideOverlap: true },
    };
  }

  function isPercentSeries(series) {
    return series?.type === 'line' && Number(series?.yAxisIndex || 0) > 0;
  }

  function repairComboChart(chartId) {
    const chart = window.charts?.instances?.[chartId];
    if (!chart || chart.isDisposed?.()) return;
    const option = chart.getOption?.();
    if (!option) return;

    const series = toArray(option.series);
    const hasBars = series.some((item) => item?.type === 'bar');
    const percentSeries = series.filter(isPercentSeries);
    if (!hasBars || !percentSeries.length) return;

    const grids = toArray(option.grid);
    if (grids.length !== 1) return;

    const revenueSeries = series.filter((item) => Number(item?.yAxisIndex || 0) === 0);
    const revenueValues = revenueSeries.flatMap(seriesValues);
    const rateValues = percentSeries.flatMap(seriesValues);
    const rateBounds = percentBounds(rateValues);
    const axes = toArray(option.yAxis);

    const grid = {
      ...(grids[0] || {}),
      top: Math.max(54, Number(grids[0]?.top) || 0),
      bottom: Math.max(48, Number(grids[0]?.bottom) || 0),
      containLabel: true,
    };

    const yAxis = axes.map((axis, index) => {
      if (index === 0 && revenueValues.length) {
        return {
          ...axis,
          min: 0,
          max: niceRevenueMax(Math.max(...revenueValues)),
        };
      }
      if (index > 0 && rateBounds) {
        return {
          ...axis,
          min: rateBounds.min,
          max: rateBounds.max,
          scale: false,
        };
      }
      return axis;
    });

    const patchedSeries = series.map((item) => isPercentSeries(item) ? reducePercentLabelClutter(item) : item);

    chart.setOption({ grid, yAxis, series: patchedSeries }, false, true);
    chart.resize?.();
  }

  function applyVisible() {
    WATCHED_CHARTS.forEach(repairComboChart);
  }

  function install() {
    if (!window.charts || !window.dataEngine || !window.app || !window.__vikodaAccountingChartsV9Installed) return false;
    if (window.__vikodaAccountingLayoutFixV91Installed) return true;
    window.__vikodaAccountingLayoutFixV91Installed = true;

    const engine = window.dataEngine;
    if (!engine.__accountingLayoutFixV91Subscribed && typeof engine.subscribe === 'function') {
      engine.__accountingLayoutFixV91Subscribed = true;
      engine.subscribe(() => window.setTimeout(applyVisible, 20));
    }

    document.addEventListener('vikoda:pagechange', () => window.setTimeout(applyVisible, 20));
    [30, 180, 500, 1000].forEach((delay) => window.setTimeout(applyVisible, delay));
    return true;
  }

  function wait(attempt = 0) {
    if (install()) return;
    if (attempt < 200) window.setTimeout(() => wait(attempt + 1), 50);
  }

  wait();
})();
