// scripts.js — Token-aware Card Collection UI (prefers local master JSON, robust IMG fallbacks + NEW highlight + real Trade/Sell submit + trade-session wiring)

// ───────────────── anti-stale hardeners ─────────────────
(function hardDisableSWAndBFCache() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then(regs => Promise.allSettled(regs.map(r => r.unregister().catch(()=>{}))))
      .catch(()=>{});
  }
  // If returning from bfcache, force a fresh render
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) location.reload();
  });
})();

document.addEventListener("DOMContentLoaded", async () => {
  /* ---------------- URL params & config ---------------- */
  const qs = new URLSearchParams(window.location.search);
  const TOKEN     = qs.get("token") || "";
  const UID       = qs.get("uid")   || "";
  const FROM_PACK = qs.get("fromPackReveal") === "true";

  // Trade session params
  const MODE         = (qs.get("mode") || "").toLowerCase(); // 'trade' to enable session UI
  const TRADE_MODE   = MODE === "trade";
  const TRADE_SESSION_ID = (qs.get("tradeSession") || qs.get("session") || "").trim();
  let   TRADE_STAGE  = (qs.get("stage") || "").toLowerCase(); // 'pickmine' | 'picktheirs' | 'decision' (server wins)
  let   TRADE_ROLE   = (qs.get("role")  || "").toLowerCase(); // 'initiator' | 'partner' (prefer server calc below)
  let   PARTNER_NAME = qs.get("partner") || "";               // optional hint
  let   INITIATOR_NAME = ""; // filled from server
  let   TRADE_LIMITS = { remaining: 3 };

  // Mocks OFF by default (only on if explicitly requested)
  const USE_MOCK  = qs.get("useMockDeckData") === "true" || qs.get("mockMode") === "true" || qs.get("mock") === "1";

  // API only needed for dynamic data; images default to this repo.
  const API_BASE  = (qs.get("api") || "").replace(/\/+$/, "");                 // e.g. https://duel-bot-production.up.railway.app
  const IMG_BASE  = (qs.get("imgbase") || "images/cards").replace(/\/+$/, ""); // primary image base (front-end repo)
  const IMG_ALT_Q = (qs.get("imgalt")  || "").replace(/\/+$/, "");             // optional alt host via URL

  // "new" cards highlighting
  const NEW_PARAM = (qs.get("new") || "").trim();           // e.g. "004,018"
  const NEW_TS    = (qs.get("ts") || "").trim();            // bust cache / unique session marker
  const newIds    = new Set((NEW_PARAM ? NEW_PARAM.split(",") : []).map(s => String(s).padStart(3,"0")));
  const SEEN_KEY  = `ccui:newSeen:${TOKEN || UID}:${NEW_TS || "0"}`;
  const alreadySeenThisBatch = sessionStorage.getItem(SEEN_KEY) === "1";

  // Audio paths
  const BG_MUSIC_SRC  = "audio/bg/Follow the Trail.mp3";
  const SALE_SFX_SRC  = "audio/effects/sale.mp3";

  // Daily sell limit (UI default; server truth comes from /me/:token/sell/status)
  const DAILY_LIMIT_DEFAULT = 5;
  let sellStatus = { soldToday: 0, soldRemaining: DAILY_LIMIT_DEFAULT, limit: DAILY_LIMIT_DEFAULT, resetAtISO: null };

  // Bust image cache
  const IMG_TS = Date.now();

  /* ---------------- helpers ---------------- */
  const trimSlash = (s="") => String(s).replace(/\/+$/, "");
  function pad3(id) { return String(id).padStart(3, "0"); }
  function safe(s)  {
    return String(s || "")
      .normalize("NFKD")
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9._-]/g, "")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
  }
  const isAbsoluteUrl = (u) => /^https?:\/\//i.test(String(u || ""));

  // Small debounce utility (used for sell-credit preview)
  function debounce(fn, delay = 200) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), delay);
    };
  }

  // derive an absolute path to this repo’s images/cards, regardless of how index.html is served
  function deriveSelfImagesAbs() {
    const url = new URL(location.href);
    const dir = url.pathname.replace(/\/index\.html?$/i, "").replace(/\/$/, "");
    return `${url.origin}${dir}/images/cards`;
  }

  // Built-in secondary fallbacks
  const BUILTIN_IMG_FALLBACKS = [
    deriveSelfImagesAbs(), // absolute to this UI’s /images/cards
    "https://madv313.github.io/Card-Collection-UI/images/cards",
    "https://raw.githubusercontent.com/MadV313/Duel-Bot/main/images/cards"
  ];

  // Map rarity → CSS class used in your styles
  function rarityClass(r) {
    const key = String(r || "Common").toLowerCase();
    return ({
      common: "common-border",
      uncommon: "uncommon-border",
      rare: "rare-border",
      legendary: "legendary-border",
      unique: "unique-border"
    })[key] || "common-border";
  }

  // TitleCase utility (ATTACK → Attack, etc.)
  function titleCase(word = "") {
    const s = String(word || "");
    if (!s) return s;
    return s.toLowerCase().replace(/^[a-z]/, (m) => m.toUpperCase());
  }

  // Build a unique list
  function uniq(arr) {
    const seen = new Set();
    const out = [];
    for (const v of arr) {
      if (!seen.has(v)) { seen.add(v); out.push(v); }
    }
    return out;
  }

  const SELF_REPO_ROOT = deriveSelfImagesAbs().replace(/\/images\/cards$/i, "");
  const BUILTIN_MASTER_FALLBACKS = uniq([
    `${trimSlash(SELF_REPO_ROOT)}/logic/CoreMasterReference.json`,
    `${trimSlash(SELF_REPO_ROOT)}/CoreMasterReference.json`,
    "https://madv313.github.io/Card-Collection-UI/logic/CoreMasterReference.json",
    "https://madv313.github.io/Card-Collection-UI/CoreMasterReference.json",
    "https://madv313.github.io/Duel-Bot/logic/CoreMasterReference.json",
    "https://raw.githubusercontent.com/MadV313/Duel-Bot/main/logic/CoreMasterReference.json",
    "https://raw.githubusercontent.com/MadV313/Duel-Bot/main/CoreMasterReference.json"
  ].filter(Boolean));

  // Append a one-shot cache-buster to any URL
  function withTs(url) {
    const ts = Date.now();
    try {
      const u = new URL(url, location.href);
      if (!u.searchParams.has('ts')) u.searchParams.set('ts', String(ts));
      return u.toString();
    } catch {
      // relative URL fallback
      return url + (url.includes('?') ? '&' : '?') + 'ts=' + ts;
    }
  }

  /* === smart fetch with API-aware throttling, de-dup & 429 backoff === */
  const inflight = new Map(); // key: "METHOD url" → Promise
  const apiCooldown = { until: 0 }; // global gentle cooldown

  const isApiUrl = (url) => {
    if (!API_BASE) return false;
    try { return new URL(url, location.href).href.startsWith(API_BASE + "/"); }
    catch { return String(url || "").startsWith(API_BASE + "/"); }
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function fetchJSON(url, opts = {}) {
    const method = (opts.method || "GET").toUpperCase();
    const key = `${method} ${url}`;

    // Coalesce duplicate in-flight requests
    if (inflight.has(key)) return inflight.get(key);

    const runner = (async () => {
      // Respect a short global cooldown after a 429
      const now = Date.now();
      if (apiCooldown.until > now && isApiUrl(url)) {
        await sleep(apiCooldown.until - now);
      }

      // Only append ts for NON-API (static) requests
      const finalUrl = isApiUrl(url) ? url : withTs(url);

      try {
        const r = await fetch(finalUrl, { cache: "no-store", ...opts });
        if (r.status === 429) {
          // Set a brief global cooldown and retry once
          const retryAfter = Number(r.headers.get("retry-after")) || 1;
          apiCooldown.until = Date.now() + retryAfter * 1000;
          await sleep(retryAfter * 1000);
          // single retry
          const r2 = await fetch(finalUrl, { cache: "no-store", ...opts });
          if (!r2.ok) throw new Error(`${r2.status} ${r2.statusText}`);
          return await r2.json();
        }
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return await r.json();
      } catch (e) {
        console.warn(`[ccui] fetch failed ${url}: ${e?.message}`);
        return null;
      }
    })();

    inflight.set(key, runner);
    try { return await runner; }
    finally { inflight.delete(key); }
  }

  async function postJson(url, body) {
    return fetchJSON(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    });
  }

  async function loadMaster() {
    // Try local copies FIRST (common paths)
    const localCandidates = [
      "data/CoreMasterReference.json",
      "logic/CoreMasterReference.json",
      "CoreMasterReference.json"
    ];

    let master = null;

    for (const p of localCandidates) {
      master = await fetchJSON(p);
      if (Array.isArray(master) && master.length) {
        console.log(`[ccui] Using local master: ${p}`);
        break;
      }
    }

    // We avoid probing API_BASE for master to cut down 404 noise; rely on UI repo fallbacks:
    if (!Array.isArray(master) || !master.length) {
      for (const url of BUILTIN_MASTER_FALLBACKS) {
        master = await fetchJSON(url);
        if (Array.isArray(master) && master.length) {
          console.log(`[ccui] Using built-in master: ${url}`);
          break;
        }
      }
    }

    // Normalize (handles either "image" or "filename"; fills name/type/rarity)
    if (Array.isArray(master)) {
      master = master.map(c => {
        const id     = pad3(c.card_id ?? c.number ?? c.id);
        const img    = c.image || c.filename || ""; // accept either key
        const name   = c.name || `Card ${id}`;
        const type   = c.type || "Unknown";
        const rarity = c.rarity || "Common";
        return { ...c, card_id: id, image: img, name, type, rarity };
      });
    }

    // Final fallback (minimal stub)
    if (!Array.isArray(master) || !master.length) {
      console.warn("[ccui] Falling back to minimal master (no local/API CoreMasterReference.json)");
      master = Array.from({ length: 127 }, (_, i) => {
        const id = pad3(i + 1);
        return {
          card_id: id,
          name: `Card ${id}`,
          type: "Unknown",
          rarity: "Common",
          image: `${id}_Card_Unknown.png`
        };
      });
    }

    // Sort & skip #000
    master = master
      .filter(c => String(c.card_id) !== "000")
      .sort((a, b) => (parseInt(a.card_id) || 0) - (parseInt(b.card_id) || 0));

    return master;
  }

  // Convert any backend/mocked shapes into { [###]: count }
  function toOwnershipMap(data) {
    const map = {};
    if (!data) return map;

    // Case A: array of { number, owned } or { card_id, owned }
    if (Array.isArray(data) && data.length && (("owned" in data[0]) || ("quantity" in data[0]))) {
      for (const row of data) {
        const id = pad3(row.number ?? row.card_id ?? row.id ?? row.numberStr);
        const qty = Number(row.owned ?? row.quantity ?? 0);
        if (!id || !Number.isFinite(qty)) continue;
        map[id] = (map[id] || 0) + qty;
      }
      return map;
    }

    // Case B: array of items with duplicates (mock deck)
    if (Array.isArray(data)) {
      for (const row of data) {
        const id = pad3(row.card_id ?? row.number ?? row.id);
        if (!id) continue;
        map[id] = (map[id] || 0) + 1;
      }
      return map;
    }

    // Case C: already a map
    if (typeof data === "object") {
      for (const [k, v] of Object.entries(data)) {
        const id = pad3(k);
        const qty = Number(v);
        if (!Number.isFinite(qty)) continue;
        map[id] = qty;
      }
      return map;
    }

    return map;
  }

  // NOTE: When API is present, call the primary route only; do NOT probe backups on failure (prevents over-calling/429 storms).
  async function loadCollection() {
    // Preferred: token route
    if (TOKEN && API_BASE) {
      const d = await fetchJSON(`${API_BASE}/me/${encodeURIComponent(TOKEN)}/collection`);
      if (d) return { map: toOwnershipMap(d), src: "token" };
      // No second probe here; fetchJSON already applied 429 backoff if needed.
    }

    // Secondary: uid route (only if TOKEN missing)
    if (!TOKEN && UID && API_BASE) {
      const d = await fetchJSON(`${API_BASE}/collection?userId=${encodeURIComponent(UID)}`);
      if (d) return { map: toOwnershipMap(d), src: "uid" };
    }

    // Mock fallback (only if explicitly enabled)
    if (USE_MOCK) {
      const d = await fetchJSON("data/mock_deckData.json");
      return { map: toOwnershipMap(d), src: "mock" };
    }

    console.warn("[ccui] No token/uid/API provided — rendering as unowned.");
    return { map: {}, src: "empty" };
  }

  // NOTE: When API is present, call the primary route only; do NOT probe backups on failure.
  async function loadStats() {
    if (TOKEN && API_BASE) {
      const s = await fetchJSON(`${API_BASE}/me/${encodeURIComponent(TOKEN)}/stats`);
      if (s) return s;
      // No second probe (e.g., /userStatsToken or ?token) — avoids extra API pressure.
    }
    if (!TOKEN && UID && API_BASE) {
      const s = await fetchJSON(`${API_BASE}/userStats/${encodeURIComponent(UID)}`);
      if (s) return s;
    }
    return { coins: 0, wins: 0, losses: 0, discordName: "" };
  }

  /** Build filename candidates for a card (handles case variants like Attack/ATTACK/attack). */
  function filenameCandidates(card) {
    const id   = pad3(card.card_id);
    const name = safe(card.name);
    const type = safe(card.type || "Unknown");

    const explicit = card.image || card.filename || "";

    // Additional robustness: if type is missing/wrong, try common buckets
    const COMMON_TYPES = ["Attack", "Specialty", "Trap", "Support", "Unknown"];

    const rawType = card.type || "Unknown";
    const typeVariants = uniq([
      type,
      safe(titleCase(rawType)),
      safe(String(rawType).toLowerCase()),
      safe(String(rawType).toUpperCase()),
      type.replace(/[-]+/g, "_"),
      type.replace(/_+/g, "-"),
      ...COMMON_TYPES.map(safe)
    ].filter(Boolean));

    const rawName = card.name || "";
    const nameVariants = uniq([
      name,
      safe(rawName),
      safe(rawName.replace(/\s+/g, "-")),
      name.replace(/[-]+/g, ""),
      name.replace(/_+/g, ""),
      name.replace(/[-]+/g, "_"),
      name.replace(/_+/g, "-"),
      name.replace(/[-_]+/g, ""),
      name.replace(/__+/g, "_")
    ].filter(Boolean));

    const synths = nameVariants.flatMap(n => typeVariants.map(t => `${id}_${n}_${t}.png`));

    const explicitVariants = [];
    if (explicit && !isAbsoluteUrl(explicit)) {
      const trimmed = explicit.trim();
      if (trimmed) {
        const sanitized = safe(trimmed);
        explicitVariants.push(trimmed);
        if (sanitized) {
          explicitVariants.push(sanitized);
          explicitVariants.push(sanitized.replace(/[-]+/g, ""));
          explicitVariants.push(sanitized.replace(/_+/g, ""));
        }
      }
    } else if (explicit) {
      explicitVariants.push(explicit);
    }

    const list = [];
    list.push(...explicitVariants);
    list.push(...synths);

    return uniq(list.filter(Boolean));
  }

  /** Build image base list (primary → alt → built-ins). */
  function imageBases() {
    const bases = [IMG_BASE];
    if (IMG_ALT_Q) bases.push(IMG_ALT_Q);
    bases.push(...BUILTIN_IMG_FALLBACKS);
    return uniq(bases.map(trimSlash).filter(Boolean));
  }

  /** Set an <img> src with fallback across filename candidates and bases. */
  function setImageWithFallback(imgEl, card, { onFailToAll } = {}) {
    const candidates = filenameCandidates(card);
    const bases = imageBases();
  
    const absolutes = candidates.filter(isAbsoluteUrl);
    const relatives = candidates.filter(c => !isAbsoluteUrl(c));
  
    const attempts = [
      ...absolutes,
      ...bases.flatMap(base => relatives.map(file => `${base}/${file}`))
    ];
  
    let idx = 0;
    const tryNext = () => {
      if (idx >= attempts.length) {
        if (typeof onFailToAll === "function") onFailToAll();
        return;
      }
      const url = attempts[idx++];
      const finalUrl = /^https?:\/\//i.test(url)
        ? url
        : (url + (url.includes('?') ? '&' : '?') + 'ts=' + IMG_TS);
      imgEl.onerror = tryNext;
      imgEl.src = finalUrl;
    };
  
    tryNext();
  }

  /* ---------------- Trade/Sell submit helpers (real API) ---------------- */
  // Legacy single-endpoint trade (kept for non-session mode)
  async function submitTradeLegacy(cards) {
    if (!API_BASE || !TOKEN) {
      showToast("⚠️ Trading requires a valid API and token.");
      return null;
    }
    return postJson(`${API_BASE}/me/${encodeURIComponent(TOKEN)}/trade`, { cards });
  }

  // Sessionized trade selection
  async function submitTradeSelection(cards, stage /* optional: 'pickMine' | 'pickTheirs' */) {
    if (!API_BASE || !TOKEN || !TRADE_MODE || !TRADE_SESSION_ID) {
      showToast("⚠️ Trade session not active. Start with /trade.");
      return null;
    }
    const body = { token: TOKEN, cards };
    if (stage) body.stage = stage; // let backend use explicit stage if provided
    return postJson(
      `${API_BASE}/trade/${encodeURIComponent(TRADE_SESSION_ID)}/select`,
      body
    );
  }

  // Partner decision (accept/deny)
  async function submitTradeDecision(decision) {
    if (!API_BASE || !TOKEN || !TRADE_MODE || !TRADE_SESSION_ID) return null;
    // Backend accepts {decision: "accept"|"deny"} or {accept: true|false}
    const body = typeof decision === "string" ? { token: TOKEN, decision } : { token: TOKEN, accept: !!decision };
    return postJson(
      `${API_BASE}/trade/${encodeURIComponent(TRADE_SESSION_ID)}/decision`,
      body
    );
  }

  // Sell payload: `{ items: [{ number, qty }, ...] }` from unit queue
  function buildSellItems() {
    const counts = {};
    for (const e of sellQueue) {
      const id = pad3(e.id);
      counts[id] = (counts[id] || 0) + 1;
    }
    return { items: Object.entries(counts).map(([number, qty]) => ({ number, qty })) };
  }

  async function submitSell() {
    if (!API_BASE || !TOKEN) {
      showToast("⚠️ Selling requires a valid API and token.");
      return null;
    }
    const body = buildSellItems();
    return postJson(`${API_BASE}/me/${encodeURIComponent(TOKEN)}/sell`, body);
  }

  // NEW: optional sell credit preview
  async function previewSellCredit() {
    try {
      if (!API_BASE || !TOKEN) return null;
      const body = buildSellItems();
      if (!body.items.length) return null;
      const res = await postJson(`${API_BASE}/me/${encodeURIComponent(TOKEN)}/sell/preview`, body);
      return res?.ok ? Number(res.credited || 0) : null;
    } catch { return null; }
  }

  // NEW: fetch current sell status (remaining/limit/reset) from backend token route
  async function fetchSellStatus() {
    try {
      if (!API_BASE || !TOKEN) {
        return { soldToday: 0, soldRemaining: DAILY_LIMIT_DEFAULT, limit: DAILY_LIMIT_DEFAULT, resetAtISO: null };
      }
      const url = `${API_BASE}/me/${encodeURIComponent(TOKEN)}/sell/status`;
      const j = await fetchJSON(url);
      if (j && typeof j.soldRemaining !== "undefined") {
        return {
          soldToday: Number(j.soldToday || 0),
          soldRemaining: Number(j.soldRemaining ?? DAILY_LIMIT_DEFAULT),
          limit: Number(j.limit || DAILY_LIMIT_DEFAULT),
          resetAtISO: j.resetAtISO || null
        };
      }
    } catch {}
    return { soldToday: 0, soldRemaining: DAILY_LIMIT_DEFAULT, limit: DAILY_LIMIT_DEFAULT, resetAtISO: null };
  }

  /* ---------------- NEW: trade collections & summary helpers ---------------- */
  async function loadTradeCollections() {
    if (!TRADE_MODE || !TRADE_SESSION_ID || !API_BASE || !TOKEN) return null;
    const url = `${API_BASE}/trade/${encodeURIComponent(TRADE_SESSION_ID)}/collections?token=${encodeURIComponent(TOKEN)}`;
    const data = await fetchJSON(url);
    if (!data?.ok) return null;
    // Normalize to maps
    const toMap = (arr) => {
      const m = {};
      if (Array.isArray(arr)) {
        for (const row of arr) {
          const id = pad3(row.id || row.card_id || row.number);
          const qty = Number(row.qty ?? row.owned ?? 0);
          if (!id || !Number.isFinite(qty)) continue;
          m[id] = qty;
        }
      }
      return m;
    };
    return {
      role: String(data.role || "").toLowerCase(),
      stage: String(data.stage || "").toLowerCase(),
      myMap: toMap(data.me || []),
      partnerMap: toMap(data.partner || [])
    };
  }

  async function loadTradeSummary() {
    if (!TRADE_MODE || !TRADE_SESSION_ID || !API_BASE || !TOKEN) return null;
    const url = `${API_BASE}/trade/${encodeURIComponent(TRADE_SESSION_ID)}/summary?token=${encodeURIComponent(TOKEN)}`;
    return await fetchJSON(url);
  }

  function patchOwnedMapWithServer(collection) {
    if (!collection || typeof collection !== "object" || !ownedMap) return;
    // Clear then patch to match server truth
    for (const k of Object.keys(ownedMap)) delete ownedMap[k];
    for (const [k, v] of Object.entries(collection)) ownedMap[pad3(k)] = Number(v) || 0;
  }

  // Refresh the entire grid based on the *current* ownedMap pointer
  function applyOwnedMapToGrid(masterById) {
    const grid = document.getElementById("card-grid") || document.getElementById("cards-container");
    if (!grid) return;
    grid.querySelectorAll(".card-container").forEach(container => {
      const numEl = container.querySelector("p");
      if (!numEl) return;
      const id = (numEl.textContent || "").replace("#", "");
      refreshTileFor(id, masterById);
    });
  }

  function recalcAndRenderHeaderCounts() {
    let uniques = 0;
    let copies  = 0;
    for (const v of Object.values(ownedMap || {})) {
      const n = Number(v) || 0;
      if (n > 0) {
        uniques += 1;
        copies  += n;
      }
    }
    const collectionCountEl = document.getElementById("collection-count");
    const totalOwnedEl      = document.getElementById("total-owned-count");
    const ownershipWarning  = document.getElementById("ownership-warning");
  
    if (collectionCountEl) collectionCountEl.textContent = `Cards Collected: ${uniques} / 127`;
    if (totalOwnedEl)      totalOwnedEl.textContent      = `Total Cards Owned: ${copies} / 250`;
    if (ownershipWarning)  ownershipWarning.style.display = copies >= 247 ? "block" : "none";
  }

  // PATCH B helper — show correct “whose collection” label
  function updateCollectionOwnerLabel() {
    const el = document.getElementById('collection-owner-label');
    if (!el) return;
    const viewingPartner = (TRADE_MODE && TRADE_STAGE === 'picktheirs' && TRADE_ROLE === 'initiator');
    el.textContent = viewingPartner
      ? `${PARTNER_NAME || 'Partner'}’s Collection`
      : `Your Collection`;
  }

  function refreshTileFor(id, masterById) {
    const grid = document.getElementById("card-grid") || document.getElementById("cards-container");
    const tile = [...(grid?.querySelectorAll(".card-container") || [])].find(div => {
      const p = div.querySelector("p");
      return p && p.textContent.replace("#","") === id;
    });
    if (!tile) return;

    const qty = Number(ownedMap?.[id] || 0);
    const img = tile.querySelector("img");
    const masterCard = masterById[id];

    // update count label
    const span = tile.querySelector(".owned-count");
    if (span) span.textContent = `Owned: ${qty}`;
    tile.dataset.owned = String(qty);

    // update image
    if (qty > 0 && masterCard && img) {
      setImageWithFallback(img, masterCard, {
        onFailToAll: () => { img.src = `${deriveSelfImagesAbs()}/000_CardBack_Unique.png`; }
      });
      img.classList.remove("facedown-card");
      img.classList.add("card-img");
      tile.className = `card-container ${rarityClass(masterCard.rarity)}`;
    } else if (img) {
      img.src = `${deriveSelfImagesAbs()}/000_CardBack_Unique.png`;
      img.classList.add("facedown-card");
    }

    // PATCH B — disable SELL while viewing partner
    const viewingPartner = (TRADE_MODE && TRADE_STAGE === 'picktheirs' && TRADE_ROLE === 'initiator');
    const sellBtn = tile.querySelector(".sell");
    if (sellBtn) {
      if (viewingPartner) {
        sellBtn.disabled = true;
        sellBtn.title = "Selling disabled while viewing partner’s collection";
      } else {
        sellBtn.disabled = qty <= 0;
        sellBtn.title = qty <= 0 ? "You don’t own this card" : "Add to sell list";
      }
    }
  }

  /* ---------------- UI helpers ---------------- */
  const tradeQueue = [];
  const sellQueue  = []; // unit entries: [{ id, filename, rarity }, ...]
  let coinBalanceEl = null;

  // NEW helpers: locate & unhighlight the [TRADE] button for a given id
  function findTradeButtonById(id) {
    const id3 = pad3(id);
    const grid = document.getElementById("card-grid") || document.getElementById("cards-container");
    const tile = [...(grid?.querySelectorAll(".card-container") || [])].find(div => {
      const p = div.querySelector("p");
      return p && p.textContent.replace("#","") === id3;
    });
    return tile ? tile.querySelector(".trade") : null;
  }
  function unhighlightTradeButton(id) {
    const btn = findTradeButtonById(id);
    if (btn) btn.classList.remove("queued");
  }
  function queueHas(id) {
    const id3 = pad3(id);
    return tradeQueue.some(e => pad3(e.id) === id3);
  }
  function removeFromTradeQueue(id) {
    const id3 = pad3(id);
    const idx = tradeQueue.findIndex(e => pad3(e.id) === id3);
    if (idx >= 0) {
      tradeQueue.splice(idx, 1);
      unhighlightTradeButton(id3);           // FIX D: clear per-card highlight
      updateBottomBar();
      return true;
    }
    return false;
  }

  function showToast(message) {
    const existing = document.getElementById("mock-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.id = "mock-toast";
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
      background: rgba(0,0,0,0.8); color: #fff; padding: 10px 14px; border-radius: 8px;
      z-index: 9999; font-family: system-ui, sans-serif; font-size: 14px; transition: opacity .25s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = "0"; setTimeout(() => toast.remove(), 250); }, 1800);
  }

  // ---- Audio: background music + SFX (auto-injected toggle) ----
  const MUSIC_MUTED_KEY = "ccui:musicMuted";
  let bgAudio = null;
  let saleSfx = null;

  function initAudio() {
    try {
      // Background music
      bgAudio = new Audio(BG_MUSIC_SRC);
      bgAudio.loop = true;
      bgAudio.preload = "auto";
      bgAudio.volume = 0.35;         // gentle by default
      // SFX
      saleSfx = new Audio(SALE_SFX_SRC);
      saleSfx.preload = "auto";
      saleSfx.volume = 0.9;

      // Create a toggle button if it doesn't exist
      let btn = document.getElementById("music-toggle");
      if (!btn) {
        btn = document.createElement("button");
        btn.id = "music-toggle";
        btn.textContent = "♫ Music: Off";
        document.body.appendChild(btn);
      }

      const isMuted = localStorage.getItem(MUSIC_MUTED_KEY) === "1";
      const desiredOn = !isMuted;

      const updateLabel = (playing) => {
        btn.textContent = playing ? "♫ Music: On" : "♫ Music: Off";
      };

      const playIfAllowed = async () => {
        try {
          await bgAudio.play();
          updateLabel(true);
        } catch {
          // Autoplay blocked; will require a user gesture
          updateLabel(false);
        }
      };

      // Try to start if not muted (will silently fail without gesture)
      if (desiredOn) playIfAllowed(); else updateLabel(false);

      // First user interaction → try to play if desired
      const oneShotStart = () => {
        if (desiredOn && bgAudio.paused) playIfAllowed();
        window.removeEventListener("pointerdown", oneShotStart);
        window.removeEventListener("keydown", oneShotStart);
      };
      window.addEventListener("pointerdown", oneShotStart, { once: true });
      window.addEventListener("keydown", oneShotStart, { once: true });

      // Toggle handler
      btn.addEventListener("click", async () => {
        if (!bgAudio) return;
        if (bgAudio.paused) {
          try {
            await bgAudio.play();
            localStorage.setItem(MUSIC_MUTED_KEY, "0");
            updateLabel(true);
            showToast("🎵 Music On");
          } catch {
            updateLabel(false);
            showToast("⚠️ Tap again to allow audio.");
          }
        } else {
          bgAudio.pause();
          localStorage.setItem(MUSIC_MUTED_KEY, "1");
          updateLabel(false);
          showToast("🔇 Music Off");
        }
      });
    } catch (e) {
      console.warn("[ccui] audio init failed:", e?.message || e);
    }
  }

  function playSaleSfx() {
    try {
      if (!saleSfx) return;
      saleSfx.currentTime = 0;
      // Do not play if user muted bg music (treat as global mute signal)
      if (localStorage.getItem(MUSIC_MUTED_KEY) === "1") return;
      saleSfx.play().catch(() => {});
    } catch {}
  }

  // NEW: update the header to show whose collection is visible
  function updateOwnerLabel() {
    const mineText = "Your Card Collection";
    const partnerText = `${PARTNER_NAME || "Partner"}'s Card Collection`;
    const label = (document.getElementById("page-owner-label")
      || document.getElementById("page-title")
      || document.querySelector("h1"));
    if (!label) return;
    if (TRADE_MODE && TRADE_STAGE === "picktheirs" && TRADE_ROLE === "initiator") {
      label.textContent = partnerText;
    } else {
      label.textContent = mineText;
    }
  }

  // PATCH A helper — clear “queued” class on [TRADE] buttons
  function clearTradeHighlights() {
    document.querySelectorAll('.card-container .trade.queued').forEach(btn => {
      btn.classList.remove('queued');
    });
  }

  // NEW: clear UI highlights on all [TRADE] buttons and (optionally) empty queue
  function clearTradeUIHighlights(clearQueue = false) {
    document.querySelectorAll(".card-actions-vertical .trade.queued").forEach(b => b.classList.remove("queued"));
    if (clearQueue) {
      tradeQueue.length = 0;
      updateBottomBar();
    }
  }

  function ensureTradeBanner() {
    let b = document.getElementById("trade-banner");
    if (!b) {
      b = document.createElement("div");
      b.id = "trade-banner";
      b.style.cssText = `
        position: sticky; top: 0; z-index: 1002; width: 100%;
        background: #0f172a; color: #e2e8f0; border-bottom: 1px solid #334155;
        padding: 10px 12px; font-family: system-ui, sans-serif; display: none;
      `;
      // content containers
      b.innerHTML = `
        <div id="trade-banner-text" style="font-weight:600"></div>
        <div id="trade-banner-summary" style="margin-top:8px; display:none;"></div>
        <div id="trade-banner-actions" style="margin-top:10px; display:none;"></div>
      `;
      const root = document.body;
      root.insertBefore(b, root.firstChild);
    }
    return b;
  }

  function renderTradeBanner({ stage, role, partnerName, initiatorName, summary }) {
    const b = ensureTradeBanner();
    const text = b.querySelector("#trade-banner-text");
    const summaryBox = b.querySelector("#trade-banner-summary");
    const actions = b.querySelector("#trade-banner-actions");
    b.style.display = TRADE_MODE ? "block" : "none";

    actions.innerHTML = "";
    summaryBox.style.display = "none";
    actions.style.display = "none";

    if (!TRADE_MODE || !TRADE_SESSION_ID) {
      text.textContent = "Start a trade with /trade";
      const saveBtn0 = document.getElementById('save-offer-btn');
      if (saveBtn0) saveBtn0.style.display = 'none';
      return;
    }

    if (stage === "decision") {
      if (role === "partner") {
        text.textContent = `Trade Offer from ${initiatorName || "player"}`;
        if (summary?.youGive || summary?.youGet) {
          summaryBox.style.display = "block";
          summaryBox.innerHTML = `
            <div><strong>You’ll receive:</strong> ${renderThumbRow(summary.youGet || [])}</div>
            <div style="margin-top:4px;"><strong>You’ll give:</strong> ${renderThumbRow(summary.youGive || [])}</div>
          `;
        }
        const accept = document.createElement("button");
        accept.textContent = "✅ Accept Trade";
        accept.style.marginRight = "8px";
        const deny = document.createElement("button");
        deny.textContent = "❌ Deny Trade";
        accept.onclick = async () => {
          accept.disabled = true; deny.disabled = true;
          const res = await submitTradeDecision("accept");
          if (res?.ok) {
            showToast(res.message || "✅ Trade accepted.");
            TRADE_STAGE = "closed";
            renderTradeBanner({ stage: "closed", role, partnerName, initiatorName });
          } else {
            showToast(res?.message || res?.error || "⚠️ Failed to accept trade.");
            accept.disabled = false; deny.disabled = false;
          }
        };
        deny.onclick = async () => {
          accept.disabled = true; deny.disabled = true;
          const res = await submitTradeDecision("deny");
          if (res?.ok) {
            showToast(res.message || "❌ Trade denied.");
            TRADE_STAGE = "closed";
            renderTradeBanner({ stage: "closed", role, partnerName, initiatorName });
          } else {
            showToast(res?.message || res?.error || "⚠️ Failed to deny trade.");
            accept.disabled = false; deny.disabled = false;
          }
        };
        actions.style.display = "block";
        actions.appendChild(accept);
        actions.appendChild(deny);
      } else {
        text.textContent = `Waiting for ${partnerName || "partner"} to accept/deny…`;
      }
      const saveBtn1 = document.getElementById('save-offer-btn');
      if (saveBtn1) saveBtn1.style.display = 'none';
      return;
    }

    if (stage === "picktheirs") {
      text.textContent = `Step 2 of 2 — select up to 3 from ${partnerName || "partner"}`;
      const saveBtn2 = document.getElementById('save-offer-btn');
      if (saveBtn2) saveBtn2.style.display = 'none';
      return;
    }

    // default = pickmine
    text.textContent = `Step 1 of 2 — select up to 3 cards to offer`;

    const saveBtn = document.getElementById('save-offer-btn');
    if (saveBtn) {
      const show = (TRADE_MODE && TRADE_ROLE === 'initiator' && (stage || '').toLowerCase() === 'pickmine');
      saveBtn.style.display = show ? 'inline-block' : 'none';
    }
  }

  function renderThumbRow(list) {
    if (!Array.isArray(list) || !list.length) return "(none)";
    return list.map(id => `<span style="display:inline-block;border:1px solid #475569;border-radius:4px;padding:2px 6px;margin-right:4px;background:#1f2937;">#${pad3(id)}</span>`).join("");
  }

  /* ---------------- Trade state fetch ---------------- */
  async function loadTradeState() {
    if (!TRADE_MODE || !TRADE_SESSION_ID || !API_BASE) return null;
    const url = `${API_BASE}/trade/${encodeURIComponent(TRADE_SESSION_ID)}/state`;
    const state = await fetchJSON(url);
    if (!state) return null;

    // Server canonical stage
    TRADE_STAGE = (state.stage || TRADE_STAGE || "pickmine").toLowerCase();
    // Infer role from stats.userId if available
    if (stats?.userId) {
      if (String(stats.userId) === String(state.initiator?.userId)) TRADE_ROLE = "initiator";
      else if (String(stats.userId) === String(state.partner?.userId)) TRADE_ROLE = "partner";
    }
    INITIATOR_NAME = state.initiator?.name || INITIATOR_NAME;
    PARTNER_NAME   = (TRADE_ROLE === "initiator" ? state.partner?.name : state.initiator?.name) || PARTNER_NAME;
    TRADE_LIMITS   = state.limits || TRADE_LIMITS;

    // Decision summary (basic id pills; detailed summary available via loadTradeSummary if desired)
    let summary = null;
    if (TRADE_STAGE === "decision") {
      const offer = state.initiator?.selection || [];
      const reqst = state.partner?.selection || [];
      summary = (TRADE_ROLE === "partner")
        ? { youGive: reqst, youGet: offer }
        : { youGive: offer, youGet: reqst };
    }

    renderTradeBanner({
      stage: TRADE_STAGE,
      role: TRADE_ROLE,
      partnerName: PARTNER_NAME,
      initiatorName: INITIATOR_NAME,
      summary
    });

    return state;
  }

  function countQueuedSellById(id) {
    const id3 = pad3(id);
    return sellQueue.reduce((n, e) => n + (pad3(e.id) === id3 ? 1 : 0), 0);
  }

  function totalSellUnits() { return sellQueue.length; }

  // NEW: effective room left considering server remaining and current queue
  function getSellRoomLeft() {
    const queued    = totalSellUnits();
    const remaining = Number(sellStatus?.soldRemaining ?? DAILY_LIMIT_DEFAULT);
    return Math.max(0, remaining - queued);
  }

  function addToSellQueueWithPrompt({ id, filename, rarity, owned }) {
    const alreadyQueued = countQueuedSellById(id);
    const remainingOwned = Math.max(0, owned - alreadyQueued);
    if (remainingOwned <= 0) {
      showToast("⚠️ You’ve already queued the maximum you own for this card.");
      return;
    }
    const roomLeft = getSellRoomLeft();
    if (roomLeft <= 0) {
      showToast("⚠️ Daily sell limit reached. Try again after reset.");
      const bar = document.getElementById("sell-bottom-bar");
      bar?.classList.add("limit-reached");
      return;
    }

    const maxQty = Math.min(remainingOwned, roomLeft);
    let qty = prompt(`How many #${id} would you like to sell? (1–${maxQty})`, "1");
    if (qty == null) return; // cancelled
    qty = parseInt(qty, 10);
    if (!Number.isFinite(qty) || qty < 1) {
      showToast("⚠️ Invalid quantity.");
      return;
    }
    if (qty > maxQty) {
      showToast(`⚠️ You can sell at most ${maxQty} right now.`);
      return;
    }

    for (let i = 0; i < qty; i++) {
      sellQueue.push({ id: pad3(id), filename, rarity });
    }
    updateSellBar();
    showToast(`🪙 Queued ${qty} × #${id} for selling.`);
  }

  function updateBottomBar() {
    const container = document.getElementById("bottom-trade-list");
    const bar = document.getElementById("trade-bottom-bar");
    if (!container || !bar) return;

    // Title swap in trade mode
    let title = bar.querySelector(".bar-title");
    if (!title) {
      title = document.createElement("div");
      title.className = "bar-title";
      title.style.cssText = "font-weight:700;margin-bottom:6px;";
      bar.prepend(title);
    }
    title.textContent = TRADE_MODE ? (TRADE_ROLE === "partner" ? "Trade Response" : "Trade Offer") : "Trade Queue";

    // Submit label adjusts by stage
    const stageLabel = (TRADE_MODE && TRADE_STAGE === "picktheirs")
      ? (TRADE_ROLE === "partner" ? "[SUBMIT YOUR PICKS]" : "[SEND TRADE PROPOSAL]")
      : (TRADE_MODE ? "[SAVE YOUR OFFER]" : "[SUBMIT TRADE]");

    container.innerHTML = "";
    tradeQueue.forEach((entry, index) => {
      const div = document.createElement("div");
      div.classList.add("trade-card-entry");

      const thumb = document.createElement("img");
      const fakeCard = { card_id: entry.id, name: "", type: "", image: entry.filename };
      setImageWithFallback(thumb, fakeCard, {
        onFailToAll: () => { thumb.src = `${deriveSelfImagesAbs()}/000_CardBack_Unique.png`; }
      });

      thumb.alt = `#${entry.id}`;
      thumb.classList.add("thumb");
      thumb.title = `Card #${entry.id} (${entry.rarity || "Unknown"})`;

      const removeBtn = document.createElement("button");
      removeBtn.innerHTML = "🗑";
      removeBtn.title = "Remove from trade queue";
      removeBtn.addEventListener("click", () => {
        // remove that entry
        tradeQueue.splice(index, 1);
        // also unhighlight the corresponding card tile button
        unhighlightTradeButton(entry.id);     // FIX D
        updateBottomBar();
        bar?.classList.remove("limit-reached");
      });

      div.appendChild(thumb);
      div.appendChild(removeBtn);
      container.appendChild(div);
    });

    let submitBtn = document.getElementById("submit-trade-btn");
    if (!submitBtn) {
      submitBtn = document.createElement("button");
      submitBtn.id = "submit-trade-btn";
      submitBtn.className = "queue-submit-button";
      bar.appendChild(submitBtn);
    }
    submitBtn.textContent = stageLabel;

    // FIX E: hide submit in decision stage (no stale actions)
    if (TRADE_MODE && TRADE_STAGE === "decision") {
      submitBtn.style.display = "none";
      submitBtn.onclick = null;
    } else {
      submitBtn.style.display = "";
      submitBtn.onclick = async () => {
        if (!tradeQueue.length) return showToast("⚠️ Trade queue is empty.");
        const cards = tradeQueue.map(e => pad3(e.id));

        // Session guards (FIX B)
        if (TRADE_MODE) {
          if (TRADE_ROLE !== 'initiator') {
            return showToast("ℹ️ Only the trade initiator can submit here.");
          }
          if (!(TRADE_STAGE === 'pickmine' || TRADE_STAGE === 'picktheirs')) {
            if (TRADE_STAGE === 'decision') return showToast("ℹ️ Waiting on partner…");
            return showToast("ℹ️ Not actionable yet. Try again.");
          }
        }

        // Disable to prevent double-clicks
        submitBtn.disabled = true;

        try {
          if (!TRADE_MODE || !TRADE_SESSION_ID) {
            showToast("ℹ️ Start a trade with /trade.");
            const res = await submitTradeLegacy(cards);
            if (res?.ok) {
              patchOwnedMapWithServer(res.collection);
              const masterById = Object.fromEntries(master.map(c => [pad3(c.card_id), c]));
              [...new Set(cards)].forEach(id => refreshTileFor(id, masterById));
              if (coinBalanceEl && res.stats?.coins != null) coinBalanceEl.textContent = String(res.stats.coins);
              tradeQueue.length = 0;
              clearTradeHighlights();           // PATCH/FIX A — remove queued highlights
              updateBottomBar();
              clearTradeUIHighlights(false);
              showToast(res.message || "📦 Trade submitted!");
              return;
            } else if (res && (res.message || res.error)) {
              showToast(`⚠️ ${res.message || res.error}`);
            }
            submitBtn.disabled = false;
            return;
          }

          // FIX C: early feedback toast
          showToast(TRADE_STAGE === 'picktheirs' ? "Submitting your picks…" : "Saving your offer…");

          // In session: use select endpoint with explicit stage
          const explicitStage = (TRADE_STAGE === "picktheirs") ? "pickTheirs" : "pickMine";
          const res = await submitTradeSelection(cards, explicitStage);
          if (res?.ok) {
            // Pre-clear to prevent auto-resubmit during flip (FIX A)
            tradeQueue.length = 0;
            clearTradeHighlights();
            updateBottomBar();

            // Pull fresh state and flip
            const state = await loadTradeState();
            await hydrateTradeCollectionsAndSwitchView(); // rebinds button via updateBottomBar

            if (state?.stage === "picktheirs") {
              showToast("📤 Offer saved. Now pick up to 3 from your partner.");
            } else if (state?.stage === "decision") {
              showToast(res.message || "📨 Trade proposal sent.");
            } else {
              showToast(res.message || "✅ Selection saved.");
            }
            return;
          } else {
            showToast(res?.message || res?.error || "⚠️ Failed to submit selection.");
            submitBtn.disabled = false;
          }
        } catch (e) {
          showToast("⚠️ Network error");
          submitBtn.disabled = false;
        }
      };
    }

    // Cap changes in trade mode (3) vs legacy (30)
    const cap = (TRADE_MODE ? 3 : 30);
    bar.classList.toggle("limit-reached", tradeQueue.length >= cap);
  }

  // Debounced preview updater (single instance)
  const debouncedUpdateSellPreview = debounce(async (previewEl) => {
    if (!previewEl) return;
    if (API_BASE && TOKEN && sellQueue.length) {
      const credited = await previewSellCredit();
      if (credited != null) {
        const s = Number(credited).toFixed(2).replace(/\.00$/,'').replace(/(\.\d)0$/,'$1');
        previewEl.textContent = `Preview credit: +${s} coins`;
      } else {
        previewEl.textContent = "";
      }
    } else {
      previewEl.textContent = "";
    }
  }, 200);

  function updateSellBar() {
    const container = document.getElementById("bottom-sell-list");
    const bar = document.getElementById("sell-bottom-bar");
    if (!container || !bar) return;

    // Status line (remaining / reset / preview)
    let status = document.getElementById("sell-status-line");
    if (!status) {
      status = document.createElement("div");
      status.id = "sell-status-line";
      status.style.cssText = "font-weight:600;margin-bottom:6px;";
      bar.prepend(status);
    }
    const queued   = totalSellUnits();
    const roomLeft = getSellRoomLeft();
    const resetTxt = sellStatus?.resetAtISO ? ` • resets ${new Date(sellStatus.resetAtISO).toLocaleString()}` : "";
    status.textContent = `Sell queued: ${queued} • Remaining today: ${roomLeft}${resetTxt}`;

    container.innerHTML = "";
    sellQueue.forEach((entry, index) => {
      const div = document.createElement("div");
      div.classList.add("sell-card-entry");

      const thumb = document.createElement("img");
      const fakeCard = { card_id: entry.id, name: "", type: "", image: entry.filename };
      setImageWithFallback(thumb, fakeCard, {
        onFailToAll: () => { thumb.src = `${deriveSelfImagesAbs()}/000_CardBack_Unique.png`; }
      });

      thumb.alt = `#${entry.id}`;
      thumb.classList.add("thumb");
      thumb.title = `Card #${entry.id} (${entry.rarity || "Unknown"})`;

      const removeBtn = document.createElement("button");
      removeBtn.innerHTML = "🗑";
      removeBtn.title = "Remove one from sell list";
      removeBtn.addEventListener("click", async () => {
        sellQueue.splice(index, 1); // remove single unit
        updateSellBar();
        bar?.classList.remove("limit-reached");
        await refreshSellStatus(); // keep remaining accurate as user edits
      });

      div.appendChild(thumb);
      div.appendChild(removeBtn);
      container.appendChild(div);
    });

    let submitBtn = document.getElementById("submit-sell-btn");
    if (!submitBtn) {
      submitBtn = document.createElement("button");
      submitBtn.id = "submit-sell-btn";
      submitBtn.className = "queue-submit-button";
      submitBtn.textContent = "[SUBMIT SELL]";
      submitBtn.addEventListener("click", async () => {
        if (!sellQueue.length) return showToast("⚠️ Sell list is empty.");
        submitBtn.disabled = true; // prevent double-clicks
        try {
          const res = await submitSell();
          if (res?.ok) {
            patchOwnedMapWithServer(res.collection);
            recalcAndRenderHeaderCounts();
            const masterById = Object.fromEntries(master.map(c => [pad3(c.card_id), c]));
            // refresh only IDs that changed
            const changedIds = Object.keys((buildSellItems()).items.reduce((m, it) => (m[it.number]=1,m), {}));
            changedIds.forEach(id => refreshTileFor(id, masterById));
            if (coinBalanceEl && res.balance != null) coinBalanceEl.textContent = String(res.balance);
            sellQueue.length = 0;
            updateSellBar();
            recalcAndRenderHeaderCounts();
            playSaleSfx(); // 🔊 play sale sound
            showToast(res.message || `🪙 Sold! +${res.credited ?? 0} coins`);
            await refreshCoinUI();
            await refreshSellStatus();
          } else if (res && (res.message || res.error)) {
            showToast(`⚠️ ${res.message || res.error}`);
            if (String(res.error || "").toLowerCase().includes("limit")) {
              bar?.classList.add("limit-reached");
              await refreshSellStatus();
            }
            await refreshCoinUI();
            submitBtn.disabled = false; // re-enable on failure
          } else {
            submitBtn.disabled = false; // generic failure path
          }
        } catch {
          showToast("⚠️ Network error");
          submitBtn.disabled = false; // re-enable on failure
        }
      });
      bar.appendChild(submitBtn);
    }

    // Optional credit preview (debounced)
    let previewEl = document.getElementById("sell-preview-line");
    if (!previewEl) {
      previewEl = document.createElement("div");
      previewEl.id = "sell-preview-line";
      previewEl.style.cssText = "margin-top:4px; opacity:0.9;";
      bar.appendChild(previewEl);
    }
    debouncedUpdateSellPreview(previewEl);

    // Visual limit cue
    bar.classList.toggle("limit-reached", roomLeft <= 0);
  }

  /* ---------------- Load data ---------------- */
  const [master, collectionResult, stats] = await Promise.all([
    loadMaster(),
    loadCollection(),
    loadStats()
  ]);

  // NEW: maintain separate ownership maps and a pointer to the one currently displayed
  let myOwnedMap = collectionResult.map || {};
  let partnerOwnedMap = {}; // filled in trade mode via /trade/:session/collections
  let ownedMap = myOwnedMap; // pointer that can flip to partner view in trade mode

  /* ---------------- Build OR Hydrate grid ---------------- */
  const grid = document.getElementById("card-grid") || document.getElementById("cards-container");
  if (!grid) {
    console.error("[ccui] Missing #card-grid or #cards-container container in HTML");
    return;
  }

  const hasPreRenderedTiles = !!grid.querySelector(".card-container");
  const masterById = Object.fromEntries(master.map(c => [pad3(c.card_id), c]));

  let totalOwnedCopies = 0;
  let ownedUniqueCount = 0;

  // helper to apply "NEW" highlight
  function applyNewHighlight(container, id) {
    if (!newIds.has(id) || alreadySeenThisBatch) return;
    container.classList.add("is-new");
    let badge = container.querySelector(".new-badge");
    if (!badge) {
      badge = document.createElement("div");
      badge.className = "new-badge";
      badge.textContent = "NEW";
      badge.style.cssText = "position:absolute;top:8px;left:8px;padding:2px 6px;border-radius:6px;background:#FFD400;color:#111;font-weight:700;font-size:11px;";
      container.appendChild(badge);
    }
    const clear = () => {
      container.classList.remove("is-new");
      badge?.remove();
    };
    container.addEventListener("click", clear, { once: true });
    setTimeout(clear, 12000);
  }

  if (hasPreRenderedTiles) {
    grid.querySelectorAll(".card-container").forEach(container => {
      const numEl = container.querySelector("p");
      const img   = container.querySelector("img");
      if (!numEl || !img) return;

      const id     = (numEl.textContent || "").replace("#", "");
      const qty    = Number(ownedMap[id] || 0);
      const masterCard = masterById[id];

      if (qty > 0) {
        ownedUniqueCount++;
        totalOwnedCopies += qty;
        if (masterCard) {
          setImageWithFallback(img, masterCard, {
            onFailToAll: () => { img.src = `${deriveSelfImagesAbs()}/000_CardBack_Unique.png`; }
          });
          img.classList.remove("facedown-card");
          img.classList.add("card-img");
          container.className = `card-container ${rarityClass(masterCard.rarity)}`;
          container.dataset.rarity = masterCard.rarity || "Common";
          applyNewHighlight(container, id);
        }
      } else {
        img.src = `${deriveSelfImagesAbs()}/000_CardBack_Unique.png`;
        img.classList.add("facedown-card");
        if (masterCard) container.dataset.rarity = masterCard.rarity || "Common";
      }

      const span = container.querySelector(".owned-count") || (() => {
        const s = document.createElement("span");
        s.className = "owned-count";
        container.appendChild(s);
        return s;
      })();

      span.textContent = `Owned: ${qty}`;
      container.dataset.owned = String(qty);

      // Wire SELL handler
      const sellBtn = container.querySelector(".sell");
      if (sellBtn) {
        sellBtn.disabled = qty <= 0;
        sellBtn.title = qty <= 0 ? "You don’t own this card" : "Add to sell list";
        sellBtn.addEventListener("click", () => {
          if (qty <= 0) return showToast("❌ You do not own this card.");
          const filename = masterCard?.image || "";
          const rarity = masterCard?.rarity || "Common";
          addToSellQueueWithPrompt({ id, filename, rarity, owned: qty });
        });
      }

      // TRADE handler — session mode, toggle behavior
      const tradeBtn = container.querySelector(".trade");
      if (tradeBtn) {
        tradeBtn.addEventListener("click", () => {
          const qtyNow = Number(ownedMap[id] || 0); // use *current* pointer (mine in step1; partner in step2)
          if (qtyNow <= 0) return showToast("❌ You do not own this card.");
          if (!TRADE_MODE || !TRADE_SESSION_ID) {
            return showToast("ℹ️ Start a trade with /trade.");
          }
          if (TRADE_STAGE === "decision") {
            return showToast("ℹ️ Waiting for decision — cannot modify picks now.");
          }

          // Toggle: if already queued, remove & unhighlight; else add (cap 3)
          if (queueHas(id)) {
            removeFromTradeQueue(id);
            showToast(`↩️ Removed #${id} from trade queue.`);
            return;
          }

          if (tradeQueue.length >= 3) return showToast(`⚠️ Trade queue is full (3).`);
          tradeQueue.push({ id, filename: masterCard?.image || "", rarity: masterCard?.rarity || "Common" });
          tradeBtn.classList.add("queued");
          showToast(`✅ Card #${id} added to trade queue.`);
          updateBottomBar();
        });
      }
    });
  } else {
    grid.innerHTML = "";

    for (const card of master) {
      const id  = pad3(card.card_id);
      const qty = Number(ownedMap[id] || 0);
      if (qty > 0) ownedUniqueCount += 1;
      totalOwnedCopies += qty;

      const cardContainer = document.createElement("div");
      cardContainer.className = `card-container ${rarityClass(card.rarity)}`;
      cardContainer.dataset.rarity = card.rarity || "Common";
      cardContainer.dataset.owned  = String(qty);
      cardContainer.style.position = "relative";

      const img = document.createElement("img");
      img.alt = card.name || `#${id}`;
      img.className = qty > 0 ? "card-img" : "facedown-card";

      if (qty > 0) {
        setImageWithFallback(img, card, {
          onFailToAll: () => { img.src = `${deriveSelfImagesAbs()}/000_CardBack_Unique.png`; }
        });
      } else {
        img.src = `${deriveSelfImagesAbs()}/000_CardBack_Unique.png`;
      }

      const num = document.createElement("p");
      num.textContent = `#${id}`;

      const actions = document.createElement("div");
      actions.className = "card-actions-vertical";

      const tradeBtn = document.createElement("button");
      tradeBtn.className = "trade";
      tradeBtn.textContent = "[TRADE]";
      tradeBtn.addEventListener("click", () => {
        const qtyNow = Number(ownedMap[id] || 0); // use *current* pointer
        if (qtyNow <= 0) return showToast("❌ You do not own this card.");
        if (!TRADE_MODE || !TRADE_SESSION_ID) {
          return showToast("ℹ️ Start a trade with /trade.");
        }
        if (TRADE_STAGE === "decision") {
          return showToast("ℹ️ Waiting for decision — cannot modify picks now.");
        }

        if (queueHas(id)) {
          removeFromTradeQueue(id);
          showToast(`↩️ Removed #${id} from trade queue.`);
          return;
        }

        if (tradeQueue.length >= 3) return showToast(`⚠️ Trade queue is full (3).`);
        tradeQueue.push({ id, filename: card.image, rarity: card.rarity });
        tradeBtn.classList.add("queued");
        showToast(`✅ Card #${id} added to trade queue.`);
        updateBottomBar();
      });

      const ownedSpan = document.createElement("span");
      ownedSpan.className = "owned-count";
      ownedSpan.textContent = `Owned: ${qty}`;

      const sellBtn = document.createElement("button");
      sellBtn.className = "sell";
      sellBtn.textContent = "[SELL]";
      sellBtn.disabled = qty <= 0;
      sellBtn.title = qty <= 0 ? "You don’t own this card" : "Add to sell list";
      sellBtn.addEventListener("click", () => {
        const qtyNow = Number(ownedMap[id] || 0); // use *current* pointer
        if (qtyNow <= 0) return showToast("❌ You do not own this card.");
        addToSellQueueWithPrompt({ id, filename: card.image, rarity: card.rarity, owned: qtyNow });
      });

      actions.append(tradeBtn, ownedSpan, sellBtn);
      cardContainer.append(img, num, actions);
      grid.appendChild(cardContainer);

      if (qty > 0) applyNewHighlight(cardContainer, id);
    }
  }

  // mark this batch as "seen" so a reload doesn't re-highlight unless ts changes
  if (newIds.size && !alreadySeenThisBatch) {
    sessionStorage.setItem(SEEN_KEY, "1");
  }

  /* ---------------- Header stats ---------------- */
  const collectionCountEl = document.getElementById("collection-count");
  const totalOwnedEl      = document.getElementById("total-owned-count");
  coinBalanceEl           = document.getElementById("coin-balance");
  const ownershipWarning  = document.getElementById("ownership-warning");

  if (collectionCountEl) collectionCountEl.textContent = `Cards Collected: ${ownedUniqueCount} / 127`;
  if (totalOwnedEl)      totalOwnedEl.textContent      = `Total Cards Owned: ${totalOwnedCopies} / 250`;
  if (ownershipWarning)  ownershipWarning.style.display = totalOwnedCopies >= 247 ? "block" : "none";

  // Call both owner labels once after initial render (PATCH B + legacy label support)
  updateCollectionOwnerLabel(); // PATCH B new label
  updateOwnerLabel();           // legacy/title fallback

  // --- NEW: always refresh from server truth so it matches /sellcard & /buycard updates ---
  function formatCoins(n) {
    const s = Number(n).toFixed(2);
    return s.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
  }
  async function refreshCoinUI() {
    try {
      if (!API_BASE || !TOKEN) return;
      const url = `${API_BASE}/me/${encodeURIComponent(TOKEN)}/stats`;
      const j = await fetchJSON(url);
      if (j && typeof j.coins !== "undefined" && coinBalanceEl) {
        coinBalanceEl.textContent = formatCoins(j.coins);
      }
    } catch (e) {
      // silent; keep whatever was rendered from initial stats
    }
  }
  await refreshCoinUI();

  // NEW: keep sell status in sync
  async function refreshSellStatus() {
    sellStatus = await fetchSellStatus();
    updateSellBar();
  }
  await refreshSellStatus();

  updateBottomBar();
  updateSellBar();

  if (FROM_PACK) {
    showToast("✨ New cards added from Pack Reveal!");
  }

  // Start audio (creates toggle & handles autoplay policy)
  initAudio();

  // NEW: helper to hydrate trade collections and switch the grid view appropriately
  async function hydrateTradeCollectionsAndSwitchView() {
    if (!TRADE_MODE || !TRADE_SESSION_ID || !API_BASE || !TOKEN) return;
    const data = await loadTradeCollections();
    if (!data) return;

    // update role/stage if backend returns them
    if (data.role)  TRADE_ROLE  = data.role;
    if (data.stage) TRADE_STAGE = data.stage;

    // patch maps from server truth
    myOwnedMap      = data.myMap || myOwnedMap;
    partnerOwnedMap = data.partnerMap || partnerOwnedMap;

    // flip pointer based on stage
    if (TRADE_STAGE === "picktheirs") {
      ownedMap = (TRADE_ROLE === "initiator") ? partnerOwnedMap : myOwnedMap;
      clearTradeUIHighlights(true);          // FIX A: ensure queue is empty & highlights cleared **after** flip too
    } else {
      ownedMap = myOwnedMap;
    }

    // refresh grid + header counts + labels
    applyOwnedMapToGrid(masterById);
    updateCollectionOwnerLabel();
    clearTradeHighlights();
    recalcAndRenderHeaderCounts();
    updateOwnerLabel();
    updateBottomBar();                        // FIX B: rebind submit after flip
  }

  /* ---------------- SAVE-OFFER button hook (initiator, Step 1) ---------------- */
  function wireSaveOfferButton() {
    const btn = document.getElementById("save-offer-btn");
    if (!btn) return;
    btn.addEventListener("click", async () => {
      if (!TRADE_MODE || !TRADE_SESSION_ID || !API_BASE || !TOKEN) {
        return showToast("⚠️ Trading requires a valid session, API & token.");
      }
      if (TRADE_ROLE !== "initiator") {
        return showToast("ℹ️ Only the trade initiator can use SAVE here.");
      }
      if ((TRADE_STAGE || "").toLowerCase() !== "pickmine") {
        return showToast("ℹ️ You’re past Step 1 — use the main trade button instead.");
      }
      if (!tradeQueue.length) {
        return showToast("⚠️ Pick at least 1 card to offer.");
      }

      // FIX C: immediate toast on submit attempt
      showToast("Saving your offer…");

      const cards = tradeQueue.map(e => String(e.id).padStart(3, "0"));
      btn.disabled = true;
      try {
        const res = await submitTradeSelection(cards, "pickMine");
        if (res?.ok) {
          // FIX A: purge queue & highlights BEFORE view flip
          tradeQueue.length = 0;
          clearTradeHighlights();
          updateBottomBar();

          await loadTradeState();
          await hydrateTradeCollectionsAndSwitchView();

          if ((TRADE_STAGE || "").toLowerCase() === "picktheirs") {
            showToast("📤 Offer saved. Now pick up to 3 from your partner.");
          } else if ((TRADE_STAGE || "").toLowerCase() === "decision") {
            showToast(res.message || "📨 Trade proposal sent.");
            clearTradeUIHighlights(true);
          } else {
            showToast(res.message || "✅ Offer saved.");
          }
          return;
        }
        showToast(res?.message || res?.error || "⚠️ Failed to save offer.");
        btn.disabled = false;
      } catch {
        showToast("⚠️ Network error");
        btn.disabled = false;
      }
    });
  }

  // If we’re in a trade session, hydrate state, collections & banner
  if (TRADE_MODE) {
    if (!TRADE_SESSION_ID) {
      ensureTradeBanner();
      renderTradeBanner({ stage: "invalid", role: "", partnerName: "" });
      showToast("⚠️ Invalid trade session link.");
    } else if (!API_BASE || !TOKEN) {
      ensureTradeBanner();
      renderTradeBanner({ stage: "invalid", role: "", partnerName: "" });
      showToast("⚠️ Trading requires a valid API & token.");
    } else {
      await loadTradeState();
      await hydrateTradeCollectionsAndSwitchView();
      // const sum = await loadTradeSummary(); // optionally use
    }
  }

  // Finally, wire the optional SAVE button (safe no-op if it’s not on the page)
  wireSaveOfferButton();

  /* ---------------- Return to HUB: keep token/api + trade session ---------------- */
  const hubLink = document.getElementById("return-to-hub");
  if (hubLink) {
    try {
      const u = new URL(hubLink.href);
      if (TOKEN) u.searchParams.set("token", TOKEN);
      if (API_BASE) u.searchParams.set("api", API_BASE);
      if (TRADE_MODE && TRADE_SESSION_ID) {
        u.searchParams.set("mode", "trade");
        u.searchParams.set("tradeSession", TRADE_SESSION_ID);
        if (TRADE_ROLE) u.searchParams.set("role", TRADE_ROLE);
      }
      hubLink.href = u.toString();
    } catch {
      let base = hubLink.getAttribute("href") || "https://madv313.github.io/HUB-UI/";
      const params = [];
      if (TOKEN) params.push(`token=${encodeURIComponent(TOKEN)}`);
      if (API_BASE) params.push(`api=${encodeURIComponent(API_BASE)}`);
      if (TRADE_MODE && TRADE_SESSION_ID) {
        params.push(`mode=trade`, `tradeSession=${encodeURIComponent(TRADE_SESSION_ID)}`);
        if (TRADE_ROLE) params.push(`role=${encodeURIComponent(TRADE_ROLE)}`);
      }
      const sep = base.includes("?") ? "&" : "?";
      hubLink.setAttribute("href", params.length ? `${base}${sep}${params.join("&")}` : base);
    }
  }
});
