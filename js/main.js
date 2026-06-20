// main.js — bootstrap
import { newGame, load, save, clearSave } from './state.js';
import { bindUI, render } from './ui.js';

let S = null;

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
  start(newGame(name));
  hideStartScreen();
};

function hideStartScreen() {
  const ss = document.querySelector('#startScreen');
  if (ss) ss.style.display = 'none';
  document.querySelector('#game').style.display = '';
}

function showStartScreen(hasSave) {
  const ss = document.querySelector('#startScreen');
  ss.style.display = '';
  document.querySelector('#game').style.display = 'none';
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
