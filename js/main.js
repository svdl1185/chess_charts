(() => {
  const MAX_OPPONENTS = 30;

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
    const pct = Math.round((current / total) * 100);
    progressFill.style.width = `${pct}%`;
    loadingDetail.textContent = `${current} / ${total}`;
  }

  function showError(msg) {
    hideLoading();
    alert(msg);
  }

  function restartCardAnimations() {
    const cards = chartsSection.querySelectorAll('.chart-card');
    cards.forEach(card => {
      card.style.animation = 'none';
      card.offsetHeight; // force reflow
      card.style.animation = '';
    });
  }

  async function analyze(username, variant) {
    Charts.destroyAll();
    showLoading();

    // Phase 1: rating history
    setPhase('Fetching your rating history...');
    setProgress(1, 4);

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

    // Show Chart 1 immediately
    setProgress(2, 4);
    chartsSection.classList.remove('hidden');
    restartCardAnimations();
    Charts.renderRatingChart(userPoints, username);

    // Phase 2: fetch games
    setPhase('Loading your games...');
    setProgress(2, 4);

    let games;
    try {
      games = await LichessAPI.getUserGames(username, variant, 100);
    } catch (e) {
      showError(`Failed to load games: ${e.message}`);
      return;
    }

    if (!games.length) {
      setPhase('No games found for this variant.');
      hideLoading();
      return;
    }

    const allOpponents = LichessAPI.extractOpponents(games, username);
    const opponents = allOpponents.slice(0, MAX_OPPONENTS);

    // Phase 3: fetch opponent histories
    setPhase('Analyzing opponents...');
    setProgress(0, opponents.length);

    const opponentData = await LichessAPI.getOpponentHistories(
      opponents,
      variant,
      (current, total) => {
        setPhase(`Analyzing opponent ${current} of ${total}...`);
        setProgress(current, total);
      }
    );

    // Phase 4: render charts 2 & 3
    setPhase('Rendering charts...');

    Charts.renderOpponentsChart(userPoints, opponentData, username);
    Charts.renderScatterChart(opponentData);

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
