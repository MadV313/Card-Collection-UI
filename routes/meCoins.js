// routes/meCoins.js
// Coins + SELL flow (remote-first storage, local fallback)
// Endpoints:
//   GET  /meCoins                     -> { ok, coins, ... }
//   GET  /meSellStatus                -> { ok, soldToday, soldRemaining, limit, resetAtISO }
//   POST /meSellPreview               -> { ok, credited }  (doesn't write)
//   POST /meSell                      -> { ok, message, credited, balance, collection }
//   GET  /meStats                     -> { ok, userId, coins, wins, losses }

import fs from 'fs/promises';
import path from 'path';
import express from 'express';

let load_file = null;
let save_file = null;
try {
  ({ load_file, save_file } = await import('../utils/storageClient.js'));
} catch {
  console.warn('[meCoins] storageClient not found, falling back to local file reads/writes');
}

const router = express.Router();

/* ---------------- config + paths ---------------- */
async function loadConfig() {
  try {
    const raw = process.env.CONFIG_JSON;
    if (raw) return JSON.parse(raw);
  } catch {}
  try {
    const raw = await fs.readFile('config.json', 'utf-8');
    return JSON.parse(raw);
  } catch {}
  return {};
}
const CONFIG = await loadConfig();

// Defaults (overridable by env or CONFIG)
const LINKED_DECKS_FILE   = 'data/linked_decks.json';
const SELLS_BY_DAY_FILE   = 'data/sells_by_day.json';
const PLAYER_STATS_FILE   = 'data/player_stats.json'; // optional (wins/losses)
const CORE_MASTER_FILE_1  = 'data/CoreMasterReference.json';
const CORE_MASTER_FILE_2  = 'logic/CoreMasterReference.json';

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

const PLAYER_STATS_PATH = path.resolve(
  process.env.PLAYER_STATS_PATH ||
  CONFIG.player_stats_path ||
  `./${PLAYER_STATS_FILE}`
);

// Limits & pricing
const DAILY_LIMIT = Number(process.env.SELL_DAILY_LIMIT || CONFIG.sell_daily_limit || 5) || 5;

/* ---------------- helpers ---------------- */
const noStore = (res) => { res.set('Cache-Control', 'no-store, max-age=0'); return res; };
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

async function readJsonLocal(file, fallback = {}) {
  try {
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
async function writeJsonLocal(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true }).catch(() => {});
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
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
async function writeJsonSmart(remoteName, localPath, data) {
  // Try remote save first, then local
  if (typeof save_file === 'function') {
    try {
      await save_file(remoteName, data);
      return;
    } catch (e) {
      console.warn(`[meCoins] remote save failed for ${remoteName}, falling back local`, e?.message);
    }
  }
  await writeJsonLocal(localPath, data);
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

  if (discordId && linked[discordId]) {
    profile = linked[discordId];
  }
  if (!profile && token) {
    const id = Object.keys(linked).find(id => linked[id]?.token === token);
    if (id) {
      discordId = id;
      profile = linked[id];
    }
  }
  return { discordId, profile, linked };
}

/* ---------------- rarity-aware pricing ---------------- */
let _masterCache = null;
async function loadMaster() {
  if (_masterCache) return _masterCache;
  // Try remote-first for both candidate paths
  const a = await readJsonSmart(CORE_MASTER_FILE_1, path.resolve(`./${CORE_MASTER_FILE_1}`), null);
  if (a && typeof a === 'object') { _masterCache = a; return _masterCache; }
  const b = await readJsonSmart(CORE_MASTER_FILE_2, path.resolve(`./${CORE_MASTER_FILE_2}`), null);
  if (b && typeof b === 'object') { _masterCache = b; return _masterCache; }
  _masterCache = null;
  return null;
}
function pad3(n) { return String(n).padStart(3, '0'); }

async function getCardRarity(cardNumber) {
  const id = pad3(cardNumber);
  const master = await loadMaster();
  if (!master) return null;

  // Accept either array or map formats
  if (Array.isArray(master)) {
    const hit = master.find(c => pad3(c?.id ?? c?.number) === id);
    return hit?.rarity || null;
  }
  if (master && typeof master === 'object') {
    // common shape: { "cards": [ ... ] }
    const list = Array.isArray(master.cards) ? master.cards : [];
    const hit = list.find(c => pad3(c?.id ?? c?.number) === id);
    return hit?.rarity || null;
  }
  return null;
}

async function priceOf(cardNumber) {
  // Legendary = 3.0, Rare = 2.0, Uncommon = 1.0, Common = 0.5
  const rarity = await getCardRarity(cardNumber).catch(() => null);
  if (!rarity) return 0.5;
  const r = String(rarity).toLowerCase();
  if (r.includes('legendary')) return 3.0;
  if (r.includes('rare')) return 2.0;
  if (r.includes('uncommon')) return 1.0;
  if (r.includes('common')) return 0.5;
  return 0.5; // fallback
}

/* ---------------- route: /meCoins ---------------- */
router.get('/meCoins', async (req, res) => {
  try {
    noStore(res);
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
// -> { ok, soldToday, soldRemaining, limit, resetAtISO }
router.get('/meSellStatus', async (req, res) => {
  try {
    noStore(res);
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

/* ---------------- route: /meSellPreview ---------------- */
// Body: { items: [{ number:'012', qty:2 }, ...] }
// -> { ok, credited }
router.post('/meSellPreview', async (req, res) => {
  try {
    noStore(res);
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    let credited = 0;

    for (const it of items) {
      const num = pad3(it?.number ?? '');
      const qty = clamp(Number(it?.qty || 0), 0, 9999);
      if (!qty) continue;
      const unit = await priceOf(num);
      credited += unit * qty;
    }
    // Round to nearest 0.01 to keep UI clean
    credited = Math.round(credited * 100) / 100;

    return res.json({ ok: true, credited });
  } catch (err) {
    console.error('[meSellPreview] error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

/* ---------------- route: /meSell ---------------- */
// Body: { items: [{ number:'012', qty:2 }, ...] }
// Writes: linked_decks (coins + collection), sells_by_day (increment today)
// -> { ok, message, credited, balance, collection }
router.post('/meSell', async (req, res) => {
  try {
    noStore(res);
    const { discordId, profile, linked } = await getIdentity(req);
    if (!discordId || !profile) {
      return res.status(404).json({ ok: false, error: 'PLAYER_NOT_FOUND' });
    }

    const items = Array.isArray(req.body?.items) ? req.body.items : [];

    // Load day counters
    const sellsByDay = await readJsonSmart(SELLS_BY_DAY_FILE, SELLS_BY_DAY_PATH, {});
    const dayKey = todayKeyUTC();
    const userSellMap = sellsByDay[discordId] || {};
    const soldToday = Number(userSellMap[dayKey] || 0);
    const remaining = Math.max(0, DAILY_LIMIT - soldToday);

    // Total requested
    const requested = items.reduce((n, it) => n + Math.max(0, Number(it?.qty || 0)), 0);
    if (requested <= 0) {
      return res.status(400).json({ ok: false, error: 'NOTHING_TO_SELL' });
    }
    if (requested > remaining) {
      return res.status(400).json({
        ok: false,
        error: `DAILY_LIMIT_REACHED`,
        detail: { allowed: remaining, requested }
      });
    }

    // Safe mutate: work on copies
    const col = { ...(profile.collection || {}) };
    let credited = 0;
    let soldCount = 0;

    // Ownership clamp + pricing
    for (const raw of items) {
      const id = pad3(raw?.number ?? '');
      const want = Math.max(0, Number(raw?.qty || 0));
      if (!want) continue;

      const have = Math.max(0, Number(col[id] || 0));
      const sellQty = clamp(want, 0, have);
      if (!sellQty) continue;

      col[id] = have - sellQty;
      const unit = await priceOf(id);
      credited += unit * sellQty;
      soldCount += sellQty;
    }

    if (soldCount <= 0) {
      return res.status(400).json({ ok: false, error: 'NO_OWNERSHIP' });
    }

    // Final daily cap safety (should already pass)
    if (soldCount > remaining) {
      soldCount = remaining;
    }
    credited = Math.round(credited * 100) / 100;

    // Update coins + collection in linked_decks
    const newCoins = Math.round(((Number(profile.coins || 0) + credited) + Number.EPSILON) * 100) / 100;
    const newProfile = {
      ...profile,
      coins: newCoins,
      collection: col,
      coinsUpdatedAt: new Date().toISOString(),
    };
    linked[discordId] = newProfile;

    // Update day counters
    sellsByDay[discordId] = {
      ...userSellMap,
      [dayKey]: (Number(userSellMap[dayKey] || 0) + soldCount),
    };

    // Persist
    await Promise.all([
      writeJsonSmart(LINKED_DECKS_FILE, LINKED_DECKS_PATH, linked),
      writeJsonSmart(SELLS_BY_DAY_FILE, SELLS_BY_DAY_PATH, sellsByDay),
    ]);

    return res.json({
      ok: true,
      message: `Sold ${soldCount} card(s)`,
      credited,
      balance: newCoins,
      collection: newProfile.collection,
    });
  } catch (err) {
    console.error('[meSell] error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

/* ---------------- route: /meStats (optional UI helper) ---------------- */
// -> { ok, userId, coins, wins, losses }
router.get('/meStats', async (req, res) => {
  try {
    noStore(res);
    const { discordId, profile } = await getIdentity(req);
    if (!discordId || !profile) {
      return res.status(404).json({ ok: false, error: 'PLAYER_NOT_FOUND' });
    }

    const stats = await readJsonSmart(PLAYER_STATS_FILE, PLAYER_STATS_PATH, {});
    const wins   = Number(stats[discordId]?.wins   ?? 0) || 0;
    const losses = Number(stats[discordId]?.losses ?? 0) || 0;

    return res.json({
      ok: true,
      userId: discordId,
      coins: Number(profile.coins || 0) || 0,
      wins,
      losses,
    });
  } catch (err) {
    console.error('[meStats] error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

export default router;
