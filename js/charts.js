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
  let fullTimeMin = null;
  let fullTimeMax = null;

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

    fullTimeMin = ratingData[0]?.x?.getTime() ?? Date.now();
    fullTimeMax = ratingData[ratingData.length - 1]?.x?.getTime() ?? Date.now();

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

    const userDs = mainChart.data.datasets[0];
    const userStart = userDs?.data?.[0]?.x;

    const total = expectedTotal || opponents.length;
    const ba = Math.max(0.05, Math.min(0.3, 30 / Math.max(1, total)));

    for (const opp of opponents) {
      if (!opp.points || !opp.points.length) continue;

      const startDate = userStart && opp.gameDate < userStart ? userStart : opp.gameDate;
      const filtered = opp.points.filter(p => p.date >= startDate);
      const anchor = { x: startDate, y: opp.ratingAtGame };
      const lineData = [anchor, ...filtered.map(p => ({ x: p.date, y: p.rating }))];
      if (lineData.length < 2) continue;

      mainChart.data.datasets.push({
        label: opp.username,
        data: lineData,
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

  function scatterColor(diff, maxAbsDiff) {
    const norm = Math.min(1, Math.abs(diff) / maxAbsDiff);
    const t = Math.pow(norm, 0.4);
    const alpha = 0.5 + t * 0.45;
    if (diff >= 0) {
      return `rgba(46, 204, 113, ${alpha})`;
    }
    return `rgba(231, 76, 60, ${alpha})`;
  }

  function renderScatterChart(opponents, userCurrentRating) {
    const ctx = document.getElementById('chart-scatter').getContext('2d');
    if (scatterChart) scatterChart.destroy();

    const valid = [];
    let maxAbsDiff = 1;

    opponents.forEach(opp => {
      if (opp.currentRating == null) return;
      const oppChange = opp.currentRating - (opp.ratingAtGame || opp.currentRating);
      const userChangeSinceGame = userCurrentRating - (opp.myRatingAtGame || userCurrentRating);
      const diff = oppChange - userChangeSinceGame;
      maxAbsDiff = Math.max(maxAbsDiff, Math.abs(diff));
      valid.push({ ...opp, oppChange, userChangeSinceGame, diff });
    });

    const colors = valid.map(opp => scatterColor(opp.diff, maxAbsDiff));
    const data = valid.map(opp => ({ x: opp.gameDate, y: opp.diff }));

    scatterChart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [{
          data,
          backgroundColor: colors,
          borderColor: 'transparent',
          pointRadius: 4.5,
          pointHoverRadius: 7,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
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
              title: items => {
                const i = items[0]?.dataIndex;
                return i != null ? valid[i]?.username : '';
              },
              label: item => {
                const opp = valid[item.dataIndex];
                if (!opp) return '';
                const os = opp.oppChange >= 0 ? '+' : '';
                const us = opp.userChangeSinceGame >= 0 ? '+' : '';
                const ds = opp.diff >= 0 ? '+' : '';
                const date = opp.gameDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
                return [
                  `Them: ${opp.ratingAtGame} → ${opp.currentRating} (${os}${opp.oppChange})`,
                  `You:  ${opp.myRatingAtGame} → ${userCurrentRating} (${us}${opp.userChangeSinceGame})`,
                  `Diff: ${ds}${opp.diff}  ·  ${date}`,
                ];
              },
            },
          },
          annotation: {
            annotations: {
              zeroLine: {
                type: 'line',
                yMin: 0,
                yMax: 0,
                borderColor: 'rgba(255, 255, 255, 0.2)',
                borderWidth: 1,
                borderDash: [4, 3],
                label: {
                  display: true,
                  content: 'Same as you',
                  position: 'end',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  color: TICK_COLOR,
                  font: { size: 10 },
                  padding: { top: 2, bottom: 2, left: 6, right: 6 },
                  borderRadius: 3,
                },
              },
            },
          },
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
            title: { display: true, text: 'Rating gain vs you (opponent − you)', color: TICK_COLOR },
          },
        },
      },
    });

    renderGainersTable(valid, userCurrentRating);
  }

  function renderGainersTable(opponents, userCurrentRating) {
    const container = document.getElementById('top-gainers');
    if (!container) return;

    const sorted = [...opponents]
      .sort((a, b) => b.diff - a.diff)
      .slice(0, 10);

    const rows = sorted.map((opp, i) => {
      const os = opp.oppChange >= 0 ? '+' : '';
      const oCls = opp.oppChange >= 0 ? 'gain-positive' : 'gain-negative';
      const ds = opp.diff >= 0 ? '+' : '';
      const dCls = opp.diff >= 0 ? 'gain-positive' : 'gain-negative';
      const date = opp.gameDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
      return `<tr>
        <td>${i + 1}</td>
        <td><a href="https://lichess.org/@/${opp.id}" target="_blank" rel="noopener">${opp.username}</a></td>
        <td>${opp.ratingAtGame} → ${opp.currentRating}</td>
        <td class="${oCls}">${os}${opp.oppChange}</td>
        <td class="${dCls}">${ds}${opp.diff}</td>
        <td>${date}</td>
      </tr>`;
    }).join('');

    container.innerHTML = `
      <h3 class="top-gainers__title">Top 10 — Gained Most vs You</h3>
      <table class="top-gainers__table">
        <thead><tr>
          <th>#</th><th>Player</th><th>Rating</th><th>Change</th><th>vs You</th><th>Played</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function setTimeRange(loFrac, hiFrac) {
    if (!mainChart || fullTimeMin == null) return;
    const span = fullTimeMax - fullTimeMin;
    const xMin = new Date(fullTimeMin + span * loFrac);
    const xMax = new Date(fullTimeMin + span * hiFrac);

    mainChart.options.scales.x.min = xMin;
    mainChart.options.scales.x.max = xMax;
    mainChart.update('none');

    if (volumeChart) {
      volumeChart.options.scales.x.min = xMin;
      volumeChart.options.scales.x.max = xMax;
      volumeChart.update('none');
    }
  }

  function initRangeSlider() {
    const rangeMin = document.getElementById('range-min');
    const rangeMax = document.getElementById('range-max');
    const track = document.getElementById('range-track');
    if (!rangeMin || !rangeMax || !track) return;

    rangeMin.value = 0;
    rangeMax.value = 1000;
    track.style.setProperty('--lo', '0%');
    track.style.setProperty('--hi', '100%');

    function update() {
      let lo = +rangeMin.value;
      let hi = +rangeMax.value;
      if (lo > hi - 10) {
        if (this === rangeMin) lo = hi - 10;
        else hi = lo + 10;
        rangeMin.value = lo;
        rangeMax.value = hi;
      }
      const loPct = (lo / 1000) * 100;
      const hiPct = (hi / 1000) * 100;
      track.style.setProperty('--lo', `${loPct}%`);
      track.style.setProperty('--hi', `${hiPct}%`);
      setTimeRange(lo / 1000, hi / 1000);
    }

    rangeMin.addEventListener('input', update);
    rangeMax.addEventListener('input', update);
  }

  function destroyAll() {
    if (mainChart) { mainChart.destroy(); mainChart = null; }
    if (volumeChart) { volumeChart.destroy(); volumeChart = null; }
    if (scatterChart) { scatterChart.destroy(); scatterChart = null; }
    fullTimeMin = null;
    fullTimeMax = null;
    const tg = document.getElementById('top-gainers');
    if (tg) tg.innerHTML = '';
    const sl = document.getElementById('stats-line');
    if (sl) { sl.textContent = ''; sl.classList.add('hidden'); }
  }

  return { renderMainChart, addOpponentsToMainChart, renderScatterChart, initRangeSlider, destroyAll };
})();
