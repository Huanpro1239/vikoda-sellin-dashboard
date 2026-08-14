/**
 * VIKODA WEB DASHBOARD - APACHE ECHARTS BUILDER & CROSS-FILTERING BUS
 */

class VikodaCharts {
  constructor(engine) {
    this.engine = engine;
    this.instances = {};
    this.colors = {
      blue: '#2563EB',
      gray: '#94A3B8',
      teal: '#0F766E',
      amber: '#D97706',
      red: '#DC2626',
      purple: '#7C3AED',
      cyan: '#0284C7',
      sky: '#38BDF8',
      palette: ['#2563EB', '#0F766E', '#D97706', '#7C3AED', '#0284C7', '#DC2626'],
    };

    window.addEventListener('resize', () => this.resizeAll());
  }

  getOrCreate(domId) {
    const el = document.getElementById(domId);
    if (!el) return null;
    if (!this.instances[domId]) {
      this.instances[domId] = echarts.init(el);
    }
    return this.instances[domId];
  }

  resizeAll() {
    Object.values(this.instances).forEach((chart) => chart && chart.resize());
  }

  // ------------------------------------------------------------------------
  // PAGE 01 CHARTS
  // ------------------------------------------------------------------------
  renderPage1() {
    this.renderP1Trend();
    this.renderP1ProductMix();
    this.renderP1ChannelMix();
    this.renderP1Waterfall();
  }

  renderP1Trend() {
    const chart = this.getOrCreate('chart_p1_trend');
    if (!chart) return;
    const data = this.engine.getMonthlyTrend();

    const option = {
      tooltip: {
        trigger: 'axis',
        formatter: (params) => {
          let res = `<strong>${params[0].name}</strong><br/>`;
          params.forEach((p) => {
            const val = p.value !== null && p.value !== undefined ? p.value.toLocaleString() : '-';
            const unit = p.seriesName.includes('%') ? '%' : ' Tr.đ';
            res += `<span style="color:${p.color}">●</span> ${p.seriesName}: <strong>${val}${unit}</strong><br/>`;
          });
          return res;
        },
      },
      legend: { data: ['Doanh thu Actual', 'Doanh thu LY', 'Target', '% Đạt Target'], top: 0 },
      grid: { left: '3%', right: '4%', bottom: '8%', top: '15%', containLabel: true },
      xAxis: { type: 'category', data: data.labels },
      yAxis: [
        { type: 'value', name: 'Triệu VNĐ', splitLine: { lineStyle: { color: '#F1F5F9' } } },
        { type: 'value', name: '% Đạt', splitLine: { show: false } },
      ],
      series: [
        { name: 'Doanh thu Actual', type: 'bar', data: data.actualSeries, itemStyle: { color: this.colors.blue, borderRadius: [4, 4, 0, 0] } },
        { name: 'Doanh thu LY', type: 'bar', data: data.lySeries, itemStyle: { color: this.colors.gray, borderRadius: [4, 4, 0, 0] } },
        { name: 'Target', type: 'line', data: data.targetSeries, lineStyle: { color: this.colors.amber, width: 2, type: 'dashed' }, itemStyle: { color: this.colors.amber } },
        { name: '% Đạt Target', type: 'line', yAxisIndex: 1, data: data.attainmentSeries, lineStyle: { color: this.colors.teal, width: 2 }, itemStyle: { color: this.colors.teal } },
      ],
    };
    chart.setOption(option);
  }

  renderP1ProductMix() {
    const chart = this.getOrCreate('chart_p1_product_mix');
    if (!chart) return;
    const data = this.engine.getProductGroupMix();

    const option = {
      tooltip: { trigger: 'item', formatter: '{b}: <strong>{c} Tr.đ</strong> ({d}%)' },
      legend: { bottom: 0, icon: 'circle' },
      color: [this.colors.blue, this.colors.cyan, this.colors.amber],
      series: [{
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['50%', '45%'],
        label: { show: false },
        data: data,
      }],
    };
    chart.setOption(option);

    // Cross-filtering
    chart.off('click');
    chart.on('click', (params) => {
      this.engine.setFilter('productGroup', params.name);
    });
  }

  renderP1ChannelMix() {
    const chart = this.getOrCreate('chart_p1_channel_mix');
    if (!chart) return;
    const data = this.engine.getChannelMix();

    const option = {
      tooltip: { trigger: 'item', formatter: '{b}: <strong>{c} Tr.đ</strong> ({d}%)' },
      legend: { bottom: 0, icon: 'circle' },
      color: [this.colors.blue, this.colors.teal, this.colors.purple, this.colors.amber, this.colors.gray],
      series: [{
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['50%', '45%'],
        label: { show: false },
        data: data,
      }],
    };
    chart.setOption(option);

    // Cross-filtering
    chart.off('click');
    chart.on('click', (params) => {
      this.engine.setFilter('channel', params.name);
    });
  }

  renderP1Waterfall() {
    const chart = this.getOrCreate('chart_p1_waterfall');
    if (!chart) return;
    const data = this.engine.getRegionGapWaterfall();

    const option = {
      tooltip: { trigger: 'axis', formatter: (p) => `${p[0].name}: <strong>${p[0].value.toLocaleString()} Tr.đ</strong>` },
      grid: { left: '3%', right: '4%', bottom: '8%', top: '10%', containLabel: true },
      xAxis: { type: 'category', data: data.map((d) => d.name) },
      yAxis: { type: 'value', name: 'Gap Target (Tr.đ)', splitLine: { lineStyle: { color: '#F1F5F9' } } },
      series: [{
        type: 'bar',
        data: data.map((d) => ({
          value: d.value,
          itemStyle: { color: d.value >= 0 ? this.colors.teal : this.colors.red, borderRadius: [4, 4, 0, 0] },
        })),
      }],
    };
    chart.setOption(option);

    // Cross-filtering
    chart.off('click');
    chart.on('click', (params) => {
      this.engine.setFilter('mien', params.name);
    });
  }

  // ------------------------------------------------------------------------
  // PAGE 02 CHARTS
  // ------------------------------------------------------------------------
  renderPage2() {
    this.renderP2Channel();
    this.renderP2SystemMT();
    this.renderP2Movement();
    this.renderP2CustomerTable();
  }

  renderP2Channel() {
    const chart = this.getOrCreate('chart_p2_channel');
    if (!chart) return;
    const data = this.engine.getChannelPerformance();

    const option = {
      tooltip: { trigger: 'axis' },
      legend: { data: ['Doanh thu Actual', 'Doanh thu LY', 'Tăng trưởng YoY %'], top: 0 },
      grid: { left: '3%', right: '4%', bottom: '8%', top: '15%', containLabel: true },
      xAxis: { type: 'category', data: data.categories },
      yAxis: [{ type: 'value', name: 'Triệu VNĐ' }, { type: 'value', name: 'YoY %' }],
      series: [
        { name: 'Doanh thu Actual', type: 'bar', data: data.actuals, itemStyle: { color: this.colors.blue, borderRadius: [4, 4, 0, 0] } },
        { name: 'Doanh thu LY', type: 'bar', data: data.lys, itemStyle: { color: this.colors.gray, borderRadius: [4, 4, 0, 0] } },
        { name: 'Tăng trưởng YoY %', type: 'line', yAxisIndex: 1, data: data.yoys, itemStyle: { color: this.colors.amber } },
      ],
    };
    chart.setOption(option);

    chart.off('click');
    chart.on('click', (params) => this.engine.setFilter('channel', params.name));
  }

  renderP2SystemMT() {
    const chart = this.getOrCreate('chart_p2_system_mt');
    if (!chart) return;
    const data = this.engine.getSystemMTRevenue();

    const option = {
      tooltip: { trigger: 'axis', formatter: (p) => `${p[0].name}: <strong>${p[0].value.toLocaleString()} Tr.đ</strong>` },
      grid: { left: '3%', right: '6%', bottom: '5%', top: '5%', containLabel: true },
      xAxis: { type: 'value', name: 'Triệu VNĐ' },
      yAxis: { type: 'category', data: data.map((d) => d.name).reverse() },
      series: [{
        type: 'bar',
        data: data.map((d) => d.value).reverse(),
        itemStyle: { color: this.colors.cyan, borderRadius: [0, 4, 4, 0] },
      }],
    };
    chart.setOption(option);

    chart.off('click');
    chart.on('click', (params) => this.engine.setFilter('systemMT', params.name));
  }

  renderP2Movement() {
    const chart = this.getOrCreate('chart_p2_movement');
    if (!chart) return;
    const data = this.engine.getCustomerMovement();

    const option = {
      tooltip: { trigger: 'axis' },
      legend: { data: ['Khách hàng Mới', 'Khách hàng Ngừng mua (Churn)'], top: 0 },
      grid: { left: '3%', right: '4%', bottom: '8%', top: '15%', containLabel: true },
      xAxis: { type: 'category', data: data.channels },
      yAxis: { type: 'value', name: 'Số lượng KH' },
      series: [
        { name: 'Khách hàng Mới', type: 'bar', data: data.newCustomers, itemStyle: { color: this.colors.teal, borderRadius: [4, 4, 0, 0] } },
        { name: 'Khách hàng Ngừng mua (Churn)', type: 'bar', data: data.churnCustomers, itemStyle: { color: this.colors.red, borderRadius: [4, 4, 0, 0] } },
      ],
    };
    chart.setOption(option);
  }

  renderP2CustomerTable() {
    const tbody = document.getElementById('p2_customer_tbody');
    if (!tbody) return;
    const data = this.engine.getTopCustomers(12);

    tbody.innerHTML = data.map((c, i) => `
      <tr>
        <td><strong>${i + 1}</strong></td>
        <td><strong>${c.name}</strong></td>
        <td><span class="meta-badge">${c.channel}</span></td>
        <td>${c.mien}</td>
        <td class="num"><strong>${c.actual.toLocaleString()}</strong></td>
        <td class="num">${c.ly.toLocaleString()}</td>
        <td class="num" style="color: ${c.yoy >= 0 ? '#16A34A' : '#DC2626'}; font-weight: 700;">${c.yoy >= 0 ? '+' : ''}${c.yoy}%</td>
        <td class="num">${c.share}%</td>
      </tr>
    `).join('');
  }

  // ------------------------------------------------------------------------
  // PAGE 03 CHARTS
  // ------------------------------------------------------------------------
  renderPage3() {
    this.renderP3Trend();
    this.renderP3Brand();
    this.renderP3HeroSKUs();
    this.renderP3DecliningSKUs();
  }

  renderP3Trend() {
    const chart = this.getOrCreate('chart_p3_trend');
    if (!chart) return;
    const data = this.engine.getVikodaVsKDTTrend();

    const option = {
      tooltip: { trigger: 'axis' },
      legend: { data: ['Vikoda Core', 'KDT Thương mại', 'Tỷ trọng Vikoda %'], top: 0 },
      grid: { left: '3%', right: '4%', bottom: '8%', top: '15%', containLabel: true },
      xAxis: { type: 'category', data: data.labels },
      yAxis: [{ type: 'value', name: 'Triệu VNĐ' }, { type: 'value', name: '%', max: 100 }],
      series: [
        { name: 'Vikoda Core', type: 'line', stack: 'total', areaStyle: { color: 'rgba(37, 99, 235, 0.2)' }, itemStyle: { color: this.colors.blue }, data: data.vikodaSeries },
        { name: 'KDT Thương mại', type: 'line', stack: 'total', areaStyle: { color: 'rgba(15, 118, 110, 0.2)' }, itemStyle: { color: this.colors.teal }, data: data.kdtSeries },
        { name: 'Tỷ trọng Vikoda %', type: 'line', yAxisIndex: 1, lineStyle: { color: this.colors.amber, width: 2 }, itemStyle: { color: this.colors.amber }, data: data.vikodaShareSeries },
      ],
    };
    chart.setOption(option);
  }

  renderP3Brand() {
    const chart = this.getOrCreate('chart_p3_brand');
    if (!chart) return;
    const data = this.engine.getBrandMix();

    const option = {
      tooltip: { trigger: 'item', formatter: '{b}: <strong>{c} Tr.đ</strong> ({d}%)' },
      legend: { bottom: 0, icon: 'circle' },
      color: this.colors.palette,
      series: [{
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['50%', '45%'],
        label: { show: false },
        data: data,
      }],
    };
    chart.setOption(option);
  }

  renderP3HeroSKUs() {
    const chart = this.getOrCreate('chart_p3_hero_skus');
    if (!chart) return;
    const data = this.engine.getHeroSKUs(10);

    const option = {
      tooltip: { trigger: 'axis', formatter: (p) => `${p[0].name}: <strong>${p[0].value.toLocaleString()} Tr.đ</strong>` },
      grid: { left: '3%', right: '6%', bottom: '5%', top: '5%', containLabel: true },
      xAxis: { type: 'value', name: 'Triệu VNĐ' },
      yAxis: { type: 'category', data: data.map((d) => d.name).reverse() },
      series: [{
        type: 'bar',
        data: data.map((d) => d.value).reverse(),
        itemStyle: { color: this.colors.blue, borderRadius: [0, 4, 4, 0] },
      }],
    };
    chart.setOption(option);
  }

  renderP3DecliningSKUs() {
    const chart = this.getOrCreate('chart_p3_declining_skus');
    if (!chart) return;
    const data = this.engine.getDecliningSKUs(10);

    const option = {
      tooltip: { trigger: 'axis', formatter: (p) => `${p[0].name}: <strong>${p[0].value}%</strong>` },
      grid: { left: '3%', right: '6%', bottom: '5%', top: '5%', containLabel: true },
      xAxis: { type: 'value', name: 'YoY %' },
      yAxis: { type: 'category', data: data.map((d) => d.name).reverse() },
      series: [{
        type: 'bar',
        data: data.map((d) => d.value).reverse(),
        itemStyle: { color: this.colors.red, borderRadius: [0, 4, 4, 0] },
      }],
    };
    chart.setOption(option);
  }

  // ------------------------------------------------------------------------
  // PAGE 04 CHARTS
  // ------------------------------------------------------------------------
  renderPage4() {
    this.renderP4VolumeTrend();
    this.renderP4Treemap();
    this.renderP4PriorityRegions();
    this.renderP4PackMix();
  }

  renderP4VolumeTrend() {
    const chart = this.getOrCreate('chart_p4_volume_trend');
    if (!chart) return;
    const data = this.engine.getPackagingVolumeTrend();

    const option = {
      tooltip: { trigger: 'axis' },
      legend: { data: ['Két (K)', 'Thùng (T)', 'Bình 19L (B)'], top: 0 },
      grid: { left: '3%', right: '4%', bottom: '8%', top: '15%', containLabel: true },
      xAxis: { type: 'category', data: data.labels },
      yAxis: { type: 'value', name: 'Sản lượng quy đổi' },
      series: [
        { name: 'Két (K)', type: 'line', data: data.ketSeries, itemStyle: { color: this.colors.blue }, smooth: true },
        { name: 'Thùng (T)', type: 'line', data: data.thungSeries, itemStyle: { color: this.colors.teal }, smooth: true },
        { name: 'Bình 19L (B)', type: 'line', data: data.binhSeries, itemStyle: { color: this.colors.amber }, smooth: true },
      ],
    };
    chart.setOption(option);
  }

  renderP4Treemap() {
    const chart = this.getOrCreate('chart_p4_treemap');
    if (!chart) return;
    const data = this.engine.getTerritoryTreemap();

    const option = {
      tooltip: { formatter: '{b}: <strong>{c} Tr.đ</strong>' },
      series: [{
        type: 'treemap',
        data: data,
        leafDepth: 1,
        levels: [
          { itemStyle: { borderColor: '#FFFFFF', borderWidth: 2, gapWidth: 2 } },
          { colorSaturation: [0.35, 0.5], itemStyle: { borderColorSaturation: 0.6, gapWidth: 1 } },
        ],
      }],
    };
    chart.setOption(option);

    chart.off('click');
    chart.on('click', (params) => this.engine.setFilter('vung', params.name));
  }

  renderP4PriorityRegions() {
    const chart = this.getOrCreate('chart_p4_priority_regions');
    if (!chart) return;
    const data = this.engine.getRegionTargetAttainment().slice(0, 10);

    const option = {
      tooltip: { trigger: 'axis', formatter: (p) => `${p[0].name}: <strong>${p[0].value}% Đạt Target</strong>` },
      grid: { left: '3%', right: '6%', bottom: '5%', top: '5%', containLabel: true },
      xAxis: { type: 'value', name: '% Đạt' },
      yAxis: { type: 'category', data: data.map((d) => d.name).reverse() },
      series: [{
        type: 'bar',
        data: data.map((d) => ({
          value: d.value,
          itemStyle: { color: d.value < 80 ? this.colors.red : this.colors.amber, borderRadius: [0, 4, 4, 0] },
        })).reverse(),
      }],
    };
    chart.setOption(option);

    chart.off('click');
    chart.on('click', (params) => this.engine.setFilter('vung', params.name));
  }

  renderP4PackMix() {
    const chart = this.getOrCreate('chart_p4_pack_mix');
    if (!chart) return;
    const data = this.engine.getPackagingMix();

    const option = {
      tooltip: { trigger: 'item', formatter: '{b}: <strong>{c}</strong> ({d}%)' },
      legend: { bottom: 0, icon: 'circle' },
      color: [this.colors.blue, this.colors.teal, this.colors.amber, this.colors.gray],
      series: [{
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['50%', '45%'],
        label: { show: false },
        data: data,
      }],
    };
    chart.setOption(option);

    chart.off('click');
    chart.on('click', (params) => this.engine.setFilter('packUnit', params.name));
  }

  // ------------------------------------------------------------------------
  // PAGE 06 CHARTS
  // ------------------------------------------------------------------------
  renderPage6() {
    this.renderP6Trend();
    this.renderP6Forecast();
    this.renderP6Shortfall();
  }

  renderP6Trend() {
    const chart = this.getOrCreate('chart_p6_trend');
    if (!chart) return;
    const data = this.engine.getMonthlyTrend();

    const option = {
      tooltip: { trigger: 'axis' },
      legend: { data: ['Doanh thu Sell In', 'Target', 'Run-rate dự báo'], top: 0 },
      grid: { left: '3%', right: '4%', bottom: '8%', top: '15%', containLabel: true },
      xAxis: { type: 'category', data: data.labels },
      yAxis: { type: 'value', name: 'Triệu VNĐ' },
      series: [
        { name: 'Doanh thu Sell In', type: 'line', data: data.actualSeries, itemStyle: { color: this.colors.blue }, lineStyle: { width: 3 } },
        { name: 'Target', type: 'line', data: data.targetSeries, itemStyle: { color: this.colors.gray }, lineStyle: { type: 'dashed' } },
        { name: 'Run-rate dự báo', type: 'line', data: data.actualSeries.map((v, i) => i === 7 ? v * 1.05 : v), itemStyle: { color: this.colors.teal }, lineStyle: { width: 2 } },
      ],
    };
    chart.setOption(option);
  }

  renderP6Forecast() {
    const chart = this.getOrCreate('chart_p6_forecast');
    if (!chart) return;
    const data = this.engine.getPlanForecastByRegion();

    const option = {
      tooltip: { trigger: 'axis', formatter: (p) => `${p[0].name}: <strong>${p[0].value}% Dự báo đạt Target</strong>` },
      grid: { left: '3%', right: '4%', bottom: '8%', top: '10%', containLabel: true },
      xAxis: { type: 'category', data: data.map((d) => d.name) },
      yAxis: { type: 'value', name: '% Dự báo' },
      series: [{
        type: 'bar',
        data: data.map((d) => ({
          value: d.value,
          itemStyle: { color: d.value >= 100 ? this.colors.teal : this.colors.amber, borderRadius: [4, 4, 0, 0] },
        })),
      }],
    };
    chart.setOption(option);
  }

  renderP6Shortfall() {
    const chart = this.getOrCreate('chart_p6_shortfall');
    if (!chart) return;
    const data = this.engine.getPlanShortfallByArea();

    const option = {
      tooltip: { trigger: 'axis' },
      legend: { data: ['Còn thiếu để đạt Target', 'Cần doanh thu mỗi ngày'], top: 0 },
      grid: { left: '3%', right: '6%', bottom: '5%', top: '15%', containLabel: true },
      xAxis: { type: 'value', name: 'Triệu VNĐ' },
      yAxis: { type: 'category', data: data.map((d) => d.vung).reverse() },
      series: [
        { name: 'Còn thiếu để đạt Target', type: 'bar', data: data.map((d) => d.shortfall).reverse(), itemStyle: { color: this.colors.red, borderRadius: [0, 4, 4, 0] } },
        { name: 'Cần doanh thu mỗi ngày', type: 'bar', data: data.map((d) => d.dailyRequired).reverse(), itemStyle: { color: this.colors.amber, borderRadius: [0, 4, 4, 0] } },
      ],
    };
    chart.setOption(option);
  }
}

window.charts = new VikodaCharts(window.dataEngine);
