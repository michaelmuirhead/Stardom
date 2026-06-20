// Headless smoke test for Stardom's game engine.
// Runs full simulated careers across every difficulty and asserts the engine
// stays internally consistent. Exits non-zero on any failure so CI can gate.
import { newGame } from '../js/state.js';
import { DIFFICULTIES, GENRE_KEYS } from '../js/data.js';
import {
  advanceWeek, audition, auditionChance, takeClass, network, rest, sideJob,
  extraWork, toggleAgent, writeScript, startProduction, isBusy, catchUp, quitSeries,
} from '../js/engine.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error(`  ✗ ${msg}`); failures++; }
}

function checkIntegrity(s, where) {
  const okNum = (v) => typeof v === 'number' && Number.isFinite(v);
  assert(okNum(s.money), `${where}: money is a finite number`);
  assert(s.fame >= 0 && s.fame <= 100, `${where}: fame in [0,100] (${s.fame})`);
  assert(s.acting >= 0 && s.acting <= 100, `${where}: acting in [0,100] (${s.acting})`);
  assert(s.energy >= 0 && s.energy <= s.maxEnergy, `${where}: energy in bounds (${s.energy})`);
  for (const g of GENRE_KEYS) assert(okNum(s.genres[g]), `${where}: genre xp numeric (${g})`);
  assert(Array.isArray(s.contacts), `${where}: contacts is an array`);
}

// A reasonably competent AI so easy/normal careers don't bankrupt on noise.
function playCareer(diffKey, weeks) {
  const s = newGame('CI Bot', diffKey);
  const seen = { series: false, romance: false, cancellation: false, renewal: false, callback: false, extra: false };
  let logLen = 0;

  for (let i = 0; i < weeks && !s.gameOver; i++) {
    if (s.activeSeries) seen.series = true;
    if (s.partner) seen.romance = true;

    if (s.energy < 22) {
      rest(s);
    } else if (!isBusy(s) && s.offers.length) {
      const cb = s.offers.find((o) => o.callback);
      const ranked = [...s.offers].sort((a, b) => auditionChance(s, b) * b.pay - auditionChance(s, a) * a.pay);
      const best = cb || ranked[0];
      if (s.money < 1000) sideJob(s);
      else if (best && auditionChance(s, best) > 0.25) audition(s, best.id);
      else if (s.money > 1500 && s.energy >= 25 && Math.random() < 0.4) takeClass(s, 'acting');
      else extraWork(s);
    } else if (s.money < 600) {
      sideJob(s);
    } else if (s.money > 800 && s.energy >= 25 && Math.random() < 0.4) {
      takeClass(s, 'acting');
    } else if (s.contacts.length && s.energy >= 10 && Math.random() < 0.3) {
      catchUp(s, s.contacts[Math.floor(Math.random() * s.contacts.length)].id);
    } else {
      network(s);
    }

    if (!s.hasAgent && s.fame >= 12) toggleAgent(s);
    if (s.fame >= 10 && s.money > 1500 && s.energy >= 30 && Math.random() < 0.06) takeClass(s, 'writing');
    if (s.fame >= 15 && s.money > 1500 && s.energy >= 30 && Math.random() < 0.06) takeClass(s, 'directing');
    if (s.fame >= 25 && s.money > 2000 && s.energy >= 30 && Math.random() < 0.06) takeClass(s, 'producing');
    if (s.writing >= 5 && Math.random() < 0.06) writeScript(s);
    if (s.producing >= 5 && s.money > 35000 && !s.productions.length) {
      startProduction(s, { budgetKey: 'mid', scriptId: s.scripts[0]?.id || '', direct: s.directing >= 5 });
    }
    if (s.activeSeries && s.activeSeries.season >= 6 && Math.random() < 0.05) quitSeries(s);

    advanceWeek(s);
    checkIntegrity(s, `${diffKey} wk${i}`);
    assert(s.log.length >= logLen || s.log.length <= 80, `${diffKey}: log sane`);
    logLen = Math.min(s.log.length, 80);
  }

  // Detect renewal / cancellation / callbacks by scanning the log.
  for (const e of s.log) {
    if (/RENEWED/.test(e.msg)) seen.renewal = true;
    if (/CANCELLED/.test(e.msg)) seen.cancellation = true;
    if (/Callback/.test(e.msg)) seen.callback = true;
  }
  if ((s.stats.extra || 0) > 0) seen.extra = true;
  return { s, seen };
}

// A focused early-game burst that auditions heavily, to reliably exercise the
// callback mechanic (which depends on near-miss losses over many attempts).
function exerciseEarly() {
  const s = newGame('Rookie', 'normal');
  let callbacks = 0, auditioned = 0;
  for (let i = 0; i < 160 && !s.gameOver; i++) {
    checkIntegrity(s, `early wk${i}`);
    if (s.energy < 20) { rest(s); advanceWeek(s); continue; }
    if (!isBusy(s) && s.offers.length) {
      const r = audition(s, s.offers[0].id);
      auditioned++;
      if (r.callback) callbacks++;
    } else if (!isBusy(s)) {
      network(s);
    } else {
      // committed to a project — just let it play out
    }
    advanceWeek(s);
  }
  // Pre-agent, the board must only show open-call roles.
  const preAgentBoardOk = !s.hasAgent ? s.offers.every((o) => o.openCall) : true;
  return { callbacks, auditioned, preAgentBoardOk, hasAgent: s.hasAgent };
}

console.log('Stardom engine smoke test\n');

// 1) Difficulty config sanity
for (const d of Object.values(DIFFICULTIES)) {
  assert(d.startMoney > 0 && d.living > 0 && typeof d.payMult === 'number',
    `difficulty "${d.key}" has valid economy`);
}

// 2) Run careers per difficulty
const agg = { series: false, romance: false, renewal: false, cancellation: false, callback: false, extra: false, landed: 0 };
for (const diffKey of Object.keys(DIFFICULTIES)) {
  // Run several times to smooth out RNG and exercise the systems.
  let survived = 0;
  for (let n = 0; n < 4; n++) {
    const { s, seen } = playCareer(diffKey, 400);
    if (!s.gameOver) survived++;
    agg.landed += s.stats.landed;
    for (const k of Object.keys(seen)) agg[k] = agg[k] || seen[k];
  }
  console.log(`  ${diffKey}: survived ${survived}/4 long careers`);
  // Easy and Normal should be comfortably survivable with competent play.
  if (diffKey !== 'hard') {
    assert(survived >= 3, `${diffKey} is survivable with competent play (${survived}/4)`);
  }
}

// 3) The four headline systems must actually engage at least once
assert(agg.landed > 0, 'roles were landed across runs');
assert(agg.series, 'TV series system engaged (joined a series)');
assert(agg.renewal, 'TV series renewals occurred');
assert(agg.cancellation, 'TV series cancellations occurred');
assert(agg.romance, 'co-star romance system engaged');
assert(agg.extra, 'extra/background work was performed');

// 4) Early-game mechanics: callbacks + open-call board gating
const early = exerciseEarly();
console.log(`  early burst: ${early.auditioned} auditions, ${early.callbacks} callbacks`);
assert(early.callbacks > 0, 'audition callbacks occurred in early-game burst');
assert(early.preAgentBoardOk, 'pre-agent board only shows open-call roles');

console.log('');
if (failures) {
  console.error(`FAILED: ${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log('PASSED: all assertions held.');
