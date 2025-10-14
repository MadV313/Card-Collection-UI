// scripts.js — Token-aware Card Collection UI (supports ?token= or ?uid=, API/IMG bases, and mocks)
document.addEventListener("DOMContentLoaded", async () => {
  /* ---------------- URL params & config ---------------- */
  const qs = new URLSearchParams(window.location.search);
  const TOKEN   = qs.get("token") || "";
  const UID     = qs.get("uid")   || "";
  const FROM_PACK = qs.get("fromPackReveal") === "true";
  const USE_MOCK  = qs.get("useMockDeckData") === "true";

  // Allow overriding API and image bases via query params
  const API_BASE = (qs.get("api") || "").replace(/\/+$/, "");     // e.g. https://your-bot.app
  const IMG_BASE = (qs.get("imgbase") || "images/cards").replace(/\/+$/, ""); // default local folder

  /* ---------------- helpers ---------------- */
  function pad3(id) { return String(id).padStart(3, "0"); }
  function safe(s)  { return String(s || "").replace(/[^a-zA-Z0-9._-]/g, ""); }

  async function fetchJSON(url) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return await r.json();
    } catch (e) {
      console.warn(`[ccui] fetch failed ${url}: ${e?.message}`);
      return null;
    }
  }

  async function loadMaster() {
    // Prefer bot master list (has `image` filenames)
    const p1 = API_BASE ? `${API_BASE}/logic/CoreMasterReference.json` : "/logic/CoreMasterReference.json";
    let master = await fetchJSON(p1);

    if (!Array.isArray(master) || !master.length) {
      // Fallback: minimal local stub if needed (will synthesize filenames)
      console.warn("[ccui] Falling back to minimal master (no remote CoreMasterReference.json)");
      master = Array.from({ length: 127 }, (_, i) => {
        const id = pad3(i + 1);
        return {
          card_id: id,
          name: `Card ${id}`,
          type: "Unknown",
          rarity: "Common",
          image: `${id}_Card_${"Unknown"}.png`
        };
      });
    }

    // Always sort by numeric card_id and skip #000 (back)
    master.sort((a, b) => parseInt(a.card_id) - parseInt(b.card_id));
    master = master.filter(c => String(c.card_id) !== "000");
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
    // Preferred: token routes (you’ll add these to the bot)
    if (TOKEN) {
      // 1) /me/:token/collection
      let d = await fetchJSON(`${API_BASE}/me/${encodeURIComponent(TOKEN)}/collection`);
      if (d) return { map: toOwnershipMap(d), src: "token" };

      // 2) /collection?token=... (fallback if you choose that shape)
      d = await fetchJSON(`${API_BASE}/collection?token=${encodeURIComponent(TOKEN)}`);
      if (d) return { map: toOwnershipMap(d), src: "token-query" };
    }

    // Secondary: uid routes that already exist in your repo
    if (UID) {
      let d = await fetchJSON(`${API_BASE}/collection?userId=${encodeURIComponent(UID)}`);
      if (d) return { map: toOwnershipMap(d), src: "uid" };
    }

    // Mock fallback
    if (USE_MOCK) {
      const d = await fetchJSON("data/mock_deckData.json");
      return { map: toOwnershipMap(d), src: "mock" };
    }

    console.warn("[ccui] No token/uid/mocks provided — rendering as unowned.");
    return { map: {}, src: "empty" };
  }

  async function loadStats() {
    if (TOKEN) {
      let s = await fetchJSON(`${API_BASE}/me/${encodeURIComponent(TOKEN)}/stats`);
      if (s) return s;
      s = await fetchJSON(`${API_BASE}/userStatsToken?token=${encodeURIComponent(TOKEN)}`);
      if (s) return s;
    }
    if (UID) {
      const s = await fetchJSON(`${API_BASE}/userStats/${encodeURIComponent(UID)}`);
      if (s) return s;
    }
    return { coins: 0, wins: 0, losses: 0, discordName: "" };
  }

  function imageURL(card) {
    // Prefer master-provided filename; otherwise synthesize
    const file = card.image
      ? safe(card.image)
      : `${pad3(card.card_id)}_${safe(card.name)}_${safe(card.type)}.png`;
    return `${IMG_BASE}/${file}`;
  }

  /* ---------------- UI helpers you already had ---------------- */
  const tradeQueue = [];
  const sellQueue  = [];

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

  function updateBottomBar() {
    const container = document.getElementById("bottom-trade-list");
    const bar = document.getElementById("trade-bottom-bar");
    if (!container || !bar) return;

    container.innerHTML = "";
    tradeQueue.forEach((entry, index) => {
      const div = document.createElement("div");
      div.classList.add("trade-card-entry");

      const thumb = document.createElement("img");
      thumb.src = `${IMG_BASE}/${safe(entry.filename || "000_CardBack_Unique.png")}`;
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
      submitBtn.addEventListener("click", () => {
        if (!tradeQueue.length) return showToast("⚠️ Trade queue is empty.");
        showToast("📦 Trade submitted (mock).");
      });
      bar.appendChild(submitBtn);
    }

    bar.classList.toggle("limit-reached", tradeQueue.length >= 30);
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
      thumb.src = `${IMG_BASE}/${safe(entry.filename || "000_CardBack_Unique.png")}`;
      thumb.alt = `#${entry.id}`;
      thumb.classList.add("thumb");
      thumb.title = `Card #${entry.id} (${entry.rarity || "Unknown"})`;

      const removeBtn = document.createElement("button");
      removeBtn.innerHTML = "🗑";
      removeBtn.title = "Remove from sell list";
      removeBtn.addEventListener("click", () => {
        sellQueue.splice(index, 1);
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
      submitBtn.addEventListener("click", () => {
        if (!sellQueue.length) return showToast("⚠️ Sell list is empty.");
        showToast("💰 Sell submitted (mock). Limit 5 per 24h enforced in backend.");
      });
      bar.appendChild(submitBtn);
    }

    bar.classList.toggle("limit-reached", sellQueue.length >= 5);
  }

  /* ---------------- Load data ---------------- */
  const [master, { map: ownedMap }, stats] = await Promise.all([
    loadMaster(),
    loadCollection(),
    loadStats()
  ]);

  /* ---------------- Build grid ---------------- */
  const grid = document.getElementById("card-grid");
  if (!grid) {
    console.error("[ccui] Missing #card-grid container in HTML");
    return;
  }
  grid.innerHTML = "";

  let totalOwnedCopies = 0;
  let ownedUniqueCount = 0;

  for (const card of master) {
    const id = pad3(card.card_id);
    const qty = Number(ownedMap[id] || 0);
    if (qty > 0) ownedUniqueCount += 1;
    totalOwnedCopies += qty;

    const cardContainer = document.createElement("div");
    cardContainer.className = `card-container ${safe((card.rarity || "Common").toLowerCase())}-border`;
    cardContainer.dataset.rarity = card.rarity || "Common";
    cardContainer.dataset.owned = String(qty);

    const img = document.createElement("img");
    img.alt = card.name || `#${id}`;
    img.className = qty > 0 ? "card-img" : "facedown-card";
    img.src = qty > 0 ? imageURL(card) : `${IMG_BASE}/000_WinterlandDeathDeck_Back.png`;

    const num = document.createElement("p");
    num.textContent = `#${id}`;

    const actions = document.createElement("div");
    actions.className = "card-actions-vertical";

    const tradeBtn = document.createElement("button");
    tradeBtn.className = "trade";
    tradeBtn.textContent = "[TRADE]";
    tradeBtn.addEventListener("click", () => {
      if (qty <= 0) return showToast("❌ You do not own this card.");
      if (tradeQueue.length >= 30) return showToast("⚠️ Trade queue is full (30).");
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
      if (sellQueue.length >= 5) {
        showToast("⚠️ You can only sell up to 5 cards every 24 hours.");
        return;
      }
      sellQueue.push({ id, filename: card.image, rarity: card.rarity });
      updateSellBar();
      showToast(`🪙 Card #${id} added to sell list.`);
    });

    actions.append(tradeBtn, ownedSpan, sellBtn);
    cardContainer.append(img, num, actions);
    grid.appendChild(cardContainer);
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
});
