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
export const LIVING_COST = 1500;         // weekly expenses (Normal baseline)
export const AGENT_CUT = 0.12;           // legacy default (see AGENT_TIERS)

// ---- Representation: agents, publicist, manager ----------------------------
// Higher agent tiers take a bigger cut but unlock more & better auditions.
export const AGENT_TIERS = [
  { key: 'boutique', name: 'Boutique Agent', icon: '🕴️', cut: 0.10, fameReq: 18, credReq: 3, odds: 0.06, offers: 1, blurb: 'A hungry up-and-comer. Low cut, modest reach.' },
  { key: 'established', name: 'Established Agency', icon: '🏢', cut: 0.13, fameReq: 45, credReq: 8, odds: 0.10, offers: 2, blurb: 'Real clout and bigger auditions.' },
  { key: 'powerhouse', name: 'Powerhouse Agency', icon: '💎', cut: 0.16, fameReq: 70, credReq: 15, odds: 0.15, offers: 3, blurb: 'The A-list machine — top roles, top cut.' },
];
export const PUBLICIST_FEE = 6000;       // weekly retainer
export const MANAGER_CUT = 0.05;         // manager's slice (on top of the agent)

// ---- Difficulty (Hollywood-scale economy) ----------------------------------
export const DIFFICULTIES = {
  easy: {
    key: 'easy', name: 'Easy', icon: '🌱',
    startMoney: 20000, living: 1100, payMult: 1.25, oddsBonus: 0.08, debtFloor: -30000,
    blurb: 'Generous pay, forgiving auditions. Learn the ropes.',
  },
  normal: {
    key: 'normal', name: 'Normal', icon: '🎯',
    startMoney: 10000, living: 1500, payMult: 1.0, oddsBonus: 0, debtFloor: -20000,
    blurb: 'The intended Hollywood grind.',
  },
  hard: {
    key: 'hard', name: 'Hard', icon: '🔥',
    startMoney: 5000, living: 2200, payMult: 0.85, oddsBonus: -0.08, debtFloor: -12000,
    blurb: 'Lean wallet, brutal odds. Only the dedicated survive.',
  },
};

// A star's "quote": pay scales steeply with fame, so an A-lister commands far
// more than an unknown for the same role. Floors at 1x (a newcomer earns the
// baseline) and climbs to ~10x at fame 100.
export function fameQuote(fame) {
  return 1 + Math.pow(clampNum(fame, 0, 100) / 100, 1.6) * 9;
}

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
    payBase: 6000, fameBase: 1.5, skillBase: 1, weeks: [1, 1, 2],
    prestige: 0.2, blurb: 'Quick paycheck, little glory.',
  },
  theatre: {
    key: 'theatre', name: 'Theatre', icon: '🎭',
    payBase: 4000, fameBase: 3, skillBase: 7, weeks: [6, 8, 12],
    prestige: 1.3, blurb: 'Low pay, but huge for your craft & reputation.',
  },
  voice: {
    key: 'voice', name: 'Voice Acting', icon: '🎙️',
    payBase: 12000, fameBase: 1.5, skillBase: 3, weeks: [3, 4, 6],
    prestige: 0.6, blurb: 'A steady paycheck — but you\'re unseen.',
  },
  tvmovie: {
    key: 'tvmovie', name: 'TV Movie', icon: '🎞️',
    payBase: 35000, fameBase: 4, skillBase: 3, weeks: [3, 4, 5],
    prestige: 0.6, blurb: 'A made-for-television feature.',
  },
  indie: {
    key: 'indie', name: 'Indie Film', icon: '🎥',
    payBase: 22000, fameBase: 5, skillBase: 5, weeks: [4, 6, 8],
    prestige: 1.4, blurb: 'Low pay, high prestige, festival darling.',
  },
  documentary: {
    key: 'documentary', name: 'Documentary', icon: '📽️',
    payBase: 14000, fameBase: 3, skillBase: 4, weeks: [4, 6, 8],
    prestige: 1.5, blurb: 'Little money, lots of prestige.',
  },
  tvshow: {
    key: 'tvshow', name: 'TV Series', icon: '📡',
    payBase: 55000, fameBase: 6, skillBase: 4, weeks: [5, 7, 9],
    prestige: 0.9, blurb: 'Recurring exposure — and a salary that can explode.',
  },
  miniseries: {
    key: 'miniseries', name: 'Miniseries', icon: '🎬',
    payBase: 130000, fameBase: 7, skillBase: 5, weeks: [6, 8, 10],
    prestige: 1.5, blurb: 'Prestige limited series. Strong pay, awards bait.',
  },
  streamseries: {
    key: 'streamseries', name: 'Streaming Series', icon: '📱',
    payBase: 120000, fameBase: 8, skillBase: 5, weeks: [6, 8, 10],
    prestige: 1.1, blurb: 'A binge-released limited series.',
  },
  movie: {
    key: 'movie', name: 'Studio Film', icon: '🎬',
    payBase: 400000, fameBase: 10, skillBase: 6, weeks: [6, 9, 12],
    prestige: 1.6, blurb: 'The big leagues. Big budgets, big risk.',
  },
  streamfilm: {
    key: 'streamfilm', name: 'Streaming Film', icon: '🍿',
    payBase: 480000, fameBase: 9, skillBase: 6, weeks: [5, 7, 10],
    prestige: 1.4, blurb: 'A splashy streaming-platform original. Pays huge.',
  },
};

// ---- Role title flavor -----------------------------------------------------
const ADJ = ['Last', 'Silent', 'Crimson', 'Broken', 'Eternal', 'Hidden', 'Wild',
  'Golden', 'Midnight', 'Forgotten', 'Savage', 'Fading', 'Electric', 'Velvet'];
const NOUN = ['Promise', 'Horizon', 'Echo', 'Dahlia', 'Empire', 'Reckoning',
  'Affair', 'Gambit', 'Requiem', 'Paradise', 'Stranger', 'Inheritance', 'Tide'];
const COMMERCIALS = ['Sparkle Soda', 'TurboClean', 'Aurora Phones', 'Cozy Mattress',
  'GreenLeaf Tea', 'Velocity Motors', 'Sunbeam Cereal', 'PureGlow Skincare'];
// Billing tiers: you climb from bit parts to leading roles as you rise.
export const BILLING = {
  cameo: { key: 'cameo', label: 'Cameo', rank: 1, payMult: 0.45, fameMult: 0.4, prestigeMult: 0.3, fameReqAdd: 0, parts: ['a Cameo', 'a Bit Part', 'a Minor Role', 'an Extra Line'] },
  supporting: { key: 'supporting', label: 'Supporting', rank: 2, payMult: 0.9, fameMult: 0.85, prestigeMult: 0.8, fameReqAdd: 3, parts: ['a Supporting Role', 'the Best Friend', 'the Love Interest', 'the Antagonist'] },
  lead: { key: 'lead', label: 'Lead', rank: 3, payMult: 1.5, fameMult: 1.5, prestigeMult: 1.4, fameReqAdd: 10, parts: ['the Lead', 'the Protagonist', 'the Title Role'] },
};

// Decide a role's billing from the player's standing and the project's scale.
function rollBilling(playerFame, tier, openCall) {
  const score = tier * 1.0 + playerFame / 25 + rf(-0.5, 1.2);
  let key = score > 2.3 ? 'lead' : score > 1.0 ? 'supporting' : 'cameo';
  // Marquee leading roles rarely come from open calls.
  if (openCall && key === 'lead' && Math.random() < 0.7) key = 'supporting';
  return BILLING[key];
}

export const FIRST_NAMES = ['Ava', 'Liam', 'Sofia', 'Noah', 'Mia', 'Ethan', 'Isla',
  'Mason', 'Zoe', 'Leo', 'Nina', 'Theo', 'Ruby', 'Felix', 'Cleo', 'Hugo'];
export const LAST_NAMES = ['Vance', 'Cross', 'Marlowe', 'Sterling', 'Quinn', 'Frost',
  'Rivera', 'Hale', 'Beaumont', 'Cole', 'Ashford', 'Knight', 'Lang', 'Monroe'];

export const STUDIOS = ['Apex Pictures', 'Meridian Studios', 'Lumen Films', 'Vanguard Pictures',
  'Nova Entertainment', 'Atlas Films', 'Silverpeak Studios', 'Onyx Pictures', 'Crown & Co.', 'Halcyon Media'];

export const BRANDS = ['Aurora Phones', 'Velocity Motors', 'PureGlow Skincare', 'Monarch Watches',
  'Lumière Couture', 'Apex Athletics', 'Nova Cosmetics', 'Crest Airlines', 'GildedAir', 'Sparkle Soda'];

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
export const OPEN_CALL_CATS = ['commercial', 'tvmovie', 'indie', 'theatre', 'voice'];

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

  const billing = rollBilling(playerFame, tier, openCall);
  const skillReq = Math.round(cat.skillBase * 4 + tier * 9 + rf(-3, 5));
  const fameReq = Math.round(cat.fameBase * 1.2 + tier * 6 + billing.fameReqAdd + rf(-2, 4));
  const pay = Math.round(cat.payBase * mult * billing.payMult * fameQuote(playerFame) * rf(0.8, 1.3) * disc);
  const fameGain = +(cat.fameBase * mult * billing.fameMult * rf(0.8, 1.25) * disc).toFixed(1);
  const skillGain = +(cat.skillBase * rf(0.8, 1.4) + tier * 0.6).toFixed(1);
  const weeks = cat.weeks[tier];
  const prestige = +(cat.prestige * mult * billing.prestigeMult * rf(0.7, 1.2) * disc).toFixed(2);
  const genre = pick(GENRE_KEYS);

  return {
    id: 'r' + Math.random().toString(36).slice(2, 9),
    title: projectTitle(cat.key),
    category: cat.key,
    catName: cat.name,
    icon: cat.icon,
    billing: billing.key,
    part: pick(billing.parts),
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
    // Casting windows close: an offer lingers only a few weeks before it's
    // recast. Bigger projects move faster (the part is in demand).
    expires: Math.max(2, Math.round((openCall ? 5 : 4) - tier + rf(0, 2))),
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

// A named career-long rival: a peer who competes for your roles and awards.
export function makeRival(playerFame) {
  const fame = Math.round(clampNum(playerFame + rf(3, 18), 2, 100));
  return {
    id: 'rv' + Math.random().toString(36).slice(2, 9),
    name: fullName(),
    fame,
    skill: Math.round(clampNum(fame * rf(0.7, 1.1) + 8, 5, 100)),
    rivalry: Math.round(rf(10, 30)),  // 0..100 intensity
  };
}

// ---- Classes / training ----------------------------------------------------
export const CLASSES = [
  { key: 'acting', stat: 'acting', name: 'Acting Workshop', icon: '🎭', cost: 1500, energy: 25, gain: [1.5, 3], cap: 100, desc: 'Sharpen your core craft.' },
  { key: 'directing', stat: 'directing', name: 'Directing Seminar', icon: '🎬', cost: 2600, energy: 30, gain: [1.2, 2.6], cap: 100, desc: 'Learn to run the set.', unlockFame: 15 },
  { key: 'writing', stat: 'writing', name: 'Screenwriting Course', icon: '✍️', cost: 1900, energy: 25, gain: [1.3, 2.8], cap: 100, desc: 'Craft compelling scripts.', unlockFame: 10 },
  { key: 'producing', stat: 'producing', name: 'Producing Bootcamp', icon: '💼', cost: 3500, energy: 30, gain: [1.1, 2.4], cap: 100, desc: 'Master budgets & deals.', unlockFame: 25 },
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
    run: (s) => ({ msg: '🎁 A residual cheque arrived in the mail. +Money.', delta: { money: 8000 + Math.floor(Math.random() * 25000) } }),
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

// ---- Narrative dilemmas (choice events) ------------------------------------
// Each option's `outcome(s)` returns a delta + message; the engine applies it
// (so logic stays here and only serializable display data is stored in state).
// Supported delta keys: money, fame, rep, acting, energy, rivalry, partnerRel.
export const CHOICE_EVENTS = [
  {
    id: 'tabloid', when: (s) => s.fame > 18,
    title: '📰 A Tabloid Comes Knocking',
    text: 'A gossip magazine offers $250,000 for a tell-all about a co-star\'s on-set behavior.',
    options: [
      { label: 'Take the money', outcome: () => ({ money: 250000, rep: -8, partnerRel: -10, image: { tabloid: 4 }, msg: 'You cash in — but the industry frowns, and it stings close to home.' }) },
      { label: 'Politely decline', outcome: () => ({ rep: 4, image: { pro: 2 }, msg: 'You keep your mouth shut. Colleagues note your discretion.' }) },
    ],
  },
  {
    id: 'staged_romance', when: (s) => s.fame > 30,
    title: '💋 A Showmance',
    text: 'Your publicist pitches a staged romance with a co-star to juice the press tour. A tabloid will pay $250k for the exclusive.',
    options: [
      { label: 'Play it up for the cameras', outcome: () => ({ money: 250000, fame: rf(3, 7), rep: -4, image: { tabloid: 6, artist: -2 }, msg: 'The "couple" dominates the news cycle. Famous — and a little cheaper for it.' }) },
      { label: 'Keep your private life private', outcome: () => ({ rep: 5, image: { artist: 2, pro: 1 }, msg: 'You refuse to perform your personal life. The serious crowd respects it.' }) },
    ],
  },
  {
    id: 'method',
    title: '🎭 Going Method',
    text: 'A demanding director wants you to stay in character for the entire shoot.',
    options: [
      { label: 'Fully commit', outcome: () => ({ acting: rf(2, 4), energy: -25, rep: 2, msg: 'Grueling — but your craft sharpens and critics take note.' }) },
      { label: 'Keep it professional', outcome: () => ({ msg: 'You deliver a solid, sane performance. No harm done.' }) },
    ],
  },
  {
    id: 'feud', when: (s) => (s.rivals || []).some((r) => r.rivalry > 40),
    title: '😤 A Public Jab',
    text: 'A rival took a swipe at you in an interview. The press wants your response.',
    options: [
      { label: 'Clap back', outcome: () => ({ fame: rf(2, 5), rivalry: 15, rep: -3, image: { tabloid: 3 }, msg: 'The feud makes headlines. Fame up, but it turns ugly.' }) },
      { label: 'Take the high road', outcome: () => ({ rep: 5, rivalry: -5, image: { pro: 2 }, msg: 'You stay gracious. The industry respects it.' }) },
    ],
  },
  {
    id: 'viral_temper', when: (s) => s.fame > 35,
    title: '📹 Caught on Camera',
    text: 'A clip of you losing your temper on set is going viral.',
    options: [
      { label: 'Issue a sincere apology', outcome: () => ({ fame: -2, rep: 4, image: { pro: 2 }, msg: 'You own it. Fans forgive; your reputation recovers.' }) },
      { label: 'Double down', outcome: () => ({ fame: rf(2, 6), rep: -7, image: { tabloid: 4 }, msg: 'You lean into the chaos. More famous, less respected.' }) },
    ],
  },
  {
    id: 'gala', when: (s) => s.money > 1000000,
    title: '🎗️ Charity Gala',
    text: 'A high-profile charity asks you to headline their fundraiser — and donate.',
    options: [
      { label: 'Donate generously ($500k)', outcome: () => ({ money: -500000, rep: 8, fame: 2, msg: 'Your generosity earns goodwill across the industry.' }) },
      { label: 'Attend, don\'t donate', outcome: () => ({ fame: 1, msg: 'You show your face. Nice photos, modest buzz.' }) },
      { label: 'Skip it', outcome: () => ({ rep: -2, msg: 'You stay home. A few eyebrows raise.' }) },
    ],
  },
  {
    id: 'passion',
    title: '🎬 Passion vs. Paycheck',
    text: 'Two scripts land on your desk: a soulless blockbuster cameo and a tiny, brilliant indie.',
    options: [
      { label: 'Chase the paycheck', outcome: () => ({ money: 2000000, rep: -3, image: { draw: 4, artist: -2 }, msg: 'Easy money. The art crowd sighs.' }) },
      { label: 'Follow your heart', outcome: () => ({ rep: 6, acting: rf(1, 3), image: { artist: 4, draw: -2 }, msg: 'The indie pays nothing but feeds your craft and credibility.' }) },
    ],
  },
  {
    id: 'mentor', when: (s) => s.fame > 50,
    title: '🌱 A Rising Hopeful',
    text: 'A nervous newcomer asks you to mentor them.',
    options: [
      { label: 'Take them under your wing', outcome: () => ({ energy: -15, rep: 5, msg: 'You pay it forward. The community admires you.' }) },
      { label: 'You\'re too busy', outcome: () => ({ msg: 'You politely decline. No one blames you... much.' }) },
    ],
  },
  // ---- On-set dilemmas (only while filming) ----
  {
    id: 'extra_take', when: (s) => !!s.active || (s.activeSeries && s.activeSeries.status === 'filming'),
    title: '🎬 One More Take',
    text: 'The director isn\'t satisfied and wants the scene again — and it\'s getting late.',
    options: [
      { label: 'Nail it, however long it takes', outcome: () => ({ prep: 1, energy: -12, msg: 'You dig deep. The take is electric.' }) },
      { label: 'Call it a day', outcome: () => ({ msg: 'You wrap on schedule. Fine is fine.' }) },
    ],
  },
  {
    id: 'own_stunt', when: (s) => !!s.active || (s.activeSeries && s.activeSeries.status === 'filming'),
    title: '🤸 Do Your Own Stunt?',
    text: 'A risky stunt could look incredible on camera — or land you in the ER.',
    options: [
      {
        label: 'Do it yourself',
        outcome: () => (Math.random() < 0.3
          ? { energy: -30, msg: 'You tweak your back — ouch. Painful reshoots follow.' }
          : { prep: 1, fame: rf(1, 3), energy: -10, msg: 'The stunt is jaw-dropping — it makes the trailer!' }),
      },
      { label: 'Use a stunt double', outcome: () => ({ msg: 'Safe and professional. The double nails it.' }) },
    ],
  },
  {
    id: 'set_friction',
    when: (s) => {
      const p = s.active || (s.activeSeries && s.activeSeries.status === 'filming' ? s.activeSeries : null);
      return !!(p && (p.costars || []).length);
    },
    title: '😬 On-Set Friction',
    text: 'You and a co-star aren\'t clicking, and it\'s showing up in the scenes.',
    options: [
      { label: 'Clear the air over dinner', outcome: () => ({ costarRel: 12, energy: -10, msg: 'You bond. The chemistry returns.' }) },
      { label: 'Keep it strictly professional', outcome: () => ({ msg: 'You power through. The tension lingers in the cut.' }) },
    ],
  },
  {
    id: 'improv', when: (s) => !!s.active || (s.activeSeries && s.activeSeries.status === 'filming'),
    title: '💡 Improv Moment',
    text: 'You have an idea to improvise a line that isn\'t in the script.',
    options: [
      {
        label: 'Go for it',
        outcome: () => (Math.random() < 0.5
          ? { prep: 1, acting: rf(0.5, 1.5), msg: 'The director loves it — it makes the final cut!' }
          : { rep: -1, msg: 'It falls flat. Back to the script.' }),
      },
      { label: 'Stick to the script', outcome: () => ({ msg: 'You play it as written. Solid and safe.' }) },
    ],
  },
  {
    id: 'campaign', when: (s) => s.fame > 40 && s.money > 1500000,
    title: '📣 Awards Campaign',
    text: 'Your team pitches an expensive "For Your Consideration" campaign this season.',
    options: [
      { label: 'Fund the campaign ($1M)', outcome: () => ({ money: -1000000, rep: 3, fame: 4, msg: 'The billboards go up. Voters are paying attention.' }) },
      { label: 'Let the work speak', outcome: () => ({ msg: 'You trust the performance to stand on its own.' }) },
    ],
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

// ---- Awards season ---------------------------------------------------------
// Real-world ceremonies, each held at a point in the year and judging your
// eligible credits from the trailing ~12 months. `kind` selects which work &
// skill a category evaluates; `medium` and `lead` filter eligible credits.
export const CEREMONIES = [
  {
    key: 'globes', name: 'Golden Globe Awards', icon: '🌐', week: 3, prestige: 1.0,
    categories: [
      { key: 'gg_film', name: 'Best Actor — Motion Picture', kind: 'acting', medium: 'film', lead: true },
      { key: 'gg_tv', name: 'Best Actor — Television', kind: 'acting', medium: 'tv', lead: true },
    ],
  },
  {
    key: 'sag', name: 'Screen Actors Guild Awards', icon: '🎟️', week: 6, prestige: 1.05,
    categories: [
      { key: 'sag_film', name: 'Outstanding Performance — Film', kind: 'acting', medium: 'film' },
      { key: 'sag_tv', name: 'Outstanding Performance — Television', kind: 'acting', medium: 'tv' },
    ],
  },
  {
    key: 'oscars', name: 'Academy Awards', icon: '🏆', week: 11, prestige: 1.6,
    categories: [
      { key: 'osc_actor', name: 'Best Actor', kind: 'acting', medium: 'film', lead: true },
      { key: 'osc_supp', name: 'Best Supporting Actor', kind: 'acting', medium: 'film', lead: false },
      { key: 'osc_writing', name: 'Best Original Screenplay', kind: 'writing', medium: 'film' },
      { key: 'osc_dir', name: 'Best Director', kind: 'directing', medium: 'film' },
      { key: 'osc_pic', name: 'Best Picture', kind: 'producing', medium: 'film' },
    ],
  },
  {
    key: 'emmys', name: 'Emmy Awards', icon: '📺', week: 38, prestige: 1.25,
    categories: [
      { key: 'emmy_lead', name: 'Outstanding Lead Actor', kind: 'acting', medium: 'tv', lead: true },
      { key: 'emmy_supp', name: 'Outstanding Supporting Actor', kind: 'acting', medium: 'tv', lead: false },
    ],
  },
];

// Film festivals — prestige events that anoint indie/documentary work mid-year.
export const FESTIVALS = [
  { key: 'sundance', name: 'Sundance', icon: '⛰️', week: 4 },
  { key: 'cannes', name: 'Cannes', icon: '🌴', week: 20 },
  { key: 'venice', name: 'Venice', icon: '🦁', week: 35 },
  { key: 'tiff', name: 'Toronto (TIFF)', icon: '🍁', week: 37 },
];

// Map a filmography credit's category label to an awards medium.
export function creditMedium(category) {
  if (['Indie Film', 'Studio Film', 'Streaming Film', 'Documentary', 'Produced'].includes(category)) return 'film';
  if (['TV Series', 'TV Movie', 'Streaming Series', 'Miniseries'].includes(category)) return 'tv';
  return 'other'; // commercials, voice, theatre — not screen-awards eligible
}

// ---- Legacy / Hall of Fame -------------------------------------------------
// Tiers a career is ranked into at retirement, by legacy score.
export const HALL_OF_FAME = [
  { min: 0, label: 'Forgotten Extra', icon: '🎭' },
  { min: 70, label: 'Working Actor', icon: '🎬' },
  { min: 160, label: 'Notable Talent', icon: '⭐' },
  { min: 300, label: 'Bona Fide Star', icon: '🌟' },
  { min: 480, label: 'Hollywood Legend', icon: '🏆' },
  { min: 720, label: 'Immortal Icon', icon: '👑' },
];

// Legacy score at/above this earns an honorary Lifetime Achievement Award.
export const LIFETIME_ACHIEVEMENT_MIN = 480;

// ---- Finances: lifestyle assets & taxes ------------------------------------
// One-time purchases. On buy: a fame/reputation bump (you're seen succeeding).
// Ongoing: weekly upkeep (a money sink) and a comfort bonus to weekly energy.
export const ASSETS = [
  { key: 'car', name: 'Sports Car', icon: '🏎️', cost: 250000, upkeep: 1200, fame: 2, rep: 1, energy: 0, desc: 'Turn heads on the boulevard.' },
  { key: 'condo', name: 'Hillside Condo', icon: '🏠', cost: 1500000, upkeep: 4000, fame: 3, rep: 2, energy: 3, desc: 'A comfortable home base.' },
  { key: 'art', name: 'Art Collection', icon: '🖼️', cost: 4000000, upkeep: 5000, fame: 3, rep: 4, energy: 0, desc: 'Cultured cachet among the elite.' },
  { key: 'mansion', name: 'Hollywood Mansion', icon: '🏡', cost: 12000000, upkeep: 20000, fame: 7, rep: 3, energy: 5, desc: 'The address that says you\'ve arrived.' },
  { key: 'yacht', name: 'Luxury Yacht', icon: '🛥️', cost: 40000000, upkeep: 45000, fame: 8, rep: 2, energy: 3, desc: 'Float above it all.' },
  { key: 'jet', name: 'Private Jet', icon: '✈️', cost: 120000000, upkeep: 110000, fame: 10, rep: 4, energy: 6, desc: 'The ultimate flex.' },
];

// Progressive annual income tax (Hollywood-scale brackets).
export function taxFor(income) {
  if (income <= 0) return 0;
  const brackets = [[100000, 0.10], [500000, 0.24], [2000000, 0.35], [Infinity, 0.45]];
  let tax = 0, prev = 0;
  for (const [cap, rate] of brackets) {
    if (income <= prev) break;
    tax += (Math.min(income, cap) - prev) * rate;
    prev = cap;
  }
  return Math.round(tax);
}

// ---- Milestones / onboarding ----------------------------------------------
// Career goals that guide the player and grant small rewards on completion.
// `check(s)` is evaluated against game state; `reward` is applied once.
export const MILESTONES = [
  { key: 'first_job', icon: '🎬', name: 'First Day on Set', desc: 'Book any paying gig — even as an extra.', reward: { money: 4000 }, check: (s) => (s.stats.extra || 0) > 0 || s.stats.landed > 0 },
  { key: 'first_class', icon: '📚', name: 'Trained Up', desc: 'Take your first class.', reward: { rep: 2 }, check: (s) => s.stats.classes > 0 },
  { key: 'first_credit', icon: '🎞️', name: 'In the Credits', desc: 'Earn your first on-screen credit.', reward: { money: 8000 }, check: (s) => s.filmography.length > 0 },
  { key: 'agent', icon: '🕴️', name: 'Represented', desc: 'Sign with a talent agent.', reward: { rep: 4 }, check: (s) => s.hasAgent },
  { key: 'fame25', icon: '⭐', name: 'Recognizable', desc: 'Reach 25 fame.', reward: { money: 25000 }, check: (s) => s.fame >= 25 },
  { key: 'first_lead', icon: '🎬', name: 'Leading Role', desc: 'Land a lead (top-billed) role.', reward: { money: 15000 }, check: (s) => s.filmography.some((f) => f.acted && (f.billing === 'lead' || (f.lead && !f.billing))) },
  { key: 'studio_film', icon: '🎥', name: 'Studio Player', desc: 'Appear in a studio film.', reward: { rep: 5 }, check: (s) => s.filmography.some((f) => f.category === 'Studio Film' && f.acted) },
  { key: 'streaming', icon: '📱', name: 'Streaming Star', desc: 'Appear in a streaming project.', reward: { rep: 4 }, check: (s) => s.filmography.some((f) => (f.category === 'Streaming Film' || f.category === 'Streaming Series') && f.acted) },
  { key: 'mansion', icon: '🏡', name: 'Living the Dream', desc: 'Buy a Hollywood mansion.', reward: { rep: 4 }, check: (s) => (s.assets || []).includes('mansion') },
  { key: 'tv_regular', icon: '📡', name: 'Series Regular', desc: 'Star in a season of TV.', reward: { rep: 4 }, check: (s) => (s.stats.seasons || 0) > 0 },
  { key: 'first_script', icon: '✍️', name: 'Screenwriter', desc: 'Write your first script.', reward: { rep: 3 }, check: (s) => (s.stats.written || 0) > 0 },
  { key: 'produce', icon: '💼', name: 'Mogul in the Making', desc: 'Produce a film.', reward: { rep: 5 }, check: (s) => s.filmography.some((f) => f.produced) },
  { key: 'direct', icon: '🎬', name: 'Auteur', desc: 'Direct a film.', reward: { rep: 5 }, check: (s) => s.filmography.some((f) => f.directed) },
  { key: 'first_nom', icon: '🎗️', name: 'Nominated', desc: 'Earn an awards nomination.', reward: { fame: 2 }, check: (s) => (s.stats.noms || 0) + (s.stats.wins || 0) > 0 },
  { key: 'first_win', icon: '🥇', name: 'Award Winner', desc: 'Win an award.', reward: { fame: 4, rep: 6 }, check: (s) => (s.stats.wins || 0) > 0 },
  { key: 'oscar', icon: '🏆', name: 'Academy Award', desc: 'Win an Academy Award.', reward: { fame: 6, rep: 8 }, check: (s) => s.awards.some((a) => a.ceremonyKey === 'oscars' && a.won) },
  { key: 'alist', icon: '🌟', name: 'A-List', desc: 'Reach 85 fame.', reward: { rep: 5 }, check: (s) => s.fame >= 85 },
  { key: 'millionaire', icon: '💰', name: 'Millionaire', desc: 'Bank $1,000,000.', reward: { rep: 3 }, check: (s) => s.money >= 1000000 },
];
