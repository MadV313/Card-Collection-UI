document.addEventListener("DOMContentLoaded", async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const fromPack = urlParams.get('fromPackReveal') === 'true';
  const tradeQueue = [];

  function updateBottomBar() {
    const container = document.getElementById("bottom-trade-list");
    if (!container) return;

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
      });

      div.appendChild(thumb);
      div.appendChild(removeBtn);
      container.appendChild(div);
    });
  }

  // Toggle bar logic
  if (!document.getElementById("toggle-bottom-bar")) {
    const toggle = document.createElement("button");
    toggle.id = "toggle-bottom-bar";
    toggle.textContent = "⬆️ Toggle Queue Bar";
    toggle.addEventListener("click", () => {
      const bar = document.getElementById("trade-bottom-bar");
      bar.classList.toggle("collapsed");
    });
    document.body.appendChild(toggle);
  }

  async function getRecentUnlocks() {
    const recentRaw = localStorage.getItem("recentUnlocks");
    if (recentRaw) return JSON.parse(recentRaw);

    try {
      const res = await fetch("/packReveal");
      if (!res.ok) throw new Error();
      const data = await res.json();
      return data;
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
      if (tradeQueue.length >= 3) {
        alert("⚠️ You can only trade up to 3 cards.");
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

      if (tradeQueue.length === 3) {
        alert("🎯 You have selected 3 cards for trade. No more can be added.");
      }
    });

    const sellButton = document.createElement('button');
    sellButton.classList.add('sell');
    sellButton.textContent = '[SELL]';

    const ownedCountSpan = document.createElement('span');
    ownedCountSpan.classList.add('owned-count');
    ownedCountSpan.textContent = `Owned: ${ownedCount}`;

    actionsDiv.append(tradeButton, ownedCountSpan, sellButton);
    cardContainer.append(cardImg, cardInfoDiv, actionsDiv);
    document.getElementById('cards-container').appendChild(cardContainer);
  });

  // Inject bottom bar
  if (!document.getElementById("trade-bottom-bar")) {
    const bar = document.createElement("div");
    bar.id = "trade-bottom-bar";
    bar.innerHTML = `
      <strong>🧳 Trade Queue:</strong>
      <div id="bottom-trade-list"></div>
    `;
    document.body.appendChild(bar);
  }

  const maxCollection = 250;
  const collectionCount = document.getElementById("collection-count");
  if (collectionCount) {
    collectionCount.textContent = `Cards Collected: ${cards.length} / 127`;
  }

  const totalOwnedCount = document.getElementById("total-owned-count");
  if (totalOwnedCount) {
    totalOwnedCount.textContent = `Total Cards Owned: ${totalOwned} / ${maxCollection}`;
  }

  const warningBanner = document.getElementById("ownership-warning");
  if (warningBanner) {
    warningBanner.style.display = totalOwned >= 247 ? "block" : "none";
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
});
