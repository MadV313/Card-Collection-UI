// routes/meCoins.js
// Returns the player's current coin balance from persistent storage.
// Accepts either ?userId=<discordId> OR Authorization: Bearer <playerToken>
// Also exposes GET /meSellStatus to show daily sell limit status in UI.

import fs from 'fs/promises';
import path from 'path';
import express from 'express';

// Optional persistent storage client (remote-first)
let load_file = null;
try {
  ({ load_file } = await import('../utils/storageClient.js'));
} catch {
  console.warn('[meCoins] storageClient not found, falling back to local file reads');
}

const router = express.Router();

/* ---------------- config + paths ---------------- */
async function loadConfig() {
  // Highest priority: CONFIG_JSON env with inline JSON
  try {
    const raw = process.env.CONFIG_JSON;
    if (raw) return JSON.parse(raw);
  } catch {}
  // Next: ./config.json file (optional)
  try {
    const raw = await fs.readFile('config.json', 'utf-8');
    return JSON.parse(raw);
  } catch {}
  return {};
}
const CONFIG = await loadConfig();

// Default paths (can be overridden by CONFIG or env)
const LINKED_DECKS_FILE = 'data/linked_decks.json';
const SELLS_BY_DAY_FILE = 'data/sells_by_day.json';

const LINKED_DECKS_PATH = path.resolve(
  process.env.LINKED_DECKS_PATH ||
  CONFIG.linked_decks_path ||
  `./${LINKED_DECKS_FILE}`
);

const SELLS_BY_DAY_PATH = path.resolve(
  process.env.SELLS_BY_DAY_PATH ||
  CONFIG.sells_by_day_path ||
  `./${SELLS_BY_DAY_FILE}`
);

// Daily limit (configurable, default 5)
const DAILY_LIMIT = Number(process.env.SELL_DAILY_LIMIT || CONFIG.sell_daily_limit || 5) || 5;

/* ---------------- helpers ---------------- */
async function readJsonLocal(file, fallback = {}) {
  try {
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
async function readJsonSmart(remoteName, localPath, fallback = {}) {
  if (typeof load_file === 'function') {
    try {
      const obj = await load_file(remoteName);
      if (obj && typeof obj === 'object') return obj;
    } catch {}
  }
  return readJsonLocal(localPath, fallback);
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

// Extract identity from request, returning { discordId, profile, linked }
async function getIdentity(req) {
  const userId = (req.query.userId || '').toString().trim();
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';

  const linked = await readJsonSmart(LINKED_DECKS_FILE, LINKED_DECKS_PATH, {});
  let discordId = userId;
  let profile = null;

  // Direct lookup by discordId (if provided)
  if (discordId && linked[discordId]) {
    profile = linked[discordId];
  }

  // Fallback: lookup by token
  if (!profile && token) {
    const id = Object.keys(linked).find(id => linked[id]?.token === token);
    if (id) {
      discordId = id;
      profile = linked[id];
    }
  }
  return { discordId, profile, linked };
}

/* ---------------- route: /meCoins ---------------- */
// GET /meCoins?userId=1234567890
// or header: Authorization: Bearer <token>
router.get('/meCoins', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, max-age=0');
    const { profile } = await getIdentity(req);

    if (!profile) {
      return res.status(404).json({ ok: false, error: 'PLAYER_NOT_FOUND' });
    }

    const coins =
      typeof profile.coins === 'number' && Number.isFinite(profile.coins)
        ? profile.coins
        : 0;

    return res.json({
      ok: true,
      userId: profile.discordId || null,
      discordName: profile.discordName || null,
      coins,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[meCoins] error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

/* ---------------- route: /meSellStatus ---------------- */
// GET /meSellStatus?userId=1234567890
// or header: Authorization: Bearer <token>
// -> { ok, soldToday, soldRemaining, limit, resetAtISO }
router.get('/meSellStatus', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, max-age=0');
    const { discordId } = await getIdentity(req);

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
      resetAtISO: nextUTCmidnightISO(),
    });
  } catch (err) {
    console.error('[meSellStatus] error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

export default router;
