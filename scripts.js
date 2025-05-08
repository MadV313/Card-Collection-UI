document.addEventListener("DOMContentLoaded", () => {
  // Debug overlay
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
    setTimeout(() => debugBox.remove(), 6000);
  };

  const urlParams = new URLSearchParams(window.location.search);
  const fromPack = urlParams.get('fromPackReveal') === 'true';
  const recentRaw = localStorage.getItem("recentUnlocks");
  const recentUnlocks = recentRaw ? JSON.parse(recentRaw) : null;

  if (!fromPack) {
    log("fromPackReveal=false");
  } else if (!recentUnlocks || !recentUnlocks.length) {
    log("No recentUnlocks.");
  } else {
    log("Triggering highlight...");
  }

  // === CARD RENDERING ===
  cards.forEach(card => {
    const rawId = card.cardId || card.card_id || '';
    const cleanId = rawId.replace(/^#/, '');
    const cardContainer = document.createElement('div');
    cardContainer.classList.add('card-container', `${card.rarity.toLowerCase()}-border`);
    cardContainer.setAttribute('data-card-id', cleanId);

    const cardImg = document.createElement('img');
    cardImg.classList.add('facedown-card');
    cardImg.src = 'images/cards/000_CardBack_Unique.png';
    cardImg.alt = card.name;

    if (card.owned > 0) {
      cardImg.src = `images/cards/${card.imageFileName}`;
    }

    const cardNumberSpan = document.createElement('span');
    cardNumberSpan.classList.add('card-number');
    cardNumberSpan.textContent = `#${card.number}`;

    const cardNameSpan = document.createElement('span');
    cardNameSpan.classList.add('card-name');
    const emojiSpan = document.createElement('span');
    emojiSpan.classList.add('emoji');

    if (card.owned > 0) {
      cardNameSpan.textContent = `#${card.number} ${card.name}`;
      emojiSpan.textContent = emojiMap[card.number];
    } else {
      cardNameSpan.textContent = `#${card.number}`;
      emojiSpan.textContent = "🔒";
    }

    const cardInfoDiv = document.createElement('div');
    cardInfoDiv.classList.add('card-info');
    cardInfoDiv.append(cardNumberSpan, cardNameSpan, emojiSpan);

    const actionsDiv = document.createElement('div');
    actionsDiv.classList.add('card-actions-vertical');

    const scrapButton = document.createElement('button');
    scrapButton.classList.add('scrap');
    scrapButton.textContent = '[SCRAP]';
    const sellButton = document.createElement('button');
    sellButton.classList.add('sell');
    sellButton.textContent = '[SELL]';
    const ownedCount = document.createElement('span');
    ownedCount.classList.add('owned-count');
    ownedCount.textContent = `Owned: ${card.owned}`;

    actionsDiv.append(scrapButton, ownedCount, sellButton);

    cardContainer.append(cardImg, cardInfoDiv, actionsDiv);
    document.getElementById('cards-container').appendChild(cardContainer);
  });

  // === NEW CARD HIGHLIGHT ===
  if (fromPack && recentUnlocks?.length) {
    const banner = document.createElement("div");
    banner.id = "new-unlocked-banner";
    banner.innerText = "New Cards Unlocked!";
    document.body.appendChild(banner);

    recentUnlocks.forEach(card => {
      const id = (card.cardId || card.card_id || '').replace(/^#/, '');
      const el = document.querySelector(`[data-card-id="${id}"]`);
      if (el) {
        el.classList.add("highlight-glow");
        const img = el.querySelector('img');
        if (img && img.src.includes('000_CardBack_Unique.png')) {
          img.src = `images/cards/${card.filename}`;
          img.classList.add("flip-in");
        }
      }
    });

    setTimeout(() => {
      document.getElementById("new-unlocked-banner")?.remove();
      localStorage.removeItem("recentUnlocks");
    }, 4000);
  }
});
