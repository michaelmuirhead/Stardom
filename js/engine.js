// engine.js — core game mechanics
import {
  WEEKS_PER_YEAR, LIVING_COST, AGENT_CUT, CLASSES, EVENTS,
  AWARD_NAME, projectTitle, makeRole,
} from './data.js';
import { pushLog, refreshOffers } from './state.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rf = (a, b) => a + Math.random() * (b - a);

// ---- Helpers ---------------------------------------------------------------
export function isBusy(s) {
  return !!s.active || s.productions.some((p) => p.weeksLeft > 0);
}

function spendEnergy(s, amount) {
  s.energy = clamp(s.energy - amount, 0, s.maxEnergy);
}

// ---- Auditioning -----------------------------------------------------------
// Returns {ok, chance, msg}
export function auditionChance(s, role) {
  const skillFactor = (s.acting - role.skillReq) / 40;       // ±
  const fameFactor = (s.fame - role.fameReq) / 60;
  const repFactor = (s.reputation - 30) / 200;
  let chance = 0.42 + skillFactor + fameFactor + repFactor;
  if (s.hasAgent) chance += 0.08;
  return clamp(chance, 0.03, 0.95);
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
  const won = Math.random() < chance;

  // Remove this offer either way (you used your shot).
  s.offers = s.offers.filter((r) => r.id !== roleId);

  if (won) {
    s.stats.landed++;
    s.active = { role, weeksLeft: role.weeks, totalWeeks: role.weeks };
    pushLog(s, `✅ You landed ${role.part} in "${role.title}" (${role.catName})! Production starts now.`);
    return { ok: true, won: true, msg: `You got the part in "${role.title}"!` };
  }
  pushLog(s, `❌ You auditioned for "${role.title}" but didn't get it. (${Math.round(chance * 100)}% odds)`);
  return { ok: true, won: false, msg: `No luck on "${role.title}".` };
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

  // Living expenses
  s.money -= LIVING_COST;

  // Active acting role progresses
  if (s.active) {
    const a = s.active;
    const weekly = Math.round(a.role.pay / a.totalWeeks);
    const net = s.hasAgent ? Math.round(weekly * (1 - AGENT_CUT)) : weekly;
    s.money += net;
    a.weeksLeft--;
    if (a.weeksLeft <= 0) {
      // Wrap: apply fame/skill/prestige payoff
      s.fame = clamp(+(s.fame + a.role.fameGain).toFixed(1), 0, 100);
      s.acting = clamp(+(s.acting + a.role.skillGain).toFixed(1), 0, 100);
      s.reputation = clamp(s.reputation + a.role.prestige * 2, 0, 100);
      s.yearPrestige += a.role.prestige;
      s.filmography.push({
        title: a.role.title, category: a.role.catName, year: s.year,
        role: a.role.part, quality: Math.round(50 + a.role.prestige * 10),
      });
      pushLog(s, `🎉 "${a.role.title}" wrapped! +${a.role.fameGain} fame, +${a.role.skillGain} acting.`);
      s.active = null;
    }
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
  if (s.money < -3000) {
    s.gameOver = true;
    s.gameOverReason = 'bankrupt';
    pushLog(s, '💀 Bankrupt. You leave town, dreams unfulfilled. Game over.');
  }
}
