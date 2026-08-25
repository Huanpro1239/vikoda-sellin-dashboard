/**
 * VIKODA SELL-IN — REFERENCE ANALYTICS V3
 *
 * This layer reshapes the existing ECharts presentation to mirror the supplied
 * Power BI reference: flat corporate colors, dense management views, variance
 * first analysis and page-specific management summaries. It deliberately reuses
 * VikodaDataEngine and does not change ETL or KPI business formulas.
 */
(() => {
  'use strict';

  const COLORS = {
    navy: '#0b304d',
    blue: '#2f67e8',
    blue2: '#5f87ed',
    cyan: '#1593c4',
    purple: '#7650e8',
    orange: '#e58a16',
    teal: '#19877e',
    green: '#1eaa63',
    red: '#df3e48',
    gray: '#9aabba',
    gray2: '#c5d0da',
    ink: '#18344c',
    muted: '#6c8093',
    grid: '#e7edf2',
  };

  const PALETTE = [COLORS.blue, COLORS.green, COLORS.orange, COLORS.purple, COLORS.cyan, '#d65b93'];

  const fmt = (value, digits = 0) => Number(value || 0).toLocaleString('vi-VN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

  const fmtTr = (value) => `${fmt(value)} Tr`;
  const fmtPct = (value) => `${Number(value || 0) >= 0 ? '+' : ''}${Number(value || 0).toFixed(1)}%`;

  function flatTooltip() {
    return {
      backgroundColor: 'rgba(11, 48, 77, .96)',
      borderColor: '#315b78',
      borderWidth: 1,
      textStyle: { color: '#fff', fontSize: 11 },
      padding: [7, 9],
      extraCssText: 'box-shadow:0 4px 12px rgba(0,0,0,.16);border-radius:3px;',
    };
  }

  function axisLabel() {
    return { color: '#5e7387', fontSize: 10 };
  }

  function categoryLabel() {
    return { color: '#314c62', fontSize: 10, fontWeight: 600 };
  }

  function splitLine() {
    return { show: true, lineStyle: { color: COLORS.grid, type: 'dashed', width: 1 } };
  }

  function legend(top = 3) {
    return {
      top,
      right: 6,
      itemWidth: 12,
      itemHeight: 7,
      itemGap: 14,
      textStyle: { color: '#526a7f', fontSize: 10, fontWeight: 600 },
    };
  }

  function setCardTitle(chartId, title, subtitle) {
    const chartNode = document.getElementById(chartId);
    const card = chartNode?.closest('.chart-card');
    if (!card) return;
    const titleNode = card.querySelector('.chart-title');
    const subtitleNode = card.querySelector('.chart-subtitle');
    if (titleNode) titleNode.textContent = title;
    if (subtitleNode) subtitleNode.textContent = subtitle;
  }

  function setCrossFilter(chartId, enabled = true) {
    const node = document.getElementById(chartId);
    if (node) node.dataset.crossFilter = String(enabled);
  }

  function sliceCurrentYear(data, engine) {
    const asOf = String(engine.metadata.as_of_date || engine.metadata.source_latest_date || engine.getReportingAsOfDate?.() || '');
    const through = Number(asOf.slice(5, 7)) || Number(engine.metadata.through_month) || data.labels.length;
    const count = Math.max(1, Math.min(data.labels.length, through));
    return {
      labels: data.labels.slice(0, count),
      actualSeries: data.actualSeries?.slice(0, count) || [],
      lySeries: data.lySeries?.slice(0, count) || [],
      targetSeries: data.targetSeries?.slice(0, count) || [],
      attainmentSeries: data.attainmentSeries?.slice(0, count) || [],
      vikodaSeries: data.vikodaSeries?.slice(0, count) || [],
      dtSeries: data.dtSeries?.slice(0, count) || [],
      vikodaShareSeries: data.vikodaShareSeries?.slice(0, count) || [],
      ketSeries: data.ketSeries?.slice(0, count) || [],
      thungSeries: data.thungSeries?.slice(0, count) || [],
      binhSeries: data.binhSeries?.slice(0, count) || [],
    };
  }

  function renderP1Trend() {
    const chart = this.getOrCreate('chart_p1_trend');
    if (!chart) return;
    const data = sliceCurrentYear(this.engine.getMonthlyTrend(), this.engine);
    const showLabels = data.labels.length <= 9;

    chart.setOption({
      animationDuration: 350,
      color: [COLORS.blue, COLORS.gray2, COLORS.orange, COLORS.teal],
      tooltip: {
        ...flatTooltip(),
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params) => {
          let html = `<strong>${this.escapeHTML(params[0]?.name || '')}</strong><br/>`;
          params.forEach((p) => {
            if (p.value === null || p.value === undefined) return;
            const suffix = p.seriesName.includes('%') ? '%' : ' Tr.đ';
            html += `${p.marker}${this.escapeHTML(p.seriesName)}: <strong>${fmt(p.value, p.seriesName.includes('%') ? 1 : 0)}${suffix}</strong><br/>`;
          });
          return html;
        },
      },
      legend: { ...legend(), data: ['Actual', 'Cùng kỳ', 'Target', '% đạt Target'] },
      grid: { left: 50, right: 50, top: 42, bottom: 28 },
      xAxis: {
        type: 'category',
        data: data.labels,
        axisLine: { lineStyle: { color: '#aebdca' } },
        axisTick: { show: false },
        axisLabel: categoryLabel(),
      },
      yAxis: [
        {
          type: 'value',
          name: 'Doanh thu (Tr.đ)',
          nameTextStyle: { color: COLORS.muted, fontSize: 9 },
          splitLine: splitLine(),
          axisLabel: axisLabel(),
        },
        {
          type: 'value',
          name: '% đạt',
          min: 0,
          splitLine: { show: false },
          axisLabel: { ...axisLabel(), formatter: '{value}%' },
        },
      ],
      series: [
        {
          name: 'Actual',
          type: 'bar',
          barMaxWidth: 24,
          data: data.actualSeries,
          itemStyle: { color: COLORS.blue, borderRadius: [2, 2, 0, 0] },
          label: { show: showLabels, position: 'top', color: '#34516a', fontSize: 9, formatter: (p) => fmt(p.value) },
        },
        {
          name: 'Cùng kỳ',
          type: 'bar',
          barMaxWidth: 24,
          data: data.lySeries,
          itemStyle: { color: '#b7c4cf', borderRadius: [2, 2, 0, 0] },
        },
        {
          name: 'Target',
          type: 'line',
          data: data.targetSeries,
          symbol: 'circle',
          symbolSize: 5,
          lineStyle: { color: COLORS.orange, width: 2, type: 'dashed' },
          itemStyle: { color: COLORS.orange },
        },
        {
          name: '% đạt Target',
          type: 'line',
          yAxisIndex: 1,
          data: data.attainmentSeries,
          symbol: 'none',
          lineStyle: { color: COLORS.teal, width: 2 },
          itemStyle: { color: COLORS.teal },
        },
      ],
    }, true);
  }

  function renderP1ProductMix() {
    const chart = this.getOrCreate('chart_p1_product_mix');
    if (!chart) return;
    const data = this.engine.getProductGroupMix().slice().sort((a, b) => b.value - a.value);
    const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0);
    const colored = data.map((item, index) => ({ ...item, itemStyle: { color: PALETTE[index % PALETTE.length] } }));

    chart.setOption({
      tooltip: { ...flatTooltip(), trigger: 'item', formatter: (p) => `${this.escapeHTML(p.name)}<br/><strong>${fmtTr(p.value)}</strong> · ${p.percent}%` },
      legend: {
        orient: 'vertical',
        right: 3,
        top: 'middle',
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 9,
        textStyle: { color: '#4f667a', fontSize: 9.5 },
      },
      graphic: [
        { type: 'text', left: '29%', top: '43%', style: { text: fmt(total), textAlign: 'center', fill: COLORS.ink, font: '700 18px Segoe UI' } },
        { type: 'text', left: '29%', top: '52%', style: { text: 'TR.Đ ACTUAL', textAlign: 'center', fill: COLORS.muted, font: '600 9px Segoe UI' } },
      ],
      series: [{
        name: 'Group Brand',
        type: 'pie',
        radius: ['50%', '72%'],
        center: ['31%', '49%'],
        minAngle: 2,
        avoidLabelOverlap: true,
        label: {
          show: true,
          formatter: (p) => p.percent >= 5 ? `${p.percent}%` : '',
          color: '#fff',
          fontWeight: 700,
          fontSize: 9,
          position: 'inside',
        },
        data: colored,
      }],
    }, true);
    chart.off('click');
    chart.on('click', (params) => this.engine.setFilter('productGroup', params.name));
    setCrossFilter('chart_p1_product_mix');
  }

  function renderP1ChannelMix() {
    const chart = this.getOrCreate('chart_p1_channel_mix');
    if (!chart) return;
    const raw = this.engine.getChannelMix().slice().sort((a, b) => a.value - b.value);
    const total = raw.reduce((sum, item) => sum + Number(item.value || 0), 0);

    chart.setOption({
      tooltip: { ...flatTooltip(), trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p) => {
        const row = raw[p[0]?.dataIndex] || {};
        const share = total > 0 ? Number(row.value || 0) / total * 100 : 0;
        return `<strong>${this.escapeHTML(row.name || '')}</strong><br/>Actual: <strong>${fmtTr(row.value)}</strong><br/>Tỷ trọng: <strong>${share.toFixed(1)}%</strong>`;
      } },
      grid: { left: 45, right: 78, top: 18, bottom: 24 },
      xAxis: { type: 'value', splitLine: splitLine(), axisLabel: axisLabel(), name: 'Tr.đ', nameTextStyle: { color: COLORS.muted, fontSize: 9 } },
      yAxis: { type: 'category', data: raw.map((d) => d.name), axisTick: { show: false }, axisLine: { show: false }, axisLabel: categoryLabel() },
      series: [{
        name: 'Actual',
        type: 'bar',
        barWidth: 18,
        data: raw.map((d, i) => ({ value: d.value, itemStyle: { color: PALETTE[i % PALETTE.length], borderRadius: [0, 2, 2, 0] } })),
        label: {
          show: true,
          position: 'right',
          color: '#3a566d',
          fontSize: 9,
          formatter: (p) => {
            const value = Number(p.value || 0);
            const share = total > 0 ? value / total * 100 : 0;
            return `${fmt(value)} · ${share.toFixed(1)}%`;
          },
        },
      }],
    }, true);
    chart.off('click');
    chart.on('click', (params) => this.engine.setFilter('channel', params.name));
    setCrossFilter('chart_p1_channel_mix');
  }

  function renderP1Gap() {
    const chart = this.getOrCreate('chart_p1_waterfall');
    if (!chart) return;
    const data = this.engine.getRegionGapWaterfall().filter((d) => d.name && Number.isFinite(Number(d.value))).sort((a, b) => a.value - b.value);

    chart.setOption({
      tooltip: { ...flatTooltip(), trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p) => {
        const row = data[p[0]?.dataIndex] || {};
        const status = Number(row.value || 0) >= 0 ? 'Vượt Target' : 'Hụt Target';
        return `<strong>${this.escapeHTML(row.name || '')}</strong><br/>${status}: <strong>${row.value >= 0 ? '+' : ''}${fmtTr(row.value)}</strong>`;
      } },
      grid: { left: 86, right: 58, top: 16, bottom: 24 },
      xAxis: {
        type: 'value',
        splitLine: splitLine(),
        axisLabel: axisLabel(),
        name: 'Gap (Tr.đ)',
        nameTextStyle: { color: COLORS.muted, fontSize: 9 },
      },
      yAxis: {
        type: 'category',
        data: data.map((d) => d.name),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { ...categoryLabel(), fontSize: 9.5 },
      },
      series: [{
        type: 'bar',
        barWidth: 17,
        data: data.map((d) => ({
          value: d.value,
          itemStyle: { color: d.value >= 0 ? COLORS.green : COLORS.red, borderRadius: d.value >= 0 ? [0, 2, 2, 0] : [2, 0, 0, 2] },
        })),
        label: {
          show: true,
          position: (p) => Number(p.value) >= 0 ? 'right' : 'left',
          color: '#3a556b',
          fontSize: 9,
          formatter: (p) => `${Number(p.value) >= 0 ? '+' : ''}${fmt(p.value)}`,
        },
        markLine: { silent: true, symbol: 'none', lineStyle: { color: '#7f93a4', width: 1 }, data: [{ xAxis: 0 }] },
      }],
    }, true);
    chart.off('click');
    chart.on('click', (params) => this.engine.setFilter('mien', params.name));
    setCrossFilter('chart_p1_waterfall');
  }

  function renderP2Channel() {
    const chart = this.getOrCreate('chart_p2_channel');
    if (!chart) return;
    const data = this.engine.getChannelPerformance();

    chart.setOption({
      tooltip: { ...flatTooltip(), trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { ...legend(), data: ['Actual', 'Cùng kỳ', 'YoY %'] },
      grid: { left: 50, right: 45, top: 42, bottom: 27 },
      xAxis: { type: 'category', data: data.categories, axisLine: { lineStyle: { color: '#aebdca' } }, axisTick: { show: false }, axisLabel: categoryLabel() },
      yAxis: [
        { type: 'value', splitLine: splitLine(), axisLabel: axisLabel(), name: 'Tr.đ', nameTextStyle: { color: COLORS.muted, fontSize: 9 } },
        { type: 'value', splitLine: { show: false }, axisLabel: { ...axisLabel(), formatter: '{value}%' } },
      ],
      series: [
        { name: 'Actual', type: 'bar', barMaxWidth: 25, data: data.actuals, itemStyle: { color: COLORS.blue, borderRadius: [2, 2, 0, 0] }, label: { show: true, position: 'top', fontSize: 9, color: '#36536a', formatter: (p) => fmt(p.value) } },
        { name: 'Cùng kỳ', type: 'bar', barMaxWidth: 25, data: data.lys, itemStyle: { color: '#bdc9d3', borderRadius: [2, 2, 0, 0] } },
        { name: 'YoY %', type: 'line', yAxisIndex: 1, data: data.yoys, symbol: 'circle', symbolSize: 5, lineStyle: { color: COLORS.orange, width: 2 }, itemStyle: { color: COLORS.orange } },
      ],
    }, true);
    chart.off('click');
    chart.on('click', (params) => this.engine.setFilter('channel', params.name));
    setCrossFilter('chart_p2_channel');
  }

  function renderP2SystemMT() {
    const chart = this.getOrCreate('chart_p2_system_mt');
    if (!chart) return;
    const data = this.engine.getSystemMTRevenue().slice(0, 10).sort((a, b) => a.value - b.value);
    chart.setOption({
      tooltip: { ...flatTooltip(), trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 92, right: 55, top: 16, bottom: 23 },
      xAxis: { type: 'value', splitLine: splitLine(), axisLabel: axisLabel() },
      yAxis: { type: 'category', data: data.map((d) => d.name), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { ...categoryLabel(), width: 82, overflow: 'truncate' } },
      series: [{ name: 'Actual', type: 'bar', barWidth: 16, data: data.map((d) => d.value), itemStyle: { color: COLORS.cyan, borderRadius: [0, 2, 2, 0] }, label: { show: true, position: 'right', color: '#3b566c', fontSize: 9, formatter: (p) => fmt(p.value) } }],
    }, true);
    chart.off('click');
    chart.on('click', (params) => this.engine.setFilter('systemMT', params.name));
    setCrossFilter('chart_p2_system_mt');
  }

  function renderP2Movement() {
    const chart = this.getOrCreate('chart_p2_movement');
    if (!chart) return;
    const data = this.engine.getCustomerMovement();
    chart.setOption({
      tooltip: { ...flatTooltip(), trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { ...legend(), data: ['Khách hàng mới', 'Ngừng mua'] },
      grid: { left: 42, right: 20, top: 42, bottom: 27 },
      xAxis: { type: 'category', data: data.channels, axisLine: { lineStyle: { color: '#aebdca' } }, axisTick: { show: false }, axisLabel: categoryLabel() },
      yAxis: { type: 'value', minInterval: 1, splitLine: splitLine(), axisLabel: axisLabel() },
      series: [
        { name: 'Khách hàng mới', type: 'bar', barMaxWidth: 25, data: data.newCustomers, itemStyle: { color: COLORS.green, borderRadius: [2, 2, 0, 0] }, label: { show: true, position: 'top', fontSize: 9, color: COLORS.green } },
        { name: 'Ngừng mua', type: 'bar', barMaxWidth: 25, data: data.churnCustomers, itemStyle: { color: COLORS.red, borderRadius: [2, 2, 0, 0] }, label: { show: true, position: 'top', fontSize: 9, color: COLORS.red } },
      ],
    }, true);
  }

  function renderP3Trend() {
    const chart = this.getOrCreate('chart_p3_trend');
    if (!chart) return;
    const data = sliceCurrentYear(this.engine.getVikodaVsKDTTrend(), this.engine);
    chart.setOption({
      tooltip: { ...flatTooltip(), trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { ...legend(), data: ['Vikoda', 'Đảnh Thạnh', 'Tỷ trọng Vikoda'] },
      grid: { left: 50, right: 45, top: 42, bottom: 27 },
      xAxis: { type: 'category', data: data.labels, axisLine: { lineStyle: { color: '#aebdca' } }, axisTick: { show: false }, axisLabel: categoryLabel() },
      yAxis: [
        { type: 'value', splitLine: splitLine(), axisLabel: axisLabel(), name: 'Tr.đ', nameTextStyle: { color: COLORS.muted, fontSize: 9 } },
        { type: 'value', min: 0, max: 100, splitLine: { show: false }, axisLabel: { ...axisLabel(), formatter: '{value}%' } },
      ],
      series: [
        { name: 'Vikoda', type: 'bar', stack: 'brand', barMaxWidth: 30, data: data.vikodaSeries, itemStyle: { color: COLORS.blue } },
        { name: 'Đảnh Thạnh', type: 'bar', stack: 'brand', barMaxWidth: 30, data: data.dtSeries, itemStyle: { color: COLORS.green } },
        { name: 'Tỷ trọng Vikoda', type: 'line', yAxisIndex: 1, data: data.vikodaShareSeries, symbol: 'circle', symbolSize: 4, lineStyle: { color: COLORS.orange, width: 2 }, itemStyle: { color: COLORS.orange } },
      ],
    }, true);
  }

  function renderP3BrandMix() {
    const chart = this.getOrCreate('chart_p3_brand');
    if (!chart) return;
    const data = this.engine.getBrandMix().slice().sort((a, b) => b.value - a.value);
    const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0);
    chart.setOption({
      tooltip: { ...flatTooltip(), trigger: 'item', formatter: (p) => `${this.escapeHTML(p.name)}<br/><strong>${fmtTr(p.value)}</strong> · ${p.percent}%` },
      legend: { orient: 'vertical', right: 2, top: 'middle', itemWidth: 10, itemHeight: 10, itemGap: 9, textStyle: { color: '#50677b', fontSize: 9.5 } },
      graphic: [
        { type: 'text', left: '31%', top: '45%', style: { text: fmt(total), textAlign: 'center', fill: COLORS.ink, font: '700 18px Segoe UI' } },
        { type: 'text', left: '31%', top: '54%', style: { text: 'TR.Đ', textAlign: 'center', fill: COLORS.muted, font: '600 9px Segoe UI' } },
      ],
      series: [{ type: 'pie', radius: ['50%', '72%'], center: ['33%', '50%'], label: { show: true, position: 'inside', formatter: (p) => p.percent >= 6 ? `${p.percent}%` : '', color: '#fff', fontSize: 9, fontWeight: 700 }, data: data.map((d, i) => ({ ...d, itemStyle: { color: PALETTE[i % PALETTE.length] } })) }],
    }, true);
  }

  function renderHorizontalRank(chartId, rows, valueSuffix, positiveColor, negativeAware = false) {
    const chart = this.getOrCreate(chartId);
    if (!chart) return;
    const data = rows.slice().sort((a, b) => Number(a.value || 0) - Number(b.value || 0));
    chart.setOption({
      tooltip: { ...flatTooltip(), trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 118, right: 62, top: 15, bottom: 22 },
      xAxis: { type: 'value', splitLine: splitLine(), axisLabel: { ...axisLabel(), formatter: (v) => `${v}${valueSuffix === '%' ? '%' : ''}` } },
      yAxis: { type: 'category', data: data.map((d) => d.name), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { ...categoryLabel(), width: 108, overflow: 'truncate' } },
      series: [{
        type: 'bar',
        barWidth: 15,
        data: data.map((d) => ({ value: d.value, itemStyle: { color: negativeAware && Number(d.value) < 0 ? COLORS.red : positiveColor, borderRadius: [0, 2, 2, 0] } })),
        label: { show: true, position: 'right', color: '#3a566d', fontSize: 9, formatter: (p) => `${Number(p.value) >= 0 && valueSuffix === '%' ? '+' : ''}${fmt(p.value, valueSuffix === '%' ? 1 : 0)}${valueSuffix}` },
      }],
    }, true);
  }

  function renderP4PackagingTrend() {
    const chart = this.getOrCreate('chart_p4_volume_trend');
    if (!chart) return;
    const data = sliceCurrentYear(this.engine.getPackagingVolumeTrend(), this.engine);
    chart.setOption({
      tooltip: { ...flatTooltip(), trigger: 'axis', axisPointer: { type: 'line' } },
      legend: { ...legend(), data: ['Két', 'Thùng', 'Bình'] },
      grid: { left: 54, right: 20, top: 42, bottom: 27 },
      xAxis: { type: 'category', data: data.labels, boundaryGap: false, axisLine: { lineStyle: { color: '#aebdca' } }, axisTick: { show: false }, axisLabel: categoryLabel() },
      yAxis: { type: 'value', splitLine: splitLine(), axisLabel: axisLabel(), name: 'SL quy đổi', nameTextStyle: { color: COLORS.muted, fontSize: 9 } },
      series: [
        { name: 'Két', type: 'line', data: data.ketSeries, showSymbol: false, smooth: .18, lineStyle: { width: 2, color: COLORS.blue }, areaStyle: { color: 'rgba(47,103,232,.06)' }, itemStyle: { color: COLORS.blue } },
        { name: 'Thùng', type: 'line', data: data.thungSeries, showSymbol: false, smooth: .18, lineStyle: { width: 2, color: COLORS.green }, itemStyle: { color: COLORS.green } },
        { name: 'Bình', type: 'line', data: data.binhSeries, showSymbol: false, smooth: .18, lineStyle: { width: 2, color: COLORS.orange }, itemStyle: { color: COLORS.orange } },
      ],
    }, true);
  }

  function renderP4Treemap() {
    const chart = this.getOrCreate('chart_p4_treemap');
    if (!chart) return;
    const data = this.engine.getTerritoryTreemap();
    chart.setOption({
      tooltip: { ...flatTooltip(), formatter: (p) => `<strong>${this.escapeHTML(p.name)}</strong><br/>${fmtTr(p.value)}` },
      color: PALETTE,
      series: [{
        type: 'treemap',
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        label: { show: true, color: '#fff', fontSize: 10, fontWeight: 650, formatter: '{b}\n{c} Tr' },
        upperLabel: { show: true, height: 22, color: '#fff', fontSize: 10, fontWeight: 700 },
        itemStyle: { borderColor: '#fff', borderWidth: 2, gapWidth: 1 },
        levels: [
          { itemStyle: { borderColor: '#fff', borderWidth: 2, gapWidth: 2 } },
          { colorSaturation: [0.38, 0.66], itemStyle: { borderColor: '#fff', borderWidth: 1, gapWidth: 1 } },
        ],
        data,
      }],
    }, true);
    chart.off('click');
    chart.on('click', (params) => {
      if (!params.data?.name) return;
      if (params.data.children) this.engine.setFilter('mien', params.data.name);
      else this.engine.setFilter('vung', params.data.name);
    });
    setCrossFilter('chart_p4_treemap');
  }

  function renderP4PackMix() {
    const chart = this.getOrCreate('chart_p4_pack_mix');
    if (!chart) return;
    const data = this.engine.getPackagingMix().slice().sort((a, b) => b.value - a.value);
    const total = data.reduce((sum, d) => sum + Number(d.value || 0), 0);
    chart.setOption({
      tooltip: { ...flatTooltip(), trigger: 'item', formatter: (p) => `${this.escapeHTML(p.name)}<br/><strong>${fmt(p.value)} đơn vị</strong> · ${p.percent}%` },
      legend: { bottom: 2, left: 'center', itemWidth: 10, itemHeight: 10, itemGap: 13, textStyle: { color: '#536a7e', fontSize: 9.5 } },
      graphic: [
        { type: 'text', left: 'center', top: '42%', style: { text: fmt(total), textAlign: 'center', fill: COLORS.ink, font: '700 17px Segoe UI' } },
        { type: 'text', left: 'center', top: '51%', style: { text: 'SL QUY ĐỔI', textAlign: 'center', fill: COLORS.muted, font: '600 9px Segoe UI' } },
      ],
      series: [{ type: 'pie', radius: ['49%', '70%'], center: ['50%', '47%'], label: { show: true, position: 'inside', formatter: (p) => p.percent >= 6 ? `${p.percent}%` : '', color: '#fff', fontSize: 9, fontWeight: 700 }, data: data.map((d, i) => ({ ...d, itemStyle: { color: PALETTE[i % PALETTE.length] } })) }],
    }, true);
  }

  function renderP4Attainment() {
    const chart = this.getOrCreate('chart_p4_priority_regions');
    if (!chart) return;
    const data = this.engine.getRegionTargetAttainment().slice().sort((a, b) => a.value - b.value);
    chart.setOption({
      tooltip: { ...flatTooltip(), trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p) => `<strong>${this.escapeHTML(p[0]?.name || '')}</strong><br/>Đạt Target: <strong>${Number(p[0]?.value || 0).toFixed(1)}%</strong>` },
      grid: { left: 105, right: 55, top: 15, bottom: 22 },
      xAxis: { type: 'value', min: 0, splitLine: splitLine(), axisLabel: { ...axisLabel(), formatter: '{value}%' } },
      yAxis: { type: 'category', data: data.map((d) => d.name), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { ...categoryLabel(), width: 96, overflow: 'truncate' } },
      series: [{
        type: 'bar',
        barWidth: 15,
        data: data.map((d) => ({ value: d.value, itemStyle: { color: d.value >= 100 ? COLORS.green : d.value >= 85 ? COLORS.orange : COLORS.red, borderRadius: [0, 2, 2, 0] } })),
        label: { show: true, position: 'right', color: '#3a566d', fontSize: 9, formatter: (p) => `${Number(p.value).toFixed(1)}%` },
        markLine: { silent: true, symbol: 'none', lineStyle: { color: COLORS.navy, type: 'dashed', width: 1 }, label: { formatter: '100%', color: COLORS.navy, fontSize: 9 }, data: [{ xAxis: 100 }] },
      }],
    }, true);
    chart.off('click');
    chart.on('click', (params) => this.engine.setFilter('vung', params.name));
    setCrossFilter('chart_p4_priority_regions');
  }

  function summaryCard(label, value, note, tone = 'info') {
    return `<div class="analysis-summary-card ${tone}"><span class="analysis-summary-label">${label}</span><span class="analysis-summary-value">${value}</span><span class="analysis-summary-note">${note}</span></div>`;
  }

  function ensureSummaryGrid(pageId) {
    const page = document.getElementById(`view_${pageId}`);
    if (!page) return null;
    let grid = page.querySelector(':scope > .analysis-summary-grid');
    if (grid) return grid;
    grid = document.createElement('div');
    grid.className = 'analysis-summary-grid';
    if (pageId === 'page_01') {
      const alert = page.querySelector(':scope > .executive-alert-strip');
      alert?.insertAdjacentElement('afterend', grid);
    } else {
      page.insertBefore(grid, page.firstChild);
    }
    return grid;
  }

  function updateSummaryGrids(engine) {
    if (!engine?.raw) return;
    const kpis = engine.getSummaryKPIs();

    const p1 = ensureSummaryGrid('page_01');
    if (p1) {
      const gap = kpis.actualMillion - kpis.targetMillion;
      const gapTone = gap >= 0 ? 'good' : (kpis.attainment >= 85 ? 'warn' : 'bad');
      p1.innerHTML = [
        summaryCard('Gap vs Target', `${gap >= 0 ? '+' : ''}${fmtTr(gap)}`, `${kpis.attainment.toFixed(1)}% kế hoạch`, gapTone),
        summaryCard('Chênh lệch cùng kỳ', `${kpis.yoyAbsolute >= 0 ? '+' : ''}${fmtTr(kpis.yoyAbsolute)}`, `${fmtPct(kpis.yoy)} YoY`, kpis.yoy >= 0 ? 'good' : 'bad'),
        summaryCard('Khách hàng hoạt động', fmt(kpis.distinctCustomers), `Cùng kỳ ${fmt(kpis.distinctLYCustomers)} KH`, 'info'),
        summaryCard('Bình quân / KH', fmtTr(kpis.distinctCustomers ? kpis.actualMillion / kpis.distinctCustomers : 0), 'Doanh thu kỳ chọn', 'info'),
      ].join('');
    }

    const p4 = ensureSummaryGrid('page_04');
    if (p4) {
      const region = engine.getRegionTargetAttainment();
      const best = region.slice().sort((a, b) => b.value - a.value)[0];
      const weak = region.slice().sort((a, b) => a.value - b.value)[0];
      const pack = engine.getPackagingMix();
      const packTotal = pack.reduce((s, d) => s + Number(d.value || 0), 0);
      const topPack = pack.slice().sort((a, b) => b.value - a.value)[0];
      p4.innerHTML = [
        summaryCard('Vùng đạt tốt nhất', best ? `${best.name} · ${best.value.toFixed(1)}%` : '—', 'Xếp theo % đạt Target', best?.value >= 100 ? 'good' : 'warn'),
        summaryCard('Vùng cần ưu tiên', weak ? `${weak.name} · ${weak.value.toFixed(1)}%` : '—', 'Thấp nhất trong kỳ', weak?.value >= 85 ? 'warn' : 'bad'),
        summaryCard('Tổng sản lượng quy đổi', fmt(packTotal), 'Két / Thùng / Bình', 'info'),
        summaryCard('Quy cách chủ lực', topPack ? topPack.name : '—', topPack ? `${fmt(topPack.value)} đơn vị` : 'Không có dữ liệu', 'info'),
      ].join('');
    }

    const p2 = ensureSummaryGrid('page_02');
    if (p2) {
      const topCustomers = engine.getTopCustomers(12, 'all');
      const movement = engine.getCustomerMovement();
      const newCount = (movement.newCustomers || []).reduce((s, v) => s + Number(v || 0), 0);
      const churnCount = (movement.churnCustomers || []).reduce((s, v) => s + Number(v || 0), 0);
      const top = topCustomers[0];
      const declining = engine.getTopCustomers(100, 'drop').filter((c) => Number(c.diff || 0) < 0);
      p2.innerHTML = [
        summaryCard('Khách hàng số 1', top ? top.name : '—', top ? `${fmtTr(top.actual)} · ${top.share}% đóng góp` : 'Không có dữ liệu', 'info'),
        summaryCard('Khách hàng mới', fmt(newCount), 'Phát sinh mua trong kỳ', newCount >= churnCount ? 'good' : 'warn'),
        summaryCard('Khách ngừng mua', fmt(churnCount), 'Không phát sinh mua kỳ này', churnCount > newCount ? 'bad' : 'warn'),
        summaryCard('KH giảm doanh thu', fmt(declining.length), 'Ưu tiên chăm sóc / phục hồi', declining.length ? 'bad' : 'good'),
      ].join('');
    }

    const p3 = ensureSummaryGrid('page_03');
    if (p3) {
      const heroes = engine.getHeroSKUs(8);
      const declining = engine.getDecliningSKUs(30);
      const brands = engine.getBrandMix();
      const topBrand = brands.slice().sort((a, b) => b.value - a.value)[0];
      const topSku = heroes[0];
      p3.innerHTML = [
        summaryCard('SKU dẫn đầu', topSku ? topSku.name : '—', topSku ? fmtTr(topSku.value) : 'Không có dữ liệu', 'info'),
        summaryCard('Group Brand dẫn đầu', topBrand ? topBrand.name : '—', topBrand ? fmtTr(topBrand.value) : 'Không có dữ liệu', 'info'),
        summaryCard('SKU giảm YoY', fmt(declining.filter((d) => d.value < 0).length), 'Danh sách cần xử lý', declining.some((d) => d.value < 0) ? 'bad' : 'good'),
        summaryCard('Sản lượng quy đổi', fmt(kpis.totalConvertedQty), `${fmtPct(kpis.volumeYoY)} vs cùng kỳ`, kpis.volumeYoY >= 0 ? 'good' : 'bad'),
      ].join('');
    }
  }

  function ensureSalesManagementPanel() {
    const page = document.getElementById('view_page_05');
    if (!page) return null;
    let panel = document.getElementById('sales_management_panel');
    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = 'sales_management_panel';
    panel.className = 'sales-management-panel';
    panel.innerHTML = `
      <div class="analysis-summary-grid" id="sales_management_summary"></div>
      <div class="sales-management-grid">
        <section class="chart-card">
          <div class="chart-card-header"><span class="chart-title">1 · Hiệu quả đơn vị quản lý</span><span class="chart-subtitle">Actual so với Target theo Vùng</span></div>
          <div id="chart_sales_region" class="chart-container" data-cross-filter="true"></div>
        </section>
        <section class="chart-card">
          <div class="chart-card-header"><span class="chart-title">2 · Hiệu quả theo Kênh</span><span class="chart-subtitle">Actual · Cùng kỳ · tăng trưởng</span></div>
          <div id="chart_sales_channel" class="chart-container" data-cross-filter="true"></div>
        </section>
      </div>`;
    page.insertBefore(panel, page.firstChild);
    return panel;
  }

  function renderSalesManagement(charts, engine) {
    if (!engine?.raw) return;
    ensureSalesManagementPanel();
    const facts = engine.getFilteredFacts();
    const lyFacts = engine.getLYFilteredFacts();
    const targets = engine.getFilteredTargets();
    const byRegion = new Map();
    const byChannel = new Map();

    const ensure = (map, key) => {
      if (!map.has(key)) map.set(key, { name: key, actual: 0, ly: 0, target: 0 });
      return map.get(key);
    };

    facts.forEach((row) => {
      const cust = engine.customers[row[1]] || {};
      const terr = engine.territories[row[3]] || {};
      const region = cust.vung || terr.vung || cust.mien || terr.mien || 'Khác';
      const channel = cust.channel || 'GT';
      ensure(byRegion, region).actual += Number(row[4] || 0) / 1000000;
      ensure(byChannel, channel).actual += Number(row[4] || 0) / 1000000;
    });

    lyFacts.forEach((row) => {
      const cust = engine.customers[row[1]] || {};
      const terr = engine.territories[row[3]] || {};
      const region = cust.vung || terr.vung || cust.mien || terr.mien || 'Khác';
      const channel = cust.channel || 'GT';
      ensure(byRegion, region).ly += Number(row[4] || 0) / 1000000;
      ensure(byChannel, channel).ly += Number(row[4] || 0) / 1000000;
    });

    targets.forEach((row) => {
      const cust = engine.customers[row[2]] || {};
      const terr = engine.territories[row[1]] || {};
      const region = cust.vung || terr.vung || cust.mien || terr.mien || 'Khác';
      const channel = cust.channel || 'GT';
      ensure(byRegion, region).target += Number(row[3] || 0) / 1000000;
      ensure(byChannel, channel).target += Number(row[3] || 0) / 1000000;
    });

    const regions = [...byRegion.values()].filter((d) => d.actual || d.target).sort((a, b) => b.actual - a.actual).slice(0, 12).reverse();
    const channels = [...byChannel.values()].filter((d) => d.actual || d.ly).sort((a, b) => b.actual - a.actual);

    const regionChart = charts.getOrCreate('chart_sales_region');
    if (regionChart) {
      regionChart.setOption({
        tooltip: { ...flatTooltip(), trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { ...legend(), data: ['Actual', 'Target'] },
        grid: { left: 112, right: 45, top: 42, bottom: 23 },
        xAxis: { type: 'value', splitLine: splitLine(), axisLabel: axisLabel() },
        yAxis: { type: 'category', data: regions.map((d) => d.name), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { ...categoryLabel(), width: 104, overflow: 'truncate' } },
        series: [
          { name: 'Actual', type: 'bar', barMaxWidth: 15, data: regions.map((d) => Math.round(d.actual)), itemStyle: { color: COLORS.blue } },
          { name: 'Target', type: 'bar', barMaxWidth: 15, data: regions.map((d) => Math.round(d.target)), itemStyle: { color: '#e8a348' } },
        ],
      }, true);
      regionChart.off('click');
      regionChart.on('click', (params) => engine.setFilter('vung', params.name));
    }

    const channelChart = charts.getOrCreate('chart_sales_channel');
    if (channelChart) {
      const yoys = channels.map((d) => d.ly > 0 ? Number(((d.actual - d.ly) / d.ly * 100).toFixed(1)) : 0);
      channelChart.setOption({
        tooltip: { ...flatTooltip(), trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { ...legend(), data: ['Actual', 'Cùng kỳ', 'YoY %'] },
        grid: { left: 48, right: 45, top: 42, bottom: 27 },
        xAxis: { type: 'category', data: channels.map((d) => d.name), axisLine: { lineStyle: { color: '#aebdca' } }, axisTick: { show: false }, axisLabel: categoryLabel() },
        yAxis: [
          { type: 'value', splitLine: splitLine(), axisLabel: axisLabel() },
          { type: 'value', splitLine: { show: false }, axisLabel: { ...axisLabel(), formatter: '{value}%' } },
        ],
        series: [
          { name: 'Actual', type: 'bar', barMaxWidth: 22, data: channels.map((d) => Math.round(d.actual)), itemStyle: { color: COLORS.blue } },
          { name: 'Cùng kỳ', type: 'bar', barMaxWidth: 22, data: channels.map((d) => Math.round(d.ly)), itemStyle: { color: '#bdc9d3' } },
          { name: 'YoY %', type: 'line', yAxisIndex: 1, data: yoys, symbol: 'circle', symbolSize: 5, lineStyle: { color: COLORS.orange, width: 2 }, itemStyle: { color: COLORS.orange } },
        ],
      }, true);
      channelChart.off('click');
      channelChart.on('click', (params) => engine.setFilter('channel', params.name));
    }

    const summary = document.getElementById('sales_management_summary');
    if (summary) {
      const kpi = engine.getSummaryKPIs();
      const regionBest = [...byRegion.values()].filter((d) => d.target > 0).map((d) => ({ ...d, attain: d.actual / d.target * 100 })).sort((a, b) => b.attain - a.attain)[0];
      const regionWeak = [...byRegion.values()].filter((d) => d.target > 0).map((d) => ({ ...d, attain: d.actual / d.target * 100 })).sort((a, b) => a.attain - b.attain)[0];
      summary.innerHTML = [
        summaryCard('Doanh thu quản lý', fmtTr(kpi.actualMillion), `${fmtPct(kpi.yoy)} vs cùng kỳ`, kpi.yoy >= 0 ? 'good' : 'bad'),
        summaryCard('Khách hàng hoạt động', fmt(kpi.distinctCustomers), `Bình quân ${fmtTr(kpi.dropSize)} / KH`, 'info'),
        summaryCard('Đơn vị dẫn đầu', regionBest ? regionBest.name : '—', regionBest ? `${regionBest.attain.toFixed(1)}% Target` : 'Chưa có Target', regionBest?.attain >= 100 ? 'good' : 'warn'),
        summaryCard('Đơn vị cần hỗ trợ', regionWeak ? regionWeak.name : '—', regionWeak ? `${regionWeak.attain.toFixed(1)}% Target` : 'Chưa có Target', regionWeak?.attain >= 85 ? 'warn' : 'bad'),
      ].join('');
    }
  }

  function decorateReferenceTitles() {
    setCardTitle('chart_p1_trend', '1 · Doanh thu Sell-In theo tháng', 'Actual · Cùng kỳ · Target · % đạt kế hoạch');
    setCardTitle('chart_p1_product_mix', '2 · Cơ cấu Group Brand', 'Tỷ trọng doanh thu trong kỳ chọn');
    setCardTitle('chart_p1_channel_mix', '3 · Doanh thu theo Kênh', 'Giá trị và tỷ trọng đóng góp');
    setCardTitle('chart_p1_waterfall', '4 · Gap Target theo Miền / Đơn vị', 'Âm = hụt kế hoạch · Dương = vượt kế hoạch');

    setCardTitle('chart_p4_volume_trend', '1 · Xu hướng sản lượng quy đổi', 'Két · Thùng · Bình theo tháng');
    setCardTitle('chart_p4_treemap', '2 · Cơ cấu doanh thu Miền - Vùng', 'Diện tích thể hiện mức đóng góp Actual');
    setCardTitle('chart_p4_priority_regions', '3 · Xếp hạng % đạt Target theo Vùng', 'Đỏ < 85% · Cam 85–99.9% · Xanh ≥ 100%');
    setCardTitle('chart_p4_pack_mix', '4 · Cơ cấu quy cách bao bì', 'Tỷ trọng sản lượng quy đổi');

    setCardTitle('chart_p2_channel', '1 · Hiệu quả Kênh phân phối', 'Actual · Cùng kỳ · tăng trưởng YoY');
    setCardTitle('chart_p2_system_mt', '2 · Xếp hạng hệ thống MT', 'Top hệ thống theo doanh thu Actual');
    setCardTitle('chart_p2_movement', '4 · Biến động khách hàng', 'Khách mới và khách ngừng mua theo Kênh');

    setCardTitle('chart_p3_trend', '1 · Xu hướng thương hiệu chủ lực', 'Vikoda · Đảnh Thạnh · tỷ trọng Vikoda');
    setCardTitle('chart_p3_brand', '2 · Cơ cấu Group Brand / Brand', 'Tỷ trọng doanh thu danh mục');
    setCardTitle('chart_p3_hero_skus', '3 · Top SKU đóng góp doanh thu', 'Xếp hạng SKU theo Actual');
    setCardTitle('chart_p3_declining_skus', '4 · SKU suy giảm YoY', 'Ưu tiên SKU có mức giảm sâu nhất');

    setCardTitle('chart_p6_trend', '1 · Actual · Target · Forecast về đích', 'Theo chân trời Tháng / Quý / Năm');
    setCardTitle('chart_p6_forecast', '2 · Áp lực vận tốc theo đơn vị', 'Vận tốc hiện tại so với mức cần thiết để đạt Target');
  }

  function install(charts, engine, app) {
    if (window.__vikodaReferenceAnalyticsInstalled) return;
    window.__vikodaReferenceAnalyticsInstalled = true;
    document.body.classList.add('reference-dashboard-v3');

    charts.renderP1Trend = renderP1Trend.bind(charts);
    charts.renderP1ProductMix = renderP1ProductMix.bind(charts);
    charts.renderP1ChannelMix = renderP1ChannelMix.bind(charts);
    charts.renderP1Waterfall = renderP1Gap.bind(charts);

    charts.renderP2Channel = renderP2Channel.bind(charts);
    charts.renderP2SystemMT = renderP2SystemMT.bind(charts);
    charts.renderP2Movement = renderP2Movement.bind(charts);

    charts.renderP3VikodaVsKDT = renderP3Trend.bind(charts);
    charts.renderP3BrandMix = renderP3BrandMix.bind(charts);
    charts.renderP3HeroSKU = function patchedHero() {
      renderHorizontalRank.call(charts, 'chart_p3_hero_skus', engine.getHeroSKUs(9), ' Tr', COLORS.blue, false);
    };
    charts.renderP3DecliningSKU = function patchedDeclining() {
      renderHorizontalRank.call(charts, 'chart_p3_declining_skus', engine.getDecliningSKUs(9), '%', COLORS.red, true);
    };

    charts.renderP4PackagingTrend = renderP4PackagingTrend.bind(charts);
    charts.renderP4TerritoryTreemap = renderP4Treemap.bind(charts);
    charts.renderP4PackagingMix = renderP4PackMix.bind(charts);
    charts.renderP4RegionAttainment = renderP4Attainment.bind(charts);

    const originalTableRender = app.renderTablePage.bind(app);
    app.renderTablePage = function referenceTableRender() {
      originalTableRender();
      renderSalesManagement(charts, engine);
    };

    decorateReferenceTitles();
    ensureSalesManagementPanel();

    const update = () => {
      updateSummaryGrids(engine);
      renderSalesManagement(charts, engine);
    };

    if (!engine.__referenceAnalyticsSubscribed) {
      engine.__referenceAnalyticsSubscribed = true;
      engine.subscribe(update);
    }

    const waitForData = (attempt = 0) => {
      if (engine.raw) {
        update();
        app.render();
        window.setTimeout(() => charts.resizeAll(), 80);
        return;
      }
      if (attempt < 120) window.setTimeout(() => waitForData(attempt + 1), 100);
    };
    waitForData();
  }

  function wait(attempt = 0) {
    if (window.charts && window.dataEngine && window.app) {
      install(window.charts, window.dataEngine, window.app);
      return;
    }
    if (attempt < 150) window.setTimeout(() => wait(attempt + 1), 50);
  }

  wait();
})();
