// engine.js — core game mechanics
import {
  WEEKS_PER_YEAR, AGENT_CUT, CLASSES, EVENTS,
  DIFFICULTIES, GENRES, GENRE_KEYS, CEREMONIES, creditMedium,
  HALL_OF_FAME, LIFETIME_ACHIEVEMENT_MIN, MILESTONES, CHOICE_EVENTS,
  projectTitle, makeRole, makeCostar, makeRival,
} from './data.js';
import { pushLog, refreshOffers } from './state.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rf = (a, b) => a + Math.random() * (b - a);

// Early-career fame friction: when nobody knows you, each small win barely moves
// the needle; once you're recognized, fame compounds. Ramps ~0.30x at fame 0 up
// to full effect around fame 35, so it only slows the early grind. Penalties
// (negative deltas) are never scaled.
function fameFriction(fame) { return clamp(0.24 + (fame / 42) * 0.76, 0.24, 1); }
function gainFame(s, amt) {
  const delta = amt > 0 ? amt * fameFriction(s.fame) : amt;
  s.fame = clamp(+(s.fame + delta).toFixed(1), 0, 100);
}

// ---- Difficulty / genre helpers -------------------------------------------
export function diffOf(s) { return DIFFICULTIES[s.difficulty] || DIFFICULTIES.normal; }

export function genreAffinity(s, genre) {
  return (s.genres && s.genres[genre]) || 0;
}

// Typecasting: once a real body of work is concentrated in one genre, casting
// directors pigeonhole you — boosting your in-brand odds but hurting your
// chances of being cast against type. Returns the dominant genre and a 0..1
// degree (0 until your top genre exceeds ~45% of your experience).
export function typecastInfo(s) {
  if (!s.genres) return { genre: null, degree: 0, share: 0 };
  let total = 0, top = null, topV = 0;
  for (const k of GENRE_KEYS) {
    const v = s.genres[k] || 0;
    total += v;
    if (v > topV) { topV = v; top = k; }
  }
  if (total < 30 || !top) return { genre: null, degree: 0, share: 0 };
  const share = topV / total;
  const degree = clamp((share - 0.45) / 0.4, 0, 1);
  return { genre: top, degree, share };
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
  // Typecasting: hard to get cast against your established brand.
  const tc = typecastInfo(s);
  if (tc.genre && role.genre !== tc.genre) chance -= tc.degree * 0.15;
  // A callback means they already liked you — better shot the second time.
  if (role.callback) chance += 0.18;
  // You soured this room during a botched negotiation.
  if (role.hagglePenalty) chance -= role.hagglePenalty;
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

  // Otherwise you've used your shot. Sometimes a rival snags the part.
  s.offers = s.offers.filter((r) => r.id !== roleId);
  const rival = Math.random() < 0.4 ? pickRival(s) : null;
  if (rival) {
    rival.rivalry = clamp(rival.rivalry + rf(2, 6), 0, 100);
    rival.fame = Math.round(clamp(rival.fame + rf(0.3, 1), 1, 100));
    pushLog(s, `❌ You lost "${role.title}" — your rival ${rival.name} landed it instead. (+${learn} acting)`);
    return { ok: true, won: false, msg: `${rival.name} got the part on "${role.title}".` };
  }
  pushLog(s, `❌ You auditioned for "${role.title}" but didn't get it. (${Math.round(chance * 100)}% odds, +${learn} acting)`);
  return { ok: true, won: false, msg: `No luck on "${role.title}".` };
}

// ---- Negotiation -----------------------------------------------------------
// Haggle an offer's deal before you audition. Fame, reputation and (especially)
// an agent drive your success; pushing too hard can cool the room or kill the
// offer. One attempt per role.
export function negotiate(s, roleId) {
  if (s.gameOver) return { ok: false, msg: 'The game is over.' };
  const role = s.offers.find((r) => r.id === roleId);
  if (!role) return { ok: false, msg: 'That offer is gone.' };
  if (role.negotiated) return { ok: false, msg: 'You\'ve already negotiated this deal.' };

  const chance = clamp(0.32 + s.reputation / 200 + s.fame / 220 + (s.hasAgent ? 0.25 : 0), 0.1, 0.92);
  if (Math.random() < chance) {
    const factor = rf(1.12, 1.4);
    role.pay = Math.round(role.pay * factor);
    role.negotiated = 'up';
    if (s.hasAgent) role.fameGain = +(role.fameGain * 1.1).toFixed(1); // better billing
    pushLog(s, `🤝 You negotiated a better deal on "${role.title}" — pay up ${Math.round((factor - 1) * 100)}%.`);
    return { ok: true, msg: 'Deal sweetened!' };
  }
  // Failure: you came off as difficult.
  role.negotiated = 'down';
  s.reputation = clamp(s.reputation - rf(1, 3), 0, 100);
  if (Math.random() < 0.18) {
    s.offers = s.offers.filter((r) => r.id !== roleId);
    pushLog(s, `🚪 You overplayed your hand — the producers walked away from "${role.title}".`);
    return { ok: false, msg: 'They pulled the offer.' };
  }
  role.hagglePenalty = 0.08; // casting cooled on you
  pushLog(s, `😬 Negotiations on "${role.title}" soured. Casting cooled on you.`);
  return { ok: false, msg: 'That went badly.' };
}

// ---- Rivals ----------------------------------------------------------------
function pickRival(s) {
  if (!s.rivals || !s.rivals.length) return null;
  return s.rivals[Math.floor(Math.random() * s.rivals.length)];
}

// Rivals' careers advance each year; a new challenger can emerge as you rise.
function updateRivals(s) {
  if (!s.rivals) s.rivals = [];
  for (const r of s.rivals) {
    r.fame = Math.round(clamp(r.fame + rf(0.5, 3) + (r.skill > 60 ? 1 : 0), 1, 100));
    r.skill = Math.round(clamp(r.skill + rf(0, 1.2), 1, 100));
    r.rivalry = clamp(r.rivalry - 1, 0, 100); // rivalries cool if not provoked
  }
  if (s.fame > 50 && s.rivals.length < 3) {
    const nemesis = makeRival(s.fame);
    s.rivals.push(nemesis);
    pushLog(s, `🔥 A new rival has emerged: ${nemesis.name} is making waves.`);
  }
}

// ---- Narrative dilemmas ----------------------------------------------------
function maybeTriggerChoice(s) {
  if (s.pendingChoice || s.ceremonyNight || s.gameOver) return;
  if (Math.random() >= 0.06) return; // ~6%/week
  const eligible = CHOICE_EVENTS.filter((e) => !e.when || e.when(s));
  if (!eligible.length) return;
  const e = eligible[Math.floor(Math.random() * eligible.length)];
  s.pendingChoice = {
    id: e.id, title: e.title, text: e.text,
    options: e.options.map((o) => ({ label: o.label })),
  };
}

export function resolveChoice(s, idx) {
  if (!s.pendingChoice) return { ok: false, msg: 'No decision pending.' };
  const e = CHOICE_EVENTS.find((x) => x.id === s.pendingChoice.id);
  s.pendingChoice = null;
  if (!e || !e.options[idx]) return { ok: false, msg: 'That choice is unavailable.' };
  const d = e.options[idx].outcome(s) || {};
  if (d.money) s.money += Math.round(d.money);
  if (d.fame) gainFame(s, d.fame);
  if (d.rep) s.reputation = clamp(s.reputation + d.rep, 0, 100);
  if (d.acting) s.acting = clamp(+(s.acting + d.acting).toFixed(1), 0, 100);
  if (d.energy) s.energy = clamp(s.energy + d.energy, 0, s.maxEnergy);
  if (d.rivalry) for (const r of (s.rivals || [])) r.rivalry = clamp(r.rivalry + d.rivalry, 0, 100);
  if (d.partnerRel && s.partner) {
    const p = s.contacts.find((c) => c.id === s.partner);
    if (p) p.rel = clamp(p.rel + d.partnerRel, 0, 100);
  }
  if (d.msg) pushLog(s, `🎬 ${d.msg}`);
  return { ok: true, msg: d.msg || 'Decision made.' };
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
      gainFame(s, 3);
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
  addCredit(s, {
    title: `${sh.title} (${sh.season} season${sh.season > 1 ? 's' : ''})`,
    category: 'TV Series', role: sh.part, genre: sh.genreName,
    acted: true, lead: /lead/i.test(sh.part), costars: (sh.costars || []).map((c) => c.id),
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
  gainFame(s, fg);
  s.acting = clamp(+(s.acting + sg).toFixed(1), 0, 100);
  s.reputation = clamp(s.reputation + sh.prestige, 0, 100);
  s.careerPrestige += sh.prestige;
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
    s.careerPrestige += finale;
    s.reputation = clamp(s.reputation + finale, 0, 100);
    addCredit(s, {
      title: `${sh.title} (${sh.season} season${sh.season > 1 ? 's' : ''})`,
      category: 'TV Series', role: sh.part, genre: sh.genreName,
      acted: true, lead: /lead/i.test(sh.part), costars: (sh.costars || []).map((c) => c.id),
      quality: sh.ratings,
    });
    pushLog(s, `📉 "${sh.title}" was CANCELLED after ${sh.season} season(s) (${sh.ratings} rating). A ${sh.season >= 3 ? 'beloved' : 'brief'} run wraps. +${fg} fame.`);
    s.activeSeries = null;
  }
}

function awardGenreXp(s, genre, amount) {
  if (!s.genres || !genre) return;
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
    s.offers.push(makeRole(s.fame, !s.hasAgent));
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
    gainFame(s, 0.5);
    msg += ' You made the final cut! +0.5 fame.';
  }
  pushLog(s, `🎬 ${msg}`);
  return { ok: true, msg: `Earned $${pay} on set.` };
}

// Signing an agent is the early-game graduation: it takes a real body of work,
// not just a viral moment. Once signed, the casting board opens up to the bigger
// roles (studio films, series-regular TV) that open calls never offer.
export const AGENT_FAME_REQ = 18;
export const AGENT_CREDITS_REQ = 3;

export function agentReady(s) {
  const credits = s.filmography.length;
  return {
    credits,
    needFame: AGENT_FAME_REQ,
    needCredits: AGENT_CREDITS_REQ,
    met: s.fame >= AGENT_FAME_REQ && credits >= AGENT_CREDITS_REQ,
  };
}

export function toggleAgent(s) {
  if (s.gameOver) return { ok: false, msg: 'The game is over.' };
  if (!s.hasAgent) {
    const req = agentReady(s);
    if (!req.met) {
      return {
        ok: false,
        msg: `No agent will sign you yet — need ${AGENT_FAME_REQ} fame & ${AGENT_CREDITS_REQ} credits (you have ${Math.floor(s.fame)} fame, ${req.credits} credit${req.credits === 1 ? '' : 's'}).`,
      };
    }
    s.hasAgent = true;
    pushLog(s, '🕴️ You signed with a talent agent! The big auditions — studio films, series regular roles — are open to you now. They take a cut, but it\'s worth it.');
    refreshOffers(s);
    return { ok: true, msg: 'Signed with an agent! The real auditions begin.' };
  }
  s.hasAgent = false;
  pushLog(s, '👋 You parted ways with your agent. Back to open calls.');
  refreshOffers(s);
  return { ok: true, msg: 'Dropped your agent.' };
}

// ---- Writing / Producing / Directing --------------------------------------
export function writeScript(s) {
  if (s.gameOver) return { ok: false, msg: 'The game is over.' };
  if (s.writing < 5) return { ok: false, msg: 'Take a screenwriting course first.' };
  if (s.energy < 30) return { ok: false, msg: 'Too tired to write.' };
  spendEnergy(s, 30);
  const quality = clamp(Math.round(s.writing * rf(0.6, 1.1) + rf(-5, 8)), 5, 100);
  const genre = GENRE_KEYS[Math.floor(Math.random() * GENRE_KEYS.length)];
  const script = {
    id: 'sc' + Math.random().toString(36).slice(2, 8),
    title: projectTitle(Math.random() < 0.5 ? 'movie' : 'tvshow'),
    genre,
    genreName: GENRES[genre].name,
    genreIcon: GENRES[genre].icon,
    quality,
  };
  s.scripts.push(script);
  // Learn by doing: every script sharpens your writing.
  const skillGain = +rf(0.3, 0.8).toFixed(2);
  s.writing = clamp(+(s.writing + skillGain).toFixed(1), 0, 100);
  s.stats.written = (s.stats.written || 0) + 1;
  pushLog(s, `✍️ You finished a ${script.genreName} script: "${script.title}" (quality ${quality}). +${skillGain} writing.`);
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
  // The studio makes the film — you keep an (Oscar-eligible) writing credit.
  // Tracked separately so it doesn't inflate your on-screen filmography.
  if (!s.writingCredits) s.writingCredits = [];
  s.writingCredits.push({
    title: sc.title, role: 'Writer', genre: sc.genreName, year: s.year, wk: absWeek(s),
    medium: 'film', written: true, writeQuality: sc.quality, quality: sc.quality,
  });
  pushLog(s, `💰 Sold "${sc.title}" to a studio for $${price}. You keep the writing credit.`);
  return { ok: true, msg: `Sold for $${price}.` };
}

// Produce a project (optionally directing it & using your own script).
// budget tiers determine cost & potential return.
export const BUDGET_TIERS = [
  { key: 'micro', name: 'Micro-budget', cost: 5000, scale: 1 },
  { key: 'mid', name: 'Mid-budget', cost: 25000, scale: 4 },
  { key: 'big', name: 'Blockbuster', cost: 120000, scale: 16 },
];

// Quality of a production before luck — shared by the wrap logic and the UI
// preview so they can never drift apart.
function prodQualityBase(scriptQuality, producing, directing, directed) {
  let base = scriptQuality * 0.5 + producing * 0.3;
  if (directed) base += directing * 0.25;
  return base;
}

// Pure projection the UI shows before you greenlight (ignores luck swings).
export function estimateProduction(s, { budgetKey, scriptId, direct }) {
  const tier = BUDGET_TIERS.find((b) => b.key === budgetKey);
  if (!tier) return null;
  const script = scriptId ? s.scripts.find((x) => x.id === scriptId) : null;
  const sq = script ? script.quality : 35;
  const base = prodQualityBase(sq, s.producing, s.directing, !!(direct && s.directing >= 5));
  const ql = Math.round(clamp(base * 0.6, 5, 100));
  const qe = Math.round(clamp(base * 0.925, 5, 100));
  const qh = Math.round(clamp(base * 1.25, 5, 100));
  const grossAt = (q) => Math.round(tier.cost * (0.4 + (q / 100) * 2.4));
  return {
    cost: tier.cost,
    affordable: s.money >= tier.cost,
    qLow: ql, qExp: qe, qHigh: qh,
    grossExp: grossAt(qe),
  };
}

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
  const genre = (script && script.genre) || GENRE_KEYS[Math.floor(Math.random() * GENRE_KEYS.length)];
  const prod = {
    id: 'pr' + Math.random().toString(36).slice(2, 8),
    title: script ? script.title : projectTitle('movie'),
    budgetKey: tier.key,
    budgetName: tier.name,
    cost: tier.cost,
    scale: tier.scale,
    scriptQuality: script ? script.quality : 35,
    written: !!script,                 // produced from your own screenplay
    genre,
    genreName: GENRES[genre].name,
    genreIcon: GENRES[genre].icon,
    directed: !!direct,
    weeksLeft: weeks,
    totalWeeks: weeks,
  };
  s.productions.push(prod);
  pushLog(s, `🎬 You're producing ${prod.genreName} project "${prod.title}" (${tier.name})${direct ? ' and directing it' : ''}.`);
  return { ok: true, msg: `Production started on "${prod.title}".` };
}

function wrapProduction(s, prod) {
  // Quality blends script, your producing/directing skill, and luck.
  let q = prodQualityBase(prod.scriptQuality, s.producing, s.directing, prod.directed) * rf(0.6, 1.25);
  q = clamp(q, 5, 100);

  // Box office return scales with budget tier & quality.
  const gross = Math.round(prod.cost * (0.4 + (q / 100) * 2.4) * rf(0.7, 1.3));
  const profit = gross - prod.cost;
  s.money += gross;
  const fameGain = +(q / 100 * 6 * Math.sqrt(prod.scale)).toFixed(1);
  gainFame(s, fameGain);
  const prestige = +(q / 100 * (prod.directed ? 2 : 1.2) * Math.sqrt(prod.scale)).toFixed(2);
  s.careerPrestige += prestige;
  s.reputation = clamp(s.reputation + q / 25, 0, 100);
  if (prod.directed) s.directing = clamp(+(s.directing + 1).toFixed(1), 0, 100);
  s.producing = clamp(+(s.producing + 1).toFixed(1), 0, 100);
  awardGenreXp(s, prod.genre, 1 + prestige);

  addCredit(s, {
    title: prod.title, category: 'Produced', genre: prod.genreName,
    role: [prod.directed ? 'Director' : null, 'Producer', prod.written ? 'Writer' : null].filter(Boolean).join(' / '),
    produced: true, directed: prod.directed, written: !!prod.written,
    writeQuality: prod.scriptQuality, quality: Math.round(q),
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
  if (d.fame) gainFame(s, d.fame);
  if (d.acting) s.acting = clamp(+(s.acting + d.acting).toFixed(1), 0, 100);
  if (d.reputation) s.reputation = clamp(+(s.reputation + d.reputation).toFixed(1), 0, 100);
  if (d.energyPenalty) s.energyPenalty = (s.energyPenalty || 0) + d.energyPenalty;
}

// ---- Filmography credits ---------------------------------------------------
function absWeek(s) { return (s.year - 1) * WEEKS_PER_YEAR + s.week; }

// Record a completed credit, stamping awards-eligibility metadata.
function addCredit(s, c) {
  s.filmography.push({
    year: s.year,
    wk: absWeek(s),
    medium: creditMedium(c.category),
    acted: !!c.acted,        // a performance (eligible for acting awards)
    lead: !!c.lead,
    produced: !!c.produced,
    directed: !!c.directed,
    written: !!c.written,    // you wrote it (eligible for screenplay)
    ...c,
  });
}

// ---- Awards season ---------------------------------------------------------
// Is a credit eligible for a given category?
function eligibleFor(c, cat) {
  if (cat.kind === 'acting') {
    if (!c.acted) return false;                    // performances only
    if (c.medium !== cat.medium) return false;
    if (cat.lead != null && !!c.lead !== cat.lead) return false;
    return true;
  }
  if (cat.kind === 'writing') return !!c.written && c.medium === 'film';
  if (cat.kind === 'directing') return !!c.directed && c.medium === 'film';
  if (cat.kind === 'producing') return !!c.produced && c.medium === 'film';
  return false;
}

// Co-stars from the honored project share the moment: relationships warm
// (more for a win), and your partner is especially thrilled. Returns names for
// the awards-night summary.
function costarReactions(s, credit, won) {
  const names = [];
  const ids = credit.costars || [];
  for (const id of ids) {
    const c = s.contacts.find((x) => x.id === id);
    if (!c) continue;
    c.rel = clamp(c.rel + (won ? rf(4, 9) : rf(1, 4)), 0, 100);
    names.push(c.name);
  }
  if (s.partner) {
    const p = s.contacts.find((x) => x.id === s.partner);
    if (p) {
      p.rel = clamp(p.rel + (won ? rf(3, 6) : rf(1, 3)), 0, 100);
      if (!names.includes(p.name)) names.push(p.name);
    }
  }
  return names;
}

// Judge one category. Realism over a whole career: a nomination is a selective
// honor (your work must clear an absolute industry bar, higher at more
// prestigious ceremonies), and even when nominated you're one of ~5 — winning is
// roughly a 1-in-5 draw, tilted only modestly by how exceptional the work is.
function judgeCategory(s, credit, cat, cer) {
  const craft = cat.kind === 'directing' ? s.directing
    : cat.kind === 'producing' ? s.producing
      : cat.kind === 'writing' ? s.writing : s.acting;
  // Writing is judged on the screenplay's quality, not the finished film's.
  const workQuality = cat.kind === 'writing' ? (credit.writeQuality ?? credit.quality ?? 40) : (credit.quality ?? 40);
  // Campaign strength ~0..100: work quality dominates, with craft, reputation
  // (industry respect/campaigning) and fame contributing.
  const strength = workQuality * 0.55 + craft * 0.25 + s.reputation * 0.12 + s.fame * 0.08;

  // Nomination bar climbs with the ceremony's prestige (Oscars hardest).
  const bar = 60 + cer.prestige * 11;
  const nomChance = clamp((strength - bar) / 40, 0, 0.7);
  if (Math.random() >= nomChance) return { nominated: false, won: false };

  // Among five nominees, the best work is favored but upsets are common.
  const edge = clamp((strength - bar) / 65, 0, 0.32);
  const winChance = clamp(0.14 + edge, 0.07, 0.46);
  return { nominated: true, won: Math.random() < winChance };
}

function runCeremony(s, cer) {
  const now = absWeek(s);
  // Both on-screen credits and sold screenplays can be in contention.
  const all = [...s.filmography, ...(s.writingCredits || [])];
  const eligible = all.filter((c) => c.wk != null && c.wk > now - WEEKS_PER_YEAR && c.wk <= now);
  const results = [];
  for (const cat of cer.categories) {
    const pool = eligible.filter((c) => eligibleFor(c, cat));
    if (!pool.length) continue;
    // Your best eligible credit is submitted for this category.
    const mine = pool.reduce((a, b) => ((b.quality ?? 0) > (a.quality ?? 0) ? b : a));
    const res = judgeCategory(s, mine, cat, cer);
    if (!res.nominated) continue;

    s.awards.push({
      ceremony: cer.name, ceremonyKey: cer.key, icon: cer.icon,
      category: cat.name, project: mine.title, year: s.year, won: res.won,
    });
    const reactions = costarReactions(s, mine, res.won);
    const rival = pickRival(s);
    let beatenBy = null;
    if (res.won) {
      s.stats.wins = (s.stats.wins || 0) + 1;
      gainFame(s, 4 * cer.prestige);
      s.reputation = clamp(s.reputation + 6 * cer.prestige, 0, 100);
      // A rival you beat is none too pleased.
      if (rival) rival.rivalry = clamp(rival.rivalry + rf(2, 5), 0, 100);
      pushLog(s, `🥇 WON ${cat.name} at the ${cer.name} for "${mine.title}"!`);
    } else {
      s.stats.noms = (s.stats.noms || 0) + 1;
      gainFame(s, 1.5 * cer.prestige);
      s.reputation = clamp(s.reputation + 2 * cer.prestige, 0, 100);
      // Often a rival is the one who beats you — fuel for the rivalry.
      if (rival && Math.random() < 0.6) {
        rival.rivalry = clamp(rival.rivalry + rf(3, 7), 0, 100);
        rival.fame = Math.round(clamp(rival.fame + rf(0.5, 2), 1, 100));
        beatenBy = rival.name;
      }
      pushLog(s, `🎗️ Nominated for ${cat.name} at the ${cer.name} ("${mine.title}")${beatenBy ? ` — lost to ${beatenBy}` : ''}.`);
    }
    results.push({ category: cat.name, project: mine.title, won: res.won, reactions, beatenBy });
  }
  // Surface an awards-night summary to the UI when you were in the running.
  if (results.length) {
    s.ceremonyNight = {
      name: cer.name, icon: cer.icon, year: s.year,
      wins: results.filter((r) => r.won).length, results,
    };
  }
}

// ---- Milestones ------------------------------------------------------------
// Fire any newly-completed milestones, applying rewards. Idempotent.
export function checkMilestones(s) {
  if (!s.milestonesDone) s.milestonesDone = {};
  const newly = [];
  for (const m of MILESTONES) {
    if (s.milestonesDone[m.key]) continue;
    if (!m.check(s)) continue;
    s.milestonesDone[m.key] = s.year;
    const r = m.reward || {};
    if (r.money) s.money += r.money;
    if (r.rep) s.reputation = clamp(s.reputation + r.rep, 0, 100);
    if (r.fame) gainFame(s, r.fame);
    const bits = [r.money ? `+$${r.money}` : null, r.rep ? `+${r.rep} rep` : null, r.fame ? `+${r.fame} fame` : null].filter(Boolean);
    pushLog(s, `🎯 Milestone reached: ${m.icon} ${m.name}!${bits.length ? ' ' + bits.join(', ') : ''}`);
    newly.push(m);
  }
  return newly;
}

// ---- Legacy / retirement ---------------------------------------------------
// Pure: a career's legacy score and Hall of Fame rank.
export function careerLegacy(s) {
  const wins = s.stats.wins || 0;
  const noms = s.stats.noms || 0;
  const oscarWins = s.awards.filter((a) => a.ceremonyKey === 'oscars' && a.won).length;
  const score = Math.round(
    s.fame * 1.2
    + wins * 9 + oscarWins * 12 + noms * 2.5
    + (s.careerPrestige || 0) * 1.2
    + s.filmography.length * 0.6
    + s.reputation * 0.4,
  );
  let rank = HALL_OF_FAME[0];
  for (const t of HALL_OF_FAME) if (score >= t.min) rank = t;
  return { score, rank, lifetimeAchievement: score >= LIFETIME_ACHIEVEMENT_MIN, wins, noms, oscarWins };
}

export function retire(s) {
  if (s.gameOver) return { ok: false, msg: 'The game is already over.' };
  const legacy = careerLegacy(s);
  if (legacy.lifetimeAchievement) {
    s.awards.push({
      ceremony: 'Lifetime Achievement', ceremonyKey: 'lifetime', icon: '🎖️',
      category: 'Lifetime Achievement Award', project: 'a storied career', year: s.year, won: true,
    });
  }
  s.legacy = legacy;
  s.gameOver = true;
  s.gameOverReason = 'retired';
  pushLog(s, `🎬 After ${s.year} year(s) in the business, ${s.name} retires as a ${legacy.rank.icon} ${legacy.rank.label}.`);
  return { ok: true, msg: 'You retired. Take a bow.' };
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
      gainFame(s, fameGain);
      s.acting = clamp(+(s.acting + a.role.skillGain).toFixed(1), 0, 100);
      s.reputation = clamp(s.reputation + a.role.prestige * 2, 0, 100);
      s.careerPrestige += a.role.prestige;
      awardGenreXp(s, a.role.genre, 1.5 + a.role.prestige);
      addCredit(s, {
        title: a.role.title, category: a.role.catName,
        role: a.role.part, genre: a.role.genreName,
        acted: true, lead: /lead/i.test(a.role.part),
        costars: (a.costars || []).map((c) => c.id),
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
    updateRivals(s);
    pushLog(s, `📅 A new year begins. You are now ${s.age}.`);
  }

  // Awards season: ceremonies fall on specific weeks through the year.
  for (const cer of CEREMONIES) {
    if (s.week === cer.week) runCeremony(s, cer);
  }

  // Career milestones (passive completions: fame/money thresholds, awards, etc.)
  checkMilestones(s);

  // A narrative dilemma may surface this week.
  maybeTriggerChoice(s);

  // Lose condition: deep, sustained debt
  if (s.money < D.debtFloor) {
    s.gameOver = true;
    s.gameOverReason = 'bankrupt';
    s.legacy = careerLegacy(s);
    pushLog(s, '💀 Bankrupt. You leave town, dreams unfulfilled. Game over.');
  }
}
