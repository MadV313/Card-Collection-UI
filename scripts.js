document.addEventListener("DOMContentLoaded", async () => {
  const debugBox = document.createElement('div');
  debugBox.style.position = 'fixed';
  debugBox.style.bottom = '10px';
  debugBox.style.right = '10px';
  debugBox.style.padding = '8px 12px';
  debugBox.style.background = 'rgba(0,0,0,0.85)';
  debugBox.style.color = '#00ff99';
  debugBox.style.fontSize = '12px';
  debugBox.style.zIndex = '9999';
  debugBox.style.borderRadius = '6px';
  debugBox.style.maxWidth = '220px';
  debugBox.style.fontFamily = 'monospace';
  debugBox.innerText = 'Debug: loading...';
  document.body.appendChild(debugBox);

  const log = (msg) => {
    debugBox.innerText = `Debug: ${msg}`;
    setTimeout(() => debugBox.remove(), 5000);
  };

  const urlParams = new URLSearchParams(window.location.search);
  const fromPack = urlParams.get('fromPackReveal') === 'true';

  async function getRecentUnlocks() {
    const recentRaw = localStorage.getItem("recentUnlocks");
    if (recentRaw) return JSON.parse(recentRaw);

    // Attempt backend fetch
    try {
      const res = await fetch("/packReveal");
      if (!res.ok) throw new Error();
      const data = await res.json();
      log("Loaded from backend.");
      return data;
    } catch {
      // Fallback to mock file
      try {
        const mock = await fetch("data/mock_pack_reveal.json");
        const mockData = await mock.json();
        log("Loaded from mock fallback.");
        return mockData;
      } catch {
        log("Failed to load cards.");
        return [];
      }
    }
  }

  const recentUnlocks = fromPack ? await getRecentUnlocks() : [];

  if (!fromPack) {
    log("fromPackReveal=false");
  } else if (!recentUnlocks.length) {
    log("No recentUnlocks.");
  } else {
    log("Triggering highlight...");
  }

  const emojiByType = {
    attack: "⚔️",
    defense: "🛡️",
    loot: "🎒",
    tactical: "🧭",
    trap: "🧨",
    infected: "☣️",
    specialty: "✨",
    special: "✨"
  };

  const getTypeEmoji = (filename = "") => {
    const typePart = filename.split("_").pop().split(".")[0].toLowerCase();
    return emojiByType[typePart] || "";
  };

  const cards = recentUnlocks;

  cards.forEach(card => {
    const rawId = card.cardId || card.card_id || '';
    const cleanId = rawId.replace(/^#/, '');
    const ownedCount = card.owned ?? (card.isNew ? 1 : 0);
    const isNewUnlock = !!card.isNew;

    const filename = card.filename || card.imageFileName || "000_CardBack_Unique.png";

    const cardContainer = document.createElement('div');
    cardContainer.classList.add('card-container', `${card.rarity.toLowerCase()}-border`);
    cardContainer.setAttribute('data-rarity', card.rarity);
    cardContainer.setAttribute('data-owned', ownedCount);
    cardContainer.setAttribute('data-card-id', cleanId);

    const cardImg = document.createElement('img');
    cardImg.alt = card.name;
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
    cardInfoDiv.appendChild(cardNumberSpan);
    cardInfoDiv.appendChild(cardNameSpan);
    cardInfoDiv.appendChild(emojiSpan);

    const actionsDiv = document.createElement('div');
    actionsDiv.classList.add('card-actions-vertical');

    const scrapButton = document.createElement('button');
    scrapButton.classList.add('scrap');
    scrapButton.textContent = '[SCRAP]';

    const sellButton = document.createElement('button');
    sellButton.classList.add('sell');
    sellButton.textContent = '[SELL]';

    const ownedCountSpan = document.createElement('span');
    ownedCountSpan.classList.add('owned-count');
    ownedCountSpan.textContent = `Owned: ${ownedCount}`;

    actionsDiv.appendChild(scrapButton);
    actionsDiv.appendChild(ownedCountSpan);
    actionsDiv.appendChild(sellButton);

    cardContainer.appendChild(cardImg);
    cardContainer.appendChild(cardInfoDiv);
    cardContainer.appendChild(actionsDiv);

    document.getElementById('cards-container').appendChild(cardContainer);
  });

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
});
