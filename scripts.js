
// Correct emoji assignment map
const emojiMap = {
  "Attack": "⚔️",
  "Defense": "🛡️",
  "Loot": "🎒",
  "Tactical": "🧭",
  "Trap": "🧨",
  "Infected": "☣️",
  "Special": "✨",
  "Unique": "🔒"
};

// Scan all text inside each card and assign emoji properly
document.addEventListener('DOMContentLoaded', () => {
  const cards = document.querySelectorAll('.card-container');
  cards.forEach(card => {
    const text = card.innerText || '';
    for (const type in emojiMap) {
      if (text.includes(type)) {
        const emojiDiv = document.createElement('div');
        emojiDiv.className = 'card-type-emoji';
        emojiDiv.textContent = emojiMap[type];
        card.appendChild(emojiDiv);
        break;
      }
    }
  });
});
