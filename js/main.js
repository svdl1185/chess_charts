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

  function showLoading() {
    loadingOverlay.classList.remove('hidden');
    chartsSection.classList.add('hidden');
    progressFill.style.width = '0%';
    loadingDetail.textContent = '';
    analyzeBtn.disabled = true;
  }

  function hideLoading() {
    loadingOverlay.classList.add('hidden');
    analyzeBtn.disabled = false;
  }

  function setPhase(text) {
    loadingPhase.textContent = text;
  }

  function setProgress(current, total) {
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    progressFill.style.width = `${pct}%`;
    loadingDetail.textContent = `${current.toLocaleString()} / ${total.toLocaleString()}`;
  }

  function setProgressIndeterminate(text) {
    progressFill.style.width = '100%';
    loadingDetail.textContent = text;
  }

  function showError(msg) {
    hideLoading();
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
    showLoading();

    const variantLabel = LichessAPI.VARIANT_MAP[variant] || variant;

    // 1 ─ Rating history
    setPhase('Fetching your rating history...');
    setProgressIndeterminate('');

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
    setPhase('Loading all your games...');
    const games = [];
    const gamesPath = `/api/games/user/${encodeURIComponent(username)}?perfType=${variant}&rated=true&sort=dateDesc`;

    try {
      await LichessAPI.streamNDJSON(gamesPath, (game, count) => {
        games.push(game);
        if (count % 50 === 0 || count < 20) {
          setProgressIndeterminate(`${count.toLocaleString()} games loaded`);
        }
      });
    } catch (e) {
      showError(`Failed to load games: ${e.message}`);
      return;
    }

    setProgressIndeterminate(`${games.length.toLocaleString()} games loaded`);

    if (!games.length) {
      hideLoading();
      return;
    }

    // 3 ─ Show main chart immediately (user line + volume from actual games)
    const trimmedGames = games.filter(g => new Date(g.createdAt) >= trimAfter);
    chartsSection.classList.remove('hidden');
    restartCardAnimations();
    Charts.renderMainChart(userPoints, username, trimmedGames);

    const allOpponents = LichessAPI.extractOpponents(games, username);

    // 4 ─ Batch-fetch current ratings for ALL opponents (scatter plot)
    setPhase('Fetching current ratings...');
    setProgress(0, allOpponents.length);

    const allWithRatings = await LichessAPI.batchFetchCurrentRatings(
      allOpponents,
      variant,
      (done, total) => setProgress(done, total),
    );

    // Compute games-since-encounter difference for scatter Y-axis
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

    Charts.renderScatterChart(allWithRatings);

    // 5 ─ Filter to ±10 rating gap, fetch ALL their full histories
    const RATING_GAP = 10;
    const closeOpponents = allOpponents.filter(opp => {
      const gap = Math.abs((opp.ratingAtGame || 0) - (opp.myRatingAtGame || 0));
      return gap <= RATING_GAP;
    });

    const totalClose = closeOpponents.length;
    setPhase(`Loading ${totalClose.toLocaleString()} opponent histories (within ±${RATING_GAP})...`);
    setProgress(0, totalClose);

    const FLUSH_EVERY = 10;
    let pendingOpps = [];

    const oppData = await LichessAPI.getOpponentHistories(
      closeOpponents,
      variant,
      (current, total, result) => {
        setPhase(`Loading opponent history ${current.toLocaleString()} / ${total.toLocaleString()}...`);
        setProgress(current, total);
        if (result) {
          pendingOpps.push(result);
          if (pendingOpps.length >= FLUSH_EVERY) {
            Charts.addOpponentsToMainChart(pendingOpps, totalClose);
            pendingOpps = [];
          }
        }
      },
    );

    // 6 ─ Flush any remaining buffered opponents
    if (pendingOpps.length) {
      Charts.addOpponentsToMainChart(pendingOpps, totalClose);
    }

    // 7 ─ Stats
    const oppLinesRendered = oppData.filter(o => {
      if (!o.points || !o.points.length) return false;
      return o.points.filter(p => p.date >= o.gameDate).length >= 2;
    }).length;

    statsLine.textContent =
      `${games.length.toLocaleString()} rated ${variantLabel.toLowerCase()} games` +
      ` · ${allOpponents.length.toLocaleString()} unique opponents` +
      ` · ${oppLinesRendered.toLocaleString()} within ±${RATING_GAP} shown`;
    statsLine.classList.remove('hidden');

    hideLoading();
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const username = usernameInput.value.trim();
    const variant = variantSelect.value;
    if (!username) return;
    analyze(username, variant);
  });
})();
