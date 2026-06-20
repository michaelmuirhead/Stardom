// state.js — game state creation, persistence
import { START, fullName, makeRole } from './data.js';

const SAVE_KEY = 'stardom.save.v1';

export function newGame(playerName) {
  const s = {
    name: playerName || fullName(),
    week: 1,
    year: 1,
    ...structuredCloneSafe(START),
    hasAgent: false,
    energyPenalty: 0,

    offers: [],          // available audition roles
    active: null,        // role currently in production: {role, weeksLeft}
    scripts: [],         // written scripts available to produce/shop
    productions: [],      // self-produced projects in progress
    filmography: [],     // completed credits {title, category, year, role}
    awards: [],          // {name, year, project}

    yearPrestige: 0,     // prestige accumulated this year (for award season)
    stats: { auditions: 0, landed: 0, classes: 0 },
    gameOver: false,
    log: [],
  };
  refreshOffers(s);
  pushLog(s, `🎬 ${s.name} arrives in town with $${s.money} and a dream.`);
  return s;
}

// structuredClone exists in Node 22 / modern browsers, but guard anyway.
function structuredCloneSafe(o) {
  return typeof structuredClone === 'function'
    ? structuredClone(o)
    : JSON.parse(JSON.stringify(o));
}

export function refreshOffers(s) {
  const count = 4 + (s.hasAgent ? 2 : 0);
  s.offers = Array.from({ length: count }, () => makeRole(s.fame));
}

export function pushLog(s, msg) {
  s.log.unshift({ week: s.week, year: s.year, msg });
  if (s.log.length > 80) s.log.pop();
}

export function save(s) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    return true;
  } catch (e) {
    console.warn('save failed', e);
    return false;
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
}
