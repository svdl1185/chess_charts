const Charts = (() => {
  const RED = '#e74c3c';
  const RED_BG = 'rgba(231, 76, 60, 0.12)';
  const GRID_COLOR = 'rgba(255, 255, 255, 0.06)';
  const TICK_COLOR = '#6b6b8d';

  const OPP_COLOR = 'rgba(100, 180, 255, ALPHA)';

  function oppAlphaColor(alpha) {
    return OPP_COLOR.replace('ALPHA', alpha);
  }

  const baseScaleOpts = {
    grid: { color: GRID_COLOR, drawBorder: false },
    ticks: { color: TICK_COLOR, font: { size: 11 } },
  };

  let ratingChart = null;
  let opponentsChart = null;
  let scatterChart = null;

  function buildMonthlyVolume(points) {
    const buckets = new Map();
    for (const p of points) {
      const key = `${p.date.getFullYear()}-${String(p.date.getMonth()).padStart(2, '0')}`;
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    const sorted = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return sorted.map(([key, count]) => {
      const [y, m] = key.split('-').map(Number);
      return { x: new Date(y, m, 15), y: count };
    });
  }

  /* ────────────────────────────────────────
     Chart 1: Rating Progression + Volume
  ──────────────────────────────────────── */

  function renderRatingChart(userPoints, username) {
    const ctx = document.getElementById('chart-rating').getContext('2d');
    if (ratingChart) ratingChart.destroy();

    const ratingData = userPoints.map(p => ({ x: p.date, y: p.rating }));
    const volumeData = buildMonthlyVolume(userPoints);
    const maxVolume = Math.max(...volumeData.map(v => v.y), 1);

    ratingChart = new Chart(ctx, {
      data: {
        datasets: [
          {
            type: 'line',
            label: username,
            data: ratingData,
            borderColor: RED,
            backgroundColor: RED_BG,
            borderWidth: 2.5,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBackgroundColor: RED,
            fill: true,
            tension: 0.3,
            yAxisID: 'y',
            order: 0,
          },
          {
            type: 'bar',
            label: 'Games / month',
            data: volumeData,
            backgroundColor: 'rgba(100, 180, 255, 0.25)',
            borderColor: 'rgba(100, 180, 255, 0.4)',
            borderWidth: 1,
            borderRadius: 2,
            yAxisID: 'yVolume',
            order: 1,
            barPercentage: 0.9,
            categoryPercentage: 0.9,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1a1a2e',
            borderColor: '#2a2a4a',
            borderWidth: 1,
            titleColor: '#e8e8f0',
            bodyColor: '#e8e8f0',
            padding: 10,
            displayColors: true,
            callbacks: {
              title: items => {
                const raw = items[0]?.raw?.x;
                if (!raw) return '';
                return new Date(raw).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
              },
            },
          },
        },
        scales: {
          x: {
            ...baseScaleOpts,
            type: 'time',
            time: { unit: 'month', tooltipFormat: 'MMM yyyy' },
          },
          y: {
            ...baseScaleOpts,
            position: 'left',
            title: { display: true, text: 'Rating', color: TICK_COLOR },
          },
          yVolume: {
            ...baseScaleOpts,
            position: 'right',
            title: { display: true, text: 'Games', color: TICK_COLOR },
            grid: { drawOnChartArea: false },
            beginAtZero: true,
            max: maxVolume * 2,
          },
        },
      },
    });
  }

  /* ────────────────────────────────────────
     Chart 2: Opponent Rating Progressions
  ──────────────────────────────────────── */

  function renderOpponentsChart(userPoints, opponents, username) {
    const ctx = document.getElementById('chart-opponents').getContext('2d');
    if (opponentsChart) opponentsChart.destroy();

    const datasets = [];

    opponents.forEach((opp) => {
      if (!opp.points.length) return;
      const fromDate = opp.gameDate;
      const filtered = opp.points.filter(p => p.date >= fromDate);
      if (filtered.length < 2) return;

      datasets.push({
        label: opp.username,
        data: filtered.map(p => ({ x: p.date, y: p.rating })),
        borderColor: oppAlphaColor(0.2),
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: false,
        tension: 0.25,
        _isOpp: true,
      });
    });

    datasets.push({
      label: `${username} (you)`,
      data: userPoints.map(p => ({ x: p.date, y: p.rating })),
      borderColor: RED,
      backgroundColor: RED_BG,
      borderWidth: 3,
      pointRadius: 0,
      pointHoverRadius: 5,
      pointHoverBackgroundColor: RED,
      fill: false,
      tension: 0.3,
      order: -1,
    });

    opponentsChart = new Chart(ctx, {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'nearest', intersect: true, axis: 'xy' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1a1a2e',
            borderColor: '#2a2a4a',
            borderWidth: 1,
            titleColor: '#e8e8f0',
            bodyColor: '#e8e8f0',
            padding: 10,
            callbacks: {
              title: items => items[0]?.dataset?.label || '',
              label: item => {
                const d = new Date(item.raw.x).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
                return `${d}: ${item.raw.y}`;
              },
            },
          },
        },
        scales: {
          x: {
            ...baseScaleOpts,
            type: 'time',
            time: { unit: 'month', tooltipFormat: 'MMM yyyy' },
          },
          y: {
            ...baseScaleOpts,
            title: { display: true, text: 'Rating', color: TICK_COLOR },
          },
        },
        onHover: (event, elements) => {
          if (!opponentsChart) return;
          const hoveredIndex = elements.length ? elements[0].datasetIndex : -1;

          opponentsChart.data.datasets.forEach((ds, idx) => {
            if (!ds._isOpp) return;
            if (hoveredIndex < 0) {
              ds.borderColor = oppAlphaColor(0.2);
              ds.borderWidth = 1.5;
            } else if (idx === hoveredIndex) {
              ds.borderColor = oppAlphaColor(1);
              ds.borderWidth = 3;
            } else {
              ds.borderColor = oppAlphaColor(0.06);
              ds.borderWidth = 1;
            }
          });
          opponentsChart.update('none');
        },
      },
    });
  }

  /* ────────────────────────────────────────
     Chart 3: Improvement Scatter Plot
  ──────────────────────────────────────── */

  function lerpColor(t) {
    // t: -1 (worst decline) → 0 (no change) → +1 (best improvement)
    // amber(243,156,18) → white midpoint → green(46,204,113)
    const clamped = Math.max(-1, Math.min(1, t));
    let r, g, b;
    if (clamped <= 0) {
      const s = -clamped;
      r = Math.round(243 * s + 160 * (1 - s));
      g = Math.round(156 * s + 160 * (1 - s));
      b = Math.round(18 * s + 160 * (1 - s));
    } else {
      const s = clamped;
      r = Math.round(46 * s + 160 * (1 - s));
      g = Math.round(204 * s + 160 * (1 - s));
      b = Math.round(113 * s + 160 * (1 - s));
    }
    return { r, g, b };
  }

  function renderScatterChart(opponents) {
    const ctx = document.getElementById('chart-scatter').getContext('2d');
    if (scatterChart) scatterChart.destroy();

    const points = [];
    let maxAbsChange = 1;

    opponents.forEach(opp => {
      if (opp.currentRating == null) return;
      const ratingChange = opp.currentRating - (opp.ratingAtGame || opp.currentRating);
      maxAbsChange = Math.max(maxAbsChange, Math.abs(ratingChange));
    });

    opponents.forEach(opp => {
      if (opp.currentRating == null) return;
      const ratingChange = opp.currentRating - (opp.ratingAtGame || opp.currentRating);

      const ratingGap = Math.abs((opp.ratingAtGame || 0) - (opp.myRatingAtGame || 0));
      const dotSize = Math.max(3, Math.min(10, 10 - ratingGap / 200));

      const t = ratingChange / maxAbsChange;
      const c = lerpColor(t);

      points.push({
        x: opp.gameDate,
        y: ratingChange,
        username: opp.username,
        ratingThen: opp.ratingAtGame,
        ratingNow: opp.currentRating,
        r: dotSize,
        _bgColor: `rgba(${c.r}, ${c.g}, ${c.b}, 0.55)`,
        _borderColor: `rgba(${c.r}, ${c.g}, ${c.b}, 0.8)`,
      });
    });

    scatterChart = new Chart(ctx, {
      type: 'bubble',
      data: {
        datasets: [{
          label: 'Opponents',
          data: points,
          backgroundColor: points.map(p => p._bgColor),
          borderColor: points.map(p => p._borderColor),
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1a1a2e',
            borderColor: '#2a2a4a',
            borderWidth: 1,
            titleColor: '#e8e8f0',
            bodyColor: '#e8e8f0',
            padding: 10,
            callbacks: {
              title: items => items[0]?.raw?.username || '',
              label: item => {
                const p = item.raw;
                const date = new Date(p.x).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
                return [
                  `Played: ${date}`,
                  `Rating: ${p.ratingThen} → ${p.ratingNow} (${p.y >= 0 ? '+' : ''}${p.y})`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            ...baseScaleOpts,
            type: 'time',
            time: { unit: 'month', tooltipFormat: 'MMM yyyy' },
            title: { display: true, text: 'Date you played this opponent', color: TICK_COLOR },
          },
          y: {
            ...baseScaleOpts,
            title: { display: true, text: 'Rating change since your game', color: TICK_COLOR },
          },
        },
      },
    });
  }

  function destroyAll() {
    if (ratingChart) { ratingChart.destroy(); ratingChart = null; }
    if (opponentsChart) { opponentsChart.destroy(); opponentsChart = null; }
    if (scatterChart) { scatterChart.destroy(); scatterChart = null; }
  }

  return { renderRatingChart, renderOpponentsChart, renderScatterChart, destroyAll };
})();
