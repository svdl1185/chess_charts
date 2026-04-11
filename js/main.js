(() => {
  const form = document.getElementById('analyze-form');
  const usernameInput = document.getElementById('username');
  const variantSelect = document.getElementById('variant');
  const analyzeBtn = document.getElementById('analyze-btn');
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingPhase = document.getElementById('loading-phase');
  const loadingDetail = document.getElementById('loading-detail');
  const progressFill = document.getElementById('progress-fill');
  const chartsSection = document.getElementById('charts-section');
  const statsLine = document.getElementById('stats-line');

  const scatterLoading = document.getElementById('scatter-loading');
  const scatterLoadingPhase = document.getElementById('scatter-loading-phase');
  const scatterProgressFill = document.getElementById('scatter-progress-fill');
  const scatterLoadingDetail = document.getElementById('scatter-loading-detail');

  const mainLoading = document.getElementById('main-loading');
  const mainLoadingText = document.getElementById('main-loading-text');
  const mainProgressFill = document.getElementById('main-progress-fill');

  function showGlobalLoading() {
    loadingOverlay.classList.remove('hidden');
    chartsSection.classList.add('hidden');
    progressFill.style.width = '0%';
    loadingDetail.textContent = '';
    analyzeBtn.disabled = true;
  }

  function hideGlobalLoading() {
    loadingOverlay.classList.add('hidden');
  }

  function setGlobalPhase(text) {
    loadingPhase.textContent = text;
  }

  function setGlobalIndeterminate(text) {
    progressFill.style.width = '100%';
    loadingDetail.textContent = text;
  }

  function showScatterLoading(phase, total) {
    scatterLoading.classList.remove('hidden');
    scatterLoadingPhase.textContent = phase;
    scatterProgressFill.style.width = '0%';
    scatterLoadingDetail.textContent = total ? `0 / ${total.toLocaleString()}` : '';
  }

  function updateScatterProgress(done, total) {
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    scatterProgressFill.style.width = `${pct}%`;
    scatterLoadingDetail.textContent = `${done.toLocaleString()} / ${total.toLocaleString()}`;
  }

  function hideScatterLoading() {
    scatterLoading.classList.add('hidden');
  }

  function showMainLoading(text) {
    mainLoading.classList.remove('hidden');
    mainLoadingText.textContent = text;
    mainProgressFill.style.width = '0%';
  }

  function updateMainProgress(done, total) {
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    mainProgressFill.style.width = `${pct}%`;
    mainLoadingText.textContent = `Loading opponent histories… ${done.toLocaleString()} / ${total.toLocaleString()}`;
  }

  function hideMainLoading() {
    mainLoading.classList.add('hidden');
  }

  function showError(msg) {
    hideGlobalLoading();
    hideScatterLoading();
    hideMainLoading();
    analyzeBtn.disabled = false;
    alert(msg);
  }

  function restartCardAnimations() {
    const cards = chartsSection.querySelectorAll('.chart-card');
    cards.forEach(card => {
      card.style.animation = 'none';
      card.offsetHeight;
      card.style.animation = '';
    });
  }

  async function analyze(username, variant) {
    Charts.destroyAll();
    showGlobalLoading();

    const variantLabel = LichessAPI.VARIANT_MAP[variant] || variant;

    // 1 ─ Rating history
    setGlobalPhase('Fetching your rating history…');
    setGlobalIndeterminate('');

    let ratingHistory;
    try {
      ratingHistory = await LichessAPI.getRatingHistory(username);
    } catch {
      showError(`Could not find user "${username}". Check the spelling and try again.`);
      return;
    }

    const allUserPoints = LichessAPI.extractVariantHistory(ratingHistory, variant);
    if (!allUserPoints.length) {
      showError(`No ${variantLabel} rating data found for "${username}".`);
      return;
    }

    const TRIM_DAYS = 30;
    const trimAfter = new Date(allUserPoints[0].date.getTime() + TRIM_DAYS * 86400000);
    const userPoints = allUserPoints.filter(p => p.date >= trimAfter);

    // 2 ─ Stream ALL rated games
    setGlobalPhase('Loading all your games…');
    const games = [];
    const gamesPath = `/api/games/user/${encodeURIComponent(username)}?perfType=${variant}&rated=true&sort=dateDesc`;

    try {
      await LichessAPI.streamNDJSON(gamesPath, (game, count) => {
        games.push(game);
        if (count % 50 === 0 || count < 20) {
          setGlobalIndeterminate(`${count.toLocaleString()} games loaded`);
        }
      });
    } catch (e) {
      showError(`Failed to load games: ${e.message}`);
      return;
    }

    if (!games.length) {
      hideGlobalLoading();
      analyzeBtn.disabled = false;
      return;
    }

    // 3 ─ Hide global loading, show charts with per-chart indicators
    hideGlobalLoading();
    const trimmedGames = games.filter(g => new Date(g.createdAt) >= trimAfter);
    chartsSection.classList.remove('hidden');
    restartCardAnimations();

    Charts.renderMainChart(userPoints, username, trimmedGames);
    Charts.initRangeSlider();

    const allOpponents = LichessAPI.extractOpponents(games, username);

    // 4 ─ Scatter: fetch current ratings (per-chart loading)
    showScatterLoading(
      `Fetching current ratings for ${allOpponents.length.toLocaleString()} opponents…`,
      allOpponents.length,
    );

    const allWithRatings = await LichessAPI.batchFetchCurrentRatings(
      allOpponents,
      variant,
      (done, total) => updateScatterProgress(done, total),
    );

    const userCurrentRating = userPoints[userPoints.length - 1]?.rating ?? 0;

    const gameTimestamps = games.map(g => g.createdAt).sort((a, b) => a - b);
    function userGamesSince(ts) {
      let lo = 0, hi = gameTimestamps.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (gameTimestamps[mid] < ts) lo = mid + 1;
        else hi = mid;
      }
      return gameTimestamps.length - lo;
    }

    const now = Date.now();
    for (const opp of allWithRatings) {
      const gameTs = opp.gameDate.getTime();
      opp.userGamesSince = userGamesSince(gameTs);
      if (opp.totalGames != null && opp.accountCreatedAt) {
        const accountAgeDays = (now - opp.accountCreatedAt) / 86400000;
        const daysSinceGame = (now - gameTs) / 86400000;
        opp.estOppGamesSince = accountAgeDays > 0
          ? Math.round(opp.totalGames * (daysSinceGame / accountAgeDays))
          : 0;
      } else {
        opp.estOppGamesSince = null;
      }
      opp.gamesDiff = opp.estOppGamesSince != null
        ? opp.estOppGamesSince - opp.userGamesSince
        : null;
    }

    Charts.renderScatterChart(allWithRatings, userCurrentRating);
    hideScatterLoading();

    // 5 ─ Main chart: fetch opponent histories (inline loading)
    const RATING_GAP = 10;
    const closeOpponents = allOpponents.filter(opp => {
      const gap = Math.abs((opp.ratingAtGame || 0) - (opp.myRatingAtGame || 0));
      return gap <= RATING_GAP;
    });

    const totalClose = closeOpponents.length;
    showMainLoading(`Loading ${totalClose.toLocaleString()} opponent histories (±${RATING_GAP} rating)…`);

    const FLUSH_EVERY = 10;
    let pendingOpps = [];

    const oppData = await LichessAPI.getOpponentHistories(
      closeOpponents,
      variant,
      (current, total, result) => {
        updateMainProgress(current, total);
        if (result) {
          pendingOpps.push(result);
          if (pendingOpps.length >= FLUSH_EVERY) {
            Charts.addOpponentsToMainChart(pendingOpps, totalClose);
            pendingOpps = [];
          }
        }
      },
    );

    if (pendingOpps.length) {
      Charts.addOpponentsToMainChart(pendingOpps, totalClose);
    }

    hideMainLoading();

    // 6 ─ Stats
    const oppLinesRendered = oppData.filter(o => {
      if (!o.points || !o.points.length) return false;
      return o.points.filter(p => p.date >= o.gameDate).length >= 2;
    }).length;

    statsLine.textContent =
      `${games.length.toLocaleString()} rated ${variantLabel.toLowerCase()} games` +
      ` · ${allOpponents.length.toLocaleString()} unique opponents` +
      ` · ${oppLinesRendered.toLocaleString()} within ±${RATING_GAP} shown`;
    statsLine.classList.remove('hidden');

    analyzeBtn.disabled = false;
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const username = usernameInput.value.trim();
    const variant = variantSelect.value;
    if (!username) return;
    analyze(username, variant);
  });
})();
