/**
 * VIKODA WEB DASHBOARD - ADVANCED ECHARTS VISUALIZATION ENGINE
 * Thiết kế giao diện biểu đồ điều hành cao cấp, thoáng đãng, sắc nét.
 */

class VikodaCharts {
  constructor(engine) {
    this.engine = engine;
    this.instances = {};
    this.colors = {
      blue: '#2563EB',
      blueLight: '#3B82F6',
      gray: '#94A3B8',
      grayLight: '#CBD5E1',
      teal: '#0F766E',
      tealLight: '#14B8A6',
      amber: '#D97706',
      amberLight: '#F59E0B',
      red: '#DC2626',
      redLight: '#EF4444',
      purple: '#7C3AED',
      purpleLight: '#8B5CF6',
      cyan: '#0284C7',
      cyanLight: '#38BDF8',
      palette: ['#2563EB', '#0D9488', '#D97706', '#7C3AED', '#0284C7', '#DC2626'],
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
  // TRANG 01: TỔNG QUAN ĐIỀU HÀNH
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
        axisPointer: { type: 'cross' },
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
      legend: {
        data: ['Doanh thu Actual', 'Doanh thu LY', 'Target', '% Đạt Target'],
        bottom: 0,
        left: 'center',
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 16,
        textStyle: { fontSize: 11, color: '#475569', fontWeight: 600 },
        icon: 'circle',
      },
      grid: { left: '3%', right: '3%', top: '36px', bottom: '40px', containLabel: true },
      xAxis: {
        type: 'category',
        data: data.labels,
        axisLabel: { color: '#475569', fontSize: 11, fontWeight: 600 },
        axisLine: { lineStyle: { color: '#E2E8F0' } },
      },
      yAxis: [
        {
          type: 'value',
          name: 'Doanh thu (Tr.đ)',
          nameTextStyle: { color: '#64748B', fontSize: 11, padding: [0, 0, 4, 0] },
          splitLine: { lineStyle: { type: 'dashed', color: '#F1F5F9' } },
          axisLabel: { color: '#64748B', fontSize: 10 },
        },
        {
          type: 'value',
          name: '% Đạt',
          nameTextStyle: { color: '#64748B', fontSize: 11, padding: [0, 0, 4, 0] },
          splitLine: { show: false },
          axisLabel: { color: '#0F766E', fontSize: 10, formatter: '{value}%' },
        },
      ],
      series: [
        {
          name: 'Doanh thu Actual',
          type: 'bar',
          barMaxWidth: 24,
          data: data.actualSeries,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: this.colors.blueLight },
              { offset: 1, color: this.colors.blue },
            ]),
            borderRadius: [4, 4, 0, 0],
          },
        },
        {
          name: 'Doanh thu LY',
          type: 'bar',
          barMaxWidth: 24,
          data: data.lySeries,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: this.colors.grayLight },
              { offset: 1, color: this.colors.gray },
            ]),
            borderRadius: [4, 4, 0, 0],
          },
        },
        {
          name: 'Target',
          type: 'line',
          data: data.targetSeries,
          lineStyle: { color: this.colors.amber, width: 2, type: 'dashed' },
          itemStyle: { color: this.colors.amber },
        },
        {
          name: '% Đạt Target',
          type: 'line',
          yAxisIndex: 1,
          data: data.attainmentSeries,
          lineStyle: { color: this.colors.teal, width: 2.5 },
          itemStyle: { color: this.colors.teal },
          symbol: 'circle',
          symbolSize: 6,
        },
      ],
    };
    chart.setOption(option);
  }

  renderP1ProductMix() {
    const chart = this.getOrCreate('chart_p1_product_mix');
    if (!chart) return;
    const data = this.engine.getProductGroupMix();

    const colorMap = {
      'Khoáng ngọt Đảnh Thạnh': '#10B981', // Xanh Lá Lục Bảo Rực Rỡ
      'Đảnh Thạnh': '#10B981',
      'Khoáng kiềm Vikoda': '#2563EB',     // Xanh Dương Đậm Hoàng Gia
      'Vikoda': '#2563EB',
      'KDT Thương Mại': '#F97316',         // Cam Rực Rỡ
      'KDT': '#F97316',
      'Sản phẩm khác': '#8B5CF6',          // Tím Đậm
      'Khác': '#8B5CF6',
    };

    const palette = ['#10B981', '#2563EB', '#F97316', '#8B5CF6', '#EC4899', '#06B6D4'];

    const coloredData = data.map((d, i) => ({
      name: d.name,
      value: d.value,
      itemStyle: { color: colorMap[d.name] || palette[i % palette.length] },
    }));

    const option = {
      tooltip: { trigger: 'item', formatter: '{b}: <strong>{c} Tr.đ</strong> ({d}%)' },
      legend: { bottom: 0, icon: 'circle', itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 11, color: '#475569', fontWeight: 600 } },
      series: [{
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['50%', '45%'],
        label: {
          show: true,
          position: 'inside',
          formatter: (p) => p.percent > 4 ? `${Math.round(p.percent)}%` : '',
          fontSize: 11,
          fontWeight: 800,
          color: '#FFFFFF',
        },
        data: coloredData,
      }],
    };
    chart.setOption(option);

    chart.off('click');
    chart.on('click', (params) => this.engine.setFilter('productGroup', params.name));
  }

  renderP1ChannelMix() {
    const chart = this.getOrCreate('chart_p1_channel_mix');
    if (!chart) return;
    const data = this.engine.getChannelMix();

    const channelColorMap = {
      'GT': '#2563EB',     // Xanh Dương Đậm
      'MT': '#10B981',     // Xanh Lá Lục Bảo
      'KA': '#8B5CF6',     // Tím Đậm
      'B2C': '#F97316',    // Cam Rực Rỡ
      'Khác': '#64748B',   // Xám
    };

    const palette = ['#2563EB', '#10B981', '#8B5CF6', '#F97316', '#64748B'];

    const coloredData = data.map((d, i) => ({
      name: d.name,
      value: d.value,
      itemStyle: { color: channelColorMap[d.name] || palette[i % palette.length] },
    }));

    const option = {
      tooltip: { trigger: 'item', formatter: '{b}: <strong>{c} Tr.đ</strong> ({d}%)' },
      legend: { bottom: 0, icon: 'circle', itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 11, color: '#475569', fontWeight: 600 } },
      series: [{
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['50%', '45%'],
        label: {
          show: true,
          position: 'inside',
          formatter: (p) => p.percent > 4 ? `${Math.round(p.percent)}%` : '',
          fontSize: 11,
          fontWeight: 800,
          color: '#FFFFFF',
        },
        data: coloredData,
      }],
    };
    chart.setOption(option);

    chart.off('click');
    chart.on('click', (params) => this.engine.setFilter('channel', params.name));
  }

  renderP1Waterfall() {
    const chart = this.getOrCreate('chart_p1_waterfall');
    if (!chart) return;
    const data = this.engine.getRegionGapWaterfall();

    const option = {
      tooltip: {
        trigger: 'axis',
        formatter: (p) => `${p[0].name}: <strong>${p[0].value.toLocaleString()} Tr.đ</strong> (${p[0].value >= 0 ? 'Vượt Target' : 'Hụt Target'})`,
      },
      grid: { left: '3%', right: '3%', bottom: '12%', top: '36px', containLabel: true },
      xAxis: {
        type: 'category',
        data: data.map((d) => d.name),
        axisLabel: { color: '#475569', fontSize: 10, fontWeight: 600, interval: 0 },
        axisLine: { lineStyle: { color: '#E2E8F0' } },
      },
      yAxis: {
        type: 'value',
        name: 'Chênh lệch Target (Tr.đ)',
        nameTextStyle: { color: '#64748B', fontSize: 11, padding: [0, 0, 4, 0] },
        splitLine: { lineStyle: { type: 'dashed', color: '#F1F5F9' } },
        axisLabel: { color: '#64748B', fontSize: 10 },
      },
      series: [{
        type: 'bar',
        barMaxWidth: 24,
        data: data.map((d) => ({
          value: d.value,
          label: {
            position: d.value >= 0 ? 'top' : 'bottom',
          },
          itemStyle: {
            color: d.value >= 0
              ? new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#14B8A6' }, { offset: 1, color: '#0F766E' }])
              : new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#F87171' }, { offset: 1, color: '#DC2626' }]),
            borderRadius: d.value >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4],
          },
        })),
        label: {
          show: true,
          formatter: (p) => `${p.value > 0 ? '+' : ''}${p.value.toLocaleString()}`,
          fontSize: 10,
          fontWeight: 700,
          color: '#334155',
        },
      }],
    };
    chart.setOption(option);

    chart.off('click');
    chart.on('click', (params) => this.engine.setFilter('mien', params.name));
  }

  // ------------------------------------------------------------------------
  // TRANG 02: KÊNH & KHÁCH HÀNG
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
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
      },
      legend: {
        data: ['Doanh thu Actual', 'Doanh thu LY', 'Tăng trưởng YoY %'],
        bottom: 0,
        left: 'center',
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 16,
        textStyle: { fontSize: 11, color: '#475569', fontWeight: 600 },
        icon: 'circle',
      },
      grid: { left: '3%', right: '3%', top: '36px', bottom: '40px', containLabel: true },
      xAxis: {
        type: 'category',
        data: data.categories,
        axisLabel: { color: '#475569', fontWeight: 600, fontSize: 11 },
        axisLine: { lineStyle: { color: '#E2E8F0' } },
      },
      yAxis: [
        {
          type: 'value',
          name: 'Doanh thu (Tr.đ)',
          nameTextStyle: { color: '#64748B', fontSize: 11, padding: [0, 0, 4, 0] },
          splitLine: { lineStyle: { type: 'dashed', color: '#F1F5F9' } },
          axisLabel: { color: '#64748B', fontSize: 10 },
        },
        {
          type: 'value',
          name: 'YoY %',
          nameTextStyle: { color: '#64748B', fontSize: 11, padding: [0, 0, 4, 0] },
          splitLine: { show: false },
          axisLabel: { color: '#D97706', fontSize: 10, formatter: '{value}%' },
        },
      ],
      series: [
        {
          name: 'Doanh thu Actual',
          type: 'bar',
          barMaxWidth: 24,
          data: data.actuals,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#3B82F6' },
              { offset: 1, color: '#1D4ED8' },
            ]),
            borderRadius: [4, 4, 0, 0],
          },
        },
        {
          name: 'Doanh thu LY',
          type: 'bar',
          barMaxWidth: 24,
          data: data.lys,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#CBD5E1' },
              { offset: 1, color: '#94A3B8' },
            ]),
            borderRadius: [4, 4, 0, 0],
          },
        },
        {
          name: 'Tăng trưởng YoY %',
          type: 'line',
          yAxisIndex: 1,
          data: data.yoys,
          itemStyle: { color: '#F59E0B' },
          lineStyle: { width: 2.5, color: '#F59E0B' },
          symbol: 'circle',
          symbolSize: 6,
        },
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
      xAxis: {
        type: 'value',
        name: 'Triệu VNĐ',
        splitLine: { lineStyle: { type: 'dashed', color: '#F1F5F9' } },
        axisLabel: { color: '#64748B', fontSize: 10 },
      },
      yAxis: {
        type: 'category',
        data: data.map((d) => d.name).reverse(),
        axisLabel: { color: '#475569', fontSize: 11 },
        axisLine: { lineStyle: { color: '#E2E8F0' } },
      },
      series: [{
        type: 'bar',
        barMaxWidth: 18,
        data: data.map((d) => d.value).reverse(),
        itemStyle: {
          color: new echarts.graphic.LinearGradient(1, 0, 0, 0, [
            { offset: 0, color: '#38BDF8' },
            { offset: 1, color: '#0284C7' },
          ]),
          borderRadius: [0, 4, 4, 0],
        },
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
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params) => {
          let html = `<strong>Kênh: ${params[0].name}</strong><br/>`;
          params.forEach((p) => {
            html += `${p.marker} ${p.seriesName}: <strong>${p.value.toLocaleString()} KH</strong><br/>`;
          });
          return html;
        },
      },
      legend: {
        data: ['Khách hàng Mới', 'Ngừng mua (Churn)'],
        bottom: 0,
        left: 'center',
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 20,
        textStyle: { fontSize: 11, color: '#475569', fontWeight: 600 },
        icon: 'circle',
      },
      grid: { left: '3%', right: '3%', top: '36px', bottom: '40px', containLabel: true },
      xAxis: {
        type: 'category',
        data: data.channels,
        axisLabel: { color: '#475569', fontWeight: 600, fontSize: 11 },
        axisLine: { lineStyle: { color: '#E2E8F0' } },
      },
      yAxis: {
        type: 'value',
        name: 'Số lượng KH (NPP/ĐL)',
        nameTextStyle: { color: '#64748B', fontSize: 11, padding: [0, 0, 4, 0] },
        splitLine: { lineStyle: { type: 'dashed', color: '#F1F5F9' } },
        axisLabel: { color: '#64748B', fontSize: 10 },
      },
      series: [
        {
          name: 'Khách hàng Mới',
          type: 'bar',
          barMaxWidth: 24,
          data: data.newCustomers,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#14B8A6' },
              { offset: 1, color: '#0D9488' },
            ]),
            borderRadius: [4, 4, 0, 0],
          },
          label: {
            show: true,
            position: 'top',
            color: '#0F766E',
            fontSize: 10,
            fontWeight: 700,
          },
        },
        {
          name: 'Ngừng mua (Churn)',
          type: 'bar',
          barMaxWidth: 24,
          data: data.churnCustomers,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#F87171' },
              { offset: 1, color: '#DC2626' },
            ]),
            borderRadius: [4, 4, 0, 0],
          },
          label: {
            show: true,
            position: 'top',
            color: '#B91C1C',
            fontSize: 10,
            fontWeight: 700,
          },
        },
      ],
    };
    chart.setOption(option);
  }

  setP2CustomerFilter(mode) {
    this.p2CustMode = mode;
    document.querySelectorAll('.p2-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
    });
    this.renderP2CustomerTable();
  }

  renderP2CustomerTable() {
    const tbody = document.getElementById('p2_customer_tbody');
    if (!tbody) return;
    const mode = this.p2CustMode || 'all';
    const data = this.engine.getTopCustomers(12, mode);

    tbody.innerHTML = data.map((c, i) => `
      <tr>
        <td><strong>${i + 1}</strong></td>
        <td><strong>${c.name}</strong></td>
        <td><span class="meta-badge">${c.channel}</span></td>
        <td>${c.mien}</td>
        <td class="num"><strong>${c.actual.toLocaleString()}</strong></td>
        <td class="num">${c.ly.toLocaleString()}</td>
        <td class="num" style="color: ${c.diff >= 0 ? '#16A34A' : '#DC2626'}; font-weight: 700;">
          ${c.diff >= 0 ? '+' : ''}${c.diff.toLocaleString()} (${c.yoy >= 0 ? '+' : ''}${c.yoy}%)
        </td>
        <td class="num">${c.share}%</td>
      </tr>
    `).join('');
  }

  // ------------------------------------------------------------------------
  // TRANG 03: SẢN PHẨM & DANH MỤC
  // ------------------------------------------------------------------------
  renderPage3() {
    this.renderP3VikodaVsKDT();
    this.renderP3BrandMix();
    this.renderP3HeroSKU();
    this.renderP3DecliningSKU();
  }

  renderP3VikodaVsKDT() {
    const chart = this.getOrCreate('chart_p3_trend');
    if (!chart) return;
    const data = this.engine.getVikodaVsKDTTrend();

    const option = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        formatter: (params) => {
          let html = `<strong>${params[0].name}</strong><br/>`;
          params.forEach((p) => {
            if (p.value !== null && p.value !== undefined) {
              const unit = p.seriesName.includes('%') ? '%' : ' Tr.đ';
              html += `${p.marker} ${p.seriesName}: <strong>${p.value.toLocaleString()}${unit}</strong><br/>`;
            }
          });
          return html;
        },
      },
      legend: {
        data: ['Khoáng kiềm Vikoda', 'Khoáng ngọt Đảnh Thạnh', 'Tỷ trọng Vikoda (%)'],
        bottom: 0,
        left: 'center',
        itemWidth: 12,
        itemHeight: 10,
        itemGap: 18,
        textStyle: { fontSize: 11, color: '#475569', fontWeight: 600 },
        icon: 'circle',
      },
      grid: { left: '3%', right: '4%', top: '36px', bottom: '46px', containLabel: true },
      xAxis: {
        type: 'category',
        data: data.labels,
        axisLabel: { color: '#475569', fontSize: 11, fontWeight: 600 },
        axisLine: { lineStyle: { color: '#E2E8F0' } },
      },
      yAxis: [
        {
          type: 'value',
          name: 'Doanh thu (Tr.đ)',
          nameTextStyle: { color: '#64748B', fontSize: 11, padding: [0, 0, 4, 0] },
          splitLine: { lineStyle: { type: 'dashed', color: '#F1F5F9' } },
          axisLabel: { color: '#64748B', fontSize: 10 },
        },
        {
          type: 'value',
          name: '% Tỷ trọng',
          max: 100,
          nameTextStyle: { color: '#64748B', fontSize: 11, padding: [0, 0, 4, 0] },
          splitLine: { show: false },
          axisLabel: { color: '#F97316', fontSize: 10, formatter: '{value}%' },
        },
      ],
      series: [
        {
          name: 'Khoáng kiềm Vikoda',
          type: 'bar',
          barMaxWidth: 22,
          data: data.vikodaSeries,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#3B82F6' },
              { offset: 1, color: '#1D4ED8' },
            ]),
            borderRadius: [4, 4, 0, 0],
          },
        },
        {
          name: 'Khoáng ngọt Đảnh Thạnh',
          type: 'bar',
          barMaxWidth: 22,
          data: data.dtSeries,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#34D399' },
              { offset: 1, color: '#059669' },
            ]),
            borderRadius: [4, 4, 0, 0],
          },
        },
        {
          name: 'Tỷ trọng Vikoda (%)',
          type: 'line',
          yAxisIndex: 1,
          data: data.vikodaShareSeries,
          lineStyle: { width: 2.5, color: '#F97316' },
          itemStyle: { color: '#F97316' },
          symbol: 'circle',
          symbolSize: 6,
        },
      ],
    };
    chart.setOption(option);
  }

  renderP3BrandMix() {
    const chart = this.getOrCreate('chart_p3_brand') || this.getOrCreate('chart_p3_brand_mix');
    if (!chart) return;
    const data = this.engine.getBrandMix();

    const brandColorMap = {
      'Khoáng kiềm Vikoda': '#2563EB',
      'Vikoda': '#2563EB',             // Xanh Dương Đậm
      'Khoáng ngọt Đảnh Thạnh': '#10B981',
      'Đảnh Thạnh': '#10B981',         // Xanh Lá Lục Bảo
      'KDT Thương Mại': '#F97316',
      'KDT': '#F97316',                // Cam Rực Rỡ
      'Sản phẩm khác': '#8B5CF6',
      'Khác': '#8B5CF6',               // Tím Đậm
      'Sumo': '#EC4899',               // Hồng Rực Rỡ
    };

    const palette = ['#10B981', '#2563EB', '#F97316', '#8B5CF6', '#EC4899', '#06B6D4'];

    const coloredData = data.map((d, i) => ({
      name: d.name,
      value: d.value,
      itemStyle: { color: brandColorMap[d.name] || palette[i % palette.length] },
    }));

    const option = {
      tooltip: { trigger: 'item', formatter: '{b}: <strong>{c} Tr.đ</strong> ({d}%)' },
      legend: { bottom: 0, icon: 'circle', itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 11, color: '#475569', fontWeight: 600 } },
      series: [{
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['50%', '45%'],
        label: {
          show: true,
          position: 'inside',
          formatter: (p) => p.percent > 4 ? `${Math.round(p.percent)}%` : '',
          fontSize: 11,
          fontWeight: 800,
          color: '#FFFFFF',
        },
        data: coloredData,
      }],
    };
    chart.setOption(option);
  }

  renderP3HeroSKU() {
    const chart = this.getOrCreate('chart_p3_hero_skus');
    if (!chart) return;
    const data = this.engine.getHeroSKUs(8);

    const option = {
      tooltip: { trigger: 'axis', formatter: (p) => `${p[0].name}: <strong>${p[0].value.toLocaleString()} Tr.đ</strong>` },
      grid: { left: '3%', right: '6%', bottom: '5%', top: '5%', containLabel: true },
      xAxis: { type: 'value', name: 'Triệu VNĐ', splitLine: { lineStyle: { type: 'dashed', color: '#F1F5F9' } }, axisLabel: { color: '#64748B', fontSize: 10 } },
      yAxis: { type: 'category', data: data.map((d) => d.name).reverse(), axisLabel: { color: '#475569', fontSize: 11 } },
      series: [{
        type: 'bar',
        barMaxWidth: 18,
        data: data.map((d) => d.value).reverse(),
        itemStyle: {
          color: new echarts.graphic.LinearGradient(1, 0, 0, 0, [{ offset: 0, color: '#3B82F6' }, { offset: 1, color: '#1D4ED8' }]),
          borderRadius: [0, 4, 4, 0],
        },
      }],
    };
    chart.setOption(option);
  }

  renderP3DecliningSKU() {
    const chart = this.getOrCreate('chart_p3_declining_skus');
    if (!chart) return;
    const data = this.engine.getDecliningSKUs(8);

    const option = {
      tooltip: { trigger: 'axis', formatter: (p) => `${p[0].name}: <strong>${p[0].value}% YoY</strong>` },
      grid: { left: '3%', right: '6%', bottom: '5%', top: '5%', containLabel: true },
      xAxis: { type: 'value', name: 'Tăng trưởng YoY (%)', splitLine: { lineStyle: { type: 'dashed', color: '#F1F5F9' } }, axisLabel: { color: '#64748B', fontSize: 10, formatter: '{value}%' } },
      yAxis: { type: 'category', data: data.map((d) => d.name).reverse(), axisLabel: { color: '#475569', fontSize: 11 } },
      series: [{
        type: 'bar',
        barMaxWidth: 18,
        data: data.map((d) => d.value).reverse(),
        itemStyle: {
          color: new echarts.graphic.LinearGradient(1, 0, 0, 0, [{ offset: 0, color: '#F87171' }, { offset: 1, color: '#DC2626' }]),
          borderRadius: [0, 4, 4, 0],
        },
      }],
    };
    chart.setOption(option);
  }

  // ------------------------------------------------------------------------
  // TRANG 04: VÙNG MIỀN & SẢN LƯỢNG
  // ------------------------------------------------------------------------
  renderPage4() {
    this.renderP4PackagingTrend();
    this.renderP4TerritoryTreemap();
    this.renderP4PackagingMix();
    this.renderP4RegionAttainment();
  }

  renderP4PackagingTrend() {
    const chart = this.getOrCreate('chart_p4_volume_trend');
    if (!chart) return;
    const data = this.engine.getPackagingVolumeTrend();

    const option = {
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      legend: {
        data: ['Sản lượng Két', 'Sản lượng Thùng', 'Sản lượng Bình 19L'],
        bottom: 0,
        left: 'center',
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 16,
        textStyle: { fontSize: 11, color: '#475569', fontWeight: 600 },
        icon: 'circle',
      },
      grid: { left: '3%', right: '3%', top: '36px', bottom: '40px', containLabel: true },
      xAxis: { type: 'category', data: data.labels, axisLabel: { color: '#475569', fontSize: 11, fontWeight: 600 } },
      yAxis: { type: 'value', name: 'Số lượng Quy cách', splitLine: { lineStyle: { type: 'dashed', color: '#F1F5F9' } }, axisLabel: { color: '#64748B', fontSize: 10 } },
      series: [
        { name: 'Sản lượng Két', type: 'line', data: data.ketSeries, lineStyle: { width: 2.5, color: this.colors.blue }, itemStyle: { color: this.colors.blue } },
        { name: 'Sản lượng Thùng', type: 'line', data: data.thungSeries, lineStyle: { width: 2.5, color: this.colors.teal }, itemStyle: { color: this.colors.teal } },
        { name: 'Sản lượng Bình 19L', type: 'line', data: data.binhSeries, lineStyle: { width: 2.5, color: this.colors.amber }, itemStyle: { color: this.colors.amber } },
      ],
    };
    chart.setOption(option);
  }

  renderP4TerritoryTreemap() {
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
          { colorSaturation: [0.35, 0.7], itemStyle: { borderColorSaturation: 0.6, gapWidth: 1 } },
        ],
      }],
    };
    chart.setOption(option);

    chart.off('click');
    chart.on('click', (params) => {
      if (params.data && params.data.name) {
        if (params.data.children) this.engine.setFilter('mien', params.data.name);
        else this.engine.setFilter('vung', params.data.name);
      }
    });
  }

  renderP4PackagingMix() {
    const chart = this.getOrCreate('chart_p4_pack_mix');
    if (!chart) return;
    const data = this.engine.getPackagingMix();

    const palette = ['#2563EB', '#10B981', '#F97316', '#8B5CF6', '#EC4899', '#06B6D4'];

    const coloredData = data.map((d, i) => ({
      name: d.name,
      value: d.value,
      itemStyle: { color: palette[i % palette.length] },
    }));

    const option = {
      tooltip: { trigger: 'item', formatter: '{b}: <strong>{c} đơn vị</strong> ({d}%)' },
      legend: { bottom: 0, icon: 'circle', itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 11, color: '#475569', fontWeight: 600 } },
      series: [{
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['50%', '45%'],
        label: {
          show: true,
          position: 'inside',
          formatter: (p) => p.percent > 4 ? `${Math.round(p.percent)}%` : '',
          fontSize: 11,
          fontWeight: 800,
          color: '#FFFFFF',
        },
        data: coloredData,
      }],
    };
    chart.setOption(option);
  }

  renderP4RegionAttainment() {
    const chart = this.getOrCreate('chart_p4_priority_regions');
    if (!chart) return;
    const data = this.engine.getRegionTargetAttainment();

    const option = {
      tooltip: { trigger: 'axis', formatter: (p) => `${p[0].name}: <strong>${p[0].value}% Target</strong>` },
      grid: { left: '3%', right: '6%', bottom: '5%', top: '5%', containLabel: true },
      xAxis: { type: 'value', name: '% Đạt Target', splitLine: { lineStyle: { type: 'dashed', color: '#F1F5F9' } }, axisLabel: { color: '#64748B', fontSize: 10, formatter: '{value}%' } },
      yAxis: { type: 'category', data: data.map((d) => d.name), axisLabel: { color: '#475569', fontSize: 10 } },
      series: [{
        type: 'bar',
        barMaxWidth: 16,
        data: data.map((d) => ({
          value: d.value,
          itemStyle: {
            color: d.value >= 100 ? '#10B981' : d.value >= 80 ? '#F59E0B' : '#EF4444',
            borderRadius: [0, 4, 4, 0],
          },
        })),
        label: {
          show: true,
          position: 'right',
          formatter: '{c}%',
          fontSize: 9,
          fontWeight: 700,
          color: '#475569',
        },
      }],
    };
    chart.setOption(option);

    chart.off('click');
    chart.on('click', (params) => this.engine.setFilter('vung', params.name));
  }

  // ------------------------------------------------------------------------
  // TRANG 06: HỆ THỐNG DỰ BÁO ĐIỀU HÀNH CEO THEO THÁNG / QUÝ / NĂM
  // ------------------------------------------------------------------------
  setForecastHorizon(horizon) {
    this.forecastHorizon = horizon;
    document.querySelectorAll('.fc-horizon-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-horizon') === horizon);
    });
    this.renderPage6();
    if (window.app && window.app.updateP6PredictiveMetrics) {
      window.app.updateP6PredictiveMetrics();
    }
  }

  renderPage6() {
    const horizon = this.forecastHorizon || 'month';
    this.renderP6HorizonChart(horizon);
    this.renderP6BurdenVelocity();
    this.renderP6EarlyWarningList();
  }

  renderP6HorizonChart(horizon) {
    const chart = this.getOrCreate('chart_p6_trend');
    if (!chart) return;
    const data = this.engine.getForecastHorizonChartData(horizon);

    if (horizon === 'month') {
      const option = {
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'cross' },
          formatter: (params) => {
            let html = `<strong>Ngày ${params[0].name.replace('N', '')}</strong><br/>`;
            params.forEach((p) => {
              if (p.value !== null && p.value !== undefined) {
                html += `${p.marker} ${p.seriesName}: <strong>${Number(p.value).toLocaleString()} Tr.đ</strong><br/>`;
              }
            });
            return html;
          },
        },
        legend: {
          data: ['Lũy kế Thực tế', 'Mục tiêu Kế hoạch', 'Dự báo Thống kê'],
          bottom: 0,
          left: 'center',
          itemWidth: 12,
          itemHeight: 10,
          itemGap: 14,
          textStyle: { fontSize: 11, color: '#475569', fontWeight: 600 },
          icon: 'circle',
        },
        grid: { left: '3%', right: '4%', top: '36px', bottom: '46px', containLabel: true },
        xAxis: {
          type: 'category',
          data: data.labels,
          axisLabel: { color: '#475569', fontSize: 10, fontWeight: 600, interval: 2 },
          axisLine: { lineStyle: { color: '#E2E8F0' } },
        },
        yAxis: {
          type: 'value',
          name: 'Doanh thu Lũy kế (Tr.đ)',
          nameTextStyle: { color: '#64748B', fontSize: 11, padding: [0, 0, 4, 0] },
          splitLine: { lineStyle: { type: 'dashed', color: '#F1F5F9' } },
          axisLabel: { color: '#64748B', fontSize: 10 },
        },
        series: [
          {
            name: 'Lũy kế Thực tế',
            type: 'line',
            data: data.actualCumulative,
            lineStyle: { width: 3, color: '#2563EB' },
            itemStyle: { color: '#2563EB' },
            symbol: 'circle',
            symbolSize: 6,
          },
          {
            name: 'Mục tiêu Kế hoạch',
            type: 'line',
            data: data.targetPacing,
            lineStyle: { width: 2, color: '#D97706', type: 'dashed' },
            itemStyle: { color: '#D97706' },
            symbol: 'none',
          },
          {
            name: 'Dự báo Thống kê',
            type: 'line',
            data: data.forecastBaseline,
            lineStyle: { width: 2.5, color: '#10B981', type: 'dotted' },
            itemStyle: { color: '#10B981' },
            symbol: 'diamond',
            symbolSize: 5,
          },
        ],
      };
      chart.setOption(option, true);
    } else {
      const option = {
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'cross' },
          formatter: (params) => {
            let html = `<strong>${params[0].name}</strong><br/>`;
            params.forEach((p) => {
              if (p.value !== null && p.value !== undefined) {
                html += `${p.marker} ${p.seriesName}: <strong>${Number(p.value).toLocaleString()} Tr.đ</strong><br/>`;
              }
            });
            return html;
          },
        },
        legend: {
          data: ['Doanh thu Thực tế', 'Dự báo Cuối kỳ', 'Target Kế hoạch'],
          bottom: 0,
          left: 'center',
          itemWidth: 12,
          itemHeight: 10,
          itemGap: 16,
          textStyle: { fontSize: 11, color: '#475569', fontWeight: 600 },
          icon: 'circle',
        },
        grid: { left: '3%', right: '3%', top: '36px', bottom: '46px', containLabel: true },
        xAxis: {
          type: 'category',
          data: data.labels,
          axisLabel: { color: '#475569', fontSize: 11, fontWeight: 600 },
          axisLine: { lineStyle: { color: '#E2E8F0' } },
        },
        yAxis: {
          type: 'value',
          name: 'Doanh thu (Tr.đ)',
          nameTextStyle: { color: '#64748B', fontSize: 11, padding: [0, 0, 4, 0] },
          splitLine: { lineStyle: { type: 'dashed', color: '#F1F5F9' } },
          axisLabel: { color: '#64748B', fontSize: 10 },
        },
        series: [
          {
            name: 'Doanh thu Thực tế',
            type: 'bar',
            barMaxWidth: 24,
            data: data.actualSeries,
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#3B82F6' }, { offset: 1, color: '#1D4ED8' }]),
              borderRadius: [3, 3, 0, 0],
            },
          },
          {
            name: 'Dự báo Cuối kỳ',
            type: 'bar',
            barMaxWidth: 24,
            data: data.forecastSeries,
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#34D399' }, { offset: 1, color: '#059669' }]),
              borderRadius: [3, 3, 0, 0],
              opacity: 0.85,
            },
          },
          {
            name: 'Target Kế hoạch',
            type: 'line',
            data: data.targetSeries,
            lineStyle: { width: 2.5, color: '#D97706', type: 'dashed' },
            itemStyle: { color: '#D97706' },
            symbol: 'circle',
            symbolSize: 6,
          },
        ],
      };
      chart.setOption(option, true);
    }
  }

  renderP6BurdenVelocity() {
    const chart = this.getOrCreate('chart_p6_forecast');
    if (!chart) return;
    const data = this.engine.getRegionBurdenAnalysis();

    const option = {
      tooltip: {
        trigger: 'axis',
        formatter: (p) => {
          const item = data[p[0].dataIndex];
          return `<strong>${item.name}</strong><br/>` +
            `• Vận tốc thực tế: <strong>${item.currentVelocity} Tr.đ/ngày</strong><br/>` +
            `• Vận tốc yêu cầu: <strong>${item.requiredVelocity} Tr.đ/ngày</strong><br/>` +
            `• Hệ số tải áp lực: <strong>${item.burden}x</strong> (${item.riskLabel})<br/>` +
            `• Dự báo về đích: <strong>${item.forecastAttainment}% Target</strong>`;
        },
      },
      legend: {
        data: ['Vận tốc Hiện tại (Tr.đ/ngày)', 'Vận tốc Yêu cầu về đích (Tr.đ/ngày)'],
        bottom: 0,
        left: 'center',
        itemWidth: 12,
        itemHeight: 10,
        itemGap: 16,
        textStyle: { fontSize: 11, color: '#475569', fontWeight: 600 },
        icon: 'circle',
      },
      grid: { left: '3%', right: '3%', bottom: '46px', top: '36px', containLabel: true },
      xAxis: {
        type: 'category',
        data: data.map((d) => d.name),
        axisLabel: { color: '#475569', fontSize: 10, fontWeight: 600, interval: 0 },
        axisLine: { lineStyle: { color: '#E2E8F0' } },
      },
      yAxis: {
        type: 'value',
        name: 'Vận tốc (Tr.đ / Ngày)',
        nameTextStyle: { color: '#64748B', fontSize: 11, padding: [0, 0, 4, 0] },
        splitLine: { lineStyle: { type: 'dashed', color: '#F1F5F9' } },
        axisLabel: { color: '#64748B', fontSize: 10 },
      },
      series: [
        {
          name: 'Vận tốc Hiện tại (Tr.đ/ngày)',
          type: 'bar',
          barMaxWidth: 18,
          data: data.map((d) => d.currentVelocity),
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#3B82F6' }, { offset: 1, color: '#1D4ED8' }]),
            borderRadius: [3, 3, 0, 0],
          },
        },
        {
          name: 'Vận tốc Yêu cầu về đích (Tr.đ/ngày)',
          type: 'bar',
          barMaxWidth: 18,
          data: data.map((d) => d.requiredVelocity),
          itemStyle: {
            color: (p) => {
              const item = data[p.dataIndex];
              return item.riskLevel === 'red' ? '#DC2626' : (item.riskLevel === 'amber' ? '#D97706' : '#10B981');
            },
            borderRadius: [3, 3, 0, 0],
          },
        },
      ],
    };
    chart.setOption(option);
  }

  renderP6EarlyWarningList() {
    const el = document.getElementById('early_warning_container');
    if (!el) return;

    const horizon = this.forecastHorizon || 'month';
    const memos = this.engine.getCEODecisionMemo(horizon);

    el.innerHTML = memos.map((m) => `
      <div class="alert-card alert-${m.severity}">
        <div class="alert-header-row">
          <span class="alert-badge alert-badge-${m.severity}">${m.tag}</span>
          <h4 class="alert-title">${m.title}</h4>
        </div>
        <p class="alert-desc">${m.desc}</p>
        <div class="alert-action-box">
          <strong>⚡ Quyết định CEO đề xuất:</strong> ${m.decision}
        </div>
      </div>
    `).join('');
  }
}

window.charts = new VikodaCharts(window.dataEngine);
