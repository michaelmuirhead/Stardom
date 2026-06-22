// engine.js — core game mechanics
import {
  WEEKS_PER_YEAR, AGENT_CUT, CLASSES, EVENTS,
  DIFFICULTIES, GENRES, GENRE_KEYS, CEREMONIES, FESTIVALS, creditMedium,
  HALL_OF_FAME, LIFETIME_ACHIEVEMENT_MIN, MILESTONES, CHOICE_EVENTS,
  ASSETS, taxFor, CATEGORIES, fameQuote, STUDIOS, BRANDS,
  AGENT_TIERS, PUBLICIST_FEE, MANAGER_CUT,
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

// ---- Age & health ----------------------------------------------------------
export function agePhase(age) {
  if (age < 30) return { key: 'rising', label: 'Rising' };
  if (age < 45) return { key: 'prime', label: 'In Their Prime' };
  if (age < 60) return { key: 'veteran', label: 'Veteran' };
  return { key: 'legacy', label: 'Elder Statesman' };
}

// Age-driven max energy: stamina tapers past 50.
function maxEnergyForAge(age) {
  return Math.round(clamp(100 - Math.max(0, age - 50) * 0.9, 55, 100));
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

// All work income flows through here. Tax is withheld pay-as-you-earn at the
// exact progressive marginal rate, so there's no year-end lump-sum shock.
function earn(s, amount) {
  if (amount <= 0) { s.money += amount; return; }
  const before = s.yearIncome || 0;
  s.yearIncome = before + amount;
  const taxDelta = taxFor(s.yearIncome) - taxFor(before);
  s.taxWithheld = (s.taxWithheld || 0) + taxDelta;
  s.money += amount - taxDelta;   // take-home, after tax
}

// ---- Royalties / residuals -------------------------------------------------
// Hired talent doesn't get box office, but a hit pays residuals for years.
// Grants a decaying weekly trickle scaled to the release's success & your billing.
function grantRoyalty(s, title, result, billing) {
  if (!result) return;
  const bf = billing === 'lead' ? 1 : billing === 'supporting' ? 0.4 : billing === 'cameo' ? 0.12 : 0.6;
  const weekly0 = result.type === 'box'
    ? Math.round(result.value * 0.00006 * bf)   // ~0.2% of box office over its run
    : Math.round(result.value * 220 * bf);       // viewership (millions) → $/wk
  if (weekly0 < 100) return;                     // negligible — skip flops
  if (!s.royalties) s.royalties = [];
  s.royalties.push({ title, weekly: weekly0, weeksLeft: 104 });
}

// Pay out & decay residuals each week. Returns the week's total (for display).
function payRoyalties(s) {
  if (!s.royalties || !s.royalties.length) return 0;
  let total = 0;
  for (const r of s.royalties) {
    earn(s, r.weekly);
    total += r.weekly;
    r.weekly = Math.round(r.weekly * 0.975); // ~2.5%/wk decay
    r.weeksLeft--;
  }
  s.royalties = s.royalties.filter((r) => r.weeksLeft > 0 && r.weekly >= 50);
  return total;
}

// ---- Lifestyle assets ------------------------------------------------------
export function ownedAssets(s) {
  return ASSETS.filter((a) => (s.assets || []).includes(a.key));
}
function lifestyleUpkeep(s) { return ownedAssets(s).reduce((t, a) => t + a.upkeep, 0); }
function lifestyleEnergy(s) { return ownedAssets(s).reduce((t, a) => t + a.energy, 0); }

export function buyAsset(s, key) {
  if (s.gameOver) return { ok: false, msg: 'The game is over.' };
  const a = ASSETS.find((x) => x.key === key);
  if (!a) return { ok: false, msg: 'Unknown purchase.' };
  if ((s.assets || []).includes(key)) return { ok: false, msg: 'You already own that.' };
  if (s.money < a.cost) return { ok: false, msg: 'You can\'t afford that.' };
  s.money -= a.cost;
  if (!s.assets) s.assets = [];
  s.assets.push(key);
  gainFame(s, a.fame);
  s.reputation = clamp(s.reputation + a.rep, 0, 100);
  pushLog(s, `${a.icon} You bought a ${a.name}! +${a.fame} fame, but +$${a.upkeep}/wk upkeep.`);
  return { ok: true, msg: `Bought a ${a.name}.` };
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
  chance += agentOdds(s);
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
  // Ageism: leading roles get harder past your mid-40s — fame softens the blow.
  // (Behind-the-camera work via pitching/producing is unaffected.)
  if (role.billing === 'lead' && s.age > 45) {
    chance -= Math.max(0, s.age - 45) * 0.008 * (1 - s.fame / 150);
  }
  // Poor health reads on camera and saps your auditions.
  if ((s.health ?? 100) < 50) chance -= (50 - s.health) / 300;
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

  const chance = clamp(0.32 + s.reputation / 200 + s.fame / 220 + (s.hasAgent ? 0.25 : 0) + (s.manager ? 0.12 : 0), 0.1, 0.95);
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
  if (s.pendingChoice || s.ceremonyNight || s.releaseNight || s.gameOver) return;
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
  // On-set deltas: rehearsal prep for the current shoot, and co-star bonding.
  const proj = s.active
    || (s.activeSeries && s.activeSeries.status === 'filming' ? s.activeSeries : null)
    || s.productions.find((p) => p.star && p.weeksLeft > 0);
  if (d.prep && proj) proj.prep = clamp((proj.prep || 0) + d.prep, 0, 4);
  if (d.costarRel && proj) for (const c of (proj.costars || [])) c.rel = clamp(c.rel + d.costarRel, 0, 100);
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

// Push for a bigger raise on a just-renewed series. A hit gives you leverage;
// fame, reputation and an agent help. One shot per renewal.
export function negotiateRenewal(s) {
  const sh = s.activeSeries;
  if (!sh || !sh.pendingRenewal) return { ok: false, msg: 'Nothing to renegotiate.' };
  sh.pendingRenewal = false;
  const chance = clamp(0.3 + sh.ratings / 200 + s.reputation / 250 + s.fame / 300 + (s.hasAgent ? 0.2 : 0) + (s.manager ? 0.12 : 0), 0.1, 0.95);
  if (Math.random() < chance) {
    const bump = rf(0.15, 0.45);
    sh.salary = Math.round(sh.salary * (1 + bump));
    pushLog(s, `🤝 You renegotiated your "${sh.title}" deal — salary up ${Math.round(bump * 100)}% to $${sh.salary.toLocaleString()}/season.`);
    return { ok: true, msg: `Salary bumped ${Math.round(bump * 100)}%!`, salary: sh.salary };
  }
  s.reputation = clamp(s.reputation - rf(0, 2), 0, 100);
  pushLog(s, `😐 The studio held firm on your "${sh.title}" salary.`);
  return { ok: false, msg: 'They held firm on the offer.' };
}

export function quitSeries(s) {
  if (!s.activeSeries) return { ok: false, msg: 'You\'re not on a series.' };
  const sh = s.activeSeries;
  addCredit(s, {
    title: `${sh.title} (${sh.season} season${sh.season > 1 ? 's' : ''})`,
    category: 'TV Series', role: sh.part, genre: sh.genreName,
    acted: true, billing: 'lead', lead: true, costars: (sh.costars || []).map((c) => c.id),
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

  // Ratings drive renewal: your fame & craft + co-star draw + rehearsal, minus fatigue.
  sh.ratings = Math.round(clamp(
    s.fame * 0.5 + s.acting * 0.2 + starPower * 0.3 + (sh.prep || 0) * 3 + rf(-8, 14) - (sh.season - 1) * 4,
    5, 100,
  ));
  const renewChance = clamp(sh.ratings / 110 + diffOf(s).oddsBonus, 0.08, 0.93);
  const rec = reception(sh.ratings);
  // Viewership (millions) scales with the rating.
  const viewers = +(3 + sh.ratings / 100 * 18 * rf(0.8, 1.3)).toFixed(1);
  const seasonNo = sh.season;
  grantRoyalty(s, `${sh.title} S${seasonNo}`, { type: 'views', value: viewers }, 'lead');

  if (Math.random() < renewChance) {
    // Market raise scales with the show's success — a hit explodes your fee.
    const oldSalary = sh.salary;
    const growth = 1 + 0.1 + (sh.ratings / 100) * 0.6;
    sh.season++;
    sh.salary = Math.round(sh.salary * growth);
    sh.weeksLeft = SERIES_SEASON_WEEKS;
    sh.totalWeeks = SERIES_SEASON_WEEKS;
    sh.prep = 0;                                // fresh prep each season
    sh.status = 'filming';
    sh.pendingRenewal = true;                   // you may renegotiate this offer
    s.stats.seasons++;
    const raisePct = Math.round((sh.salary / oldSalary - 1) * 100);
    pushLog(s, `📈 "${sh.title}" was RENEWED for season ${sh.season}! (${sh.ratings} rating, +${raisePct}% to $${sh.salary.toLocaleString()}/season). +${fg} fame.`);
    s.releaseNight = {
      title: sh.title, icon: '📡', category: `TV Series · Season ${seasonNo}`,
      role: sh.part, genre: sh.genreName, quality: sh.ratings, reception: rec.label, emoji: rec.emoji,
      result: { type: 'views', value: viewers }, rating: sh.ratings, verdict: `Renewed for Season ${sh.season}`,
      fameGain: fg, costars: (sh.costars || []).map((c) => c.name),
      renewalOffer: { salary: sh.salary, raisePct },
    };
  } else {
    // Cancellation: a long run earns a prestigious finale.
    const finale = +(sh.prestige * Math.min(sh.season, 6) * 0.6).toFixed(2);
    s.careerPrestige += finale;
    s.reputation = clamp(s.reputation + finale, 0, 100);
    addCredit(s, {
      title: `${sh.title} (${sh.season} season${sh.season > 1 ? 's' : ''})`,
      category: 'TV Series', role: sh.part, genre: sh.genreName,
      acted: true, billing: 'lead', lead: true, costars: (sh.costars || []).map((c) => c.id),
      quality: sh.ratings, reception: rec.label, result: { type: 'views', value: viewers },
    });
    pushLog(s, `📉 "${sh.title}" was CANCELLED after ${sh.season} season(s) (${sh.ratings} rating). A ${sh.season >= 3 ? 'beloved' : 'brief'} run wraps. +${fg} fame.`);
    s.releaseNight = {
      title: sh.title, icon: '📡', category: `TV Series · ${seasonNo} season${seasonNo > 1 ? 's' : ''}`,
      role: sh.part, genre: sh.genreName, quality: sh.ratings, reception: rec.label, emoji: rec.emoji,
      result: { type: 'views', value: viewers }, rating: sh.ratings, verdict: 'Cancelled — the show wraps',
      fameGain: fg, costars: (sh.costars || []).map((c) => c.name),
    };
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
  s.health = clamp((s.health ?? 100) + 2, 0, 100);
  pushLog(s, `😴 You rested. +${gain} energy.`);
  return { ok: true, msg: 'Recharged.' };
}

// Invest in your wellbeing: a spa/retreat/trainer week restores health & energy.
const WELLNESS_COST = 12000;
export function wellness(s) {
  if (s.gameOver) return { ok: false, msg: 'The game is over.' };
  if (s.money < WELLNESS_COST) return { ok: false, msg: 'You can\'t afford a wellness retreat right now.' };
  if ((s.health ?? 100) >= 100 && s.energy >= s.maxEnergy) return { ok: false, msg: 'You\'re already in peak shape.' };
  s.money -= WELLNESS_COST;
  const hg = rf(10, 20);
  s.health = clamp((s.health ?? 100) + hg, 0, 100);
  s.energy = clamp(s.energy + 25, 0, s.maxEnergy);
  pushLog(s, `🧘 You spent a week on wellness (trainer, spa, therapy). +${hg.toFixed(0)} health.`);
  return { ok: true, msg: 'Refreshed and restored.' };
}

export function sideJob(s) {
  if (s.gameOver) return { ok: false, msg: 'The game is over.' };
  if (s.energy < 20) return { ok: false, msg: 'Too tired for a shift.' };
  spendEnergy(s, 20);
  const pay = 2500 + Math.floor(Math.random() * 1500);
  earn(s, pay);
  pushLog(s, `🍽️ Worked a serving shift. +$${pay}.`);
  return { ok: true, msg: `Earned $${pay}.` };
}

// Background/extra work: the always-available on-theme floor gig. It roughly
// keeps the lights on (a profit on Easy, a slow bleed on Normal, brutal on Hard)
// while building a little craft — enough to survive on, never enough to escape.
const EXTRA_PAY = 1400;
const EXTRA_ENERGY = 14;
export function extraWork(s) {
  if (s.gameOver) return { ok: false, msg: 'The game is over.' };
  if (isBusy(s)) return { ok: false, msg: 'You can\'t do extra work while on a project.' };
  if (s.energy < EXTRA_ENERGY) return { ok: false, msg: 'Too tired for a day on set.' };
  spendEnergy(s, EXTRA_ENERGY);
  const pay = Math.round(EXTRA_PAY * diffOf(s).payMult * rf(0.8, 1.2));
  earn(s, pay);
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

// ---- Representation helpers ----
export function agentTierInfo(s) {
  return AGENT_TIERS.find((t) => t.key === s.agentTier) || (s.hasAgent ? AGENT_TIERS[0] : null);
}
export function agentTierReady(s, tier) {
  return s.fame >= tier.fameReq && s.filmography.length >= tier.credReq;
}
function representationCut(s) {
  const t = agentTierInfo(s);
  return (t ? t.cut : 0) + (s.manager ? MANAGER_CUT : 0);
}
function agentOdds(s) {
  const t = agentTierInfo(s);
  return t ? t.odds : 0;
}

export function signAgent(s, tierKey) {
  if (s.gameOver) return { ok: false, msg: 'The game is over.' };
  const tier = AGENT_TIERS.find((t) => t.key === tierKey);
  if (!tier) return { ok: false, msg: 'Unknown agency.' };
  if (s.agentTier === tierKey) return { ok: false, msg: 'They already represent you.' };
  if (!agentTierReady(s, tier)) {
    return { ok: false, msg: `${tier.name} won't sign you yet — need ${tier.fameReq} fame & ${tier.credReq} credits.` };
  }
  const upgrade = s.hasAgent;
  s.agentTier = tierKey;
  s.hasAgent = true;
  pushLog(s, `${tier.icon} You ${upgrade ? 'switched to' : 'signed with'} ${tier.name} (${Math.round(tier.cut * 100)}% cut). Bigger auditions await.`);
  refreshOffers(s);
  return { ok: true, msg: `${upgrade ? 'Upgraded to' : 'Signed with'} ${tier.name}.` };
}

export function dropAgent(s) {
  if (!s.hasAgent) return { ok: false, msg: 'You have no agent.' };
  s.agentTier = null;
  s.hasAgent = false;
  pushLog(s, '👋 You parted ways with your agent. Back to open calls.');
  refreshOffers(s);
  return { ok: true, msg: 'Dropped your agent.' };
}

// Hire/fire a publicist (weekly retainer) or manager (a cut for clout).
export function toggleStaff(s, who) {
  if (s.gameOver) return { ok: false, msg: 'The game is over.' };
  if (who === 'publicist') {
    s.publicist = !s.publicist;
    pushLog(s, s.publicist ? `📣 Hired a publicist ($${PUBLICIST_FEE.toLocaleString()}/wk) — they\'ll soften scandals and amplify good press.` : '📣 Let your publicist go.');
    return { ok: true, msg: s.publicist ? 'Publicist hired.' : 'Publicist released.' };
  }
  if (who === 'manager') {
    s.manager = !s.manager;
    pushLog(s, s.manager ? `📋 Hired a manager (${Math.round(MANAGER_CUT * 100)}% cut) — sharper deals and renewals.` : '📋 Let your manager go.');
    return { ok: true, msg: s.manager ? 'Manager hired.' : 'Manager released.' };
  }
  return { ok: false, msg: 'Unknown role.' };
}

// Back-compat: sign the best agency you qualify for, or drop your agent.
export function toggleAgent(s) {
  if (s.gameOver) return { ok: false, msg: 'The game is over.' };
  if (s.hasAgent) return dropAgent(s);
  const best = [...AGENT_TIERS].reverse().find((t) => agentTierReady(s, t));
  if (!best) {
    const req = agentReady(s);
    return { ok: false, msg: `No agent will sign you yet — need ${AGENT_FAME_REQ} fame & ${AGENT_CREDITS_REQ} credits (you have ${Math.floor(s.fame)} fame, ${req.credits}).` };
  }
  return signAgent(s, best.key);
}

// ---- Social media & endorsements ------------------------------------------
// Post to your fanbase: builds followers & a little fame; can go viral.
export function socialPost(s) {
  if (s.gameOver) return { ok: false, msg: 'The game is over.' };
  if (s.energy < 8) return { ok: false, msg: 'Too tired to post.' };
  spendEnergy(s, 8);
  let gained = rf(0.15, 0.7) * (1 + s.fame / 60) * (s.publicist ? 1.3 : 1);
  let fameUp = rf(0.1, 0.4);
  const viral = Math.random() < (0.08 + (s.publicist ? 0.04 : 0));
  if (viral) { gained *= 5; fameUp *= 4; }
  s.followers = +((s.followers || 0) + gained).toFixed(2);
  gainFame(s, fameUp);
  pushLog(s, viral
    ? `📈 Your post went VIRAL! +${gained.toFixed(1)}M followers.`
    : `📱 You posted for your fans. +${gained.toFixed(2)}M followers.`);
  return { ok: true, msg: viral ? 'Went viral!' : 'Posted.' };
}

function makeBrandOffer(s) {
  const weeks = [12, 26, 52][Math.floor(Math.random() * 3)];
  const weekly = Math.round((s.fame * 220 + (s.followers || 0) * 9000) * rf(0.7, 1.4) * (s.publicist ? 1.15 : 1));
  return {
    id: 'bd' + Math.random().toString(36).slice(2, 8),
    brand: BRANDS[Math.floor(Math.random() * BRANDS.length)],
    weeks, weekly, fame: +rf(0.5, 2).toFixed(1),
  };
}

export function refreshBrandOffers(s) {
  if (s.fame < 8) { s.brandOffers = []; return; }
  const n = 1 + Math.floor(Math.random() * 3);
  s.brandOffers = Array.from({ length: n }, () => makeBrandOffer(s));
}

export function acceptBrandDeal(s, id) {
  if (s.gameOver) return { ok: false, msg: 'The game is over.' };
  const i = (s.brandOffers || []).findIndex((o) => o.id === id);
  if (i < 0) return { ok: false, msg: 'That offer is gone.' };
  const o = s.brandOffers[i];
  if (!s.endorsements) s.endorsements = [];
  s.endorsements.push({ brand: o.brand, weekly: o.weekly, weeksLeft: o.weeks });
  s.brandOffers.splice(i, 1);
  gainFame(s, o.fame);
  pushLog(s, `🤝 Signed a ${o.brand} endorsement — $${o.weekly.toLocaleString()}/wk for ${o.weeks} weeks.`);
  return { ok: true, msg: `Endorsing ${o.brand}.` };
}

// Weekly: pay endorsements, age the fanbase toward your fame, refresh offers.
function tickSocial(s) {
  if (s.endorsements && s.endorsements.length) {
    for (const e of s.endorsements) { earn(s, e.weekly); e.weeksLeft--; }
    s.endorsements = s.endorsements.filter((e) => e.weeksLeft > 0);
    const over = s.endorsements.length - 1;          // overexposure beyond one deal
    if (over > 0) s.reputation = clamp(s.reputation - over * 0.4, 0, 100);
  }
  const target = s.fame * 0.45;                       // fanbase trends toward fame
  s.followers = +Math.max(0, (s.followers || 0) + (target - (s.followers || 0)) * 0.04).toFixed(2);
  if (Math.random() < 0.15) refreshBrandOffers(s);
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

// Build a (display-only) sequence of studio bids that escalate to the final price.
function buildBids(base, finalPrice, war) {
  const pool = [...STUDIOS].sort(() => Math.random() - 0.5);
  if (!war) return { bids: [{ studio: pool[0], bid: finalPrice }], winner: pool[0] };
  const n = 2 + Math.floor(Math.random() * 3);   // 2-4 rival studios
  const steps = n + 1;
  const bids = [];
  let cur = Math.round(base * 0.6);
  for (let i = 0; i < steps; i++) {
    cur = i === steps - 1 ? finalPrice : Math.round(cur + (finalPrice - cur) * rf(0.3, 0.6));
    bids.push({ studio: pool[i % n], bid: cur });
  }
  return { bids, winner: bids[bids.length - 1].studio };
}

// Pitch a script to studios. Attach yourself as star/director/producer (gated by
// skill/fame). Returns rejection, a single offer, or a bidding war. On a deal you
// get a (fame/quality-scaled) sale price; if you attached creative roles, the
// studio greenlights the film and you make it (films over weeks → release).
export function pitchScript(s, scriptId, attach = {}) {
  if (s.gameOver) return { ok: false, msg: 'The game is over.' };
  if (isBusy(s)) return { ok: false, msg: 'Finish your current project before pitching.' };
  const idx = s.scripts.findIndex((x) => x.id === scriptId);
  if (idx < 0) return { ok: false, msg: 'Script not found.' };
  const sc = s.scripts[idx];
  const want = { star: !!attach.star, direct: !!attach.direct, produce: !!attach.produce };
  if (want.direct && s.directing < 5) return { ok: false, msg: 'You need directing skill to attach as director.' };
  if (want.produce && s.producing < 5) return { ok: false, msg: 'You need producing skill to attach as producer.' };

  // Studios love a great script; attaching an unbankable you scares them off.
  let heat = sc.quality * 0.7 + s.reputation * 0.3 + s.fame * 0.35;
  if (want.star && s.fame < 40) heat -= (40 - s.fame) * 0.6;     // not bankable as lead
  if (want.direct && s.directing < 35) heat -= 8;
  if (want.produce) heat -= 4;
  const acceptChance = clamp(heat / 95, 0.05, 0.95);

  if (Math.random() >= acceptChance) {
    s.reputation = clamp(s.reputation - rf(0, 1.5), 0, 100);
    const why = (want.star && s.fame < 40) ? ' (they wanted the script, not you attached as lead)' : '';
    pushLog(s, `🚪 Studios passed on "${sc.title}"${why}. Keep shopping it.`);
    return { ok: false, msg: `Passed on "${sc.title}".` };
  }

  // Hot scripts + a bankable name spark a bidding war.
  const warChance = clamp((sc.quality - 55) / 70 + s.fame / 220, 0, 0.7);
  const war = Math.random() < warChance;
  const base = sc.quality * 15000 * (0.6 + s.fame / 100);
  const priceMult = war ? rf(1.9, 4.0) : rf(0.85, 1.4);
  const price = Math.round(base * priceMult);
  earn(s, price);
  s.reputation = clamp(s.reputation + sc.quality / 25, 0, 100);
  s.scripts.splice(idx, 1);

  const anyAttach = want.star || want.direct || want.produce;
  if (!anyAttach) {
    // Writer-only sale → Oscar-eligible writing credit (kept off your on-screen list).
    if (!s.writingCredits) s.writingCredits = [];
    s.writingCredits.push({
      title: sc.title, role: 'Writer', genre: sc.genreName, year: s.year, wk: absWeek(s),
      medium: 'film', written: true, writeQuality: sc.quality, quality: sc.quality,
    });
    pushLog(s, war
      ? `🔥 BIDDING WAR over "${sc.title}"! Sold for $${price.toLocaleString()}. You keep the writing credit.`
      : `💰 Sold "${sc.title}" to a studio for $${price.toLocaleString()}. You keep the writing credit.`);
    const sale = buildBids(base, price, war);
    s.pitchNight = { title: sc.title, genre: sc.genreName, war, price, greenlit: false, attach: want, bids: sale.bids, winner: sale.winner };
    return { ok: true, war, price, msg: war ? `Bidding war! Sold for $${price.toLocaleString()}.` : `Sold for $${price.toLocaleString()}.` };
  }

  // Greenlit: the studio makes it with you attached. Film it like a role.
  const cat = CATEGORIES.movie;
  const roleFee = Math.round(cat.payBase * (want.star ? 1.5 : 0.5) * fameQuote(s.fame) * rf(0.85, 1.2));
  const role = {
    title: sc.title, category: 'movie', catName: 'Studio Film', icon: cat.icon,
    genre: sc.genre, genreName: sc.genreName, genreIcon: sc.genreIcon,
    billing: want.star ? 'lead' : 'supporting', part: want.star ? 'the Lead' : '(off-screen)',
    tier: 2,
    fameGain: +(cat.fameBase * 1.6 * (want.star ? 1.5 : 0.8)).toFixed(1),
    skillGain: +(cat.skillBase * 1.2).toFixed(1),
    prestige: +(cat.prestige * 1.3).toFixed(2),
    pay: roleFee,
  };
  s.active = {
    role, weeksLeft: 9, totalWeeks: 9, prep: 0,
    costars: castCostars(s), project: true, attach: want, scriptQuality: sc.quality,
  };
  const hats = [want.star ? 'star' : null, want.direct ? 'direct' : null, want.produce ? 'produce' : null].filter(Boolean).join('/');
  pushLog(s, war
    ? `🔥 BIDDING WAR over "${sc.title}"! Sold for $${price.toLocaleString()} and greenlit with you attached (${hats}). Filming begins.`
    : `🎬 "${sc.title}" sold for $${price.toLocaleString()} and greenlit with you attached (${hats}). Filming begins.`);
  const sale = buildBids(base, price, war);
  s.pitchNight = { title: sc.title, genre: sc.genreName, war, price, greenlit: true, attach: want, bids: sale.bids, winner: sale.winner };
  return { ok: true, war, price, greenlit: true, msg: war ? `Bidding war! "${sc.title}" greenlit.` : `"${sc.title}" greenlit.` };
}

// Wrap a pitched, self-attached studio project: blend the hats you wore into its
// quality, then release it (box office, reception, residuals, credit).
function wrapStudioProject(s, a) {
  const at = a.attach;
  let base = a.scriptQuality * 0.4 + (a.prep || 0) * 4;
  base += at.star ? s.acting * 0.4 : 25;
  if (at.direct) base += s.directing * 0.2;
  if (at.produce) base += s.producing * 0.1;
  const quality = clamp(Math.round(base * rf(0.8, 1.15)), 5, 100);
  const rec = reception(quality);
  const sc = scoreRelease(quality, s.fame, a.role.prestige);
  const comp = releaseCompetition(s);
  const result = applyCompetition(projectResult('Studio Film', 2, sc.audience, s.fame), comp);
  bondWithCostars(s, a.costars || []);
  const fameGain = +(a.role.fameGain * rec.fameMult).toFixed(1);
  gainFame(s, fameGain);
  if (at.star) s.acting = clamp(+(s.acting + a.role.skillGain).toFixed(1), 0, 100);
  if (at.direct) s.directing = clamp(+(s.directing + 1).toFixed(1), 0, 100);
  if (at.produce) s.producing = clamp(+(s.producing + 1).toFixed(1), 0, 100);
  s.reputation = clamp(s.reputation + a.role.prestige * 2 + rec.rep, 0, 100);
  s.careerPrestige += a.role.prestige;
  awardGenreXp(s, a.role.genre, 1.5 + a.role.prestige);
  const roles = [at.star ? 'Star' : null, at.direct ? 'Director' : null, at.produce ? 'Producer' : null, 'Writer'].filter(Boolean).join(' / ');
  addCredit(s, {
    title: a.role.title, category: 'Studio Film', role: roles, genre: a.role.genreName,
    acted: !!at.star, billing: at.star ? 'lead' : undefined, lead: !!at.star,
    directed: !!at.direct, produced: !!at.produce, written: true, writeQuality: a.scriptQuality,
    costars: (a.costars || []).map((c) => c.id), quality, reception: rec.label, result,
    critics: sc.critics, audience: sc.audience,
  });
  grantRoyalty(s, a.role.title, result, at.star ? 'lead' : 'supporting');
  maybeStartFranchise(s, { title: a.role.title, genre: a.role.genre, genreName: a.role.genreName, genreIcon: a.role.genreIcon, category: 'Studio Film', quality });
  pushLog(s, `🎞️ Your film "${a.role.title}" released — ${rec.emoji} ${rec.label} (🍅 ${sc.critics} / 🍿 ${sc.audience}). +${fameGain} fame.`);
  s.releaseNight = {
    title: a.role.title, icon: a.role.genreIcon, category: 'Your Studio Film', role: roles,
    genre: a.role.genreName, quality, reception: rec.label, emoji: rec.emoji,
    critics: sc.critics, audience: sc.audience,
    competition: comp && comp.factor < 1 ? comp.rival : null,
    result, fameGain, costars: (a.costars || []).map((c) => c.name),
  };
  s.active = null;
}

// Produce a project (optionally directing it & using your own script).
// budget tiers determine cost & potential return.
export const BUDGET_TIERS = [
  { key: 'micro', name: 'Micro-budget', cost: 400000, scale: 1 },
  { key: 'mid', name: 'Mid-budget', cost: 6000000, scale: 4 },
  { key: 'big', name: 'Blockbuster', cost: 60000000, scale: 16 },
];

// Quality of a production before luck — shared by the wrap logic and the UI
// preview so they can never drift apart.
function prodQualityBase(scriptQuality, producing, directing, directed) {
  let base = scriptQuality * 0.5 + producing * 0.3;
  if (directed) base += directing * 0.25;
  return base;
}

// Pure projection the UI shows before you greenlight (ignores luck swings).
export function estimateProduction(s, { budgetKey, scriptId, direct, star }) {
  const tier = BUDGET_TIERS.find((b) => b.key === budgetKey);
  if (!tier) return null;
  const script = scriptId ? s.scripts.find((x) => x.id === scriptId) : null;
  const sq = script ? script.quality : 35;
  let base = prodQualityBase(sq, s.producing, s.directing, !!(direct && s.directing >= 5));
  if (star) base += s.acting * 0.2;
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

export function startProduction(s, { budgetKey, scriptId, direct, star }) {
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
    star: !!star,                      // you cast yourself as the lead
    genre,
    genreName: GENRES[genre].name,
    genreIcon: GENRES[genre].icon,
    directed: !!direct,
    weeksLeft: weeks,
    totalWeeks: weeks,
  };
  if (star) prod.costars = castCostars(s);
  s.productions.push(prod);
  const hats = [star ? 'starring' : null, direct ? 'directing' : null].filter(Boolean).join(' & ');
  pushLog(s, `🎬 You're producing ${prod.genreName} project "${prod.title}" (${tier.name})${hats ? ' and ' + hats : ''}.`);
  return { ok: true, msg: `Production started on "${prod.title}".` };
}

// ---- Performance & reception ----------------------------------------------
// A role's on-screen quality is driven by your craft, genre comfort, how much
// you prepared, the project's prestige, and your billing — plus luck.
function performanceQuality(s, role, prep) {
  const aff = clamp(genreAffinity(s, role.genre), 0, 40);
  const billingBonus = role.billing === 'lead' ? 4 : role.billing === 'supporting' ? 2 : 0;
  const material = Math.min(role.prestige || 0, 3) * 2.5; // good material helps, capped
  // Your craft is the dominant factor; genre comfort, prep and material modify it.
  const base = s.acting * 0.75 + aff * 0.15 + (prep || 0) * 5 + billingBonus + material;
  return clamp(Math.round(base * rf(0.82, 1.15)), 5, 100);
}

// Rotten-Tomatoes-style split: critics reward craft & prestige; audiences reward
// broad appeal & star power. Derived from the work's quality so they track it.
function scoreRelease(quality, fame, prestige) {
  return {
    critics: Math.round(clamp(quality * 0.85 + (prestige || 0) * 6 + rf(-7, 7), 1, 100)),
    audience: Math.round(clamp(quality * 0.6 + fame * 0.2 + rf(-10, 12), 1, 100)),
  };
}

// How the work lands with audiences/critics, from its quality (+ luck).
function reception(quality) {
  const score = quality + rf(-12, 12);
  if (score < 35) return { label: 'Flop', fameMult: 0.6, rep: -2, emoji: '📉' };
  if (score < 60) return { label: 'Mixed Reviews', fameMult: 1.0, rep: 0, emoji: '➖' };
  if (score < 82) return { label: 'Hit', fameMult: 1.3, rep: 1, emoji: '👍' };
  return { label: 'Smash Hit', fameMult: 1.6, rep: 3, emoji: '🌟' };
}

// Concrete commercial result of a release: theatrical box office (USD) or
// streaming/TV viewership (millions), scaled by the project, its quality, and
// the player's drawing power.
function projectResult(category, tier, quality, fame) {
  const lk = rf(0.75, 1.35);
  const tierMult = [0.6, 1.0, 1.8][tier] ?? 1;
  const draw = (0.6 + fame / 100 * 0.8);
  if (category === 'Indie Film' || category === 'Studio Film') {
    const base = category === 'Indie Film' ? 1.6e6 : 42e6;
    return { type: 'box', value: Math.round(base * tierMult * (0.4 + quality / 100 * 2.2) * draw * lk) };
  }
  const baseV = category === 'Streaming Film' ? 22
    : category === 'Streaming Series' ? 14
      : category === 'TV Movie' ? 4 : 8;
  return { type: 'views', value: +(baseV * tierMult * (0.4 + quality / 100 * 1.8) * draw * lk).toFixed(1) };
}

// ---- Franchises & the release calendar ------------------------------------
// A breakout film can spawn a franchise: a later sequel offer that pays a
// premium and carries a built-in audience — but deepens your typecast and
// fatigues with each installment.
const sequelTitle = (base, n) => `${base.replace(/\s+\d+$/, '')} ${n}`;

// Films can franchise; episodic TV / commercials / theatre don't.
function franchiseable(category) {
  return ['Indie Film', 'Studio Film', 'Streaming Film', 'Produced', 'Movie', 'Documentary'].includes(category);
}

function maybeStartFranchise(s, info) {
  if (!s.franchises) s.franchises = [];
  if (!franchiseable(info.category)) return;
  if (info.quality < 72) return;                          // only true breakouts
  if (s.franchises.length >= 6) return;
  if (s.franchises.some((f) => f.baseTitle === info.title)) return;
  s.franchises.push({
    baseTitle: info.title,
    genre: info.genre,
    genreName: info.genreName,
    genreIcon: info.genreIcon || '🎬',
    installments: 1,
    strength: Math.round(info.quality),                   // erodes with sequels
    cooldown: Math.round(rf(18, 42)),                     // weeks until a sequel
  });
  pushLog(s, `🌟 "${info.title}" is a phenomenon — the studio smells a franchise.`);
}

// Build a sequel audition offer for an established franchise.
function makeSequelRole(s, fr) {
  const next = fr.installments + 1;
  const role = makeRole(s.fame, false);
  role.category = 'movie';
  role.catName = (CATEGORIES.movie && CATEGORIES.movie.name) || 'Movie';
  role.icon = (CATEGORIES.movie && CATEGORIES.movie.icon) || '🎬';
  role.title = sequelTitle(fr.baseTitle, next);
  role.genre = fr.genre;
  role.genreName = fr.genreName;
  role.genreIcon = fr.genreIcon;
  role.billing = 'lead';
  role.part = 'Returning Lead';
  role.openCall = false;
  role.tier = 2;
  // Sequels pay a premium and bring built-in fame, but break less new ground.
  role.pay = Math.round(role.pay * (1.6 + next * 0.25));
  role.fameGain = +(role.fameGain * 1.3).toFixed(1);
  role.prestige = +(role.prestige * 0.7).toFixed(2);
  role.fameReq = Math.max(0, role.fameReq - 10);          // they want YOU back
  role.sequel = true;
  role.franchiseBase = fr.baseTitle;
  return role;
}

// Once per week, a dormant franchise may resurface with a sequel offer.
function maybeOfferSequel(s) {
  if (!s.franchises || !s.franchises.length) return;
  if (isBusy(s) || !s.hasAgent) return;
  for (const fr of s.franchises) {
    if (fr.cooldown > 0) { fr.cooldown--; continue; }
    if (fr.installments >= 4) continue;                   // franchises fatigue out
    if (s.offers.some((o) => o.franchiseBase === fr.baseTitle)) continue;
    if (Math.random() < 0.14) {
      s.offers.unshift(makeSequelRole(s, fr));
      pushLog(s, `📣 The studio wants you back for "${sequelTitle(fr.baseTitle, fr.installments + 1)}".`);
    }
  }
}

// Wrapping a sequel advances (or retires) its franchise.
function advanceFranchise(s, baseTitle, quality) {
  const fr = (s.franchises || []).find((f) => f.baseTitle === baseTitle);
  if (!fr) return;
  fr.installments++;
  fr.strength = Math.round((fr.strength + quality) / 2 - 5); // diminishing returns
  fr.cooldown = Math.round(rf(24, 52));
  awardGenreXp(s, fr.genre, 2);                            // returning role = typecast
  if (fr.installments >= 4 || fr.strength < 55) {
    pushLog(s, `🎬 The "${fr.baseTitle}" franchise has run its course.`);
    s.franchises = s.franchises.filter((f) => f !== fr);
  }
}

// Hit or advance the right franchise when a film wraps.
function tickFranchise(s, role, quality) {
  if (role.sequel && role.franchiseBase) advanceFranchise(s, role.franchiseBase, quality);
  else maybeStartFranchise(s, { title: role.title, genre: role.genre, genreName: role.genreName, genreIcon: role.genreIcon, category: role.catName, quality });
}

// Release calendar: opening against a rival blockbuster can cut box office.
function releaseCompetition(s) {
  if (Math.random() < 0.3) {
    const pool = (s.rivals || []).filter((r) => r && r.name);
    const rival = pool.length ? pool[Math.floor(Math.random() * pool.length)].name : 'a major studio tentpole';
    return { factor: +rf(0.55, 0.82).toFixed(2), rival };
  }
  return { factor: 1, rival: null };
}

// Apply a competition factor to a box-office result in place; views unaffected.
function applyCompetition(result, comp) {
  if (result && comp && comp.factor < 1 && result.type === 'box') {
    result.value = Math.round(result.value * comp.factor);
  }
  return result;
}

// Rehearse for the project you're currently filming to lift its performance.
export function prepareRole(s) {
  if (s.gameOver) return { ok: false, msg: 'The game is over.' };
  const proj = s.active
    || (s.activeSeries && s.activeSeries.status === 'filming' ? s.activeSeries : null)
    || s.productions.find((p) => p.star && p.weeksLeft > 0);
  if (!proj) return { ok: false, msg: 'You\'re not filming anything to prepare for.' };
  if ((proj.prep || 0) >= 4) return { ok: false, msg: 'You\'re fully prepared for this role.' };
  if (s.energy < 18) return { ok: false, msg: 'Too tired to rehearse. Rest first.' };
  spendEnergy(s, 18);
  proj.prep = (proj.prep || 0) + 1;
  s.acting = clamp(+(s.acting + rf(0.1, 0.3)).toFixed(1), 0, 100);
  const title = proj.role ? proj.role.title : proj.title;
  pushLog(s, `🎭 You rehearsed for "${title}" (prep ${proj.prep}/4). Your performance will be stronger.`);
  return { ok: true, msg: 'Rehearsed — performance improved.' };
}

function wrapProduction(s, prod) {
  // Quality blends script, producing/directing skill (and your acting if you
  // star), how prepared you were, and luck.
  let base = prodQualityBase(prod.scriptQuality, s.producing, s.directing, prod.directed);
  if (prod.star) base += s.acting * 0.2 + (prod.prep || 0) * 3;
  const q = clamp(base * rf(0.6, 1.25), 5, 100);

  // Box office return scales with budget tier & quality.
  const comp = releaseCompetition(s);
  const gross = Math.round(prod.cost * (0.4 + (q / 100) * 2.4) * rf(0.7, 1.3) * comp.factor);
  const profit = gross - prod.cost;
  earn(s, gross);
  const fameGain = +(q / 100 * 6 * Math.sqrt(prod.scale)).toFixed(1);
  gainFame(s, fameGain);
  const prestige = +(q / 100 * (prod.directed ? 2 : 1.2) * Math.sqrt(prod.scale)).toFixed(2);
  s.careerPrestige += prestige;
  s.reputation = clamp(s.reputation + q / 25, 0, 100);
  if (prod.directed) s.directing = clamp(+(s.directing + 1).toFixed(1), 0, 100);
  s.producing = clamp(+(s.producing + 1).toFixed(1), 0, 100);
  awardGenreXp(s, prod.genre, 1 + prestige);
  if (prod.star) {
    s.acting = clamp(+(s.acting + 1).toFixed(1), 0, 100);
    awardGenreXp(s, prod.genre, 1);
    bondWithCostars(s, prod.costars || []);
  }

  const rec = reception(q);
  const sc = scoreRelease(q, s.fame, prod.scale * 0.3);
  addCredit(s, {
    title: prod.title, category: 'Produced', genre: prod.genreName,
    role: [prod.star ? 'Star' : null, prod.directed ? 'Director' : null, 'Producer', prod.written ? 'Writer' : null].filter(Boolean).join(' / '),
    produced: true, directed: prod.directed, written: !!prod.written,
    acted: !!prod.star, billing: prod.star ? 'lead' : undefined, lead: !!prod.star,
    costars: (prod.costars || []).map((c) => c.id),
    writeQuality: prod.scriptQuality, quality: Math.round(q),
    critics: sc.critics, audience: sc.audience,
    reception: rec.label, result: { type: 'box', value: gross },
  });

  maybeStartFranchise(s, { title: prod.title, genre: prod.genre, genreName: prod.genreName, genreIcon: prod.genreIcon, category: 'Produced', quality: q });
  const verdict = profit > 0
    ? `It grossed $${gross.toLocaleString()} — a $${profit.toLocaleString()} profit! 🍾`
    : `It grossed $${gross.toLocaleString()} — a $${Math.abs(profit).toLocaleString()} loss. 📉`;
  pushLog(s, `🎞️ "${prod.title}" wrapped (${rec.emoji} ${rec.label}, 🍅 ${sc.critics} / 🍿 ${sc.audience}). ${verdict} +${fameGain} fame.`);
  s.releaseNight = {
    title: prod.title, icon: prod.genreIcon || '🎬', category: 'Your Production',
    role: [prod.star ? 'Star' : null, prod.directed ? 'Director' : null, 'Producer'].filter(Boolean).join(' / '),
    genre: prod.genreName, quality: Math.round(q), reception: rec.label, emoji: rec.emoji,
    critics: sc.critics, audience: sc.audience,
    competition: comp && comp.factor < 1 ? comp.rival : null,
    result: { type: 'box', value: gross }, profit, fameGain,
    costars: (prod.costars || []).map((c) => c.name),
  };
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
  // A publicist softens bad press and amplifies the good.
  let fame = d.fame || 0;
  let rep = d.reputation || 0;
  if (s.publicist) {
    if (fame < 0) fame *= 0.6; else fame *= 1.15;
    if (rep < 0) rep *= 0.6;
  }
  if (fame) gainFame(s, fame);
  if (rep) s.reputation = clamp(+(s.reputation + rep).toFixed(1), 0, 100);
  if (d.acting) s.acting = clamp(+(s.acting + d.acting).toFixed(1), 0, 100);
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
    const billing = c.billing || (c.lead ? 'lead' : 'supporting');
    if (billing === 'cameo') return false;         // cameos aren't award-worthy
    if (cat.lead != null && (billing === 'lead') !== cat.lead) return false;
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
  // Critics drive awards (a prestige beat); writing uses the screenplay quality.
  const workQuality = cat.kind === 'writing'
    ? (credit.writeQuality ?? credit.quality ?? 40)
    : (credit.critics ?? credit.quality ?? 40);
  // Campaign strength ~0..100: work quality dominates, with craft, reputation
  // (industry respect/campaigning) and fame contributing.
  const strength = workQuality * 0.55 + craft * 0.25 + s.reputation * 0.12 + s.fame * 0.08;

  // Nomination bar climbs with the ceremony's prestige (Oscars hardest).
  const bar = 64 + cer.prestige * 12;
  const nomChance = clamp((strength - bar) / 42, 0, 0.65);
  if (Math.random() >= nomChance) return { nominated: false, won: false };

  // Among five nominees, the best work is favored but upsets are common.
  const edge = clamp((strength - bar) / 70, 0, 0.30);
  const winChance = clamp(0.12 + edge, 0.06, 0.42);
  return { nominated: true, won: Math.random() < winChance };
}

// Festivals: a critically-strong recent indie/documentary (or any film) earns a
// selection — and, if exceptional, the top prize — boosting prestige, rep & fame.
function runFestival(s, fest) {
  const now = absWeek(s);
  const pool = s.filmography.filter((c) => c.wk != null && c.wk > now - WEEKS_PER_YEAR && c.wk <= now
    && c.medium === 'film' && (c.critics ?? 0) >= 55);
  if (!pool.length) return;
  const best = pool.reduce((a, b) => ((b.critics ?? 0) > (a.critics ?? 0) ? b : a));
  const won = (best.critics ?? 0) >= 80 && Math.random() < 0.5;
  const prestige = +((best.critics ?? 60) / 100 * (won ? 2.2 : 1)).toFixed(2);
  s.careerPrestige += prestige;
  s.reputation = clamp(s.reputation + (won ? 6 : 3), 0, 100);
  gainFame(s, won ? 3 : 1.5);
  pushLog(s, won
    ? `${fest.icon} "${best.title}" WON the top prize at ${fest.name}! A festival sensation.`
    : `${fest.icon} "${best.title}" was selected at ${fest.name} — critical buzz builds.`);
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

// Lifetime box office (films) and total viewership (TV/streaming) across all credits.
export function careerTotals(s) {
  let boxOffice = 0, viewers = 0, biggest = null;
  for (const f of s.filmography) {
    if (!f.result) continue;
    if (f.result.type === 'box') {
      boxOffice += f.result.value;
      if (!biggest || f.result.value > biggest.value) biggest = { title: f.title, value: f.result.value };
    } else {
      viewers += f.result.value;
    }
  }
  return { boxOffice, viewers: Math.round(viewers), biggest };
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

  // Living expenses (base + lifestyle upkeep)
  s.money -= D.living + lifestyleUpkeep(s) + (s.publicist ? PUBLICIST_FEE : 0);

  // Residual income from past hits
  payRoyalties(s);

  // Endorsements & fanbase
  tickSocial(s);

  // Active acting role progresses
  if (s.active) {
    const a = s.active;
    const weekly = Math.round((a.role.pay || 0) * D.payMult / a.totalWeeks);
    const net = Math.round(weekly * (1 - representationCut(s)));
    earn(s, net);
    a.weeksLeft--;
    if (a.weeksLeft <= 0 && a.project) {
      wrapStudioProject(s, a);
    } else if (a.weeksLeft <= 0) {
      // Wrap: your performance quality + the project's reception shape the payoff.
      const starPower = bondWithCostars(s, a.costars || []);
      const rubOff = +(starPower * 0.04).toFixed(1);
      const quality = performanceQuality(s, a.role, a.prep);
      const isAd = creditMedium(a.role.catName) === 'other'; // commercials: no box office
      const rec = isAd ? null : reception(quality);
      const sc = isAd ? null : scoreRelease(quality, s.fame, a.role.prestige);
      const fameGain = +(a.role.fameGain * (rec ? rec.fameMult : 1) + rubOff).toFixed(1);
      gainFame(s, fameGain);
      s.acting = clamp(+(s.acting + a.role.skillGain).toFixed(1), 0, 100);
      s.reputation = clamp(s.reputation + a.role.prestige * 2 + (rec ? rec.rep : 0), 0, 100);
      s.careerPrestige += a.role.prestige;
      awardGenreXp(s, a.role.genre, 1.5 + a.role.prestige);
      const comp = isAd ? null : releaseCompetition(s);
      const result = isAd ? null : applyCompetition(projectResult(a.role.catName, a.role.tier, sc.audience, s.fame), comp);
      addCredit(s, {
        title: a.role.title, category: a.role.catName,
        role: a.role.part, genre: a.role.genreName,
        acted: true, billing: a.role.billing || 'supporting',
        lead: a.role.billing === 'lead',
        sequel: !!a.role.sequel,
        costars: (a.costars || []).map((c) => c.id),
        quality, reception: rec ? rec.label : undefined,
        critics: sc ? sc.critics : undefined, audience: sc ? sc.audience : undefined,
        result,
      });
      const cred = s.filmography[s.filmography.length - 1];
      if (!isAd) {
        grantRoyalty(s, a.role.title, cred.result, a.role.billing);
        tickFranchise(s, a.role, quality);
      }
      const recMsg = rec ? ` ${rec.emoji} ${rec.label} (🍅 ${sc.critics} / 🍿 ${sc.audience}).` : '';
      pushLog(s, `🎉 "${a.role.title}" wrapped!${recMsg} +${fameGain} fame, +${a.role.skillGain} acting.`);
      if (!isAd) {
        s.releaseNight = {
          title: a.role.title, icon: a.role.genreIcon, category: a.role.catName,
          role: a.role.part, billing: a.role.billing, genre: a.role.genreName,
          quality, reception: rec.label, emoji: rec.emoji, result: cred.result,
          critics: sc.critics, audience: sc.audience,
          competition: comp && comp.factor < 1 ? comp.rival : null,
          fameGain, costars: (a.costars || []).map((c) => c.name),
        };
      }
      s.active = null;
    }
  }

  // TV series (renewal/cancellation arc)
  if (s.activeSeries && s.activeSeries.status === 'filming') {
    const sh = s.activeSeries;
    const weekly = Math.round(sh.salary * D.payMult / sh.totalWeeks);
    earn(s, Math.round(weekly * (1 - representationCut(s))));
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

  // Overwork erodes health; poor health slows recovery.
  if (s.energy < 12) s.health = clamp((s.health ?? 100) - rf(1, 3), 0, 100);
  const healthFactor = 0.55 + (s.health ?? 100) / 220;            // ~0.55–1.0
  // Energy regen (base − burnout + lifestyle comfort), scaled by health.
  const regen = Math.round((30 + lifestyleEnergy(s)) * healthFactor) - (s.energyPenalty || 0);
  s.energy = clamp(s.energy + regen, 0, s.maxEnergy);
  s.energyPenalty = 0;

  // Random event
  rollEvents(s);

  // Slowly refresh the audition board so it stays lively
  if (Math.random() < 0.5 && !isBusy(s)) refreshOffers(s);

  // A dormant franchise may resurface with a sequel offer.
  maybeOfferSequel(s);

  // Advance the calendar
  s.week++;
  if (s.week > WEEKS_PER_YEAR) {
    s.week = 1;
    s.year++;
    s.age++;
    updateRivals(s);
    // Tax was withheld as you earned; just reconcile (≈0) and reset for the year.
    const owed = taxFor(s.yearIncome || 0);
    const settle = owed - (s.taxWithheld || 0);
    if (settle !== 0) s.money -= settle;
    if ((s.yearIncome || 0) > 0) {
      pushLog(s, `🧾 Tax year closed: $${owed.toLocaleString()} paid on $${Math.round(s.yearIncome).toLocaleString()} of income.`);
    }
    s.yearIncome = 0;
    s.taxWithheld = 0;
    // Aging: stamina tapers, and fame fades if you go quiet (faster when older).
    s.maxEnergy = maxEnergyForAge(s.age);
    s.energy = Math.min(s.energy, s.maxEnergy);
    const activeRecently = s.filmography.some((f) => f.year >= s.year - 1);
    const decay = clamp((s.age - 40) * 0.1, 0, 4) * (activeRecently ? 0.3 : 1.4);
    if (decay > 0) s.fame = clamp(+(s.fame - decay).toFixed(1), 0, 100);
    if (s.age >= 45) s.health = clamp((s.health ?? 100) - rf(0.5, 2), 0, 100);
    if (!s.history) s.history = [];
    s.history.push({ year: s.year, age: s.age, fame: Math.round(s.fame), money: Math.round(s.money), acting: Math.round(s.acting) });
    if (s.history.length > 80) s.history.shift();
    pushLog(s, `📅 A new year begins. You are now ${s.age}.${decay > 1.5 && !activeRecently ? ' The spotlight is drifting away…' : ''}`);
  }

  // Awards season: ceremonies fall on specific weeks through the year.
  for (const cer of CEREMONIES) {
    if (s.week === cer.week) runCeremony(s, cer);
  }
  // Film festivals anoint your recent indie/prestige work.
  for (const fest of FESTIVALS) {
    if (s.week === fest.week) runFestival(s, fest);
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
