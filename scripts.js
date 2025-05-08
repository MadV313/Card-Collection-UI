document.addEventListener("DOMContentLoaded", () => {
  // === CARD RENDERING ===
  cards.forEach(card => {
    const cardContainer = document.createElement('div');
    cardContainer.classList.add('card-container', `${card.rarity.toLowerCase()}-border`);
    cardContainer.setAttribute('data-rarity', card.rarity);
    cardContainer.setAttribute('data-owned', card.owned);
    cardContainer.setAttribute('data-card-id', card.cardId || card.card_id); // Fallback

    const cardImg = document.createElement('img');
    cardImg.classList.add('facedown-card');
    cardImg.src = 'images/cards/000_CardBack_Unique.png';
    cardImg.alt = card.name;

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
      cardImg.src = `images/cards/${card.imageFileName}`;
    } else {
      cardNameSpan.textContent = `#${card.number}`;
      emojiSpan.textContent = "🔒";
    }

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
    ownedCountSpan.textContent = `Owned: ${card.owned}`;

    actionsDiv.appendChild(scrapButton);
    actionsDiv.appendChild(ownedCountSpan);
    actionsDiv.appendChild(sellButton);

    cardContainer.appendChild(cardImg);
    cardContainer.appendChild(cardInfoDiv);
    cardContainer.appendChild(actionsDiv);

    document.getElementById('cards-container').appendChild(cardContainer);
  });

  // === MOCK UNLOCK HIGHLIGHT + TEMPORARY IMAGE REVEAL ===
  const recentUnlocks = JSON.parse(localStorage.getItem("recentUnlocks"));
  if (!recentUnlocks || !recentUnlocks.length) return;

  const banner = document.createElement("div");
  banner.id = "new-unlocked-banner";
  banner.innerText = "New Cards Unlocked!";
  document.body.appendChild(banner);

  recentUnlocks.forEach(card => {
    const id = card.cardId || card.card_id;
    const match = document.querySelector(`[data-card-id="${id}"]`);
    if (match) {
      match.classList.add("highlight-glow");
      const img = match.querySelector("img");
      if (img && img.src.includes("000_CardBack_Unique.png")) {
        const filename = card.filename || card.imageFileName;
        img.src = `images/cards/${filename}`;
        img.classList.add("temporary-reveal");
      }
    }
  });

  setTimeout(() => {
    document.getElementById("new-unlocked-banner")?.remove();
    document.querySelectorAll(".highlight-glow").forEach(el => el.classList.remove("highlight-glow"));
    document.querySelectorAll(".temporary-reveal").forEach(img => {
      img.src = "images/cards/000_CardBack_Unique.png";
      img.classList.remove("temporary-reveal");
    });
    localStorage.removeItem("recentUnlocks");
  }, 3000);
});
