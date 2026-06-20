// engine.js — core game mechanics
import {
  WEEKS_PER_YEAR, AGENT_CUT, CLASSES, EVENTS,
  AWARD_NAME, DIFFICULTIES, GENRES, GENRE_KEYS,
  projectTitle, makeRole, makeCostar,
} from './data.js';
import { pushLog, refreshOffers } from './state.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rf = (a, b) => a + Math.random() * (b - a);

// ---- Difficulty / genre helpers -------------------------------------------
export function diffOf(s) { return DIFFICULTIES[s.difficulty] || DIFFICULTIES.normal; }

export function genreAffinity(s, genre) {
  return (s.genres && s.genres[genre]) || 0;
}

// The genre you've worked in most — your public "specialty".
export function specialty(s) {
  if (!s.genres) return null;
  let best = null, bestV = 8; // need some minimum before you have a brand
  for (const k of GENRE_KEYS) {
    if (s.genres[k] > bestV) { bestV = s.genres[k]; best = k; }
  }
  return best ? { key: best, ...GENRES[best], value: bestV } : null;
}

// ---- Helpers ---------------------------------------------------------------
export function isBusy(s) {
  return !!s.active
    || (s.activeSeries && s.activeSeries.status === 'filming')
    || s.productions.some((p) => p.weeksLeft > 0);
}

function spendEnergy(s, amount) {
  s.energy = clamp(s.energy - amount, 0, s.maxEnergy);
}

// Best-connected famous friend gives you an audition edge.
function connectionBonus(s) {
  if (!s.contacts || !s.contacts.length) return 0;
  let best = 0;
  for (const c of s.contacts) best = Math.max(best, (c.rel / 100) * (c.fame / 100));
  return best * 0.12; // up to +0.12 odds from a powerful ally
}

// ---- Auditioning -----------------------------------------------------------
// Returns {ok, chance, msg}
export function auditionChance(s, role) {
  const skillFactor = (s.acting - role.skillReq) / 40;       // ±
  const fameFactor = (s.fame - role.fameReq) / 60;
  const repFactor = (s.reputation - 30) / 200;
  let chance = 0.42 + skillFactor + fameFactor + repFactor;
  if (s.hasAgent) chance += 0.08;
  chance += diffOf(s).oddsBonus;
  chance += connectionBonus(s);
  // Specialization: experience in this genre makes you a natural fit.
  chance += clamp(genreAffinity(s, role.genre) / 250, 0, 0.2);
  // A callback means they already liked you — better shot the second time.
  if (role.callback) chance += 0.18;
  return clamp(chance, 0.03, 0.97);
}

export function audition(s, roleId) {
  if (s.gameOver) return { ok: false, msg: 'The game is over.' };
  if (isBusy(s)) return { ok: false, msg: 'You are already committed to a project.' };
  const role = s.offers.find((r) => r.id === roleId);
  if (!role) return { ok: false, msg: 'That role is no longer available.' };
  const energyCost = 18;
  if (s.energy < energyCost) return { ok: false, msg: 'Too exhausted to audition. Rest first.' };

  spendEnergy(s, energyCost);
  s.stats.auditions++;
  const chance = auditionChance(s, role);
  const roll = Math.random();
  const won = roll < chance;

  // You always learn from being in the room — even when you don't book it.
  const learn = +rf(0.15, 0.5).toFixed(2);
  s.acting = clamp(+(s.acting + learn).toFixed(1), 0, 100);
  awardGenreXp(s, role.genre, 0.4);

  if (won) {
    s.offers = s.offers.filter((r) => r.id !== roleId);
    s.stats.landed++;
    const costars = castCostars(s);
    const names = costars.map((c) => c.name).join(' & ');
    if (role.category === 'tvshow') {
      startSeries(s, role, costars);
      pushLog(s, `✅ You're a series regular on "${role.title}" (${role.genreName}) alongside ${names}! Season 1 begins.`);
      return { ok: true, won: true, msg: `You joined the cast of "${role.title}"!` };
    }
    s.active = { role, weeksLeft: role.weeks, totalWeeks: role.weeks, costars };
    pushLog(s, `✅ You landed ${role.part} in "${role.title}" (${role.genreName} ${role.catName}) with ${names}! Filming starts now.`);
    return { ok: true, won: true, msg: `You got the part in "${role.title}"!` };
  }

  // Near-miss → callback: the offer stays, with better odds next time.
  const margin = roll - chance; // how far you missed (smaller = closer)
  if (!role.callback && margin < 0.15) {
    role.callback = true;
    pushLog(s, `📞 Callback! "${role.title}" wants to see you again — your odds improve. (+${learn} acting from the room)`);
    return { ok: true, won: false, callback: true, msg: `Callback for "${role.title}"!` };
  }

  // Otherwise you've used your shot.
  s.offers = s.offers.filter((r) => r.id !== roleId);
  pushLog(s, `❌ You auditioned for "${role.title}" but didn't get it. (${Math.round(chance * 100)}% odds, +${learn} acting)`);
  return { ok: true, won: false, msg: `No luck on "${role.title}".` };
}

// ---- Co-stars & relationships ---------------------------------------------
// Assign 1-2 co-stars to a project: sometimes a familiar face, sometimes new.
function castCostars(s) {
  const out = [];
  const n = 1 + (Math.random() < 0.5 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const known = s.contacts.filter((c) => c.rel >= 25 && !out.includes(c));
    if (known.length && Math.random() < 0.4) {
      out.push(known[Math.floor(Math.random() * known.length)]);
    } else {
      const cs = makeCostar(s.fame);
      s.contacts.push(cs);
      out.push(cs);
    }
  }
  return out;
}

// Wrapping a shared project deepens relationships & rubs off star power.
function bondWithCostars(s, costars) {
  let starPower = 0;
  for (const c of costars) {
    c.projects = (c.projects || 0) + 1;
    c.rel = clamp(c.rel + rf(8, 16), 0, 100);
    starPower += Math.max(0, c.fame - s.fame);
    // A close, famous co-star can spark on-set romance.
    if (!s.partner && !c.romance && c.rel > 55 && Math.random() < 0.2) {
      c.romance = true;
      s.partner = c.id;
      s.fame = clamp(s.fame + 3, 0, 100);
      pushLog(s, `💞 On-set sparks: you and ${c.name} are now an item! The press loves it. +3 fame.`);
    }
  }
  return starPower;
}

export function catchUp(s, contactId) {
  if (s.gameOver) return { ok: false, msg: 'The game is over.' };
  if (s.energy < 10) return { ok: false, msg: 'Too tired to socialize.' };
  const c = s.contacts.find((x) => x.id === contactId);
  if (!c) return { ok: false, msg: 'Contact not found.' };
  spendEnergy(s, 10);
  c.rel = clamp(c.rel + rf(5, 10), 0, 100);
  s.reputation = clamp(s.reputation + 0.5, 0, 100);
  pushLog(s, `☕ You caught up with ${c.name}. Relationship grew.`);
  return { ok: true, msg: `You and ${c.name} are closer.` };
}

// ---- TV series renewal / cancellation arc ---------------------------------
const SERIES_SEASON_WEEKS = 8;

function startSeries(s, role, costars) {
  s.activeSeries = {
    title: role.title,
    genre: role.genre,
    genreName: role.genreName,
    genreIcon: role.genreIcon,
    part: role.part,
    costars,
    season: 1,
    weeksLeft: SERIES_SEASON_WEEKS,
    totalWeeks: SERIES_SEASON_WEEKS,
    salary: role.pay,                 // per season
    fameGain: role.fameGain,
    skillGain: role.skillGain,
    prestige: role.prestige,
    ratings: 0,
    status: 'filming',
  };
  s.stats.seasons++;
}

export function quitSeries(s) {
  if (!s.activeSeries) return { ok: false, msg: 'You\'re not on a series.' };
  const sh = s.activeSeries;
  s.filmography.push({
    title: `${sh.title} (${sh.season} season${sh.season > 1 ? 's' : ''})`,
    category: 'TV Series', year: s.year, role: sh.part,
    quality: Math.round(sh.ratings || 50),
  });
  pushLog(s, `🚪 You left "${sh.title}" after ${sh.season} season(s) to pursue other work.`);
  s.activeSeries = null;
  return { ok: true, msg: `You left "${sh.title}".` };
}

// Resolve the end of a TV season: pay out, then renew or cancel.
function endSeason(s) {
  const sh = s.activeSeries;
  // Season payoff (gains taper a little each season).
  const taper = Math.max(0.5, 1 - (sh.season - 1) * 0.08);
  const fg = +(sh.fameGain * taper).toFixed(1);
  const sg = +(sh.skillGain * taper).toFixed(1);
  s.fame = clamp(+(s.fame + fg).toFixed(1), 0, 100);
  s.acting = clamp(+(s.acting + sg).toFixed(1), 0, 100);
  s.reputation = clamp(s.reputation + sh.prestige, 0, 100);
  s.yearPrestige += sh.prestige;
  awardGenreXp(s, sh.genre, 2 + sh.prestige);
  const starPower = bondWithCostars(s, sh.costars);

  // Ratings drive renewal: your fame & craft + co-star draw, minus fatigue.
  sh.ratings = Math.round(clamp(
    s.fame * 0.5 + s.acting * 0.2 + starPower * 0.3 + rf(-8, 14) - (sh.season - 1) * 4,
    5, 100,
  ));
  const renewChance = clamp(sh.ratings / 110 + diffOf(s).oddsBonus, 0.08, 0.93);

  if (Math.random() < renewChance) {
    sh.season++;
    sh.salary = Math.round(sh.salary * 1.12);  // raises each season
    sh.weeksLeft = SERIES_SEASON_WEEKS;
    sh.totalWeeks = SERIES_SEASON_WEEKS;
    sh.status = 'filming';
    s.stats.seasons++;
    pushLog(s, `📈 "${sh.title}" was RENEWED for season ${sh.season}! (${sh.ratings} rating, +12% pay). +${fg} fame.`);
  } else {
    // Cancellation: a long run earns a prestigious finale.
    const finale = +(sh.prestige * Math.min(sh.season, 6) * 0.6).toFixed(2);
    s.yearPrestige += finale;
    s.reputation = clamp(s.reputation + finale, 0, 100);
    s.filmography.push({
      title: `${sh.title} (${sh.season} season${sh.season > 1 ? 's' : ''})`,
      category: 'TV Series', year: s.year, role: sh.part,
      quality: sh.ratings,
    });
    pushLog(s, `📉 "${sh.title}" was CANCELLED after ${sh.season} season(s) (${sh.ratings} rating). A ${sh.season >= 3 ? 'beloved' : 'brief'} run wraps. +${fg} fame.`);
    s.activeSeries = null;
  }
}

function awardGenreXp(s, genre, amount) {
  if (!s.genres) return;
  s.genres[genre] = +((s.genres[genre] || 0) + amount).toFixed(1);
}

// ---- Training --------------------------------------------------------------
export function takeClass(s, classKey) {
  if (s.gameOver) return { ok: false, msg: 'The game is over.' };
  const c = CLASSES.find((x) => x.key === classKey);
  if (!c) return { ok: false, msg: 'Unknown class.' };
  if (c.unlockFame && s.fame < c.unlockFame) {
    return { ok: false, msg: `${c.name} unlocks at ${c.unlockFame} fame.` };
  }
  if (s.money < c.cost) return { ok: false, msg: 'You can\'t afford that class.' };
  if (s.energy < c.energy) return { ok: false, msg: 'Too tired for class. Rest first.' };
  if (s[c.stat] >= c.cap) return { ok: false, msg: `Your ${c.stat} is already maxed.` };

  s.money -= c.cost;
  spendEnergy(s, c.energy);
  const gain = rf(c.gain[0], c.gain[1]);
  s[c.stat] = clamp(+(s[c.stat] + gain).toFixed(1), 0, c.cap);
  s.stats.classes++;
  pushLog(s, `📚 Attended ${c.name}. +${gain.toFixed(1)} ${c.stat}.`);
  return { ok: true, msg: `Your ${c.stat} improved!` };
}

// ---- Simple actions --------------------------------------------------------
export function network(s) {
  if (s.gameOver) return { ok: false, msg: 'The game is over.' };
  if (s.energy < 15) return { ok: false, msg: 'Too tired to network.' };
  spendEnergy(s, 15);
  const rep = rf(2, 5);
  s.reputation = clamp(+(s.reputation + rep).toFixed(1), 0, 100);
  let msg = `Networked at an industry party. +${rep.toFixed(1)} reputation.`;
  // Chance of an extra offer popping up.
  if (Math.random() < 0.4) {
    s.offers.push(makeRole(s.fame));
    msg += ' A new audition opened up!';
  }
  pushLog(s, `🥂 ${msg}`);
  return { ok: true, msg };
}

export function rest(s) {
  if (s.gameOver) return { ok: false, msg: 'The game is over.' };
  const gain = 35;
  s.energy = clamp(s.energy + gain, 0, s.maxEnergy);
  pushLog(s, `😴 You rested. +${gain} energy.`);
  return { ok: true, msg: 'Recharged.' };
}

export function sideJob(s) {
  if (s.gameOver) return { ok: false, msg: 'The game is over.' };
  if (s.energy < 20) return { ok: false, msg: 'Too tired for a shift.' };
  spendEnergy(s, 20);
  const pay = 250 + Math.floor(Math.random() * 200);
  s.money += pay;
  pushLog(s, `🍽️ Worked a serving shift. +$${pay}.`);
  return { ok: true, msg: `Earned $${pay}.` };
}

// Background/extra work: the always-available on-theme floor gig. It roughly
// keeps the lights on (a profit on Easy, a slow bleed on Normal, brutal on Hard)
// while building a little craft — enough to survive on, never enough to escape.
const EXTRA_PAY = 200;
const EXTRA_ENERGY = 14;
export function extraWork(s) {
  if (s.gameOver) return { ok: false, msg: 'The game is over.' };
  if (isBusy(s)) return { ok: false, msg: 'You can\'t do extra work while on a project.' };
  if (s.energy < EXTRA_ENERGY) return { ok: false, msg: 'Too tired for a day on set.' };
  spendEnergy(s, EXTRA_ENERGY);
  const pay = Math.round(EXTRA_PAY * diffOf(s).payMult * rf(0.8, 1.2));
  s.money += pay;
  const skillGain = +rf(0.2, 0.5).toFixed(2);
  s.acting = clamp(+(s.acting + skillGain).toFixed(1), 0, 100);
  s.stats.extra = (s.stats.extra || 0) + 1;
  let msg = `Worked as a background extra. +$${pay}, +${skillGain} acting.`;
  // Occasionally make a connection on set (a fellow striver, low fame).
  if (Math.random() < 0.18) {
    const cs = makeCostar(Math.max(1, s.fame * 0.4));
    cs.rel = clamp(cs.rel + rf(5, 12), 0, 100);
    s.contacts.push(cs);
    msg += ` You hit it off with ${cs.name} between takes.`;
  }
  // Rare: you actually make the final cut, for a sliver of fame.
  if (Math.random() < 0.06) {
    s.fame = clamp(+(s.fame + 0.5).toFixed(1), 0, 100);
    msg += ' You made the final cut! +0.5 fame.';
  }
  pushLog(s, `🎬 ${msg}`);
  return { ok: true, msg: `Earned $${pay} on set.` };
}

export function toggleAgent(s) {
  if (s.gameOver) return { ok: false, msg: 'The game is over.' };
  if (!s.hasAgent) {
    if (s.fame < 12) return { ok: false, msg: 'No agent will sign you yet. Reach 12 fame.' };
    s.hasAgent = true;
    pushLog(s, '🕴️ You signed with a talent agent! Better auditions, but they take a cut.');
    refreshOffers(s);
    return { ok: true, msg: 'Signed with an agent.' };
  }
  s.hasAgent = false;
  pushLog(s, '👋 You parted ways with your agent.');
  return { ok: true, msg: 'Dropped your agent.' };
}

// ---- Writing / Producing / Directing --------------------------------------
export function writeScript(s) {
  if (s.gameOver) return { ok: false, msg: 'The game is over.' };
  if (s.writing < 5) return { ok: false, msg: 'Take a screenwriting course first.' };
  if (s.energy < 30) return { ok: false, msg: 'Too tired to write.' };
  spendEnergy(s, 30);
  const quality = clamp(Math.round(s.writing * rf(0.6, 1.1) + rf(-5, 8)), 5, 100);
  const script = {
    id: 'sc' + Math.random().toString(36).slice(2, 8),
    title: projectTitle(Math.random() < 0.5 ? 'movie' : 'tvshow'),
    quality,
  };
  s.scripts.push(script);
  pushLog(s, `✍️ You finished a script: "${script.title}" (quality ${quality}).`);
  return { ok: true, msg: `Wrote "${script.title}".` };
}

export function sellScript(s, scriptId) {
  const idx = s.scripts.findIndex((x) => x.id === scriptId);
  if (idx < 0) return { ok: false, msg: 'Script not found.' };
  const sc = s.scripts[idx];
  const price = Math.round(sc.quality * 220 * rf(0.7, 1.3));
  s.money += price;
  s.reputation = clamp(s.reputation + sc.quality / 30, 0, 100);
  s.scripts.splice(idx, 1);
  pushLog(s, `💰 Sold "${sc.title}" to a studio for $${price}.`);
  return { ok: true, msg: `Sold for $${price}.` };
}

// Produce a project (optionally directing it & using your own script).
// budget tiers determine cost & potential return.
export const BUDGET_TIERS = [
  { key: 'micro', name: 'Micro-budget', cost: 5000, scale: 1 },
  { key: 'mid', name: 'Mid-budget', cost: 25000, scale: 4 },
  { key: 'big', name: 'Blockbuster', cost: 120000, scale: 16 },
];

export function startProduction(s, { budgetKey, scriptId, direct }) {
  if (s.gameOver) return { ok: false, msg: 'The game is over.' };
  if (s.producing < 5) return { ok: false, msg: 'Take a producing bootcamp first.' };
  const tier = BUDGET_TIERS.find((b) => b.key === budgetKey);
  if (!tier) return { ok: false, msg: 'Pick a budget.' };
  if (s.money < tier.cost) return { ok: false, msg: 'You can\'t afford that budget.' };
  if (direct && s.directing < 5) return { ok: false, msg: 'You need directing skill to direct.' };

  let script = null;
  if (scriptId) {
    const idx = s.scripts.findIndex((x) => x.id === scriptId);
    if (idx >= 0) { script = s.scripts[idx]; s.scripts.splice(idx, 1); }
  }
  s.money -= tier.cost;
  const weeks = tier.key === 'micro' ? 6 : tier.key === 'mid' ? 10 : 16;
  const prod = {
    id: 'pr' + Math.random().toString(36).slice(2, 8),
    title: script ? script.title : projectTitle('movie'),
    budgetKey: tier.key,
    budgetName: tier.name,
    cost: tier.cost,
    scale: tier.scale,
    scriptQuality: script ? script.quality : 35,
    directed: !!direct,
    weeksLeft: weeks,
    totalWeeks: weeks,
  };
  s.productions.push(prod);
  pushLog(s, `🎬 You're producing "${prod.title}" (${tier.name})${direct ? ' and directing it' : ''}.`);
  return { ok: true, msg: `Production started on "${prod.title}".` };
}

function wrapProduction(s, prod) {
  // Quality blends script, your producing/directing skill, and luck.
  let q = prod.scriptQuality * 0.5 + s.producing * 0.3;
  if (prod.directed) q += s.directing * 0.25;
  q *= rf(0.6, 1.25);
  q = clamp(q, 5, 100);

  // Box office return scales with budget tier & quality.
  const gross = Math.round(prod.cost * (0.4 + (q / 100) * 2.4) * rf(0.7, 1.3));
  const profit = gross - prod.cost;
  s.money += gross;
  const fameGain = +(q / 100 * 6 * Math.sqrt(prod.scale)).toFixed(1);
  s.fame = clamp(+(s.fame + fameGain).toFixed(1), 0, 100);
  const prestige = +(q / 100 * (prod.directed ? 2 : 1.2) * Math.sqrt(prod.scale)).toFixed(2);
  s.yearPrestige += prestige;
  s.reputation = clamp(s.reputation + q / 25, 0, 100);
  if (prod.directed) s.directing = clamp(+(s.directing + 1).toFixed(1), 0, 100);
  s.producing = clamp(+(s.producing + 1).toFixed(1), 0, 100);

  s.filmography.push({
    title: prod.title, category: 'Produced', year: s.year,
    role: prod.directed ? 'Producer / Director' : 'Producer', quality: Math.round(q),
  });

  const verdict = profit > 0
    ? `It grossed $${gross} — a $${profit} profit! 🍾`
    : `It grossed $${gross} — a $${Math.abs(profit)} loss. 📉`;
  pushLog(s, `🎞️ "${prod.title}" wrapped (quality ${Math.round(q)}). ${verdict} +${fameGain} fame.`);
}

// ---- Random events ---------------------------------------------------------
function rollEvents(s) {
  for (const ev of EVENTS) {
    if (ev.when && !ev.when(s)) continue;
    if (Math.random() < ev.chance) {
      const { msg, delta } = ev.run(s);
      applyDelta(s, delta);
      pushLog(s, msg);
      break; // at most one event per week keeps things readable
    }
  }
}

function applyDelta(s, d) {
  if (!d) return;
  if (d.money) s.money += d.money;
  if (d.fame) s.fame = clamp(+(s.fame + d.fame).toFixed(1), 0, 100);
  if (d.acting) s.acting = clamp(+(s.acting + d.acting).toFixed(1), 0, 100);
  if (d.reputation) s.reputation = clamp(+(s.reputation + d.reputation).toFixed(1), 0, 100);
  if (d.energyPenalty) s.energyPenalty = (s.energyPenalty || 0) + d.energyPenalty;
}

// ---- Award season ----------------------------------------------------------
function awardSeason(s) {
  // Probability of a nomination scales with prestige earned this year.
  const p = clamp(s.yearPrestige / 12, 0, 0.9);
  if (s.yearPrestige > 1.5 && Math.random() < p) {
    const nominated = true;
    const won = Math.random() < clamp(s.yearPrestige / 25, 0.1, 0.8);
    if (won) {
      const recent = s.filmography[s.filmography.length - 1];
      const award = { name: AWARD_NAME, year: s.year, project: recent ? recent.title : 'your work' };
      s.awards.push(award);
      s.fame = clamp(s.fame + 8, 0, 100);
      s.reputation = clamp(s.reputation + 12, 0, 100);
      pushLog(s, `🏆 You WON the ${AWARD_NAME} for ${award.project}! Your career soars. +8 fame.`);
    } else {
      s.fame = clamp(s.fame + 3, 0, 100);
      pushLog(s, `🎟️ You were nominated for a ${AWARD_NAME} but didn't win. Still, exposure! +3 fame.`);
    }
  }
  s.yearPrestige = 0;
}

// ---- Advance one week ------------------------------------------------------
export function advanceWeek(s) {
  if (s.gameOver) return;

  const D = diffOf(s);

  // Living expenses
  s.money -= D.living;

  // Active acting role progresses
  if (s.active) {
    const a = s.active;
    const weekly = Math.round(a.role.pay * D.payMult / a.totalWeeks);
    const net = s.hasAgent ? Math.round(weekly * (1 - AGENT_CUT)) : weekly;
    s.money += net;
    a.weeksLeft--;
    if (a.weeksLeft <= 0) {
      // Wrap: bond with co-stars; their star power rubs off on your fame.
      const starPower = bondWithCostars(s, a.costars || []);
      const rubOff = +(starPower * 0.04).toFixed(1);
      const fameGain = +(a.role.fameGain + rubOff).toFixed(1);
      s.fame = clamp(+(s.fame + fameGain).toFixed(1), 0, 100);
      s.acting = clamp(+(s.acting + a.role.skillGain).toFixed(1), 0, 100);
      s.reputation = clamp(s.reputation + a.role.prestige * 2, 0, 100);
      s.yearPrestige += a.role.prestige;
      awardGenreXp(s, a.role.genre, 1.5 + a.role.prestige);
      s.filmography.push({
        title: a.role.title, category: a.role.catName, year: s.year,
        role: a.role.part, genre: a.role.genreName,
        quality: Math.round(50 + a.role.prestige * 10),
      });
      const rubMsg = rubOff > 0 ? ` (+${rubOff} from famous co-stars)` : '';
      pushLog(s, `🎉 "${a.role.title}" wrapped! +${fameGain} fame${rubMsg}, +${a.role.skillGain} acting.`);
      s.active = null;
    }
  }

  // TV series (renewal/cancellation arc)
  if (s.activeSeries && s.activeSeries.status === 'filming') {
    const sh = s.activeSeries;
    const weekly = Math.round(sh.salary * D.payMult / sh.totalWeeks);
    s.money += s.hasAgent ? Math.round(weekly * (1 - AGENT_CUT)) : weekly;
    sh.weeksLeft--;
    if (sh.weeksLeft <= 0) endSeason(s);
  }

  // Self-produced projects progress
  for (const prod of s.productions) {
    if (prod.weeksLeft > 0) {
      prod.weeksLeft--;
      if (prod.weeksLeft <= 0) wrapProduction(s, prod);
    }
  }
  s.productions = s.productions.filter((p) => p.weeksLeft > 0 || p._kept);

  // Energy regen (minus any burnout penalty)
  const regen = 30 - (s.energyPenalty || 0);
  s.energy = clamp(s.energy + regen, 0, s.maxEnergy);
  s.energyPenalty = 0;

  // Random event
  rollEvents(s);

  // Slowly refresh the audition board so it stays lively
  if (Math.random() < 0.5 && !isBusy(s)) refreshOffers(s);

  // Advance the calendar
  s.week++;
  if (s.week > WEEKS_PER_YEAR) {
    s.week = 1;
    s.year++;
    s.age++;
    awardSeason(s);
    pushLog(s, `📅 A new year begins. You are now ${s.age}.`);
  }

  // Lose condition: deep, sustained debt
  if (s.money < D.debtFloor) {
    s.gameOver = true;
    s.gameOverReason = 'bankrupt';
    pushLog(s, '💀 Bankrupt. You leave town, dreams unfulfilled. Game over.');
  }
}
