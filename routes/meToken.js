// routes/meToken.js
// Token-aware routes that resolve :token → userId via linked_decks.json
import express from 'express';
import {
  resolveUserIdByToken,
  getPlayerCollectionMap,
  getUserStats,
  getPlayerProfileByUserId,
  loadMaster,
  pad3,
} from '../utils/deckUtils.js';

const router = express.Router();

/**
 * GET /me/:token/collection
 * Returns an array of owned cards for the user resolved by :token.
 * Shape: [{ number: "001", owned: 2, name, rarity, type, image }, ...]
 */
router.get('/me/:token/collection', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');

    const { token } = req.params;
    const userId = await resolveUserIdByToken(token);
    if (!userId) return res.status(404).json({ error: 'Invalid token' });

    const [collectionMap, master] = await Promise.all([
      getPlayerCollectionMap(userId),
      loadMaster()
    ]);

    // Build array enriched with master data when available
    const masterById = new Map(master.map(c => [pad3(c.card_id), c]));
    const out = Object.entries(collectionMap)
      .filter(([id]) => id !== '000')
      .map(([id, owned]) => {
        const meta = masterById.get(id);
        return {
          number: id,
          owned: Number(owned) || 0,
          ...(meta ? {
            name: meta.name,
            rarity: meta.rarity,
            type: meta.type,
            image: meta.image // filename from CoreMasterReference.json
          } : {})
        };
      })
      .sort((a, b) => parseInt(a.number, 10) - parseInt(b.number, 10));

    return res.json(out);
  } catch (e) {
    console.error('[meToken] /me/:token/collection error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * GET /me/:token/stats
 * Returns { coins, wins, losses, discordName, userId }
 */
router.get('/me/:token/stats', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');

    const { token } = req.params;
    const userId = await resolveUserIdByToken(token);
    if (!userId) return res.status(404).json({ error: 'Invalid token' });

    const [stats, profile] = await Promise.all([
      getUserStats(userId),
      getPlayerProfileByUserId(userId)
    ]);

    return res.json({
      userId,
      discordName: profile?.discordName || '',
      coins: stats.coins || 0,
      wins: stats.wins || 0,
      losses: stats.losses || 0
    });
  } catch (e) {
    console.error('[meToken] /me/:token/stats error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * (Compatibility) GET /userStatsToken?token=...
 * Same payload as /me/:token/stats for clients that use a query param.
 */
router.get('/userStatsToken', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');

    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Missing token' });

    const userId = await resolveUserIdByToken(String(token));
    if (!userId) return res.status(404).json({ error: 'Invalid token' });

    const [stats, profile] = await Promise.all([
      getUserStats(userId),
      getPlayerProfileByUserId(userId)
    ]);

    return res.json({
      userId,
      discordName: profile?.discordName || '',
      coins: stats.coins || 0,
      wins: stats.wins || 0,
      losses: stats.losses || 0
    });
  } catch (e) {
    console.error('[meToken] /userStatsToken error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
