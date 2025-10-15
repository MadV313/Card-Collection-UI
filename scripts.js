// scripts.js — Token-aware Card Collection UI (prefers local master JSON, robust IMG fallbacks + NEW highlight + real Trade/Sell submit)
document.addEventListener("DOMContentLoaded", async () => {
  /* ---------------- URL params & config ---------------- */
  const qs = new URLSearchParams(window.location.search);
  const TOKEN     = qs.get("token") || "";
  const UID       = qs.get("uid")   || "";
  const FROM_PACK = qs.get("fromPackReveal") === "true";
  const MODE      = (qs.get("mode") || "").toLowerCase(); // e.g. 'trade' (optional gating prep)
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

  async function fetchJSON(url, opts) {
    try {
      const r = await fetch(url, { cache: "no-store", ...opts });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return await r.json();
    } catch (e) {
      console.warn(`[ccui] fetch failed ${url}: ${e?.message}`);
      return null;
    }
  }

  async function loadMaster() {
    // Try local copies FIRST (common paths), then the API if needed
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

    if ((!Array.isArray(master) || !master.length) && API_BASE) {
      const apiCandidates = [
        `${API_BASE}/logic/CoreMasterReference.json`,
        `${API_BASE}/CoreMasterReference.json`
      ];
      for (const p of apiCandidates) {
        master = await fetchJSON(p);
        if (Array.isArray(master) && master.length) {
          console.log(`[ccui] Using API master: ${p}`);
          break;
        }
      }
    }

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

  async function loadCollection() {
    // Preferred: token routes on your backend
    if (TOKEN && API_BASE) {
      let d = await fetchJSON(`${API_BASE}/me/${encodeURIComponent(TOKEN)}/collection`);
      if (d) return { map: toOwnershipMap(d), src: "token" };

      d = await fetchJSON(`${API_BASE}/collection?token=${encodeURIComponent(TOKEN)}`);
      if (d) return { map: toOwnershipMap(d), src: "token-query" };
    }

    // Secondary: uid route
    if (UID && API_BASE) {
      let d = await fetchJSON(`${API_BASE}/collection?userId=${encodeURIComponent(UID)}`);
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

  async function loadStats() {
    if (TOKEN && API_BASE) {
      let s = await fetchJSON(`${API_BASE}/me/${encodeURIComponent(TOKEN)}/stats`);
      if (s) return s;
      s = await fetchJSON(`${API_BASE}/userStatsToken?token=${encodeURIComponent(TOKEN)}`);
      if (s) return s;
    }
    if (UID && API_BASE) {
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
      imgEl.onerror = tryNext;
      imgEl.src = url;
    };

    tryNext();
  }

  /* ---------------- Trade/Sell submit helpers (real API) ---------------- */
  async function postJson(url, body) {
    return fetchJSON(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    });
  }

  async function submitTrade(cards) {
    if (!API_BASE || !TOKEN) {
      showToast("⚠️ Trading requires a valid API and token.");
      return null;
    }
    return postJson(`${API_BASE}/me/${encodeURIComponent(TOKEN)}/trade`, { cards });
  }

  // Build `{ items: [{ number, qty }, ...] }` from the current sellQueue (unit entries)
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

  function patchOwnedMapWithServer(collection) {
    if (!collection || typeof collection !== "object") return;
    // Clear then patch to match server truth
    for (const k of Object.keys(ownedMap)) delete ownedMap[k];
    for (const [k, v] of Object.entries(collection)) ownedMap[pad3(k)] = Number(v) || 0;
  }

  function refreshTileFor(id, masterById) {
    const grid = document.getElementById("card-grid") || document.getElementById("cards-container");
    const tile = [...grid.querySelectorAll(".card-container")].find(div => {
      const p = div.querySelector("p");
      return p && p.textContent.replace("#","") === id;
    });
    if (!tile) return;

    const qty = Number(ownedMap[id] || 0);
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

    // toggle SELL button enable
    const sellBtn = tile.querySelector(".sell");
    if (sellBtn) {
      sellBtn.disabled = qty <= 0;
      sellBtn.title = qty <= 0 ? "You don’t own this card" : "Add to sell list";
    }
  }

  /* ---------------- UI helpers ---------------- */
  const tradeQueue = [];
  const sellQueue  = []; // unit entries: [{ id, filename, rarity }, ...]

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

  function countQueuedSellById(id) {
    const id3 = pad3(id);
    return sellQueue.reduce((n, e) => n + (pad3(e.id) === id3 ? 1 : 0), 0);
  }

  function totalSellUnits() { return sellQueue.length; }

  function addToSellQueueWithPrompt({ id, filename, rarity, owned }) {
    const alreadyQueued = countQueuedSellById(id);
    const remaining = Math.max(0, owned - alreadyQueued);
    if (remaining <= 0) {
      showToast("⚠️ You’ve already queued the maximum you own for this card.");
      return;
    }
    const roomLeft = Math.max(0, 5 - totalSellUnits());
    if (roomLeft <= 0) {
      showToast("⚠️ You can only sell up to 5 cards every 24 hours.");
      const bar = document.getElementById("sell-bottom-bar");
      bar?.classList.add("limit-reached");
      return;
    }

    const maxQty = Math.min(remaining, roomLeft);
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
        tradeQueue.splice(index, 1);
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
      submitBtn.textContent = "[SUBMIT TRADE]";
      submitBtn.addEventListener("click", async () => {
        if (!tradeQueue.length) return showToast("⚠️ Trade queue is empty.");
        const cards = tradeQueue.map(e => pad3(e.id));
        const res = await submitTrade(cards);
        if (res?.ok) {
          patchOwnedMapWithServer(res.collection);
          const masterById = Object.fromEntries(master.map(c => [pad3(c.card_id), c]));
          [...new Set(cards)].forEach(id => refreshTileFor(id, masterById));
          if (coinBalanceEl && res.stats?.coins != null) coinBalanceEl.textContent = String(res.stats.coins);
          tradeQueue.length = 0;
          updateBottomBar();
          showToast(res.message || "📦 Trade submitted!");
        } else if (res && (res.message || res.error)) {
          showToast(`⚠️ ${res.message || res.error}`);
        }
      });
      bar.appendChild(submitBtn);
    }

    // Optional prep: when actually in trade mode, cap to 3
    const cap = (MODE === "trade") ? 3 : 30;
    bar.classList.toggle("limit-reached", tradeQueue.length >= cap);
  }

  function updateSellBar() {
    const container = document.getElementById("bottom-sell-list");
    const bar = document.getElementById("sell-bottom-bar");
    if (!container || !bar) return;

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
      removeBtn.addEventListener("click", () => {
        sellQueue.splice(index, 1); // remove single unit
        updateSellBar();
        bar?.classList.remove("limit-reached");
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
        const res = await submitSell();
        if (res?.ok) {
          patchOwnedMapWithServer(res.collection);
          const masterById = Object.fromEntries(master.map(c => [pad3(c.card_id), c]));
          // refresh only IDs that changed
          const changedIds = Object.keys((buildSellItems()).items.reduce((m, it) => (m[it.number]=1,m), {}));
          changedIds.forEach(id => refreshTileFor(id, masterById));
          if (coinBalanceEl && res.stats?.coins != null) coinBalanceEl.textContent = String(res.stats.coins);
          sellQueue.length = 0;
          updateSellBar();
          showToast(res.message || "🪙 Sell submitted!");
        } else if (res && (res.message || res.error)) {
          showToast(`⚠️ ${res.message || res.error}`);
        }
      });
      bar.appendChild(submitBtn);
    }

    bar.classList.toggle("limit-reached", sellQueue.length >= 5);
  }

  /* ---------------- Load data ---------------- */
  const [master, collectionResult, stats] = await Promise.all([
    loadMaster(),
    loadCollection(),
    loadStats()
  ]);
  const ownedMap = collectionResult.map || {};

  /* ---------------- Build OR Hydrate grid ---------------- */
  const grid = document.getElementById("card-grid") || document.getElementById("cards-container");
  if (!grid) {
    console.error("[ccui] Missing #card-grid or #cards-container container in HTML");
    return;
  }

  const hasPreRenderedTiles = !!grid.querySelector(".card-container");

  let totalOwnedCopies = 0;
  let ownedUniqueCount = 0;

  // helper to apply "NEW" highlight
  function applyNewHighlight(container, id) {
    if (!newIds.has(id) || alreadySeenThisBatch) return;
    container.classList.add("is-new");
    // add a small badge
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
    // clear on click
    container.addEventListener("click", clear, { once: true });
    // auto clear after 12s
    setTimeout(clear, 12000);
  }

  if (hasPreRenderedTiles) {
    const masterById = Object.fromEntries(master.map(c => [pad3(c.card_id), c]));

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

      // Wire SELL handler (quantity prompt + cap 5 / respect owned)
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

      // Keep existing trade button behavior (prep: optional cap if in MODE=trade)
      const tradeBtn = container.querySelector(".trade");
      if (tradeBtn) {
        tradeBtn.addEventListener("click", () => {
          if (qty <= 0) return showToast("❌ You do not own this card.");
          const cap = (MODE === "trade") ? 3 : 30;
          if (tradeQueue.length >= cap) return showToast(`⚠️ Trade queue is full (${cap}).`);
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
        if (qty <= 0) return showToast("❌ You do not own this card.");
        const cap = (MODE === "trade") ? 3 : 30;
        if (tradeQueue.length >= cap) return showToast(`⚠️ Trade queue is full (${cap}).`);
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
        if (qty <= 0) return showToast("❌ You do not own this card.");
        addToSellQueueWithPrompt({ id, filename: card.image, rarity: card.rarity, owned: qty });
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
  const coinBalanceEl     = document.getElementById("coin-balance");
  const ownershipWarning  = document.getElementById("ownership-warning");

  if (collectionCountEl) collectionCountEl.textContent = `Cards Collected: ${ownedUniqueCount} / 127`;
  if (totalOwnedEl)      totalOwnedEl.textContent      = `Total Cards Owned: ${totalOwnedCopies} / 250`;
  if (coinBalanceEl)     coinBalanceEl.textContent     = String(stats?.coins ?? 0);
  if (ownershipWarning)  ownershipWarning.style.display = totalOwnedCopies >= 247 ? "block" : "none";

  updateBottomBar();
  updateSellBar();

  if (FROM_PACK) {
    showToast("✨ New cards added from Pack Reveal!");
  }

  /* ---------------- Return to HUB: keep token/api ---------------- */
  const hubLink = document.getElementById("return-to-hub");
  if (hubLink) {
    try {
      const u = new URL(hubLink.href);
      if (TOKEN) u.searchParams.set("token", TOKEN);
      if (API_BASE) u.searchParams.set("api", API_BASE);
      hubLink.href = u.toString();
    } catch {
      // If original was a relative without protocol, build safely
      let base = hubLink.getAttribute("href") || "https://madv313.github.io/HUB-UI/";
      const sep = base.includes("?") ? "&" : "?";
      const qp  = [
        TOKEN ? `token=${encodeURIComponent(TOKEN)}` : "",
        API_BASE ? `api=${encodeURIComponent(API_BASE)}` : ""
      ].filter(Boolean).join("&");
      hubLink.setAttribute("href", qp ? `${base}${sep}${qp}` : base);
    }
  }
});
