document.addEventListener("DOMContentLoaded", async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const fromPack = urlParams.get('fromPackReveal') === 'true';
  const useMockDeckData = urlParams.get('useMockDeckData') === 'true';

  const tradeQueue = [];
  const sellQueue = [];

  function showToast(message) {
    const existing = document.getElementById("mock-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "mock-toast";
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.85);
      color: #00ffcc;
      padding: 10px 20px;
      font-size: 1rem;
      border: 2px solid #00ffff;
      border-radius: 8px;
      z-index: 9999;
      opacity: 0;
      transition: opacity 0.4s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = 1 }, 100);
    setTimeout(() => {
      toast.style.opacity = 0;
      setTimeout(() => toast.remove(), 800);
    }, 2000);
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
      thumb.src = `/Card-Collection-UI/images/cards/${entry.filename || '000_CardBack_Unique.png'}`;
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
      bar.appendChild(submitBtn);
    }

    submitBtn.onclick = () => {
      if (tradeQueue.length === 0) return;
      submitBtn.classList.add("submit-flash");
      setTimeout(() => {
        showToast("Trade submitted! Stand by for player's response!");
        tradeQueue.length = 0;
        updateBottomBar();
      }, 1200);
    };

    bar?.classList.toggle("limit-reached", tradeQueue.length >= 3);
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
      thumb.src = `/Card-Collection-UI/images/cards/${entry.filename || '000_CardBack_Unique.png'}`;
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

    let submitBtn = document.getElementById("submit-sell-btn");
    if (!submitBtn) {
      submitBtn = document.createElement("button");
      submitBtn.id = "submit-sell-btn";
      submitBtn.className = "queue-submit-button";
      submitBtn.textContent = "[SUBMIT SELL]";
      bar.appendChild(submitBtn);
    }

    submitBtn.onclick = () => {
      if (sellQueue.length === 0) return;
      submitBtn.classList.add("submit-flash");
      setTimeout(() => {
        showToast("Sale successful!");
        sellQueue.length = 0;
        updateSellBar();
      }, 1200);
    };

    bar?.classList.toggle("limit-reached", sellQueue.length >= 5);
  }

  document.getElementById("toggle-bottom-bar")?.addEventListener("click", () => {
    document.getElementById("trade-bottom-bar")?.classList.toggle("collapsed");
  });

  document.getElementById("toggle-sell-bar")?.addEventListener("click", () => {
    document.getElementById("sell-bottom-bar")?.classList.toggle("collapsed");
  });

  const emojiByType = {
    attack: "⚔️", defense: "🛡️", loot: "🎒", tactical: "🧭",
    trap: "🧨", infected: "☣️", specialty: "✨", special: "✨"
  };

  const getTypeEmoji = (filename = "") => {
    const typePart = filename.split("_").pop().split(".")[0].toLowerCase();
    return emojiByType[typePart] || "";
  };

  const deckData = useMockDeckData ? await fetch("data/mock_deckData.json").then(r => r.json()) : [];
  const allCards = await fetch("data/card_master.json").then(r => r.json());
  allCards.sort((a, b) => parseInt(a.card_id) - parseInt(b.card_id));
  
  // Build ownership map
  const ownershipMap = {};
  let totalOwned = 0;
  
  deckData.forEach(card => {
    const baseId = card.card_id.replace(/-DUP\d*$/, '');
    if (!ownershipMap[baseId]) {
      ownershipMap[baseId] = { count: 0, card: card };
    }
    ownershipMap[baseId].count++;
    totalOwned++;
  });
  
  const grid = document.getElementById("cards-container");
  if (grid) grid.innerHTML = "";
  
  allCards.forEach(card => {
    const id = card.card_id;
    const owned = ownershipMap[id];
    const ownedCount = owned?.count || 0;
  
    const filename = ownedCount > 0 ? card.image : "000_CardBack_Unique.png";
  
    const cardContainer = document.createElement("div");
    cardContainer.classList.add("card-container", `${card["Card Rarity"].toLowerCase()}-border`);
    cardContainer.dataset.rarity = card["Card Rarity"];
    cardContainer.dataset.owned = ownedCount;
    cardContainer.dataset.cardId = id;
  
    const cardImg = document.createElement("img");
    cardImg.alt = card.name;
    cardImg.loading = "lazy";
    cardImg.src = `/Card-Collection-UI/images/cards/${filename}`;
    cardImg.classList.add('facedown-card');
  
    const cardNumber = document.createElement('p');
    cardNumber.textContent = `#${id}`;
  
    const ownedCountSpan = document.createElement('span');
    ownedCountSpan.classList.add('owned-count');
    ownedCountSpan.textContent = `Owned: ${ownedCount}`;
  
    const actionsDiv = document.createElement('div');
    actionsDiv.classList.add('card-actions-vertical');
  
    const tradeButton = document.createElement('button');
    tradeButton.classList.add('trade');
    tradeButton.textContent = '[TRADE]';
    tradeButton.disabled = ownedCount === 0;
    if (ownedCount === 0) tradeButton.title = "You don’t own this card";
  
    tradeButton.addEventListener('click', () => {
      if (ownedCount <= 0) return showToast("❌ You do not own this card.");
      const tradeBar = document.getElementById("trade-bottom-bar");
      tradeBar?.classList.remove("collapsed");
  
      if (tradeQueue.length >= 3) {
        showToast("⚠️ You can only trade up to 3 cards.");
        tradeBar?.classList.add("limit-reached");
        return;
      }
  
      const qty = prompt(`Enter quantity to trade (1–${Math.min(3, ownedCount)}):`, "1");
      const quantity = parseInt(qty);
      if (isNaN(quantity) || quantity < 1 || quantity > Math.min(3, ownedCount)) {
        showToast(`❌ Invalid quantity. Must be between 1 and ${Math.min(3, ownedCount)}.`);
        return;
      }
  
      const availableSpots = 3 - tradeQueue.length;
      const toAdd = Math.min(quantity, availableSpots);
      if (toAdd < quantity) showToast(`⚠️ Only ${toAdd} trade slot(s) remaining.`);
  
      for (let i = 0; i < toAdd; i++) {
        tradeQueue.push({ id, filename, rarity: card["Card Rarity"] });
      }
  
      showToast(`✅ Card #${id} x${toAdd} added to trade queue.`);
      tradeButton.classList.add("queued");
      updateBottomBar();
    });
  
    const sellButton = document.createElement("button");
    sellButton.classList.add("sell");
    sellButton.textContent = "[SELL]";
    sellButton.disabled = ownedCount === 0;
    if (ownedCount === 0) sellButton.title = "You don’t own this card";
  
    sellButton.addEventListener("click", () => {
      if (ownedCount <= 0) return showToast("❌ You do not own this card.");
      const sellBar = document.getElementById("sell-bottom-bar");
      sellBar?.classList.remove("collapsed");
  
      if (sellQueue.length >= 5) {
        showToast("⚠️ You can only sell up to 5 cards every 24 hours.");
        sellBar?.classList.add("limit-reached");
        return;
      }
  
      sellQueue.push({ id, filename, rarity: card["Card Rarity"] });
      updateSellBar();
    });
  
    actionsDiv.append(tradeButton, ownedCountSpan, sellButton);
    cardContainer.append(cardImg, cardNumber, actionsDiv);
    grid.appendChild(cardContainer);
  });
  
  const ownedCardCount = Object.keys(ownershipMap).length;

  document.getElementById("collection-count").textContent = `Cards Collected: ${ownedCardCount} / 127`;
  document.getElementById("total-owned-count").textContent = `Total Cards Owned: ${totalOwned} / 250`;
  document.getElementById("coin-balance").textContent = "13";
  
  if (totalOwned >= 247) {
    const warning = document.getElementById("ownership-warning");
    if (warning) warning.style.display = "block";
  }

updateBottomBar();
updateSellBar();
});
