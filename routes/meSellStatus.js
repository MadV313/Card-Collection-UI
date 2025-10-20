// routes/meSellStatus.js
// Returns the player's daily sell status (soldToday, soldRemaining, limit, resetAtISO)

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

const LINKED_DECKS_PATH  = path.resolve(CONFIG.linked_decks_path  || './data/linked_decks.json');
const SELLS_BY_DAY_PATH  = path.resolve(CONFIG.sells_by_day_path  || './data/sells_by_day.json');
const DAILY_LIMIT        = Number(CONFIG.daily_sell_limit || 5);

/* ---------------- helpers ---------------- */
async function readJson(file, fallback = {}) {
  try {
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
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

/* ---------------- route ---------------- */
// GET /api/meSellStatus?userId=1234567890
// or with header: Authorization: Bearer <playerToken>
router.get('/meSellStatus', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');

    const userId = (req.query.userId || '').toString().trim();
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';

    const [linked, sellsByDay] = await Promise.all([
      readJson(LINKED_DECKS_PATH, {}),
      readJson(SELLS_BY_DAY_PATH, {})
    ]);

    let id = userId;
    if (!id && token) {
      id = Object.keys(linked).find(k => linked[k]?.token === token);
    }

    if (!id || !linked[id]) {
      return res.status(404).json({ ok: false, error: 'PLAYER_NOT_FOUND' });
    }

    const dayKey = todayKeyUTC();
    const soldToday = Number(sellsByDay?.[id]?.[dayKey] || 0);
    const soldRemaining = Math.max(0, DAILY_LIMIT - soldToday);
    const resetAtISO = nextUTCmidnightISO();

    return res.json({
      ok: true,
      soldToday,
      soldRemaining,
      limit: DAILY_LIMIT,
      resetAtISO
    });
  } catch (err) {
    console.error('[meSellStatus] error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

export default router;
