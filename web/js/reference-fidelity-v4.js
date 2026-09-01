/**
 * VIKODA SELL-IN — SCREENSHOT FIDELITY V4
 * Exact analytical composition derived from the supplied Power BI reference pages.
 * Reuses the canonical VikodaDataEngine; no ETL formulas are duplicated or changed.
 */
(() => {
  'use strict';

  const C = {
    navy: '#0b304d',
    blue: '#2f67e8',
    gray: '#bcc8d2',
    orange: '#d97706',
    teal: '#147f76',
    purple: '#7344e8',
    green: '#0ea65b',
    red: '#ec1726',
    ink: '#18344c',
    muted: '#647a8f',
    grid: '#dce5ec',
  };

  const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[char]);

  const fmt = (value, digits = 0) => Number(value || 0).toLocaleString('vi-VN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const fmtCompact = (value) => {
    const number = Number(value || 0);
    return Math.abs(number) >= 1000 ? `${fmt(number / 1000)}k` : fmt(number);
  };
  const signed = (value, digits = 0) => `${Number(value || 0) >= 0 ? '+' : ''}${fmt(value, digits)}`;

  function tooltip() {
    return {
      backgroundColor: 'rgba(11,48,77,.96)',
      borderColor: '#40637d',
      borderWidth: 1,
      textStyle: { color: '#fff', fontSize: 11 },
      padding: [7, 9],
      extraCssText: 'border-radius:3px;box-shadow:0 4px 12px rgba(0,0,0,.16);',
    };
  }

  function gridLine() {
    return { show: true, lineStyle: { color: C.grid, width: 1 } };
  }

  function axisText() {
    return { color: '#536b80', fontSize: 10 };
  }

  function legend() {
    return {
      top: 2,
      left: 2,
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 12,
      textStyle: { color: '#61758a', fontSize: 10 },
    };
  }

  function asOfMonth(engine) {
    const asOf = String(engine.metadata.as_of_date || engine.metadata.source_latest_date || engine.getReportingAsOfDate?.() || '');
    return Math.max(1, Math.min(12, Number(asOf.slice(5, 7)) || Number(engine.metadata.through_month) || 12));
  }

  function currentYear(engine) {
    const asOf = String(engine.metadata.as_of_date || engine.metadata.source_latest_date || engine.getReportingAsOfDate?.() || '');
    return Number(asOf.slice(0, 4)) || Number(engine.metadata.current_year) || new Date().getFullYear();
  }

  function setCardText(chartId, title, subtitle) {
    const card = document.getElementById(chartId)?.closest('.chart-card');
    if (!card) return;
    const titleNode = card.querySelector('.chart-title');
    const subtitleNode = card.querySelector('.chart-subtitle');
    if (titleNode) titleNode.textContent = title;
    if (subtitleNode) subtitleNode.textContent = subtitle;
  }

  function monthlyComboData(engine) {
    const base = engine.getMonthlyTrend();
    const through = asOfMonth(engine);
    const actual = base.actualSeries.map((value, index) => index < through ? Number(value || 0) : null);
    const ly = base.lySeries.map((value) => Number(value || 0));
    const target = base.targetSeries.map((value) => Number(value || 0));
    const attainment = target.map((value, index) => index < through && value > 0
      ? Number(((actual[index] || 0) / value * 100).toFixed(1))
      : null);
    const growth = ly.map((value, index) => index < through && value > 0
      ? Number((((actual[index] || 0) - value) / value * 100).toFixed(1))
      : null);
    return { labels: base.labels, actual, ly, target, attainment, growth, through };
  }

  function renderMonthlyCombo(charts, chartId) {
    const chart = charts.getOrCreate(chartId);
    if (!chart) return;
    const data = monthlyComboData(charts.engine);
    const isOverviewTrend = chartId === 'chart_p1_trend';
    const isProductTrend = chartId === 'chart_p3_trend';
    const valueLabelFontSize = isProductTrend ? 10 : 8.5;

    if (isOverviewTrend) {
      const futureStart = data.through < data.labels.length ? data.labels[data.through].replace('T', '') : null;
      const futureEnd = data.labels[data.labels.length - 1].replace('T', '');
      chart.setOption({
        animationDuration: 300,
        tooltip: {
          ...tooltip(),
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          formatter: (params) => {
            const index = Number.isInteger(params[0]?.dataIndex) ? params[0].dataIndex : 0;
            let html = `<strong>Tháng ${escapeHTML(params[0]?.name || '')}</strong><br/>`;
            params.forEach((p) => {
              if (p.value === null || p.value === undefined) return;
              html += `${p.marker}${escapeHTML(p.seriesName)}: <strong>${fmt(p.value)} tr</strong><br/>`;
            });
            if (data.attainment[index] !== null) html += `% đạt Target: <strong>${fmt(data.attainment[index], 1)}%</strong><br/>`;
            if (data.growth[index] !== null) html += `Tăng trưởng: <strong>${fmt(data.growth[index], 1)}%</strong>`;
            return html;
          },
        },
        legend: { ...legend(), data: ['Actual', 'Cùng kỳ', 'Target'] },
        grid: { left: 66, right: 34, top: 58, bottom: 42, containLabel: true },
        xAxis: {
          type: 'category',
          data: data.labels.map((label) => label.replace('T', '')),
          name: 'Tháng',
          nameLocation: 'middle',
          nameGap: 28,
          nameTextStyle: { color: C.muted, fontSize: 10 },
          axisLine: { lineStyle: { color: '#c8d3dc' } },
          axisTick: { show: false },
          axisLabel: { ...axisText(), fontSize: 10 },
        },
        yAxis: [{
          type: 'value',
          name: 'Doanh thu · triệu đồng',
          nameTextStyle: { color: C.muted, fontSize: 9, align: 'left' },
          splitNumber: 4,
          splitLine: gridLine(),
          axisLabel: { ...axisText(), formatter: (v) => v ? fmtCompact(v) : '0' },
        }],
        series: [
          {
            name: 'Actual', type: 'bar', barMaxWidth: 24, data: data.actual,
            itemStyle: { color: C.blue, borderRadius: [3, 3, 0, 0] },
            label: {
              show: true,
              position: 'top',
              distance: 5,
              fontSize: 9,
              formatter: (p) => {
                if (p.value === null || p.value === undefined) return '';
                const attained = data.attainment[p.dataIndex];
                if (attained === null) return fmtCompact(p.value);
                const state = attained >= 100 ? 'good' : attained >= 85 ? 'warn' : 'bad';
                return `{value|${fmtCompact(p.value)}}\n{${state}|${fmt(attained, 1)}%}`;
              },
              rich: {
                value: { color: '#496176', fontSize: 9, fontWeight: 600, lineHeight: 15 },
                good: { color: '#087f6d', backgroundColor: '#e7f6f2', borderRadius: 7, padding: [2, 5], fontSize: 8, fontWeight: 700 },
                warn: { color: '#9a5b00', backgroundColor: '#fff4d8', borderRadius: 7, padding: [2, 5], fontSize: 8, fontWeight: 700 },
                bad: { color: '#b43b42', backgroundColor: '#fdebed', borderRadius: 7, padding: [2, 5], fontSize: 8, fontWeight: 700 },
              },
            },
            labelLayout: { hideOverlap: true },
          },
          {
            name: 'Cùng kỳ', type: 'bar', barMaxWidth: 24, data: data.ly,
            itemStyle: { color: '#b7c2cc', borderRadius: [3, 3, 0, 0] },
          },
          {
            name: 'Target', type: 'line', data: data.target,
            symbol: 'none', smooth: .08,
            lineStyle: { color: C.orange, width: 2, type: 'dashed' },
            itemStyle: { color: C.orange },
            markArea: futureStart ? {
              silent: true,
              itemStyle: { color: 'rgba(31, 64, 91, 0.035)' },
              label: { show: true, position: 'insideTop', color: '#8a9aaa', fontSize: 9, formatter: 'Kế hoạch' },
              data: [[{ xAxis: futureStart }, { xAxis: futureEnd }]],
            } : undefined,
          },
        ],
      }, true);
      return;
    }

    chart.setOption({
      animationDuration: 300,
      tooltip: {
        ...tooltip(),
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params) => {
          let html = `<strong>${escapeHTML(params[0]?.name || '')}</strong><br/>`;
          params.forEach((p) => {
            if (p.value === null || p.value === undefined) return;
            const suffix = p.seriesName.includes('%') ? '%' : ' tr';
            html += `${p.marker}${escapeHTML(p.seriesName)}: <strong>${fmt(p.value, p.seriesName.includes('%') ? 1 : 0)}${suffix}</strong><br/>`;
          });
          return html;
        },
      },
      legend: { ...legend(), data: ['Actual', 'Cùng kỳ', 'Target', '% đạt Target', '% Growth'] },
      grid: isProductTrend
        ? { left: 72, right: 78, top: 54, bottom: 40, containLabel: true }
        : { left: 64, right: 72, top: 50, bottom: 36 },
      xAxis: {
        type: 'category',
        data: data.labels.map((label) => label.replace('T', '')),
        name: 'Tháng',
        nameLocation: 'middle',
        nameGap: 26,
        nameTextStyle: { color: C.ink, fontSize: 11 },
        axisLine: { lineStyle: { color: '#aebfcd' } },
        axisTick: { show: false },
        axisLabel: { ...axisText(), fontSize: 11 },
      },
      yAxis: [
        {
          type: 'value',
          name: 'Doanh thu (triệu đồng)',
          ...(isProductTrend ? { min: 0 } : {}),
          nameTextStyle: { color: C.muted, fontSize: 9 },
          splitLine: gridLine(),
          axisLabel: { ...axisText(), formatter: (v) => v ? `${fmt(v)} tr` : '-' },
        },
        {
          type: 'value',
          name: '% đạt Target / % Growth',
          splitLine: { show: false },
          axisLabel: { ...axisText(), formatter: (v) => `${fmt(v)}%` },
        },
      ],
      series: [
        {
          name: 'Actual', type: 'bar', barMaxWidth: isProductTrend ? 26 : 20, data: data.actual,
          itemStyle: { color: C.blue },
          label: {
            show: true,
            position: isProductTrend ? 'insideTop' : 'top',
            distance: isProductTrend ? 5 : 3,
            fontSize: valueLabelFontSize,
            fontWeight: isProductTrend ? 700 : 400,
            color: isProductTrend ? '#fff' : '#476078',
            formatter: (p) => p.value === null ? '' : (isProductTrend ? fmtCompact(p.value) : fmt(p.value)),
          },
        },
        { name: 'Cùng kỳ', type: 'bar', barMaxWidth: isProductTrend ? 26 : 20, data: data.ly, itemStyle: { color: C.gray } },
        { name: 'Target', type: 'bar', barMaxWidth: isProductTrend ? 26 : 20, data: data.target, itemStyle: { color: C.orange } },
        {
          name: '% đạt Target', type: 'line', yAxisIndex: 1, data: data.attainment,
          symbol: 'circle', symbolSize: isProductTrend ? 7 : 6, smooth: .12,
          lineStyle: { color: C.teal, width: 2.5 }, itemStyle: { color: C.teal },
          label: { show: true, position: 'top', fontSize: valueLabelFontSize, fontWeight: isProductTrend ? 600 : 400, color: '#375c5a', formatter: (p) => p.value === null ? '' : `${fmt(p.value)}%` },
          labelLayout: { hideOverlap: true },
        },
        {
          name: '% Growth', type: 'line', yAxisIndex: 1, data: data.growth,
          symbol: 'circle', symbolSize: isProductTrend ? 7 : 6, smooth: .1,
          lineStyle: { color: C.purple, width: 2.5 }, itemStyle: { color: C.purple },
          label: { show: true, position: 'bottom', fontSize: valueLabelFontSize, fontWeight: isProductTrend ? 600 : 400, color: '#5e3fb2', formatter: (p) => p.value === null ? '' : `${fmt(p.value)}%` },
          labelLayout: { hideOverlap: true },
        },
      ],
    }, true);
  }

  function aggregateActual(engine, dimension) {
    const map = new Map();
    engine.getFilteredFacts().forEach((row) => {
      const cust = engine.customers[row[1]] || {};
      const terr = engine.territories[row[3]] || {};
      const prod = engine.products[row[2]] || {};
      let label = 'Khác';
      if (dimension === 'vung') label = cust.vung || terr.vung || cust.mien || terr.mien || 'Khác';
      if (dimension === 'product') label = prod.short_name || prod.name || prod.group || row[2] || 'Khác';
      map.set(label, (map.get(label) || 0) + Number(row[4] || 0) / 1000000);
    });
    return [...map.entries()]
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .filter((item) => item.value !== 0)
      .sort((a, b) => b.value - a.value);
  }

  function renderTop5(charts, chartId, dimension, color) {
    const chart = charts.getOrCreate(chartId);
    if (!chart) return;
    const data = aggregateActual(charts.engine, dimension).slice(0, 5).reverse();
    const isRegionRanking = dimension === 'vung';
    chart.setOption({
      tooltip: { ...tooltip(), trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p) => `<strong>${escapeHTML(p[0]?.name || '')}</strong><br/>Actual: <strong>${fmt(p[0]?.value)} tr</strong>` },
      grid: isRegionRanking
        ? { left: 8, right: 76, top: 14, bottom: 31, containLabel: true }
        : { left: 132, right: 72, top: 14, bottom: 31 },
      xAxis: {
        type: 'value',
        name: 'Doanh thu (triệu đồng)',
        nameLocation: 'middle', nameGap: 27,
        splitLine: gridLine(), axisLabel: { ...axisText(), formatter: (v) => v ? `${fmt(v)} tr` : '-' },
      },
      yAxis: {
        type: 'category', data: data.map((d) => d.name),
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: isRegionRanking
          ? { ...axisText(), color: '#193b57', fontSize: 11, fontWeight: 600, width: 160, overflow: 'break', interval: 0, lineHeight: 14, margin: 10 }
          : { ...axisText(), color: '#263f55', width: 120, overflow: 'truncate' },
      },
      series: [{
        type: 'bar', barWidth: 20,
        data: data.map((d) => d.value), itemStyle: { color },
        label: { show: true, position: 'right', fontSize: 8.5, color: '#60778c', formatter: (p) => `${fmt(p.value)} tr` },
      }],
    }, true);
  }

  function configureOverview() {
    const page = document.getElementById('view_page_01');
    if (!page || page.dataset.fidelityConfigured) return;
    page.dataset.fidelityConfigured = 'true';
    const firstGrid = page.querySelector(':scope > .charts-grid-2-1');
    const secondGrid = page.querySelector(':scope > .charts-grid-2');
    const productCard = document.getElementById('chart_p1_product_mix')?.closest('.chart-card');
    const regionCard = document.getElementById('chart_p1_channel_mix')?.closest('.chart-card');
    const gapCard = document.getElementById('chart_p1_waterfall')?.closest('.chart-card');
    if (productCard && secondGrid) secondGrid.appendChild(productCard);
    if (regionCard && secondGrid) secondGrid.insertBefore(regionCard, secondGrid.firstChild);
    gapCard?.classList.add('reference-hidden-card');
    if (firstGrid) firstGrid.style.gridTemplateColumns = '1fr';
    setCardText('chart_p1_trend', 'Hiệu quả Sell-In theo tháng', 'Actual, cùng kỳ và Target · Chạm hoặc rê để xem tỷ lệ');
    setCardText('chart_p1_channel_mix', 'Top 5 vùng theo doanh thu', 'Xếp hạng theo Actual trong kỳ chọn · Đơn vị: triệu đồng');
    setCardText('chart_p1_product_mix', 'Top 5 nhóm sản phẩm', 'Đóng góp doanh thu theo nhóm sản phẩm · Đơn vị: triệu đồng');
  }

  function renderOverview(charts) {
    configureOverview();
    renderMonthlyCombo(charts, 'chart_p1_trend');
    renderTop5(charts, 'chart_p1_channel_mix', 'vung', C.blue);
    renderTop5(charts, 'chart_p1_product_mix', 'product', C.teal);
    const region = charts.instances.chart_p1_channel_mix;
    region?.off('click');
    region?.on('click', (params) => charts.engine.setFilter('vung', params.name));
  }

  function metricRowsByRegion(engine) {
    const map = new Map();
    const ensure = (mien, vung) => {
      const key = `${mien || 'Khác'}|||${vung || 'Khác'}`;
      if (!map.has(key)) map.set(key, { key, mien: mien || 'Khác', vung: vung || 'Khác', actual: 0, ly: 0, target: 0 });
      return map.get(key);
    };
    engine.getFilteredFacts().forEach((row) => {
      const cust = engine.customers[row[1]] || {};
      const terr = engine.territories[row[3]] || {};
      ensure(cust.mien || terr.mien, cust.vung || terr.vung).actual += Number(row[4] || 0) / 1000000;
    });
    engine.getLYFilteredFacts().forEach((row) => {
      const cust = engine.customers[row[1]] || {};
      const terr = engine.territories[row[3]] || {};
      ensure(cust.mien || terr.mien, cust.vung || terr.vung).ly += Number(row[4] || 0) / 1000000;
    });
    engine.getFilteredTargets().forEach((row) => {
      const cust = engine.customers[row[2]] || {};
      const terr = engine.territories[row[1]] || {};
      ensure(cust.mien || terr.mien, cust.vung || terr.vung).target += Number(row[3] || 0) / 1000000;
    });
    return [...map.values()].map((row) => ({
      ...row,
      growth: row.ly > 0 ? (row.actual - row.ly) / row.ly * 100 : (row.actual > 0 ? 100 : 0),
      attainment: row.target > 0 ? row.actual / row.target * 100 : 0,
      gap: row.actual - row.target,
    })).filter((row) => row.actual || row.ly || row.target).sort((a, b) => b.actual - a.actual);
  }

  function tableShell(id, title, subtitle) {
    const section = document.createElement('section');
    section.id = id;
    section.className = 'table-card reference-matrix-card';
    section.innerHTML = `<div class="reference-matrix-title">${escapeHTML(title)}</div><div class="reference-matrix-subtitle">${escapeHTML(subtitle)}</div><div class="reference-matrix-wrap"></div>`;
    return section;
  }

  function renderRegionMatrix(engine) {
    const card = document.getElementById('reference_region_matrix');
    const wrap = card?.querySelector('.reference-matrix-wrap');
    if (!wrap) return;
    const rows = metricRowsByRegion(engine);
    const totals = rows.reduce((a, r) => ({ actual: a.actual + r.actual, ly: a.ly + r.ly, target: a.target + r.target }), { actual: 0, ly: 0, target: 0 });
    const growth = totals.ly > 0 ? (totals.actual - totals.ly) / totals.ly * 100 : 0;
    const attainment = totals.target > 0 ? totals.actual / totals.target * 100 : 0;
    wrap.innerHTML = `<table class="reference-matrix"><thead><tr><th class="text-col">Miền</th><th class="text-col">Vùng</th><th>Actual kỳ chọn</th><th>Cùng kỳ</th><th>Tăng trưởng</th><th>Target kỳ chọn</th><th>% đạt Target</th><th>Gap Target</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${escapeHTML(r.mien)}</td><td>${escapeHTML(r.vung)}</td><td class="num">${fmt(r.actual)} tr</td><td class="num">${fmt(r.ly)} tr</td><td class="num ${r.growth >= 0 ? 'positive' : 'negative'}">${r.growth >= 0 ? '' : '('}${fmt(Math.abs(r.growth), 1)}%${r.growth >= 0 ? '' : ')'}</td><td class="num">${fmt(r.target)} tr</td><td class="num ${r.attainment >= 100 ? 'positive' : r.attainment < 85 ? 'negative' : ''}">${fmt(r.attainment, 1)}%</td><td class="num ${r.gap >= 0 ? 'positive' : 'negative'}">${r.gap >= 0 ? fmt(r.gap) : `(${fmt(Math.abs(r.gap))})`} tr</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="2">Total</td><td class="num">${fmt(totals.actual)} tr</td><td class="num">${fmt(totals.ly)} tr</td><td class="num">${fmt(growth, 1)}%</td><td class="num">${fmt(totals.target)} tr</td><td class="num">${fmt(attainment, 1)}%</td><td class="num">${totals.actual - totals.target >= 0 ? fmt(totals.actual - totals.target) : `(${fmt(Math.abs(totals.actual - totals.target))})`} tr</td></tr></tfoot></table>`;
  }

  function configureRegionPage() {
    const page = document.getElementById('view_page_04');
    if (!page || page.dataset.fidelityConfigured) return;
    page.dataset.fidelityConfigured = 'true';
    const primaryGrid = page.querySelector(':scope > .charts-grid-2');
    const volumeCard = document.getElementById('chart_p4_volume_trend')?.closest('.chart-card');
    [document.getElementById('chart_p4_treemap'), document.getElementById('chart_p4_priority_regions'), document.getElementById('chart_p4_pack_mix')].forEach((node) => node?.closest('.chart-card')?.classList.add('reference-hidden-card'));
    if (primaryGrid) primaryGrid.style.gridTemplateColumns = '1fr';
    if (volumeCard) {
      setCardText('chart_p4_volume_trend', '1 · XU HƯỚNG VÙNG - MIỀN · ACTUAL · CÙNG KỲ · TARGET', 'X · Tháng 1–12   |   CỘT · Doanh thu (triệu đồng)   |   ĐƯỜNG · % đạt Target · % Growth');
      if (!document.getElementById('reference_region_matrix')) {
        volumeCard.parentElement?.insertAdjacentElement('afterend', tableShell('reference_region_matrix', '2 · HIỆU QUẢ THEO MIỀN - VÙNG', 'Actual · Cùng kỳ · Tăng trưởng · Target · % đạt · Gap Target'));
      }
    }
  }

  function renderRegionPage(charts) {
    configureRegionPage();
    renderMonthlyCombo(charts, 'chart_p4_volume_trend');
    renderRegionMatrix(charts.engine);
  }

  function customerMetrics(engine) {
    const actual = new Map();
    const ly = new Map();
    const target = new Map();
    engine.getFilteredFacts().forEach((r) => actual.set(r[1], (actual.get(r[1]) || 0) + Number(r[4] || 0) / 1000000));
    engine.getLYFilteredFacts().forEach((r) => ly.set(r[1], (ly.get(r[1]) || 0) + Number(r[4] || 0) / 1000000));
    engine.getFilteredTargets().forEach((r) => target.set(r[2], (target.get(r[2]) || 0) + Number(r[3] || 0) / 1000000));
    const total = [...actual.values()].reduce((a, b) => a + b, 0);
    return [...new Set([...actual.keys(), ...ly.keys(), ...target.keys()])].map((key) => {
      const cust = engine.customers[key] || {};
      const a = actual.get(key) || 0;
      const l = ly.get(key) || 0;
      const t = target.get(key) || 0;
      return { key, code: cust.code || key, name: cust.name || key, actual: a, ly: l, target: t, growth: l > 0 ? (a - l) / l * 100 : (a > 0 ? 100 : 0), attainment: t > 0 ? a / t * 100 : 0, share: total > 0 ? a / total * 100 : 0 };
    }).filter((r) => r.actual > 0).sort((a, b) => (
      b.actual - a.actual
      || a.name.localeCompare(b.name, 'vi')
      || a.code.localeCompare(b.code, 'vi')
    ));
  }

  function renderCustomerTop(charts) {
    const chart = charts.getOrCreate('chart_p2_channel');
    if (!chart) return;
    const data = customerMetrics(charts.engine).slice(0, 12);
    const names = data.map((r) => r.name.length > 12 ? `${r.name.slice(0, 11)}…` : r.name);
    chart.setOption({
      tooltip: { ...tooltip(), trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { ...legend(), data: ['Actual', 'Cùng kỳ', 'Target', '% đạt Target', '% Growth'] },
      grid: { left: 58, right: 64, top: 50, bottom: 63 },
      xAxis: { type: 'category', data: names, name: 'Khách hàng', nameLocation: 'middle', nameGap: 48, axisTick: { show: false }, axisLine: { lineStyle: { color: '#afbfcc' } }, axisLabel: { ...axisText(), rotate: 34, interval: 0 } },
      yAxis: [
        { type: 'value', name: 'Doanh thu (triệu đồng)', splitLine: gridLine(), axisLabel: { ...axisText(), formatter: (v) => v ? `${fmt(v)} tr` : '-' } },
        { type: 'value', name: '% đạt / Growth', splitLine: { show: false }, axisLabel: { ...axisText(), formatter: (v) => `${fmt(v)}%` } },
      ],
      series: [
        { name: 'Actual', type: 'bar', barMaxWidth: 17, data: data.map((r) => Math.round(r.actual)), itemStyle: { color: C.blue } },
        { name: 'Cùng kỳ', type: 'bar', barMaxWidth: 17, data: data.map((r) => Math.round(r.ly)), itemStyle: { color: C.gray } },
        { name: 'Target', type: 'bar', barMaxWidth: 17, data: data.map((r) => Math.round(r.target)), itemStyle: { color: C.orange } },
        { name: '% đạt Target', type: 'line', yAxisIndex: 1, data: data.map((r) => Number(r.attainment.toFixed(1))), symbol: 'circle', symbolSize: 5, lineStyle: { color: C.teal, width: 2 }, itemStyle: { color: C.teal }, label: { show: true, position: 'top', fontSize: 8, formatter: (p) => `${fmt(p.value)}%` } },
        { name: '% Growth', type: 'line', yAxisIndex: 1, data: data.map((r) => Number(r.growth.toFixed(1))), symbol: 'circle', symbolSize: 5, lineStyle: { color: C.purple, width: 2 }, itemStyle: { color: C.purple }, label: { show: true, position: 'bottom', fontSize: 8, formatter: (p) => `${fmt(p.value)}%` } },
      ],
    }, true);
  }

  function renderCustomerShare(charts) {
    const chart = charts.getOrCreate('chart_p2_system_mt');
    if (!chart) return;
    const all = customerMetrics(charts.engine);
    const top12 = all.slice(0, 12).reduce((sum, r) => sum + r.actual, 0);
    const total = all.reduce((sum, r) => sum + r.actual, 0);
    const rest = Math.max(0, total - top12);
    chart.setOption({
      tooltip: { ...tooltip(), trigger: 'item', formatter: (p) => `${escapeHTML(p.name)}: <strong>${fmt(p.percent, 1)}%</strong><br/>${fmt(p.value)} tr` },
      legend: { bottom: 0, left: 'center', itemWidth: 9, itemHeight: 9, textStyle: { color: '#60758a', fontSize: 9 } },
      series: [{ type: 'pie', radius: ['46%', '69%'], center: ['50%', '47%'], label: { show: true, position: 'outside', color: '#667b90', fontSize: 9, formatter: '{b}' }, data: [{ name: 'Top 12 khách hàng', value: Math.round(top12), itemStyle: { color: '#10b7ad' } }, { name: 'Khách hàng còn lại', value: Math.round(rest), itemStyle: { color: '#294f54' } }] }],
    }, true);
  }

  function customerMatrixYear(engine) {
    const selectedEnd = String(engine.filters?.endDate || '');
    return Number(selectedEnd.slice(0, 4)) || currentYear(engine);
  }

  function customerMonthlyRows(engine, selected, year = customerMatrixYear(engine)) {
    const rows = new Map(selected.map((r) => [r.key, { ...r, months: Array(12).fill(0) }]));
    engine.getFilteredFacts({ ...engine.filters, startDate: `${year}-01-01`, endDate: `${year}-12-31` }).forEach((fact) => {
      if (!rows.has(fact[1])) return;
      const m = Number(String(fact[0]).slice(5, 7)) - 1;
      if (m >= 0 && m < 12) rows.get(fact[1]).months[m] += Number(fact[4] || 0) / 1000000;
    });
    return [...rows.values()];
  }

  function renderCustomerMatrix(engine) {
    const host = document.getElementById('reference_customer_matrix_wrap');
    if (!host) return;
    const selected = customerMetrics(engine);
    const year = customerMatrixYear(engine);
    const rows = customerMonthlyRows(engine, selected, year);
    const totals = Array(12).fill(0);
    rows.forEach((r) => r.months.forEach((v, i) => { totals[i] += v; }));
    const subtitle = host.closest('.chart-card')?.querySelector('.chart-subtitle');
    if (subtitle) subtitle.textContent = `${fmt(rows.length)} khách hàng có doanh thu · Sắp xếp theo Actual kỳ chọn`;
    host.innerHTML = `<table class="reference-matrix"><thead><tr><th>Mã KH</th><th class="text-col">Khách hàng</th>${Array.from({ length: 12 }, (_, i) => `<th>T${String(i + 1).padStart(2, '0')} ${year}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr><td>${escapeHTML(r.code)}</td><td>${escapeHTML(r.name)}</td>${r.months.map((v) => `<td class="num">${v ? `${fmt(v)} tr` : ''}</td>`).join('')}</tr>`).join('')}</tbody><tfoot><tr><td colspan="2">Total</td>${totals.map((v) => `<td class="num">${v ? `${fmt(v)} tr` : ''}</td>`).join('')}</tr></tfoot></table>`;
  }

  function configureCustomerPage() {
    const page = document.getElementById('view_page_02');
    if (!page || page.dataset.fidelityConfigured) return;
    page.dataset.fidelityConfigured = 'true';
    setCardText('chart_p2_channel', '1 · TOP 12 KHÁCH HÀNG · ACTUAL · CÙNG KỲ · TARGET', 'X · Top 12 theo Actual kỳ chọn   |   CỘT · Doanh thu   |   ĐƯỜNG · % đạt Target · % Growth');
    setCardText('chart_p2_system_mt', '2 · TỶ TRỌNG TOP 12 KHÁCH HÀNG', 'Top 12 so với tổng doanh số kỳ chọn');
    const movementCard = document.getElementById('chart_p2_movement')?.closest('.chart-card');
    movementCard?.classList.add('reference-hidden-card');
    const tableCard = document.getElementById('p2_customer_tbody')?.closest('.chart-card');
    if (tableCard) {
      const title = tableCard.querySelector('.chart-title');
      const subtitle = tableCard.querySelector('.chart-subtitle');
      if (title) title.textContent = '3 · KHÁCH HÀNG VÀ DIỄN BIẾN 12 THÁNG';
      if (subtitle) subtitle.textContent = 'Tất cả khách hàng có doanh thu theo bộ lọc hiện tại';
      const responsive = tableCard.querySelector('.table-responsive');
      if (responsive) {
        responsive.id = 'reference_customer_matrix_wrap';
        responsive.classList.add('reference-matrix-wrap');
        responsive.innerHTML = '';
      }
    }
  }

  function renderCustomerPage(charts) {
    configureCustomerPage();
    renderCustomerTop(charts);
    renderCustomerShare(charts);
    renderCustomerMatrix(charts.engine);
  }

  function productMonthlyRows(engine) {
    const year = currentYear(engine);
    const totals = new Map();
    const months = new Map();
    engine.getFilteredFacts({ ...engine.filters, startDate: `${year}-01-01`, endDate: `${year}-12-31` }).forEach((fact) => {
      const prod = engine.products[fact[2]] || {};
      const key = fact[2];
      const value = Number(fact[4] || 0) / 1000000;
      totals.set(key, (totals.get(key) || 0) + value);
      if (!months.has(key)) months.set(key, Array(12).fill(0));
      const m = Number(String(fact[0]).slice(5, 7)) - 1;
      if (m >= 0 && m < 12) months.get(key)[m] += value;
    });
    return [...totals.entries()].map(([key, total]) => {
      const prod = engine.products[key] || {};
      return { key, group: engine.normalizeProductGroup?.(prod.group) || prod.group || 'Khác', brand: prod.brand || 'Khác', sku: prod.short_name || prod.name || key, total, months: months.get(key) || Array(12).fill(0) };
    }).sort((a, b) => b.total - a.total).slice(0, 24);
  }

  function renderProductMatrix(engine) {
    const wrap = document.getElementById('reference_product_matrix_wrap');
    if (!wrap) return;
    const rows = productMonthlyRows(engine);
    const totals = Array(12).fill(0);
    rows.forEach((r) => r.months.forEach((v, i) => { totals[i] += v; }));
    const year = currentYear(engine);
    wrap.innerHTML = `<table class="reference-matrix"><thead><tr><th class="text-col">Group Brand</th><th>Brand</th><th class="text-col">SKU</th>${Array.from({ length: 12 }, (_, i) => `<th>T${String(i + 1).padStart(2, '0')} ${year}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr><td>${escapeHTML(r.group)}</td><td>${escapeHTML(r.brand)}</td><td>${escapeHTML(r.sku)}</td>${r.months.map((v) => `<td class="num">${v ? `${fmt(v)} tr` : ''}</td>`).join('')}</tr>`).join('')}</tbody><tfoot><tr><td colspan="3">Total</td>${totals.map((v) => `<td class="num">${v ? `${fmt(v)} tr` : ''}</td>`).join('')}</tr></tfoot></table>`;
  }

  function configureProductPage() {
    const page = document.getElementById('view_page_03');
    if (!page || page.dataset.fidelityConfigured) return;
    page.dataset.fidelityConfigured = 'true';
    setCardText('chart_p3_trend', '1 · XU HƯỚNG SẢN PHẨM 12 THÁNG', 'X · Tháng 1–12   |   CỘT · Doanh thu (triệu đồng; k = nghìn)   |   ĐƯỜNG · % đạt Target · % Growth');
    const trendCard = document.getElementById('chart_p3_trend')?.closest('.chart-card');
    [document.getElementById('chart_p3_brand'), document.getElementById('chart_p3_hero_skus'), document.getElementById('chart_p3_declining_skus')].forEach((node) => node?.closest('.chart-card')?.classList.add('reference-hidden-card'));
    const firstGrid = page.querySelector(':scope > .charts-grid-2');
    firstGrid?.classList.add('reference-product-trend-grid');
    trendCard?.classList.add('reference-product-trend-card');
    if (firstGrid && !document.getElementById('reference_product_matrix')) {
      firstGrid.insertAdjacentElement('afterend', tableShell('reference_product_matrix', '2 · GROUP BRAND - BRAND - SKU', 'Ma trận doanh thu 12 tháng theo Group Brand / Brand / SKU'));
      const wrap = document.querySelector('#reference_product_matrix .reference-matrix-wrap');
      if (wrap) wrap.id = 'reference_product_matrix_wrap';
    }
  }

  function renderProductPage(charts) {
    configureProductPage();
    renderMonthlyCombo(charts, 'chart_p3_trend');
    renderProductMatrix(charts.engine);
  }

  function dimensionMetrics(engine, level) {
    const map = new Map();
    const ensure = (name, mien = '') => {
      const key = name || 'Khác';
      if (!map.has(key)) map.set(key, { name: key, mien, actual: 0, ly: 0, target: 0 });
      return map.get(key);
    };
    const info = (fact, isTarget = false) => {
      const cust = engine.customers[fact[isTarget ? 2 : 1]] || {};
      const terr = engine.territories[fact[isTarget ? 1 : 3]] || {};
      const mien = cust.mien || terr.mien || 'Khác';
      const vung = cust.vung || terr.vung || mien;
      return { mien, name: level === 'mien' ? mien : vung };
    };
    engine.getFilteredFacts().forEach((r) => { const d = info(r); ensure(d.name, d.mien).actual += Number(r[4] || 0) / 1000000; });
    engine.getLYFilteredFacts().forEach((r) => { const d = info(r); ensure(d.name, d.mien).ly += Number(r[4] || 0) / 1000000; });
    engine.getFilteredTargets().forEach((r) => { const d = info(r, true); ensure(d.name, d.mien).target += Number(r[3] || 0) / 1000000; });
    return [...map.values()].map((r) => ({ ...r, growth: r.ly > 0 ? (r.actual - r.ly) / r.ly * 100 : 0, attainment: r.target > 0 ? r.actual / r.target * 100 : 0, gap: r.actual - r.target })).filter((r) => r.actual || r.ly || r.target);
  }

  function renderVarianceWaterfall(charts) {
    const chart = charts.getOrCreate('chart_p6_trend');
    if (!chart) return;
    const rows = dimensionMetrics(charts.engine, 'mien').sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap)).slice(0, 5);
    let cumulative = 0;
    const base = [];
    const change = [];
    rows.forEach((r) => {
      if (r.gap >= 0) {
        base.push(cumulative);
        change.push({ value: r.gap, raw: r.gap, itemStyle: { color: C.green } });
      } else {
        base.push(cumulative + r.gap);
        change.push({ value: Math.abs(r.gap), raw: r.gap, itemStyle: { color: C.red } });
      }
      cumulative += r.gap;
    });
    const total = cumulative;
    base.push(total >= 0 ? 0 : total);
    change.push({ value: Math.abs(total), raw: total, itemStyle: { color: '#10b7ad' } });
    const labels = [...rows.map((r) => r.name), 'Total'];
    chart.setOption({
      tooltip: { ...tooltip(), trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p) => { const item = p.find((x) => x.seriesName === 'Gap'); const raw = Number(item?.data?.raw ?? 0); return `<strong>${escapeHTML(p[0]?.name || '')}</strong><br/>Gap Target: <strong>${raw >= 0 ? '+' : ''}${fmt(raw)} tr</strong>`; } },
      grid: { left: 78, right: 20, top: 22, bottom: 58 },
      xAxis: { type: 'category', data: labels, axisTick: { show: false }, axisLine: { lineStyle: { color: '#afbfcc' } }, axisLabel: { ...axisText(), interval: 0, rotate: 0 } },
      yAxis: { type: 'value', name: 'Chênh lệch (triệu đồng)', splitLine: gridLine(), axisLabel: { ...axisText(), formatter: (v) => v ? `${fmt(v)} tr` : '-' } },
      series: [
        { name: 'Base', type: 'bar', stack: 'waterfall', silent: true, data: base, itemStyle: { color: 'transparent' }, emphasis: { itemStyle: { color: 'transparent' } } },
        { name: 'Gap', type: 'bar', stack: 'waterfall', barMaxWidth: 56, data: change, label: { show: true, position: 'bottom', color: '#243d52', fontSize: 9, formatter: (p) => { const raw = Number(p.data?.raw ?? 0); return `${raw >= 0 ? '+' : '('}${fmt(Math.abs(raw))}${raw >= 0 ? '' : ')'} tr`; } } },
      ],
    }, true);
  }

  function renderVarianceRegions(charts) {
    const chart = charts.getOrCreate('chart_p6_forecast');
    if (!chart) return;
    const data = dimensionMetrics(charts.engine, 'vung').sort((a, b) => a.gap - b.gap).slice(0, 10);
    chart.setOption({
      tooltip: { ...tooltip(), trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p) => `<strong>${escapeHTML(p[0]?.name || '')}</strong><br/>Gap Target: <strong>${signed(p[0]?.value)} tr</strong>` },
      grid: { left: 115, right: 65, top: 16, bottom: 32 },
      xAxis: { type: 'value', name: 'Gap Target (triệu đồng)', nameLocation: 'middle', nameGap: 26, splitLine: gridLine(), axisLabel: { ...axisText(), formatter: (v) => v ? `${fmt(v)} tr` : '-' } },
      yAxis: { type: 'category', data: data.map((d) => d.name), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { ...axisText(), color: '#273f54', width: 105, overflow: 'truncate' } },
      series: [{ type: 'bar', barWidth: 18, data: data.map((d) => ({ value: Math.round(d.gap), itemStyle: { color: d.gap >= 0 ? C.green : C.red } })), label: { show: true, position: 'right', color: '#536c82', fontSize: 8.5, formatter: (p) => `${signed(p.value)} tr` }, markLine: { silent: true, symbol: 'none', lineStyle: { color: '#8da2b4', width: 1 }, data: [{ xAxis: 0 }] } }],
    }, true);
    chart.off('click');
    chart.on('click', (params) => charts.engine.setFilter('vung', params.name));
  }

  function renderVarianceMatrix(engine) {
    const host = document.getElementById('early_warning_container');
    if (!host) return;
    const rows = dimensionMetrics(engine, 'vung').sort((a, b) => b.actual - a.actual);
    const totals = rows.reduce((a, r) => ({ actual: a.actual + r.actual, ly: a.ly + r.ly, target: a.target + r.target }), { actual: 0, ly: 0, target: 0 });
    const tg = totals.ly > 0 ? (totals.actual - totals.ly) / totals.ly * 100 : 0;
    const ta = totals.target > 0 ? totals.actual / totals.target * 100 : 0;
    host.innerHTML = `<div class="reference-matrix-wrap"><table class="reference-matrix"><thead><tr><th class="text-col">Miền</th><th class="text-col">Vùng</th><th>Actual kỳ chọn</th><th>Cùng kỳ</th><th>Tăng trưởng</th><th>Target kỳ chọn</th><th>% đạt Target</th><th>Gap Target</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${escapeHTML(r.mien)}</td><td>${escapeHTML(r.name)}</td><td class="num">${fmt(r.actual)} tr</td><td class="num">${fmt(r.ly)} tr</td><td class="num ${r.growth >= 0 ? 'positive' : 'negative'}">${fmt(r.growth, 1)}%</td><td class="num">${fmt(r.target)} tr</td><td class="num ${r.attainment >= 100 ? 'positive' : r.attainment < 85 ? 'negative' : ''}">${fmt(r.attainment, 1)}%</td><td class="num ${r.gap >= 0 ? 'positive' : 'negative'}">${r.gap >= 0 ? fmt(r.gap) : `(${fmt(Math.abs(r.gap))})`} tr</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="2">Total</td><td class="num">${fmt(totals.actual)} tr</td><td class="num">${fmt(totals.ly)} tr</td><td class="num">${fmt(tg, 1)}%</td><td class="num">${fmt(totals.target)} tr</td><td class="num">${fmt(ta, 1)}%</td><td class="num">${totals.actual - totals.target >= 0 ? fmt(totals.actual - totals.target) : `(${fmt(Math.abs(totals.actual - totals.target))})`} tr</td></tr></tfoot></table></div>`;
  }

  function configureVariancePage() {
    const page = document.getElementById('view_page_06');
    if (!page || page.dataset.fidelityConfigured) return;
    page.dataset.fidelityConfigured = 'true';
    setCardText('chart_p6_trend', '1 · ĐƠN VỊ GÂY THIẾU / VƯỢT TARGET', 'Đóng góp dương / âm so với Target kỳ chọn');
    setCardText('chart_p6_forecast', '2 · CHÊNH LỆCH THEO VÙNG', 'X · Vùng   |   Y · Gap Target (triệu đồng)');
    const detailCard = document.getElementById('early_warning_container')?.closest('.chart-card');
    if (detailCard) {
      const title = detailCard.querySelector('.chart-title');
      const sub = detailCard.querySelector('.chart-subtitle');
      if (title) title.textContent = '4 · CHI TIẾT NGUYÊN NHÂN CHÊNH LỆCH';
      if (sub) sub.textContent = 'Miền · Vùng · Actual · Cùng kỳ · Tăng trưởng · Target · % đạt · Gap';
    }
  }

  function renderVariancePage(charts) {
    configureVariancePage();
    renderVarianceWaterfall(charts);
    renderVarianceRegions(charts);
    renderVarianceMatrix(charts.engine);
  }

  function install() {
    const charts = window.charts;
    const engine = window.dataEngine;
    if (!charts || !engine || !window.app) return false;
    if (window.__vikodaFidelityV4Installed) return true;
    window.__vikodaFidelityV4Installed = true;

    configureOverview();
    configureRegionPage();
    configureCustomerPage();
    configureProductPage();
    configureVariancePage();

    charts.renderPage1 = () => renderOverview(charts);
    charts.renderPage2 = () => renderCustomerPage(charts);
    charts.renderPage3 = () => renderProductPage(charts);
    charts.renderPage4 = () => renderRegionPage(charts);
    charts.renderPage6 = () => renderVariancePage(charts);

    const updateAll = () => {
      if (!engine.raw) return;
      if (window.app.activePage === 'page_01') renderOverview(charts);
      else if (window.app.activePage === 'page_02') renderCustomerPage(charts);
      else if (window.app.activePage === 'page_03') renderProductPage(charts);
      else if (window.app.activePage === 'page_04') renderRegionPage(charts);
      else if (window.app.activePage === 'page_06') renderVariancePage(charts);
      charts.resizeAll();
    };

    if (!engine.__fidelityV4Subscribed) {
      engine.__fidelityV4Subscribed = true;
      engine.subscribe(updateAll);
    }

    const waitData = (attempt = 0) => {
      if (engine.raw) {
        window.app.render();
        window.setTimeout(() => { updateAll(); charts.resizeAll(); }, 80);
      } else if (attempt < 120) {
        window.setTimeout(() => waitData(attempt + 1), 100);
      }
    };
    waitData();
    return true;
  }

  function wait(attempt = 0) {
    if (window.__vikodaReferenceAnalyticsInstalled && install()) return;
    if (attempt < 160) window.setTimeout(() => wait(attempt + 1), 50);
  }

  wait();
})();
