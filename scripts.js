document.addEventListener("DOMContentLoaded", () => {
  // On-screen debug box for mobile
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
  const recentRaw = localStorage.getItem("recentUnlocks");
  const recentUnlocks = recentRaw ? JSON.parse(recentRaw) : null;

  if (!fromPack) {
    log("fromPackReveal=false");
  } else if (!recentUnlocks || !recentUnlocks.length) {
    log("No recentUnlocks.");
  } else {
    log("Triggering highlight...");
  }

  const cards = recentUnlocks || [
    {
      cardId: "#001",
      number: "001",
      name: "M4-A1",
      rarity: "Rare",
      owned: 0,
      imageFileName: "001_M4A1_Attack.png"
    },
    {
      cardId: "#126",
      number: "126",
      name: "Lt. Col. Emil Borén",
      rarity: "Legendary",
      owned: 0,
      imageFileName: "126_Lt.Col.EmilBoren_Specialty.png"
    },
    {
      cardId: "#036",
      number: "036",
      name: "NBC Suit",
      rarity: "Common",
      owned: 0,
      imageFileName: "036_NBCSuit_Defense.png"
    }
  ];

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

  cards.forEach(card => {
    const rawId = card.cardId || card.card_id || '';
    const cleanId = rawId.replace(/^#/, '');
    console.log("Rendering card with ID:", cleanId);

    const cardContainer = document.createElement('div');
    cardContainer.classList.add('card-container', `${card.rarity.toLowerCase()}-border`);
    cardContainer.setAttribute('data-rarity', card.rarity);
    cardContainer.setAttribute('data-owned', card.owned);
    cardContainer.setAttribute('data-card-id', cleanId);

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
      emojiSpan.textContent = getTypeEmoji(card.imageFileName || card.filename);
      cardImg.src = `images/cards/${card.imageFileName || card.filename}`;
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

  // === UNLOCK HIGHLIGHT ===
  if (fromPack && recentUnlocks && recentUnlocks.length) {
    const banner = document.createElement("div");
    banner.id = "new-unlocked-banner";
    banner.innerText = "New Cards Unlocked!";
    document.body.appendChild(banner);

    recentUnlocks.forEach(card => {
      if (!card.isNew) return;

      const rawId = card.cardId || card.card_id || '';
      const id = rawId.replace(/^#/, '');
      console.log("Looking for card ID:", id);

      const match = document.querySelector(`[data-card-id="${id}"]`);
      if (match) {
        console.log("✓ Matched and highlighting:", id);
        match.classList.add("highlight-glow");

        const img = match.querySelector("img");
        if (img && img.src.includes("000_CardBack_Unique.png")) {
          const filename = card.filename || card.imageFileName;
          img.src = `images/cards/${filename}`;
          img.classList.add("temporary-reveal");
        }
      } else {
        console.warn("No match found for unlock ID:", id);
      }
    });

    setTimeout(() => {
      document.getElementById("new-unlocked-banner")?.remove();
      document.querySelectorAll(".highlight-glow").forEach(el => el.classList.remove("highlight-glow"));
      localStorage.removeItem("recentUnlocks");
    }, 3000);
  }
});
