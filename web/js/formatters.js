/**
 * Shared display formatters for dashboard KPIs and summaries.
 * Keep units and precision consistent across every presentation layer.
 */
(() => {
  'use strict';

  function formatMillion(value) {
    return `${Number(value || 0).toLocaleString('en-US', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} tr`;
  }

  function formatPercent(value, { signed = false } = {}) {
    const number = Number(value || 0);
    const prefix = signed && number > 0 ? '+' : '';
    return `${prefix}${number.toFixed(1)}%`;
  }

  const formatters = { formatMillion, formatPercent };

  if (typeof window !== 'undefined') window.VikodaFormatters = formatters;
  if (typeof module !== 'undefined' && module.exports) module.exports = formatters;
})();
