
document.addEventListener('DOMContentLoaded', function() {
  const cards = document.querySelectorAll('.card-container');
  cards.forEach(card => {
    const rarity = card.dataset.rarity;
    const owned = parseInt(card.dataset.owned);
    card.classList.remove('common-border', 'uncommon-border', 'rare-border', 'legendary-border', 'unique-border', 'legendary-glow');
    if (rarity === 'Common') {
      card.classList.add('common-border');
    } else if (rarity === 'Uncommon') {
      card.classList.add('uncommon-border');
    } else if (rarity === 'Rare') {
      card.classList.add('rare-border');
    } else if (rarity === 'Legendary') {
      card.classList.add('legendary-border');
      if (owned > 0) {
        card.classList.add('legendary-glow');
      }
    } else if (rarity === 'Unique') {
      card.classList.add('unique-border');
    }
  });
});


// Emoji assignment based on card type
const emojiMap = {
  "Attack": "⚔️",
  "Defense": "🛡️",
  "Loot": "🎒",
  "Tactical": "🧭",
  "Trap": "🧨",
  "Infected": "☣️",
  "Special": "✨"
};

// After DOM loads, assign the emojis to each card
document.addEventListener('DOMContentLoaded', () => {
  const cards = document.querySelectorAll('.card-container');
  cards.forEach(card => {
    const textElements = card.querySelectorAll('p');
    if (textElements.length > 0) {
      const lastText = textElements[0].textContent || '';
      for (const type in emojiMap) {
        if (lastText.includes(type)) {
          const emojiDiv = document.createElement('div');
          emojiDiv.className = 'card-type-emoji';
          emojiDiv.textContent = emojiMap[type];
          card.appendChild(emojiDiv);
          break;
        }
      }
    }
  });
});
