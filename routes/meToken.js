// routes/meCoins.js
// Returns the player's current coin balance from linked_decks.json.
// Accepts either ?userId=<discordId> OR Authorization: Bearer <playerToken> (or X-Player-Token)

import fs from 'fs/promises';
import path from 'path';
import express from 'express';

const router = express.Router();

/* ---------------- config + paths ---------------- */
function loadConfig() {
  try {
    const raw = process.env.CONFIG_JSON;
    if (raw) return JSON.parse(raw);
  } catch {}
  try {
    return JSON.parse(require('fs').readFileSync('config.json', 'utf-8')) || {};
  } catch {
    return {};
  }
}
const CONFIG = loadConfig();

// Same file the bot updates when /sellcard or /buycard runs
const LINKED_DECKS_PATH = path.resolve(CONFIG.linked_decks_path || './data/linked_decks.json');

/* ---------------- helpers ---------------- */
async function readJson(file, fallback = {}) {
  try {
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** Format coins with up to 2 decimals, trimming trailing zeros (supports 0.5, 2.5, etc.) */
function formatCoins(n) {
  const s = Number(n).toFixed(2);
  return s.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

/* ---------------- route ---------------- */
// GET /api/meCoins?userId=1234567890
// or with header: Authorization: Bearer <playerToken>
// or with header: X-Player-Token: <playerToken>
router.get('/meCoins', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store'); // always fresh

    const userId = (req.query.userId || '').toString().trim();

    // Token can come from Authorization: Bearer <token> OR X-Player-Token
    const auth = req.headers.authorization || '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
    const headerToken = (req.headers['x-player-token'] || '').toString().trim();
    const token = bearer || headerToken;

    const linked = await readJson(LINKED_DECKS_PATH, {});

    let profile = null;

    // 1) direct lookup by discordId (recommended)
    if (userId && linked[userId]) {
      profile = linked[userId];
    }

    // 2) fallback: lookup by token if provided
    if (!profile && token) {
      const id = Object.keys(linked).find(id => linked[id]?.token === token);
      if (id) profile = linked[id];
    }

    if (!profile) {
      return res.status(404).json({ ok: false, error: 'PLAYER_NOT_FOUND' });
    }

    const coinsNum =
      typeof profile.coins === 'number' && !Number.isNaN(profile.coins) ? profile.coins : 0;

    return res.json({
      ok: true,
      discordId: profile.discordId || null,
      discordName: profile.discordName || null,
      coins: coinsNum,                 // raw (use this for math)
      coinsPretty: formatCoins(coinsNum), // UI-friendly string
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('[meCoins] error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

export default router;
