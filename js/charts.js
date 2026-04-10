const Charts = (() => {
  const RED = '#e74c3c';
  const RED_BG = 'rgba(231, 76, 60, 0.12)';
  const GRID_COLOR = 'rgba(255, 255, 255, 0.06)';
  const TICK_COLOR = '#6b6b8d';

  const OPP_PALETTE = [
    'rgba(52, 152, 219, ALPHA)',   // blue
    'rgba(26, 188, 156, ALPHA)',   // teal
    'rgba(155, 89, 182, ALPHA)',   // purple
    'rgba(241, 196, 15, ALPHA)',   // yellow
    'rgba(230, 126, 34, ALPHA)',   // orange
    'rgba(46, 204, 113, ALPHA)',   // green
    'rgba(142, 68, 173, ALPHA)',   // violet
    'rgba(22, 160, 133, ALPHA)',   // dark teal
    'rgba(41, 128, 185, ALPHA)',   // dark blue
    'rgba(243, 156, 18, ALPHA)',   // amber
  ];

  function oppColor(index, alpha) {
    return OPP_PALETTE[index % OPP_PALETTE.length].replace('ALPHA', alpha);
  }

  const baseScaleOpts = {
    grid: { color: GRID_COLOR, drawBorder: false },
    ticks: { color: TICK_COLOR, font: { size: 11 } },
  };

  const baseTimeAxis = {
    ...baseScaleOpts,
    type: 'time',
    time: { unit: 'month', tooltipFormat: 'MMM yyyy' },
    adapters: { date: {} },
  };

  let ratingChart = null;
  let opponentsChart = null;
  let scatterChart = null;

  /* ────────────────────────────────────────
     Chart 1: Rating Progression
  ──────────────────────────────────────── */

  function renderRatingChart(userPoints, username) {
    const ctx = document.getElementById('chart-rating').getContext('2d');
    if (ratingChart) ratingChart.destroy();

    const data = userPoints.map(p => ({ x: p.date, y: p.rating }));

    ratingChart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [{
          label: username,
          data,
          borderColor: RED,
          backgroundColor: RED_BG,
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: RED,
          fill: true,
          tension: 0.3,
        }],
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
            displayColors: false,
            callbacks: {
              title: items => items[0]?.raw?.x
                ? new Date(items[0].raw.x).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                : '',
              label: item => `Rating: ${item.raw.y}`,
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

    opponents.forEach((opp, i) => {
      if (!opp.points.length) return;
      const fromDate = opp.gameDate;
      const filtered = opp.points.filter(p => p.date >= fromDate);
      if (filtered.length < 2) return;

      const ratingGap = Math.abs((opp.ratingAtGame || 0) - (opp.myRatingAtGame || 0));
      const baseAlpha = Math.max(0.12, 0.4 - ratingGap / 1500);

      datasets.push({
        label: opp.username,
        data: filtered.map(p => ({ x: p.date, y: p.rating })),
        borderColor: oppColor(i, baseAlpha),
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: false,
        tension: 0.25,
        _oppIndex: i,
        _baseAlpha: baseAlpha,
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
            if (ds.label.includes('(you)')) return;
            if (hoveredIndex < 0 || ds.label.includes('(you)')) {
              ds.borderColor = oppColor(ds._oppIndex ?? idx, ds._baseAlpha ?? 0.25);
              ds.borderWidth = 1.5;
            } else if (idx === hoveredIndex) {
              ds.borderColor = oppColor(ds._oppIndex ?? idx, 1);
              ds.borderWidth = 3;
            } else {
              ds.borderColor = oppColor(ds._oppIndex ?? idx, 0.07);
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

  function renderScatterChart(opponents, userRatingChange, userGamesPlayed) {
    const ctx = document.getElementById('chart-scatter').getContext('2d');
    if (scatterChart) scatterChart.destroy();

    const improved = [];
    const declined = [];

    opponents.forEach(opp => {
      if (!opp.points.length) return;
      const lastRating = opp.points[opp.points.length - 1].rating;
      const ratingChange = lastRating - (opp.ratingAtGame || lastRating);
      const gamesCount = opp.points.length;

      const ratingGap = Math.abs((opp.ratingAtGame || 0) - (opp.myRatingAtGame || 0));
      const dotSize = Math.max(4, 14 - ratingGap / 150);

      const point = {
        x: gamesCount,
        y: ratingChange,
        username: opp.username,
        ratingThen: opp.ratingAtGame,
        ratingNow: lastRating,
        r: dotSize,
      };

      if (ratingChange >= userRatingChange) {
        improved.push(point);
      } else {
        declined.push(point);
      }
    });

    scatterChart = new Chart(ctx, {
      type: 'bubble',
      data: {
        datasets: [
          {
            label: 'Improved more than you',
            data: improved,
            backgroundColor: 'rgba(46, 204, 113, 0.55)',
            borderColor: 'rgba(46, 204, 113, 0.8)',
            borderWidth: 1,
            hoverBackgroundColor: 'rgba(46, 204, 113, 0.9)',
          },
          {
            label: 'Improved less than you',
            data: declined,
            backgroundColor: 'rgba(243, 156, 18, 0.55)',
            borderColor: 'rgba(243, 156, 18, 0.8)',
            borderWidth: 1,
            hoverBackgroundColor: 'rgba(243, 156, 18, 0.9)',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: '#e8e8f0', font: { size: 12 }, usePointStyle: true, pointStyle: 'circle' },
          },
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
                return [
                  `Rating: ${p.ratingThen} → ${p.ratingNow} (${p.y >= 0 ? '+' : ''}${p.y})`,
                  `Data points: ${p.x}`,
                ];
              },
            },
          },
          annotation: {
            annotations: {
              xLine: {
                type: 'line',
                xMin: userGamesPlayed,
                xMax: userGamesPlayed,
                borderColor: 'rgba(231, 76, 60, 0.6)',
                borderWidth: 2,
                borderDash: [6, 4],
                label: {
                  display: true,
                  content: 'Your activity',
                  position: 'start',
                  color: RED,
                  font: { size: 11, weight: 'bold' },
                  backgroundColor: 'rgba(15, 15, 26, 0.8)',
                },
              },
              yLine: {
                type: 'line',
                yMin: userRatingChange,
                yMax: userRatingChange,
                borderColor: 'rgba(231, 76, 60, 0.6)',
                borderWidth: 2,
                borderDash: [6, 4],
                label: {
                  display: true,
                  content: `Your change: ${userRatingChange >= 0 ? '+' : ''}${userRatingChange}`,
                  position: 'start',
                  color: RED,
                  font: { size: 11, weight: 'bold' },
                  backgroundColor: 'rgba(15, 15, 26, 0.8)',
                },
              },
            },
          },
        },
        scales: {
          x: {
            ...baseScaleOpts,
            title: { display: true, text: 'Rating data points (activity level)', color: TICK_COLOR },
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
