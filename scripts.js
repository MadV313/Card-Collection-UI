
// Full card type to emoji mapping
const emojiMapByType = {
  "Attack": "⚔️",
  "Defense": "🛡️",
  "Loot": "🎒",
  "Tactical": "🧭",
  "Trap": "🧨",
  "Infected": "☣️",
  "Special": "✨",
  "Unique": "🔒"
};

// Card name to type mapping (partial example, you can expand this fully)
const cardTypeLookup = {
  "Battle Axe": "Attack",
  "Tactical Binoculars": "Tactical",
  "Military Tent": "Loot",
  "Spike Trap": "Trap",
  "Infected Brute": "Infected",
  "Agency Intel": "Special",
  "Warlord's Sigil": "Unique"
  // <-- Add your full 128 mappings here manually later!
};

document.addEventListener('DOMContentLoaded', () => {
  const cards = document.querySelectorAll('.card-container');
  cards.forEach(card => {
    const nameElements = card.querySelectorAll('p');
    if (nameElements.length > 0) {
      const cardName = nameElements[0].textContent.trim();
      const cardType = cardTypeLookup[cardName];
      if (cardType && emojiMapByType[cardType]) {
        const emojiDiv = document.createElement('div');
        emojiDiv.className = 'card-type-emoji';
        emojiDiv.textContent = emojiMapByType[cardType];
        card.appendChild(emojiDiv);
      }
    }
  });
});
