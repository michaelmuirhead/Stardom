// data.js — static content & procedural generators for Stardom
// All numbers are tuned for a ~weekly turn loop.

export const START = {
  age: 18,
  money: 1500,
  fame: 1,
  acting: 5,
  directing: 0,
  writing: 0,
  producing: 0,
  reputation: 10,
  energy: 100,
  maxEnergy: 100,
};

export const WEEKS_PER_YEAR = 52;
export const LIVING_COST = 220;          // weekly expenses (Normal baseline)
export const AGENT_CUT = 0.12;           // agent takes a slice of role pay

// ---- Difficulty ------------------------------------------------------------
export const DIFFICULTIES = {
  easy: {
    key: 'easy', name: 'Easy', icon: '🌱',
    startMoney: 3000, living: 160, payMult: 1.25, oddsBonus: 0.08, debtFloor: -5000,
    blurb: 'Generous pay, forgiving auditions. Learn the ropes.',
  },
  normal: {
    key: 'normal', name: 'Normal', icon: '🎯',
    startMoney: 1500, living: 220, payMult: 1.0, oddsBonus: 0, debtFloor: -3000,
    blurb: 'The intended Hollywood grind.',
  },
  hard: {
    key: 'hard', name: 'Hard', icon: '🔥',
    startMoney: 700, living: 300, payMult: 0.85, oddsBonus: -0.08, debtFloor: -2000,
    blurb: 'Lean wallet, brutal odds. Only the dedicated survive.',
  },
};

// ---- Genres ----------------------------------------------------------------
export const GENRES = {
  drama: { key: 'drama', name: 'Drama', icon: '🎭', specialty: 'Dramatic Actor' },
  comedy: { key: 'comedy', name: 'Comedy', icon: '😂', specialty: 'Comedian' },
  action: { key: 'action', name: 'Action', icon: '💥', specialty: 'Action Star' },
  horror: { key: 'horror', name: 'Horror', icon: '👻', specialty: 'Scream King/Queen' },
  scifi: { key: 'scifi', name: 'Sci-Fi', icon: '🚀', specialty: 'Sci-Fi Icon' },
  romance: { key: 'romance', name: 'Romance', icon: '💖', specialty: 'Heartthrob' },
};
export const GENRE_KEYS = Object.keys(GENRES);

// ---- Project categories ---------------------------------------------------
// tier roughly = fame gate. Higher tiers pay & raise fame more, but are harder.
export const CATEGORIES = {
  commercial: {
    key: 'commercial', name: 'Commercial', icon: '📺',
    payBase: 800, fameBase: 1.5, skillBase: 1, weeks: [1, 1, 2],
    prestige: 0.2, blurb: 'Quick paycheck, little glory.',
  },
  tvmovie: {
    key: 'tvmovie', name: 'TV Movie', icon: '🎞️',
    payBase: 4000, fameBase: 4, skillBase: 3, weeks: [3, 4, 5],
    prestige: 0.6, blurb: 'A made-for-television feature.',
  },
  tvshow: {
    key: 'tvshow', name: 'TV Series', icon: '📡',
    payBase: 7000, fameBase: 6, skillBase: 4, weeks: [5, 7, 9],
    prestige: 0.9, blurb: 'Recurring exposure on the small screen.',
  },
  indie: {
    key: 'indie', name: 'Indie Film', icon: '🎥',
    payBase: 3000, fameBase: 5, skillBase: 5, weeks: [4, 6, 8],
    prestige: 1.4, blurb: 'Low pay, high prestige, festival darling.',
  },
  movie: {
    key: 'movie', name: 'Studio Film', icon: '🎬',
    payBase: 15000, fameBase: 10, skillBase: 6, weeks: [6, 9, 12],
    prestige: 1.6, blurb: 'The big leagues. Big budgets, big risk.',
  },
};

// ---- Role title flavor -----------------------------------------------------
const ADJ = ['Last', 'Silent', 'Crimson', 'Broken', 'Eternal', 'Hidden', 'Wild',
  'Golden', 'Midnight', 'Forgotten', 'Savage', 'Fading', 'Electric', 'Velvet'];
const NOUN = ['Promise', 'Horizon', 'Echo', 'Dahlia', 'Empire', 'Reckoning',
  'Affair', 'Gambit', 'Requiem', 'Paradise', 'Stranger', 'Inheritance', 'Tide'];
const COMMERCIALS = ['Sparkle Soda', 'TurboClean', 'Aurora Phones', 'Cozy Mattress',
  'GreenLeaf Tea', 'Velocity Motors', 'Sunbeam Cereal', 'PureGlow Skincare'];
const PART = ['the Lead', 'a Supporting Role', 'the Antagonist', 'the Love Interest',
  'the Comic Relief', 'a Cameo', 'the Narrator', 'an Ensemble Part'];

export const FIRST_NAMES = ['Ava', 'Liam', 'Sofia', 'Noah', 'Mia', 'Ethan', 'Isla',
  'Mason', 'Zoe', 'Leo', 'Nina', 'Theo', 'Ruby', 'Felix', 'Cleo', 'Hugo'];
export const LAST_NAMES = ['Vance', 'Cross', 'Marlowe', 'Sterling', 'Quinn', 'Frost',
  'Rivera', 'Hale', 'Beaumont', 'Cole', 'Ashford', 'Knight', 'Lang', 'Monroe'];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const rf = (a, b) => a + Math.random() * (b - a);

export function projectTitle(catKey) {
  if (catKey === 'commercial') return `${pick(COMMERCIALS)} Ad`;
  return `The ${pick(ADJ)} ${pick(NOUN)}`;
}

export function fullName() {
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
}

// Generate a single audition offer scaled to player fame.
// Roles an actor can reach without representation: smaller, lower-paid gigs.
// Studio films and series-regular TV roles only come through an agent.
export const OPEN_CALL_CATS = ['commercial', 'tvmovie', 'indie'];

export function makeRole(playerFame, openCall = false) {
  const keys = openCall ? OPEN_CALL_CATS : Object.keys(CATEGORIES);
  // Bias category selection by what the player can plausibly reach.
  const cat = CATEGORIES[pick(keys)];
  // tier 0..2 (small/medium/large within category), gated softly by fame.
  let tier = Math.min(2, Math.max(0, Math.round(rf(-0.4, 2.2) * (0.5 + playerFame / 100))));
  if (openCall) tier = Math.min(tier, 1);  // no marquee parts at open calls
  const mult = [0.7, 1.1, 1.8][tier];
  // Open-call gigs (student films, local spots, day players) pay & profile less.
  const disc = openCall ? 0.7 : 1;

  const skillReq = Math.round(cat.skillBase * 4 + tier * 9 + rf(-3, 5));
  const fameReq = Math.round(cat.fameBase * 1.2 + tier * 6 + rf(-2, 4));
  const pay = Math.round(cat.payBase * mult * rf(0.8, 1.3) * disc);
  const fameGain = +(cat.fameBase * mult * rf(0.8, 1.25) * disc).toFixed(1);
  const skillGain = +(cat.skillBase * rf(0.8, 1.4) + tier * 0.6).toFixed(1);
  const weeks = cat.weeks[tier];
  const prestige = +(cat.prestige * mult * rf(0.7, 1.2) * disc).toFixed(2);
  const genre = pick(GENRE_KEYS);

  return {
    id: 'r' + Math.random().toString(36).slice(2, 9),
    title: projectTitle(cat.key),
    category: cat.key,
    catName: cat.name,
    icon: cat.icon,
    part: pick(PART),
    openCall,
    genre,
    genreName: GENRES[genre].name,
    genreIcon: GENRES[genre].icon,
    tier,
    skillReq: Math.max(3, skillReq),
    fameReq: Math.max(0, fameReq),
    pay,
    fameGain,
    skillGain,
    weeks,
    prestige,
  };
}

// Generate a co-star scaled around the player's fame.
export function makeCostar(playerFame) {
  const fame = Math.round(clampNum(playerFame + rf(-15, 35), 1, 100));
  return {
    id: 'cs' + Math.random().toString(36).slice(2, 9),
    name: fullName(),
    fame,
    rel: 0,        // relationship 0..100
    projects: 0,
    romance: false,
  };
}

function clampNum(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ---- Classes / training ----------------------------------------------------
export const CLASSES = [
  { key: 'acting', stat: 'acting', name: 'Acting Workshop', icon: '🎭', cost: 350, energy: 25, gain: [1.5, 3], cap: 100, desc: 'Sharpen your core craft.' },
  { key: 'directing', stat: 'directing', name: 'Directing Seminar', icon: '🎬', cost: 600, energy: 30, gain: [1.2, 2.6], cap: 100, desc: 'Learn to run the set.', unlockFame: 15 },
  { key: 'writing', stat: 'writing', name: 'Screenwriting Course', icon: '✍️', cost: 450, energy: 25, gain: [1.3, 2.8], cap: 100, desc: 'Craft compelling scripts.', unlockFame: 10 },
  { key: 'producing', stat: 'producing', name: 'Producing Bootcamp', icon: '💼', cost: 800, energy: 30, gain: [1.1, 2.4], cap: 100, desc: 'Master budgets & deals.', unlockFame: 25 },
];

// ---- Random weekly events --------------------------------------------------
// Each returns a delta object + message when its `when` predicate passes.
export const EVENTS = [
  {
    id: 'viral', chance: 0.06, weight: (s) => 1,
    run: (s) => ({ msg: '📈 A clip of you went viral online! +Fame.', delta: { fame: 3 + Math.random() * 4 } }),
  },
  {
    id: 'scandal', chance: 0.05, when: (s) => s.fame > 20,
    run: (s) => ({ msg: '📰 A tabloid printed an unflattering story. -Fame, -Reputation.', delta: { fame: -(2 + Math.random() * 4), reputation: -4 } }),
  },
  {
    id: 'mentor', chance: 0.04, when: (s) => s.acting < 60,
    run: (s) => ({ msg: '🤝 A veteran actor gave you free pointers. +Acting.', delta: { acting: 2 + Math.random() * 2 } }),
  },
  {
    id: 'gift', chance: 0.04,
    run: (s) => ({ msg: '🎁 A residual cheque arrived in the mail. +Money.', delta: { money: 300 + Math.floor(Math.random() * 700) } }),
  },
  {
    id: 'burnout', chance: 0.05, when: (s) => s.energy < 35,
    run: (s) => ({ msg: '😩 Exhaustion caught up with you. -Energy next week.', delta: { energyPenalty: 15 } }),
  },
  {
    id: 'fan', chance: 0.05, when: (s) => s.fame > 35,
    run: (s) => ({ msg: '⭐ Fans recognized you on the street. +Reputation.', delta: { reputation: 3 } }),
  },
  {
    id: 'flop', chance: 0.03, when: (s) => s.fame > 50,
    run: (s) => ({ msg: '💸 An old project underperformed in re-runs. -Fame.', delta: { fame: -(1 + Math.random() * 3) } }),
  },
];

// ---- Fame tiers (titles) ---------------------------------------------------
export const FAME_TIERS = [
  { min: 0, label: 'Unknown' },
  { min: 8, label: 'Aspiring' },
  { min: 20, label: 'Working Actor' },
  { min: 35, label: 'Recognizable' },
  { min: 50, label: 'Rising Star' },
  { min: 70, label: 'Celebrity' },
  { min: 85, label: 'A-List' },
  { min: 95, label: 'Icon' },
];

export function fameTier(fame) {
  let t = FAME_TIERS[0];
  for (const x of FAME_TIERS) if (fame >= x.min) t = x;
  return t.label;
}

export const AWARD_NAME = 'Golden Star';
