
// Inject practice mode button into UI
window.addEventListener('DOMContentLoaded', () => {
    const btnRow = document.querySelector('.button-row');
    if (btnRow) {
        const practiceBtn = document.createElement('button');
        practiceBtn.textContent = 'Start Practice Mode';
        practiceBtn.onclick = startPracticeDuel;
        btnRow.appendChild(practiceBtn);
    }
});

const devDeck = JSON.parse(localStorage.getItem("devDeck")) || []; // Loaded dynamically in production

// Practice mode game state
const gameState = {
    player: {
        hp: 200,
        hand: [],
        field: [],
        deck: [...devDeck],
    },
    bot: {
        hp: 200,
        field: [],
        deck: [...devDeck],
    }
};

function startPracticeDuel() {
    alert("Practice mode started.");
    drawCard('player');
    drawCard('player');
    drawCard('bot');
}

function drawCard(target) {
    const side = gameState[target];
    if (side.hand && side.hand.length < 4 && side.deck.length > 0) {
        const card = side.deck.pop();
        side.hand = side.hand || [];
        side.hand.push(card);
        console.log(`${target} drew: ${card.name}`);
        renderCardToUI(card, target);
    }
}

function renderCardToUI(card, target) {
    const handRow = document.querySelector(`#${target === 'player' ? 'your-hand' : 'opponent-field'}`);
    const cardDiv = document.createElement('div');
    cardDiv.className = "card";
    cardDiv.style.backgroundImage = `url('${card.image_url}')`;
    cardDiv.title = card.name;
    handRow.appendChild(cardDiv);
}
