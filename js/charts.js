const Charts = (() => {
  const RED = '#e74c3c';
  const RED_BG = 'rgba(231, 76, 60, 0.12)';
  const GRID_COLOR = 'rgba(255, 255, 255, 0.06)';
  const TICK_COLOR = '#6b6b8d';
  const OPP_TPL = 'rgba(100, 180, 255, ALPHA)';

  function oppAlpha(a) {
    return OPP_TPL.replace('ALPHA', a);
  }

  const baseScale = {
    grid: { color: GRID_COLOR },
    ticks: { color: TICK_COLOR, font: { size: 11 } },
    border: { display: false },
  };

  let mainChart = null;
  let volumeChart = null;
  let scatterChart = null;

  function buildMonthlyVolumeFromGames(games) {
    const buckets = new Map();
    for (const g of games) {
      const d = new Date(g.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    return [...buckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, count]) => {
        const [y, m] = key.split('-').map(Number);
        return { x: new Date(y, m, 15), y: count };
      });
  }

  /* ─── Main chart (user line) + Volume bars ─── */

  function renderMainChart(userPoints, username, games) {
    const ctxMain = document.getElementById('chart-main').getContext('2d');
    if (mainChart) mainChart.destroy();

    const ratingData = userPoints.map(p => ({ x: p.date, y: p.rating }));

    mainChart = new Chart(ctxMain, {
      type: 'line',
      data: {
        datasets: [{
          label: `${username} (you)`,
          data: ratingData,
          borderColor: RED,
          backgroundColor: RED_BG,
          borderWidth: 3,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: RED,
          fill: false,
          tension: 0.3,
          order: -1,
        }],
      },
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
            ...baseScale,
            type: 'time',
            time: { unit: 'month', tooltipFormat: 'MMM yyyy' },
            ticks: { ...baseScale.ticks, display: false },
          },
          y: {
            ...baseScale,
            position: 'left',
            title: { display: true, text: 'Rating', color: TICK_COLOR },
          },
        },
        onHover: (event, elements) => {
          if (!mainChart) return;
          const oppDs = mainChart.data.datasets.filter(ds => ds._isOpp);
          if (!oppDs.length || oppDs.length > 150) return;

          const ba = Math.max(0.05, Math.min(0.3, 30 / oppDs.length));
          const hIdx = elements.length ? elements[0].datasetIndex : -1;

          mainChart.data.datasets.forEach((ds, idx) => {
            if (!ds._isOpp) return;
            if (hIdx < 0) {
              ds.borderColor = oppAlpha(ba);
              ds.borderWidth = 1.5;
            } else if (idx === hIdx) {
              ds.borderColor = oppAlpha(1);
              ds.borderWidth = 3;
            } else {
              ds.borderColor = oppAlpha(0.04);
              ds.borderWidth = 1;
            }
          });
          mainChart.update('none');
        },
      },
    });

    /* Volume chart */
    const ctxVol = document.getElementById('chart-volume').getContext('2d');
    if (volumeChart) volumeChart.destroy();

    const volumeData = buildMonthlyVolumeFromGames(games);

    volumeChart = new Chart(ctxVol, {
      type: 'bar',
      data: {
        datasets: [{
          label: 'Games / month',
          data: volumeData,
          backgroundColor: 'rgba(100, 180, 255, 0.25)',
          borderColor: 'rgba(100, 180, 255, 0.4)',
          borderWidth: 1,
          borderRadius: 2,
          barPercentage: 0.9,
          categoryPercentage: 0.9,
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
            padding: 8,
            callbacks: {
              title: items => {
                const raw = items[0]?.raw?.x;
                if (!raw) return '';
                return new Date(raw).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
              },
              label: item => `${item.raw.y} games`,
            },
          },
        },
        scales: {
          x: {
            ...baseScale,
            type: 'time',
            time: { unit: 'month', tooltipFormat: 'MMM yyyy' },
          },
          y: {
            ...baseScale,
            position: 'right',
            beginAtZero: true,
            grid: { drawOnChartArea: false },
            ticks: { ...baseScale.ticks, maxTicksLimit: 3 },
          },
        },
      },
    });
  }

  /* ─── Add opponent lines to existing main chart ─── */

  function addOpponentsToMainChart(opponents, expectedTotal) {
    if (!mainChart) return;

    const total = expectedTotal || opponents.length;
    const ba = Math.max(0.05, Math.min(0.3, 30 / Math.max(1, total)));

    for (const opp of opponents) {
      if (!opp.points || !opp.points.length) continue;
      const filtered = opp.points.filter(p => p.date >= opp.gameDate);
      if (filtered.length < 2) continue;

      mainChart.data.datasets.push({
        label: opp.username,
        data: filtered.map(p => ({ x: p.date, y: p.rating })),
        borderColor: oppAlpha(ba),
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: false,
        tension: 0.25,
        _isOpp: true,
      });
    }

    mainChart.update('none');
  }

  /* ─── Scatter: Improvement plot ─── */

  function lerpColor(t) {
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

    const valid = [];
    let maxAbsChange = 1;

    opponents.forEach(opp => {
      if (opp.currentRating == null) return;
      const ratingChange = opp.currentRating - (opp.ratingAtGame || opp.currentRating);
      maxAbsChange = Math.max(maxAbsChange, Math.abs(ratingChange));
      valid.push({ ...opp, ratingChange });
    });

    const colors = valid.map(opp => {
      const t = opp.ratingChange / maxAbsChange;
      const c = lerpColor(t);
      return `rgba(${c.r}, ${c.g}, ${c.b}, 0.5)`;
    });

    const data = valid.map(opp => ({ x: opp.gameDate, y: opp.ratingChange }));

    scatterChart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [{
          data,
          backgroundColor: colors,
          borderColor: 'transparent',
          pointRadius: 2.5,
          pointHoverRadius: 2.5,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
        },
        scales: {
          x: {
            ...baseScale,
            type: 'time',
            time: { unit: 'month', tooltipFormat: 'MMM yyyy' },
            title: { display: true, text: 'Date you played this opponent', color: TICK_COLOR },
          },
          y: {
            ...baseScale,
            title: { display: true, text: 'Rating change since your game', color: TICK_COLOR },
          },
        },
      },
    });

    renderGainersTable(valid);
  }

  function renderGainersTable(opponents) {
    const container = document.getElementById('top-gainers');
    if (!container) return;

    const sorted = [...opponents]
      .sort((a, b) => b.ratingChange - a.ratingChange)
      .slice(0, 10);

    const rows = sorted.map((opp, i) => {
      const sign = opp.ratingChange >= 0 ? '+' : '';
      const cls = opp.ratingChange >= 0 ? 'gain-positive' : 'gain-negative';
      const date = opp.gameDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
      return `<tr>
        <td>${i + 1}</td>
        <td><a href="https://lichess.org/@/${opp.id}" target="_blank" rel="noopener">${opp.username}</a></td>
        <td>${opp.ratingAtGame}</td>
        <td>${opp.currentRating}</td>
        <td class="${cls}">${sign}${opp.ratingChange}</td>
        <td>${date}</td>
      </tr>`;
    }).join('');

    container.innerHTML = `
      <h3 class="top-gainers__title">Top 10 Biggest Gainers</h3>
      <table class="top-gainers__table">
        <thead><tr>
          <th>#</th><th>Player</th><th>Then</th><th>Now</th><th>Change</th><th>Played</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function destroyAll() {
    if (mainChart) { mainChart.destroy(); mainChart = null; }
    if (volumeChart) { volumeChart.destroy(); volumeChart = null; }
    if (scatterChart) { scatterChart.destroy(); scatterChart = null; }
    const tg = document.getElementById('top-gainers');
    if (tg) tg.innerHTML = '';
    const sl = document.getElementById('stats-line');
    if (sl) { sl.textContent = ''; sl.classList.add('hidden'); }
  }

  return { renderMainChart, addOpponentsToMainChart, renderScatterChart, destroyAll };
})();
