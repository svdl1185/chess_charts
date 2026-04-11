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
  let scatter2Chart = null;
  let histogramChart = null;
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

  /* ─── Shared scatter helpers ─── */

  const SYMLOG_C = 1000;

  function symlog(v) {
    return Math.sign(v) * Math.log10(1 + Math.abs(v) / SYMLOG_C);
  }

  function symexp(v) {
    return Math.sign(v) * SYMLOG_C * (Math.pow(10, Math.abs(v)) - 1);
  }

  function formatGamesDiff(v) {
    const rounded = Math.round(v);
    if (rounded === 0) return '0';
    const abs = Math.abs(rounded);
    if (abs >= 1000) return `${(rounded / 1000).toFixed(0)}k`;
    return rounded.toLocaleString();
  }

  const SYMLOG_NICE = [-50000, -20000, -10000, -5000, -1000, 0, 1000, 5000, 10000, 20000, 50000];

  const tooltipBase = {
    backgroundColor: '#1a1a2e',
    borderColor: '#2a2a4a',
    borderWidth: 1,
    titleColor: '#e8e8f0',
    bodyColor: '#e8e8f0',
    padding: 10,
    displayColors: false,
  };

  function sign(v) { return v >= 0 ? '+' : ''; }

  function prepareValidOpponents(opponents, userCurrentRating) {
    const valid = [];
    let maxAbsDiff = 1;
    opponents.forEach(opp => {
      if (opp.currentRating == null || opp.gamesDiff == null) return;
      const oppChange = opp.currentRating - (opp.ratingAtGame || opp.currentRating);
      const userChangeSinceGame = userCurrentRating - (opp.myRatingAtGame || userCurrentRating);
      const diff = oppChange - userChangeSinceGame;
      const daysSince = Math.max(1, (Date.now() - opp.gameDate.getTime()) / 86400000);
      maxAbsDiff = Math.max(maxAbsDiff, Math.abs(diff));
      valid.push({ ...opp, oppChange, userChangeSinceGame, diff, daysSince });
    });
    return { valid, maxAbsDiff };
  }

  function addClickToOpen(chart, validData) {
    const canvas = chart.canvas;
    canvas.style.cursor = 'default';
    canvas.addEventListener('click', (evt) => {
      const points = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, false);
      if (!points.length) return;
      const idx = points[0].element?.$context?.raw?._idx;
      if (idx == null) return;
      const opp = validData[idx];
      if (opp) window.open(`https://lichess.org/@/${opp.id}`, '_blank');
    });
    canvas.addEventListener('mousemove', (evt) => {
      const points = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, false);
      canvas.style.cursor = points.length ? 'pointer' : 'default';
    });
  }

  /* ─── Scatter 1: Activity Since Encounter ─── */

  function scatterColor(diff, maxAbsDiff, isGreen) {
    const norm = Math.min(1, Math.abs(diff) / maxAbsDiff);
    const t = Math.pow(norm, 0.4);
    if (isGreen) {
      const alpha = 0.6 + t * 0.35;
      return `rgba(46, 204, 113, ${alpha})`;
    }
    const alpha = 0.3 + t * 0.4;
    return `rgba(231, 76, 60, ${alpha})`;
  }

  function renderScatterChart(opponents, userCurrentRating) {
    const ctx = document.getElementById('chart-scatter').getContext('2d');
    if (scatterChart) scatterChart.destroy();

    const { valid, maxAbsDiff } = prepareValidOpponents(opponents, userCurrentRating);

    const redData = [];
    const redColors = [];
    const greenData = [];
    const greenColors = [];

    valid.forEach((opp, i) => {
      const point = { x: opp.gameDate, y: symlog(opp.gamesDiff), _idx: i };
      if (opp.diff >= 0) {
        greenData.push(point);
        greenColors.push(scatterColor(opp.diff, maxAbsDiff, true));
      } else {
        redData.push(point);
        redColors.push(scatterColor(opp.diff, maxAbsDiff, false));
      }
    });

    function tooltipTitle(items) {
      const idx = items[0]?.raw?._idx;
      return idx != null ? valid[idx]?.username : '';
    }

    function tooltipLabel(item) {
      const opp = valid[item.raw._idx];
      if (!opp) return '';
      const date = opp.gameDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
      const gds = opp.gamesDiff >= 0 ? '+' : '';
      return [
        `Games since: ~${opp.estOppGamesSince} them vs ${opp.userGamesSince} you (${gds}${opp.gamesDiff})`,
        `Opp: ${opp.ratingAtGame} → ${opp.currentRating} (${sign(opp.oppChange)}${opp.oppChange})`,
        `You: ${opp.myRatingAtGame} → ${userCurrentRating} (${sign(opp.userChangeSinceGame)}${opp.userChangeSinceGame})`,
        `Net: ${sign(opp.diff)}${opp.diff}  ·  ${date}`,
      ];
    }

    scatterChart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'Gained less',
            data: redData,
            backgroundColor: redColors,
            borderColor: 'transparent',
            pointRadius: 2.5,
            pointHoverRadius: 6,
            order: 2,
          },
          {
            label: 'Gained more',
            data: greenData,
            backgroundColor: greenColors,
            borderColor: 'rgba(46, 204, 113, 0.6)',
            borderWidth: 1,
            pointRadius: 4,
            pointHoverRadius: 7,
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: { ...tooltipBase, callbacks: { title: tooltipTitle, label: tooltipLabel } },
          annotation: {
            annotations: {
              zeroLine: {
                type: 'line', yMin: 0, yMax: 0,
                borderColor: 'rgba(255, 255, 255, 0.2)', borderWidth: 1, borderDash: [4, 4],
                label: {
                  display: true, content: 'same activity', position: 'start',
                  backgroundColor: 'transparent', color: 'rgba(255, 255, 255, 0.3)', font: { size: 10 },
                },
              },
            },
          },
        },
        scales: {
          x: {
            ...baseScale, type: 'time',
            time: { unit: 'month', tooltipFormat: 'MMM yyyy' },
            title: { display: true, text: 'Date you played this opponent', color: TICK_COLOR },
          },
          y: {
            ...baseScale,
            title: { display: true, text: "Opponent's est. games − your games (since encounter)", color: TICK_COLOR },
            afterBuildTicks: (axis) => {
              axis.ticks = SYMLOG_NICE
                .map(v => symlog(v))
                .filter(v => v >= axis.min - 0.01 && v <= axis.max + 0.01)
                .map(value => ({ value }));
            },
            ticks: { ...baseScale.ticks, callback: value => formatGamesDiff(symexp(value)) },
          },
        },
      },
    });

    addClickToOpen(scatterChart, valid);
    renderScatter2Chart(valid, userCurrentRating);
    renderHistogramChart(valid);
    renderGainersTable(valid, userCurrentRating);
  }

  /* ─── Scatter 2: Rating Change You vs Opponent ─── */

  function renderScatter2Chart(valid, userCurrentRating) {
    const ctx = document.getElementById('chart-scatter2').getContext('2d');
    if (scatter2Chart) scatter2Chart.destroy();

    const maxDays = Math.max(1, ...valid.map(o => o.daysSince));
    const data = [];
    const bgColors = [];
    const radii = [];

    valid.forEach((opp, i) => {
      data.push({ x: opp.userChangeSinceGame, y: opp.oppChange, _idx: i });
      const recencyNorm = 1 - Math.min(1, opp.daysSince / maxDays);
      const alpha = 0.15 + recencyNorm * 0.75;
      const isGreen = opp.diff >= 0;
      if (isGreen) {
        bgColors.push(`rgba(46, 204, 113, ${alpha})`);
      } else {
        bgColors.push(`rgba(231, 76, 60, ${alpha})`);
      }
      radii.push(2.5 + recencyNorm * 4);
    });

    function tooltipTitle(items) {
      const idx = items[0]?.raw?._idx;
      return idx != null ? valid[idx]?.username : '';
    }

    function tooltipLabel(item) {
      const opp = valid[item.raw._idx];
      if (!opp) return '';
      const date = opp.gameDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
      const days = Math.round(opp.daysSince);
      return [
        `Opp: ${opp.ratingAtGame} → ${opp.currentRating} (${sign(opp.oppChange)}${opp.oppChange})`,
        `You: ${opp.myRatingAtGame} → ${userCurrentRating} (${sign(opp.userChangeSinceGame)}${opp.userChangeSinceGame})`,
        `Net: ${sign(opp.diff)}${opp.diff}  ·  ${date} (${days}d ago)`,
      ];
    }

    const allX = valid.map(o => o.userChangeSinceGame);
    const allY = valid.map(o => o.oppChange);
    const lo = Math.min(Math.min(...allX), Math.min(...allY)) - 20;
    const hi = Math.max(Math.max(...allX), Math.max(...allY)) + 20;

    scatter2Chart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [{
          data,
          backgroundColor: bgColors,
          borderColor: 'transparent',
          pointRadius: radii,
          pointHoverRadius: 8,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: { ...tooltipBase, callbacks: { title: tooltipTitle, label: tooltipLabel } },
          annotation: {
            annotations: {
              diagonal: {
                type: 'line', yMin: lo, yMax: hi, xMin: lo, xMax: hi,
                borderColor: 'rgba(255, 255, 255, 0.15)', borderWidth: 1, borderDash: [6, 4],
                label: {
                  display: true, content: 'equal change', position: 'end',
                  backgroundColor: 'transparent', color: 'rgba(255, 255, 255, 0.3)', font: { size: 10 },
                },
              },
              zeroX: {
                type: 'line', xMin: 0, xMax: 0,
                borderColor: 'rgba(255, 255, 255, 0.08)', borderWidth: 1,
              },
              zeroY: {
                type: 'line', yMin: 0, yMax: 0,
                borderColor: 'rgba(255, 255, 255, 0.08)', borderWidth: 1,
              },
            },
          },
        },
        scales: {
          x: {
            ...baseScale,
            title: { display: true, text: 'Your rating change since game', color: TICK_COLOR },
          },
          y: {
            ...baseScale,
            title: { display: true, text: "Opponent's rating change since game", color: TICK_COLOR },
          },
        },
      },
    });

    addClickToOpen(scatter2Chart, valid);
  }

  /* ─── Histogram: Rating Gain Distribution ─── */

  function renderHistogramChart(valid) {
    const ctx = document.getElementById('chart-histogram').getContext('2d');
    if (histogramChart) histogramChart.destroy();

    const diffs = valid.map(o => o.diff);
    if (!diffs.length) return;

    const absMax = Math.max(50, Math.max(...diffs.map(Math.abs)));
    const binWidth = absMax <= 100 ? 10 : absMax <= 500 ? 25 : 50;
    const lo = Math.floor(Math.min(...diffs) / binWidth) * binWidth;
    const hi = Math.ceil(Math.max(...diffs) / binWidth) * binWidth;

    const bins = [];
    for (let edge = lo; edge < hi; edge += binWidth) {
      bins.push({ lo: edge, hi: edge + binWidth, count: 0 });
    }
    for (const d of diffs) {
      const idx = Math.min(bins.length - 1, Math.max(0, Math.floor((d - lo) / binWidth)));
      bins[idx].count++;
    }

    const labels = bins.map(b => {
      const mid = (b.lo + b.hi) / 2;
      return mid >= 0 ? `+${mid}` : `${mid}`;
    });
    const counts = bins.map(b => b.count);
    const barColors = bins.map(b => {
      const mid = (b.lo + b.hi) / 2;
      if (mid < -binWidth / 2) return 'rgba(231, 76, 60, 0.55)';
      if (mid > binWidth / 2) return 'rgba(46, 204, 113, 0.55)';
      return 'rgba(255, 255, 255, 0.2)';
    });

    histogramChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: counts,
          backgroundColor: barColors,
          borderColor: barColors.map(c => c.replace(/[\d.]+\)$/, '0.8)')),
          borderWidth: 1,
          borderRadius: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipBase,
            callbacks: {
              title: items => {
                const idx = items[0]?.dataIndex;
                if (idx == null) return '';
                const b = bins[idx];
                return `${b.lo >= 0 ? '+' : ''}${b.lo} to ${b.hi >= 0 ? '+' : ''}${b.hi}`;
              },
              label: item => `${item.raw} opponents`,
            },
          },
          annotation: {
            annotations: {
              zeroLine: {
                type: 'line', xMin: labels.indexOf('+0') !== -1 ? labels.indexOf('+0') : undefined,
                xMax: labels.indexOf('+0') !== -1 ? labels.indexOf('+0') : undefined,
                borderColor: 'rgba(255, 255, 255, 0.3)', borderWidth: 1, borderDash: [4, 3],
              },
            },
          },
        },
        scales: {
          x: {
            ...baseScale,
            title: { display: true, text: 'Opponent rating change − your rating change', color: TICK_COLOR },
            ticks: {
              ...baseScale.ticks, maxRotation: 0,
              callback: function (val, idx) { return idx % 2 === 0 ? this.getLabelForValue(val) : ''; },
            },
          },
          y: {
            ...baseScale,
            beginAtZero: true,
            title: { display: true, text: 'Number of opponents', color: TICK_COLOR },
          },
        },
      },
    });
  }

  /* ─── Top Gainers Table ─── */

  function renderGainersTable(opponents, userCurrentRating) {
    const container = document.getElementById('top-gainers');
    if (!container) return;

    const sorted = [...opponents]
      .sort((a, b) => b.diff - a.diff)
      .slice(0, 10);

    const rows = sorted.map((opp, i) => {
      const dCls = opp.diff >= 0 ? 'gain-positive' : 'gain-negative';
      const date = opp.gameDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
      return `<tr>
        <td>${i + 1}</td>
        <td><a href="https://lichess.org/@/${opp.id}" target="_blank" rel="noopener">${opp.username}</a></td>
        <td>${sign(opp.oppChange)}${opp.oppChange}</td>
        <td>${sign(opp.userChangeSinceGame)}${opp.userChangeSinceGame}</td>
        <td class="${dCls}">${sign(opp.diff)}${opp.diff}</td>
        <td>${date}</td>
      </tr>`;
    }).join('');

    container.innerHTML = `
      <h3 class="top-gainers__title">Top 10 — Gained Most vs You</h3>
      <table class="top-gainers__table">
        <thead><tr>
          <th>#</th><th>Player</th><th>Them</th><th>You</th><th>Net</th><th>Played</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  /* ─── Range slider & time range ─── */

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

  /* ─── Cleanup ─── */

  function destroyAll() {
    [mainChart, volumeChart, scatterChart, scatter2Chart, histogramChart].forEach(c => {
      if (c) c.destroy();
    });
    mainChart = volumeChart = scatterChart = scatter2Chart = histogramChart = null;
    fullTimeMin = null;
    fullTimeMax = null;
    const tg = document.getElementById('top-gainers');
    if (tg) tg.innerHTML = '';
    const sl = document.getElementById('stats-line');
    if (sl) { sl.textContent = ''; sl.classList.add('hidden'); }
  }

  return { renderMainChart, addOpponentsToMainChart, renderScatterChart, initRangeSlider, destroyAll };
})();
