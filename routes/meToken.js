// routes/meCoins.js
// Returns the player's current coin balance from persistent storage.
// Accepts either ?userId=<discordId> OR Authorization: Bearer <playerToken> (or X-Player-Token)
// NEW: Falls back to local JSON if remote storage isn't configured.
// NEW: Adds GET /api/meSellStatus to expose daily sell usage for the UI.

import fs from 'fs/promises';
import path from 'path';
import express from 'express';

// Optional remote storage client (preferred)
let load_file = null;
try {
  // If your UI repo has utils/storageClient.js (same API as the bot backend), this will work.
  ({ load_file } = await import('../utils/storageClient.js'));
} catch {
  // No remote storage available; we'll fall back to local file reads.
}

const router = express.Router();

/* ---------------- config + paths ---------------- */
function loadConfig() {
  try {
    const raw = process.env.CONFIG_JSON;
    if (raw) return JSON.parse(raw);
  } catch {}
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return JSON.parse(require('fs').readFileSync('config.json', 'utf-8')) || {};
  } catch {
    return {};
  }
}
const CONFIG = loadConfig();

// Same files the bot updates
const LINKED_DECKS_FILE = 'data/linked_decks.json';
const SELLS_BY_DAY_FILE = 'data/sells_by_day.json';

// Local fallbacks (only used if remote loader is not available)
const LINKED_DECKS_PATH = path.resolve(CONFIG.linked_decks_path || `./${LINKED_DECKS_FILE}`);
const SELLS_BY_DAY_PATH = path.resolve(CONFIG.sells_by_day_path || `./${SELLS_BY_DAY_FILE}`);

// Daily limit (keep in sync with backend)
const DAILY_LIMIT = Number(process.env.DAILY_SELL_LIMIT || 5);

/* ---------------- helpers ---------------- */
async function readJsonLocal(file, fallback = {}) {
  try {
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** Prefer remote storage; else local file */
async function readJsonSmart(remoteName, localPath, fallback = {}) {
  if (typeof load_file === 'function') {
    try {
      const obj = await load_file(remoteName);
      if (obj && typeof obj === 'object') return obj;
    } catch {
      // fall through to local
    }
  }
  return readJsonLocal(localPath, fallback);
}

/** Format coins with up to 2 decimals, trimming trailing zeros (supports 0.5, 2.5, etc.) */
function formatCoins(n) {
  const s = Number(n).toFixed(2);
  return s.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

/** Resolve profile by userId or token */
function resolveProfile({ linked, userId, token }) {
  if (userId && linked[userId]) return linked[userId];

  if (token) {
    const id = Object.keys(linked).find(id => linked[id]?.token === token);
    if (id) return linked[id];
  }
  return null;
}

function todayKeyUTC(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function nextUTCmidnightISO(d = new Date()) {
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0));
  return next.toISOString();
}

/* ---------------- route: coins ---------------- */
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

    const linked = await readJsonSmart(LINKED_DECKS_FILE, LINKED_DECKS_PATH, {});
    const profile = resolveProfile({ linked, userId, token });

    if (!profile) {
      return res.status(404).json({ ok: false, error: 'PLAYER_NOT_FOUND' });
    }

    const coinsNum =
      typeof profile.coins === 'number' && !Number.isNaN(profile.coins) ? profile.coins : 0;

    return res.json({
      ok: true,
      discordId: profile.discordId || null,
      discordName: profile.discordName || null,
      coins: coinsNum,                    // raw (use this for math)
      coinsPretty: formatCoins(coinsNum), // UI-friendly string
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('[meCoins] error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

/* --------------- route: daily sell status for the UI (optional) -------------- */
// GET /api/meSellStatus?userId=123
// or header Authorization: Bearer <token> / X-Player-Token: <token>
router.get('/meSellStatus', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');

    const userIdQ = (req.query.userId || '').toString().trim();

    const auth = req.headers.authorization || '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
    const headerToken = (req.headers['x-player-token'] || '').toString().trim();
    const token = bearer || headerToken;

    // Need to resolve to a specific discordId
    const linked = await readJsonSmart(LINKED_DECKS_FILE, LINKED_DECKS_PATH, {});
    let discordId = userIdQ;
    if (!discordId && token) {
      const id = Object.keys(linked).find(id => linked[id]?.token === token);
      if (id) discordId = id;
    }

    if (!discordId) {
      return res.status(400).json({ ok: false, error: 'MISSING_ID_OR_TOKEN' });
    }

    const sellsByDay = await readJsonSmart(SELLS_BY_DAY_FILE, SELLS_BY_DAY_PATH, {});
    const dayKey = todayKeyUTC();
    const userSellMap = sellsByDay[discordId] || {};
    const soldToday = Number(userSellMap[dayKey] || 0);

    return res.json({
      ok: true,
      soldToday,
      soldRemaining: Math.max(0, DAILY_LIMIT - soldToday),
      limit: DAILY_LIMIT,
      resetAtISO: nextUTCmidnightISO()
    });
  } catch (err) {
    console.error('[meSellStatus] error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

export default router;
