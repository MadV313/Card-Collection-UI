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

// Default paths
const LINKED_DECKS_FILE = 'data/linked_decks.json';
const SELLS_BY_DAY_FILE = 'data/sells_by_day.json';
const LINKED_DECKS_PATH = path.resolve(CONFIG.linked_decks_path || `./${LINKED_DECKS_FILE}`);
const SELLS_BY_DAY_PATH = path.resolve(CONFIG.sells_by_day_path || `./${SELLS_BY_DAY_FILE}`);

const DAILY_LIMIT = 5;

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

/* ---------------- route: /meCoins ---------------- */
// GET /meCoins?userId=1234567890
// or header: Authorization: Bearer <token>
router.get('/meCoins', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const userId = (req.query.userId || '').toString().trim();
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';

    const linked = await readJsonSmart(LINKED_DECKS_FILE, LINKED_DECKS_PATH, {});
    let profile = null;

    // Lookup by discordId
    if (userId && linked[userId]) profile = linked[userId];

    // Fallback: lookup by token
    if (!profile && token) {
      const id = Object.keys(linked).find(id => linked[id]?.token === token);
      if (id) profile = linked[id];
    }

    if (!profile) return res.status(404).json({ ok: false, error: 'PLAYER_NOT_FOUND' });

    const coins =
      typeof profile.coins === 'number' && !Number.isNaN(profile.coins)
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
    res.set('Cache-Control', 'no-store');
    const userId = (req.query.userId || '').toString().trim();
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';

    const linked = await readJsonSmart(LINKED_DECKS_FILE, LINKED_DECKS_PATH, {});
    let discordId = userId;

    if (!discordId && token) {
      const id = Object.keys(linked).find(id => linked[id]?.token === token);
      if (id) discordId = id;
    }

    if (!discordId) return res.status(400).json({ ok: false, error: 'MISSING_ID_OR_TOKEN' });

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
