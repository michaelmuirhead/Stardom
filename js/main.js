// main.js — bootstrap
import { newGame, load, save, clearSave } from './state.js';
import { DIFFICULTIES } from './data.js';
import { bindUI } from './ui.js';

let S = null;
let chosenDifficulty = 'normal';

function persist(state) {
  S = state;
  save(state);
}

function start(state) {
  S = state;
  bindUI(S, persist);
}

window.__stardomNewGame = () => {
  const nameInput = document.querySelector('#playerName');
  const name = nameInput ? nameInput.value.trim() : '';
  clearSave();
  start(newGame(name, chosenDifficulty));
  hideStartScreen();
};

function renderDifficulty() {
  const box = document.querySelector('#difficulty');
  if (!box) return;
  box.innerHTML = '';
  for (const d of Object.values(DIFFICULTIES)) {
    const b = document.createElement('button');
    b.className = 'diff-opt' + (d.key === chosenDifficulty ? ' active' : '');
    b.type = 'button';
    b.innerHTML = `<span class="diff-name">${d.icon} ${d.name}</span>
      <span class="diff-blurb">${d.blurb}</span>`;
    b.onclick = () => { chosenDifficulty = d.key; renderDifficulty(); };
    box.appendChild(b);
  }
}

function hideStartScreen() {
  const ss = document.querySelector('#startScreen');
  if (ss) ss.style.display = 'none';
  document.querySelector('#game').style.display = '';
}

function showStartScreen(hasSave) {
  const ss = document.querySelector('#startScreen');
  ss.style.display = '';
  document.querySelector('#game').style.display = 'none';
  renderDifficulty();
  const cont = document.querySelector('#continueBtn');
  if (hasSave) {
    cont.style.display = '';
    cont.onclick = () => {
      const saved = load();
      if (saved) { start(saved); hideStartScreen(); }
    };
  } else {
    cont.style.display = 'none';
  }
  document.querySelector('#newBtn').onclick = () => window.__stardomNewGame();
}

window.addEventListener('DOMContentLoaded', () => {
  const saved = load();
  showStartScreen(!!saved);
});
