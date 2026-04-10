const LichessAPI = (() => {
  const BASE = 'https://lichess.org';
  const CONCURRENCY = 5;
  const RETRY_DELAY = 2000;
  const MAX_RETRIES = 3;

  const VARIANT_MAP = {
    ultraBullet: 'UltraBullet',
    bullet: 'Bullet',
    blitz: 'Blitz',
    rapid: 'Rapid',
    classical: 'Classical',
    correspondence: 'Correspondence',
  };

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function fetchWithRetry(url, opts = {}, retries = MAX_RETRIES) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const res = await fetch(url, opts);
      if (res.status === 429) {
        const wait = RETRY_DELAY * (attempt + 1);
        await sleep(wait);
        continue;
      }
      if (!res.ok) throw new Error(`Lichess API error ${res.status}`);
      return res;
    }
    throw new Error('Rate limited after retries');
  }

  async function fetchJSON(path) {
    const res = await fetchWithRetry(`${BASE}${path}`);
    return res.json();
  }

  async function fetchNDJSON(path) {
    const res = await fetchWithRetry(`${BASE}${path}`, {
      headers: { Accept: 'application/x-ndjson' },
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const items = [];
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try { items.push(JSON.parse(trimmed)); } catch { /* skip */ }
      }
    }
    if (buffer.trim()) {
      try { items.push(JSON.parse(buffer.trim())); } catch { /* skip */ }
    }
    return items;
  }

  async function getRatingHistory(username) {
    return fetchJSON(`/api/user/${encodeURIComponent(username)}/rating-history`);
  }

  function extractVariantHistory(ratingHistory, variant) {
    const displayName = VARIANT_MAP[variant] || variant;
    const entry = ratingHistory.find(
      e => e.name.toLowerCase() === displayName.toLowerCase()
    );
    if (!entry || !entry.points.length) return [];
    return entry.points.map(([y, m, d, r]) => ({
      date: new Date(y, m, d),
      rating: r,
    }));
  }

  async function getUserGames(username, variant, max = 100) {
    const path = `/api/games/user/${encodeURIComponent(username)}?perfType=${variant}&max=${max}&rated=true&sort=dateDesc`;
    return fetchNDJSON(path);
  }

  function extractOpponents(games, myUsername) {
    const lower = myUsername.toLowerCase();
    const seen = new Map();

    for (const game of games) {
      const white = game.players?.white;
      const black = game.players?.black;
      if (!white?.user || !black?.user) continue;

      const isWhite = white.user.id.toLowerCase() === lower ||
                      white.user.name?.toLowerCase() === lower;
      const me = isWhite ? white : black;
      const opp = isWhite ? black : white;
      const oppId = opp.user.id.toLowerCase();

      if (!seen.has(oppId)) {
        seen.set(oppId, {
          username: opp.user.name || opp.user.id,
          id: opp.user.id,
          ratingAtGame: opp.rating,
          myRatingAtGame: me.rating,
          gameDate: new Date(game.createdAt),
        });
      }
    }
    return [...seen.values()];
  }

  async function runPool(tasks, concurrency, onItemDone) {
    const results = new Array(tasks.length);
    let nextIndex = 0;
    let completed = 0;

    async function worker() {
      while (nextIndex < tasks.length) {
        const i = nextIndex++;
        results[i] = await tasks[i]();
        completed++;
        if (onItemDone) onItemDone(completed, tasks.length);
      }
    }

    const workers = Array.from(
      { length: Math.min(concurrency, tasks.length) },
      () => worker()
    );
    await Promise.all(workers);
    return results;
  }

  async function getOpponentHistories(opponents, variant, onProgress) {
    const tasks = opponents.map(opp => async () => {
      try {
        const history = await getRatingHistory(opp.id);
        const points = extractVariantHistory(history, variant);
        return { ...opp, points };
      } catch {
        return { ...opp, points: [] };
      }
    });

    return runPool(tasks, CONCURRENCY, onProgress);
  }

  return {
    VARIANT_MAP,
    getRatingHistory,
    extractVariantHistory,
    getUserGames,
    extractOpponents,
    getOpponentHistories,
  };
})();
