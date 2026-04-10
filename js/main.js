(() => {
  const CHART2_MAX_OPPONENTS = 50;

  const form = document.getElementById('analyze-form');
  const usernameInput = document.getElementById('username');
  const variantSelect = document.getElementById('variant');
  const analyzeBtn = document.getElementById('analyze-btn');
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingPhase = document.getElementById('loading-phase');
  const loadingDetail = document.getElementById('loading-detail');
  const progressFill = document.getElementById('progress-fill');
  const chartsSection = document.getElementById('charts-section');

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

    // Phase 1: rating history (single call)
    setPhase('Fetching your rating history...');
    setProgressIndeterminate('');

    let ratingHistory;
    try {
      ratingHistory = await LichessAPI.getRatingHistory(username);
    } catch (e) {
      showError(`Could not find user "${username}". Check the spelling and try again.`);
      return;
    }

    const userPoints = LichessAPI.extractVariantHistory(ratingHistory, variant);
    if (!userPoints.length) {
      showError(`No ${variant} rating data found for "${username}".`);
      return;
    }

    // Show chart 1 immediately
    chartsSection.classList.remove('hidden');
    restartCardAnimations();
    Charts.renderRatingChart(userPoints, username);

    // Phase 2: stream ALL games
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

    const allOpponents = LichessAPI.extractOpponents(games, username);
    setPhase(`Found ${allOpponents.length.toLocaleString()} unique opponents`);

    // Phase 3: batch-fetch current ratings for ALL opponents (300 per call)
    setPhase('Fetching current ratings...');
    setProgress(0, allOpponents.length);

    const allWithRatings = await LichessAPI.batchFetchCurrentRatings(
      allOpponents,
      variant,
      (done, total) => {
        setPhase(`Fetching current ratings...`);
        setProgress(done, total);
      }
    );

    // Render chart 3 (scatter) with ALL opponents
    Charts.renderScatterChart(allWithRatings);

    // Phase 4: fetch full rating histories for chart 2 subset
    const chart2Opponents = allOpponents.slice(0, CHART2_MAX_OPPONENTS);
    setPhase(`Loading rating histories (${chart2Opponents.length} recent opponents)...`);
    setProgress(0, chart2Opponents.length);

    const opponentData = await LichessAPI.getOpponentHistories(
      chart2Opponents,
      variant,
      (current, total) => {
        setPhase(`Loading rating history ${current} of ${total}...`);
        setProgress(current, total);
      }
    );

    Charts.renderOpponentsChart(userPoints, opponentData, username);

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
