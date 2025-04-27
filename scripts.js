// Assuming you have a list of all cards with their numbers, names, rarities, etc.

cards.forEach(card => {
    const cardContainer = document.createElement('div');
    cardContainer.classList.add('card-container', `${card.rarity.toLowerCase()}-border`);
    cardContainer.setAttribute('data-rarity', card.rarity);
    cardContainer.setAttribute('data-owned', card.owned);

    const cardImg = document.createElement('img');
    cardImg.classList.add('facedown-card');
    cardImg.src = 'images/cards/000_CardBack_Unique.png'; // All cards start facedown
    cardImg.alt = card.name;

    const cardNumberSpan = document.createElement('span');
    cardNumberSpan.classList.add('card-number');
    cardNumberSpan.textContent = `#${card.number}`;

    const cardNameSpan = document.createElement('span');
    cardNameSpan.classList.add('card-name');

    const emojiSpan = document.createElement('span');
    emojiSpan.classList.add('emoji');

    // Set name and emoji based on ownership
    if (card.owned === 0) {
        cardNameSpan.textContent = `#${card.number}`;
        emojiSpan.textContent = "🔒";
    } else {
        cardNameSpan.textContent = `#${card.number} ${card.name}`;
        emojiSpan.textContent = emojiMap[card.number];
        cardImg.src = `images/cards/${card.imageFileName}`; // Swap in real image if owned
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
