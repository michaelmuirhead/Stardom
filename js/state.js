// state.js — game state creation, persistence
import { START, DIFFICULTIES, GENRE_KEYS, fullName, makeRole, makeRival } from './data.js';

const SAVE_KEY = 'stardom.save.v1';

export function newGame(playerName, difficultyKey) {
  const diff = DIFFICULTIES[difficultyKey] || DIFFICULTIES.normal;
  const s = {
    name: playerName || fullName(),
    difficulty: diff.key,
    week: 1,
    year: 1,
    ...structuredCloneSafe(START),
    health: 100,         // wellness; affects energy regen & audition odds
    hasAgent: false,
    energyPenalty: 0,

    offers: [],          // available audition roles
    active: null,        // acting role in production: {role, weeksLeft, costars}
    activeSeries: null,  // ongoing TV series (renewal/cancellation arc)
    scripts: [],         // written scripts available to produce/shop
    writingCredits: [],  // sold screenplays (Oscar-eligible, not on-screen credits)
    productions: [],      // self-produced projects in progress
    filmography: [],     // completed credits {title, category, year, role}
    awards: [],          // {name, year, project}

    genres: Object.fromEntries(GENRE_KEYS.map((k) => [k, 0])), // affinity XP
    contacts: [],        // co-stars & industry relationships
    partner: null,       // current romantic partner (contact id)
    rivals: [makeRival(START.fame), makeRival(START.fame)], // career-long peers
    pendingChoice: null, // an unresolved narrative dilemma

    careerPrestige: 0,   // cumulative prestige across your whole career
    assets: [],          // owned lifestyle assets (keys)
    royalties: [],       // decaying residual income from past hits
    yearIncome: 0,       // gross income this year (for taxes)
    taxWithheld: 0,      // tax withheld so far this year
    milestonesDone: {},  // milestone key -> year completed
    stats: { auditions: 0, landed: 0, classes: 0, seasons: 0, wins: 0, noms: 0, written: 0, extra: 0 },
    gameOver: false,
    log: [],
  };
  s.money = diff.startMoney;
  refreshOffers(s);
  pushLog(s, `🎬 ${s.name} arrives in town with $${s.money} and a dream. (${diff.name} mode)`);
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
  s.offers = Array.from({ length: count }, () => makeRole(s.fame, !s.hasAgent));
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
