const LichessAPI = (() => {
  const BASE = 'https://lichess.org';

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

  async function fetchJSON(path) {
    const res = await fetch(`${BASE}${path}`);
    if (!res.ok) throw new Error(`Lichess API error ${res.status} for ${path}`);
    return res.json();
  }

  async function fetchNDJSON(path, onProgress) {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Accept: 'application/x-ndjson' },
    });
    if (!res.ok) throw new Error(`Lichess API error ${res.status} for ${path}`);

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
        try {
          const obj = JSON.parse(trimmed);
          items.push(obj);
          if (onProgress) onProgress(items.length);
        } catch { /* skip malformed lines */ }
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

  async function getOpponentHistories(opponents, variant, onProgress) {
    const results = [];
    for (let i = 0; i < opponents.length; i++) {
      const opp = opponents[i];
      try {
        const history = await getRatingHistory(opp.id);
        const points = extractVariantHistory(history, variant);
        results.push({ ...opp, points });
      } catch {
        results.push({ ...opp, points: [] });
      }
      if (onProgress) onProgress(i + 1, opponents.length);
      if (i < opponents.length - 1) await sleep(1000);
    }
    return results;
  }

  function getUserProfile(username) {
    return fetchJSON(`/api/user/${encodeURIComponent(username)}`);
  }

  return {
    VARIANT_MAP,
    getRatingHistory,
    extractVariantHistory,
    getUserGames,
    extractOpponents,
    getOpponentHistories,
    getUserProfile,
  };
})();
