const LichessAPI = (() => {
  const BASE = 'https://lichess.org';
  const CONCURRENCY = 10;
  const BATCH_SIZE = 300;
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

  const PERF_KEY_MAP = {
    ultraBullet: 'ultraBullet',
    bullet: 'bullet',
    blitz: 'blitz',
    rapid: 'rapid',
    classical: 'classical',
    correspondence: 'correspondence',
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

  async function streamNDJSON(path, onItem) {
    const res = await fetchWithRetry(`${BASE}${path}`, {
      headers: { Accept: 'application/x-ndjson' },
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let count = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const obj = JSON.parse(trimmed);
          count++;
          if (onItem) onItem(obj, count);
        } catch { /* skip */ }
      }
    }
    if (buffer.trim()) {
      try {
        const obj = JSON.parse(buffer.trim());
        count++;
        if (onItem) onItem(obj, count);
      } catch { /* skip */ }
    }
    return count;
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

  async function batchFetchCurrentRatings(opponents, variant, onProgress) {
    const perfKey = PERF_KEY_MAP[variant] || variant;
    const chunks = [];
    for (let i = 0; i < opponents.length; i += BATCH_SIZE) {
      chunks.push(opponents.slice(i, i + BATCH_SIZE));
    }

    const ratingMap = new Map();
    let done = 0;

    for (const chunk of chunks) {
      const ids = chunk.map(o => o.id).join(',');
      try {
        const res = await fetchWithRetry(`${BASE}/api/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: ids,
        });
        const users = await res.json();
        for (const u of users) {
          const perf = u.perfs?.[perfKey];
          if (perf) {
            ratingMap.set(u.id.toLowerCase(), perf.rating);
          }
        }
      } catch { /* skip failed batch */ }
      done += chunk.length;
      if (onProgress) onProgress(Math.min(done, opponents.length), opponents.length);
    }

    return opponents.map(opp => ({
      ...opp,
      currentRating: ratingMap.get(opp.id.toLowerCase()) ?? null,
    }));
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
        if (onItemDone) onItemDone(completed, tasks.length, results[i]);
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
    streamNDJSON,
    extractOpponents,
    batchFetchCurrentRatings,
    getOpponentHistories,
  };
})();
