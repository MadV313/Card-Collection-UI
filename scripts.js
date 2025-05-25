document.addEventListener("DOMContentLoaded", async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const fromPack = urlParams.get('fromPackReveal') === 'true';
  const tradeQueue = [];
  const sellQueue = [];

  function updateBottomBar() {
    const container = document.getElementById("bottom-trade-list");
    const bar = document.getElementById("trade-bottom-bar");
    if (!container || !bar) return;

    container.innerHTML = "";
    tradeQueue.forEach((entry, index) => {
      const div = document.createElement("div");
      div.classList.add("trade-card-entry");

      const thumb = document.createElement("img");
      thumb.src = `images/cards/${entry.filename || '000_CardBack_Unique.png'}`;
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

    const existingSubmit = document.getElementById("submit-trade-btn");
    if (!existingSubmit) {
      const submitBtn = document.createElement("button");
      submitBtn.id = "submit-trade-btn";
      submitBtn.className = "queue-submit-button";
      submitBtn.textContent = "[SUBMIT TRADE]";
      submitBtn.addEventListener("click", () => {
        submitBtn.classList.add("submit-flash");
        setTimeout(() => submitBtn.classList.remove("submit-flash"), 800);
      });
      bar.appendChild(submitBtn);
    }

    if (tradeQueue.length >= 3) {
      bar?.classList.add("limit-reached");
    } else {
      bar?.classList.remove("limit-reached");
    }
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
      thumb.src = `images/cards/${entry.filename || '000_CardBack_Unique.png'}`;
      thumb.alt = `#${entry.id}`;
      thumb.classList.add("thumb");
      thumb.title = `Card #${entry.id} (${entry.rarity || "Unknown"})`;

      const removeBtn = document.createElement("button");
      removeBtn.innerHTML = "🗑";
      removeBtn.title = "Remove from sell queue";
      removeBtn.addEventListener("click", () => {
        sellQueue.splice(index, 1);
        updateSellBar();
        bar?.classList.remove("limit-reached");
      });

      div.appendChild(thumb);
      div.appendChild(removeBtn);
      container.appendChild(div);
    });

    const existingSubmit = document.getElementById("submit-sell-btn");
    if (!existingSubmit) {
      const submitBtn = document.createElement("button");
      submitBtn.id = "submit-sell-btn";
      submitBtn.className = "queue-submit-button";
      submitBtn.textContent = "[SUBMIT SELL]";
      submitBtn.addEventListener("click", () => {
        submitBtn.classList.add("submit-flash");
        setTimeout(() => submitBtn.classList.remove("submit-flash"), 800);
      });
      bar.appendChild(submitBtn);
    }

    if (sellQueue.length >= 5) {
      bar?.classList.add("limit-reached");
    } else {
      bar?.classList.remove("limit-reached");
    }
  }

  document.getElementById("toggle-bottom-bar")?.addEventListener("click", () => {
    const tradeBar = document.getElementById("trade-bottom-bar");
    if (tradeBar) tradeBar.classList.toggle("collapsed");
  });

  document.getElementById("toggle-sell-bar")?.addEventListener("click", () => {
    const sellBar = document.getElementById("sell-bottom-bar");
    if (sellBar) sellBar.classList.toggle("collapsed");
  });

  async function getRecentUnlocks() {
    const recentRaw = localStorage.getItem("recentUnlocks");
    if (recentRaw) return JSON.parse(recentRaw);
    try {
      const res = await fetch("/packReveal");
      if (!res.ok) throw new Error();
      return await res.json();
    } catch {
      try {
        const mock = await fetch("data/mock_pack_reveal.json");
        return await mock.json();
      } catch {
        return [];
      }
    }
  }

  const recentUnlocks = fromPack ? await getRecentUnlocks() : [];

  const emojiByType = {
    attack: "⚔️", defense: "🛡️", loot: "🎒", tactical: "🧭",
    trap: "🧨", infected: "☣️", specialty: "✨", special: "✨"
  };

  const getTypeEmoji = (filename = "") => {
    const typePart = filename.split("_").pop().split(".")[0].toLowerCase();
    return emojiByType[typePart] || "";
  };

  const cards = recentUnlocks;
  let totalOwned = 0;

  cards.forEach(card => {
    const rawId = card.cardId || card.card_id || '';
    const cleanId = rawId.replace(/^#/, '');
    const ownedCount = card.owned ?? (card.isNew ? 1 : 0);
    const isNewUnlock = !!card.isNew;
    if (ownedCount > 0) totalOwned += ownedCount;

    const filename = card.filename || card.imageFileName || "000_CardBack_Unique.png";

    const cardContainer = document.createElement('div');
    cardContainer.classList.add('card-container', `${card.rarity.toLowerCase()}-border`);
    cardContainer.dataset.rarity = card.rarity;
    cardContainer.dataset.owned = ownedCount;
    cardContainer.dataset.cardId = cleanId;

    const cardImg = document.createElement('img');
    cardImg.alt = card.name;
    cardImg.loading = "lazy";
    cardImg.src = ownedCount > 0 ? `images/cards/${filename}` : 'images/cards/000_CardBack_Unique.png';
    cardImg.classList.add('facedown-card');
    if (isNewUnlock) cardImg.classList.add('shimmer');

    const cardNumberSpan = document.createElement('span');
    cardNumberSpan.classList.add('card-number');
    cardNumberSpan.textContent = `#${card.number}`;

    const cardNameSpan = document.createElement('span');
    cardNameSpan.classList.add('card-name');
    cardNameSpan.textContent = ownedCount > 0 ? `#${card.number} ${card.name}` : `#${card.number}`;

    const emojiSpan = document.createElement('span');
    emojiSpan.classList.add('emoji');
    emojiSpan.textContent = ownedCount > 0 ? getTypeEmoji(filename) : "🔒";

    const cardInfoDiv = document.createElement('div');
    cardInfoDiv.classList.add('card-info');
    cardInfoDiv.append(cardNumberSpan, cardNameSpan, emojiSpan);

    const actionsDiv = document.createElement('div');
    actionsDiv.classList.add('card-actions-vertical');

    const tradeButton = document.createElement('button');
    tradeButton.classList.add('trade');
    tradeButton.textContent = '[TRADE]';
    tradeButton.addEventListener('click', () => {
      const tradeBar = document.getElementById("trade-bottom-bar");
      tradeBar?.classList.remove("collapsed");

      if (tradeQueue.length >= 3) {
        alert("⚠️ You can only trade up to 3 cards.");
        tradeBar?.classList.add("limit-reached");
        return;
      }

      const qty = prompt("Enter quantity to trade (1–3):", "1");
      const quantity = parseInt(qty);
      if (isNaN(quantity) || quantity < 1 || quantity > 3) {
        alert("❌ Invalid quantity. Must be between 1 and 3.");
        return;
      }

      const availableSpots = 3 - tradeQueue.length;
      const toAdd = Math.min(quantity, availableSpots);
      if (toAdd < quantity) alert(`⚠️ Only ${toAdd} trade slot(s) remaining.`);

      for (let i = 0; i < toAdd; i++) {
        tradeQueue.push({ id: cleanId, filename, rarity: card.rarity });
      }

      alert(`✅ Card #${cleanId} x${toAdd} added to trade queue.`);
      tradeButton.classList.add("queued");
      updateBottomBar();
    });

    const sellButton = document.createElement('button');
    sellButton.classList.add('sell');
    sellButton.textContent = '[SELL]';
    sellButton.addEventListener('click', () => {
      const sellBar = document.getElementById("sell-bottom-bar");
      sellBar?.classList.remove("collapsed");

      if (sellQueue.length >= 5) {
        alert("⚠️ You can only sell up to 5 cards every 24 hours.");
        sellBar?.classList.add("limit-reached");
        return;
      }

      sellQueue.push({ id: cleanId, filename, rarity: card.rarity });
      updateSellBar();
    });

    const ownedCountSpan = document.createElement('span');
    ownedCountSpan.classList.add('owned-count');
    ownedCountSpan.textContent = `Owned: ${ownedCount}`;

    actionsDiv.append(tradeButton, ownedCountSpan, sellButton);
    cardContainer.append(cardImg, cardInfoDiv, actionsDiv);
    document.getElementById('cards-container').appendChild(cardContainer);
  });

  const maxCollection = 250;
  document.getElementById("collection-count").textContent = `Cards Collected: ${cards.length} / 127`;
  document.getElementById("total-owned-count").textContent = `Total Cards Owned: ${totalOwned} / ${maxCollection}`;
  document.getElementById("coin-balance").textContent = "13";

  if (totalOwned >= 247) {
    document.getElementById("ownership-warning").style.display = "block";
  }

  if (fromPack && recentUnlocks.length) {
    const banner = document.createElement("div");
    banner.id = "new-unlocked-banner";
    banner.innerText = "New Cards Unlocked!";
    document.body.appendChild(banner);

    recentUnlocks.forEach(card => {
      if (!card.isNew) return;
      const rawId = card.cardId || card.card_id || '';
      const id = rawId.replace(/^#/, '');
      const match = document.querySelector(`[data-card-id="${id}"]`);
      if (match) match.classList.add("highlight-glow");
    });

    setTimeout(() => {
      document.getElementById("new-unlocked-banner")?.remove();
      document.querySelectorAll(".highlight-glow").forEach(el => el.classList.remove("highlight-glow"));
      localStorage.removeItem("recentUnlocks");
    }, 3000);
  }

  updateBottomBar();
  updateSellBar();
});
