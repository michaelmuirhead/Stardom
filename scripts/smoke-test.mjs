// Headless smoke test for Stardom's game engine.
// Runs full simulated careers across every difficulty and asserts the engine
// stays internally consistent. Exits non-zero on any failure so CI can gate.
import { newGame } from '../js/state.js';
import { DIFFICULTIES, GENRE_KEYS, makeRole, taxFor } from '../js/data.js';
import {
  advanceWeek, audition, auditionChance, takeClass, network, rest, sideJob,
  extraWork, toggleAgent, writeScript, startProduction, isBusy, catchUp, quitSeries,
  agentReady, negotiate, resolveChoice, buyAsset, ownedAssets, pitchScript, careerTotals,
  startAudition, auditionChoose, currentAuditionBeat, closeAudition, publicImage,
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
      const winnable = s.offers.filter((o) => auditionChance(s, o) > 0.15).sort((a, b) => b.pay - a.pay);
      const best = cb || winnable[0] || [...s.offers].sort((a, b) => auditionChance(s, b) - auditionChance(s, a))[0];
      if (s.money < 8000) sideJob(s);
      else if (best && auditionChance(s, best) > 0.12) audition(s, best.id);
      else if (s.money > 6000 && s.energy >= 25 && Math.random() < 0.4) takeClass(s, 'acting');
      else extraWork(s);
    } else if (s.money < 4000) {
      sideJob(s);
    } else if (s.money > 6000 && s.energy >= 25 && Math.random() < 0.4) {
      takeClass(s, 'acting');
    } else if (s.contacts.length && s.energy >= 10 && Math.random() < 0.3) {
      catchUp(s, s.contacts[Math.floor(Math.random() * s.contacts.length)].id);
    } else {
      network(s);
    }

    if (!s.hasAgent && s.fame >= 12) toggleAgent(s);
    if (s.fame >= 10 && s.money > 12000 && s.energy >= 30 && Math.random() < 0.06) takeClass(s, 'writing');
    if (s.fame >= 15 && s.money > 12000 && s.energy >= 30 && Math.random() < 0.06) takeClass(s, 'directing');
    if (s.fame >= 25 && s.money > 20000 && s.energy >= 30 && Math.random() < 0.06) takeClass(s, 'producing');
    if (s.writing >= 5 && Math.random() < 0.06) writeScript(s);
    if (s.producing >= 5 && s.money > 8000000 && !s.productions.length) {
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

// Play interactive audition scenes to completion; confirm they resolve, track a
// director, and let craft sway the outcome (a skilled actor outperforms a raw one).
function exerciseAuditionScenes() {
  function rate(acting, fame) {
    let landed = 0, resolved = 0, dirTracked = 0, n = 300;
    for (let run = 0; run < n; run++) {
      const s = newGame('Reader', 'normal');
      s.acting = acting; s.fame = fame; s.energy = 100;
      const role = s.offers.find((o) => o.billing !== 'lead') || s.offers[0];
      const r0 = startAudition(s, role.id);
      if (!r0.ok) continue;
      let guard = 0;
      while (s.auditionScene && !s.auditionScene.done && guard++ < 8) {
        const beat = currentAuditionBeat(s);
        // "Competent" play: grounded read, take the note, build rapport.
        const want = ['true', 'take', 'chat'];
        const key = beat.choices.find((c) => want.includes(c.key)) ? want.find((w) => beat.choices.some((c) => c.key === w)) : beat.choices[0].key;
        auditionChoose(s, key);
      }
      if (s.auditionScene && s.auditionScene.done) {
        resolved++;
        if (s.auditionScene.verdict.won) landed++;
        if (s.directors.length) dirTracked++;
        closeAudition(s);
      }
      assert(s.auditionScene == null, 'audition scene clears after close');
    }
    return { landed: landed / n, resolved, dirTracked };
  }
  const raw = rate(10, 5);
  const skilled = rate(55, 35);
  return { raw, skilled };
}

// Deterministically join TV series and run them to observe renewals + cancels.
function exerciseSeries() {
  let joined = false, renew = false, cancel = false;
  for (let attempt = 0; attempt < 60 && !(renew && cancel); attempt++) {
    const s = newGame('TV Star', 'easy');
    s.fame = 38; s.acting = 45; s.hasAgent = true; s.money = 1e7;
    let guard = 0;
    while (!s.activeSeries && guard++ < 600) {
      const r = s.offers.find((o) => o.category === 'tvshow');
      if (r) { s.energy = 100; audition(s, r.id); }
      if (!s.activeSeries) { s.money = 1e7; advanceWeek(s); }
    }
    if (!s.activeSeries) continue;
    joined = true;
    let g = 0;
    while (s.activeSeries && g++ < 500) { s.money = 1e7; advanceWeek(s); }
    for (const e of s.log) {
      if (/RENEWED/.test(e.msg)) renew = true;
      if (/CANCELLED/.test(e.msg)) cancel = true;
    }
  }
  return { joined, renew, cancel };
}

// A long, competent career to observe awards-season outcomes.
function exerciseAwards(years) {
  const s = newGame('Laureate', 'normal');
  for (let i = 0; i < years * 52 && !s.gameOver; i++) {
    if (!s.hasAgent && agentReady(s).met) toggleAgent(s);
    if (s.energy < 22) { rest(s); advanceWeek(s); continue; }
    if (!isBusy(s) && s.offers.length) {
      const cb = s.offers.find((o) => o.callback);
      const winnable = s.offers.filter((o) => auditionChance(s, o) > 0.15).sort((a, b) => b.pay - a.pay);
      const t = cb || winnable[0] || [...s.offers].sort((a, b) => auditionChance(s, b) - auditionChance(s, a))[0];
      if (s.money < 8000) sideJob(s);
      else if (t && auditionChance(s, t) > 0.12) audition(s, t.id);
      else if (s.money > 6000 && s.energy >= 25) takeClass(s, 'acting');
      else extraWork(s);
    } else if (s.money < 4000) { sideJob(s); }
    else if (s.money > 6000 && s.energy >= 25 && Math.random() < 0.4) { takeClass(s, 'acting'); }
    else if (!isBusy(s)) { network(s); } else { rest(s); }
    if (s.fame >= 15 && s.money > 12000 && s.energy >= 30 && Math.random() < 0.05) takeClass(s, 'directing');
    if (s.fame >= 25 && s.money > 20000 && s.energy >= 30 && Math.random() < 0.05) takeClass(s, 'producing');
    if (s.producing >= 5 && s.money > 8000000 && !s.productions.length) {
      startProduction(s, { budgetKey: 'mid', scriptId: '', direct: s.directing >= 5 });
    }
    advanceWeek(s);
  }
  return {
    wins: s.stats.wins || 0, noms: s.stats.noms || 0, years, fame: s.fame,
    milestones: Object.keys(s.milestonesDone || {}).length,
  };
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
assert(agg.romance, 'co-star romance system engaged');
assert(agg.extra, 'extra/background work was performed');

// TV series renewal/cancellation arc (deterministic exerciser)
const ser = exerciseSeries();
console.log(`  tv series: joined=${ser.joined} renew=${ser.renew} cancel=${ser.cancel}`);
assert(ser.joined, 'a TV series can be joined');
assert(ser.renew, 'TV series renewals occur');
assert(ser.cancel, 'TV series cancellations occur');

// 4) Early-game mechanics: callbacks + open-call board gating
const early = exerciseEarly();
console.log(`  early burst: ${early.auditioned} auditions, ${early.callbacks} callbacks`);
assert(early.callbacks > 0, 'audition callbacks occurred in early-game burst');
assert(early.preAgentBoardOk, 'pre-agent board only shows open-call roles');

// 4b) Played audition scenes resolve cleanly and reward craft.
const scenes = exerciseAuditionScenes();
console.log(`  audition scenes: raw actor books ${(scenes.raw.landed * 100).toFixed(0)}%, skilled books ${(scenes.skilled.landed * 100).toFixed(0)}%`);
assert(scenes.raw.resolved > 0 && scenes.skilled.resolved > 0, 'played audition scenes resolve to a verdict');
assert(scenes.skilled.dirTracked > 0, 'auditions record the director you read for');
assert(scenes.skilled.landed > scenes.raw.landed + 0.2, 'craft meaningfully improves audition outcomes');

// 5) Awards season fires and produces realistic (non-runaway) outcomes
const YEARS = 15;
const aw = exerciseAwards(YEARS);
console.log(`  awards (${YEARS}yr legend): ${aw.wins} wins, ${aw.noms} nominations, ${aw.milestones} milestones`);
assert(aw.wins + aw.noms > 0, 'awards season produced nominations/wins over a long career');
// A peak legend wins under ~1/yr across all four ceremonies; the old runaway bug
// produced ~2/yr (30+/career). This guards against a regression to that.
assert(aw.wins < YEARS * 1.5, `award wins are realistic, not runaway (${aw.wins} over ${YEARS}yr)`);
assert(aw.milestones >= 6, `career milestones are completed over a long career (${aw.milestones})`);

// 6) Rivals, negotiation, and narrative choices
{
  const fresh = newGame('Feature Bot', 'normal');
  assert((fresh.rivals || []).length >= 2, 'rivals are created at game start');

  // Negotiation: an established, agented actor should usually succeed and raise pay.
  let negSuccess = 0;
  for (let i = 0; i < 50; i++) {
    const s = newGame('Haggler', 'normal');
    s.fame = 45; s.reputation = 55; s.hasAgent = true;
    const r = s.offers[0]; const oldPay = r.pay;
    const res = negotiate(s, r.id);
    if (res.ok && r.pay > oldPay) negSuccess++;
  }
  assert(negSuccess > 25, `negotiation raises pay on success (${negSuccess}/50)`);

  // Narrative choice: trigger one and resolve it cleanly.
  const cs = newGame('Decider', 'normal');
  cs.fame = 45; cs.money = 400000; cs.reputation = 50;
  let guard = 0;
  while (!cs.pendingChoice && guard++ < 400) { cs.money = 400000; advanceWeek(cs); }
  assert(!!cs.pendingChoice, 'a narrative dilemma can be triggered');
  if (cs.pendingChoice) {
    const r = resolveChoice(cs, 0);
    assert(r.ok && !cs.pendingChoice, 'a narrative dilemma resolves and clears');
  }

  // Scarcity: offers expire if ignored, and a long commitment thins the board.
  {
    const os = newGame('Idler', 'normal');
    const firstIds = os.offers.map((o) => o.id);
    for (let i = 0; i < 12; i++) advanceWeek(os);          // sit idle, never audition
    assert(firstIds.some((id) => !os.offers.find((o) => o.id === id)),
      'unactioned offers expire off the board over time');

    // While tied up on a project, fresh offers stop arriving.
    const bs = newGame('Busy', 'easy');
    bs.fame = 40; bs.acting = 60; bs.hasAgent = true; bs.money = 1e7;
    // Force into a long shoot.
    bs.active = { role: makeRole(40, false), weeksLeft: 10, totalWeeks: 10, costars: [] };
    bs.active.role.weeks = 10;
    const before = bs.offers.length;
    for (let i = 0; i < 8 && isBusy(bs); i++) { bs.money = 1e7; advanceWeek(bs); }
    assert(bs.offers.length <= before, 'no new offers arrive while you are committed to a shoot');
  }

  // Industry memory: a director who champions you eventually brings a personal offer.
  {
    const cs = newGame('Favored', 'easy');
    cs.hasAgent = true; cs.agentTier = 'powerhouse'; cs.fame = 55; cs.acting = 70;
    cs.directors = [{ id: 'dirfan', name: 'Ada Vance', rel: 92, films: 3 }];
    let championed = false, guard = 0;
    while (!championed && guard++ < 500) {
      cs.money = 5e6;
      advanceWeek(cs);
      if (cs.offers.some((o) => o.from && o.from.kind === 'director')) championed = true;
    }
    assert(championed, 'a director who champions you brings a personal offer');
  }

  // Identity: the kind of career you play declares a matching public image.
  {
    function imageCareer(prefer) {
      const s = newGame('Persona', 'easy');
      s.hasAgent = true; s.agentTier = 'powerhouse'; s.acting = 75; s.fame = 55;
      const prestige = ['indie', 'theatre', 'documentary', 'tvmovie', 'miniseries'];
      const commercial = ['movie', 'streamfilm', 'tvshow', 'streamseries'];
      const want = prefer === 'art' ? prestige : commercial;
      for (let w = 0; w < 350 && !s.gameOver; w++) {
        s.money = 5e6;
        if (!isBusy(s) && s.energy >= 24 && s.offers.length) {
          const role = s.offers.find((o) => want.includes(o.category));
          if (role) {
            startAudition(s, role.id);
            let g = 0;
            while (s.auditionScene && !s.auditionScene.done && g++ < 8) {
              const b = currentAuditionBeat(s);
              const k = (b.choices.find((c) => ['true', 'take', 'chat'].includes(c.key)) || b.choices[0]).key;
              auditionChoose(s, k);
            }
            if (s.auditionScene && s.auditionScene.done) closeAudition(s);
          }
        }
        advanceWeek(s);
        s.releaseNight = null; s.pendingChoice = null; s.ceremonyNight = null;
      }
      return publicImage(s);
    }
    const artist = imageCareer('art');
    const draw = imageCareer('commercial');
    assert(artist && artist.key === 'artist', `a prestige career declares the Serious Artist image (${artist && artist.label})`);
    assert(draw && draw.key === 'draw', `a blockbuster career declares the Blockbuster Draw image (${draw && draw.label})`);
  }

  // Rivals advance over the years.
  const rs = newGame('Survivor', 'normal');
  const startTopFame = Math.max(...rs.rivals.map((r) => r.fame));
  for (let i = 0; i < 6 * 52; i++) { rs.money = 1e9; advanceWeek(rs); }
  assert(Math.max(...rs.rivals.map((r) => r.fame)) > startTopFame, 'rivals gain fame over a career');
}

// 7) Billing progression, streaming, taxes, and lifestyle assets
{
  // Open-call newcomers never get leading roles; stars always do.
  const openLeads = Array.from({ length: 300 }, () => makeRole(2, true)).filter((r) => r.billing === 'lead').length;
  assert(openLeads === 0, 'open-call newcomers are not offered leading roles');
  const starLeads = Array.from({ length: 300 }, () => makeRole(85, false)).filter((r) => r.billing === 'lead').length;
  assert(starLeads > 250, 'established stars are offered leading roles');

  // Streaming-era categories exist on the agented board.
  const cats = new Set(Array.from({ length: 1500 }, () => makeRole(70, false).category));
  assert(cats.has('streamfilm') && cats.has('streamseries'), 'streaming projects appear on the board');

  // Progressive income tax.
  assert(taxFor(0) === 0 && taxFor(200000) > taxFor(40000) && taxFor(40000) > 0, 'income tax is progressive');

  // Lifestyle assets: purchase, ownership, and ongoing upkeep.
  const s = newGame('Tycoon', 'normal');
  s.money = 20000000;
  const r = buyAsset(s, 'mansion');
  assert(r.ok && ownedAssets(s).some((a) => a.key === 'mansion'), 'lifestyle assets can be purchased');
  s.money = 20000000; advanceWeek(s);
  assert(s.money < 20000000, 'asset upkeep is charged weekly');
}

// 8) Script pitching + lifetime totals
{
  const s = newGame('Auteur', 'easy');
  s.writing = 85; s.fame = 85; s.acting = 85; s.directing = 60; s.producing = 60; s.reputation = 75; s.money = 1e6;
  let greenlit = false;
  for (let k = 0; k < 15 && !greenlit; k++) {
    s.energy = 100;
    pitchScript(s, (s.scripts[0] || (writeScript(s), s.scripts[0])).id, { star: true, direct: true });
    if (s.active && s.active.project) { greenlit = true; let g = 0; while (s.active && g++ < 20) { s.money = 1e6; advanceWeek(s); } }
    else if (!s.scripts.length) writeScript(s);
  }
  assert(greenlit, 'a bankable auteur can pitch & greenlight a film with attachments');
  const t = careerTotals(s);
  assert(t.boxOffice > 0, `lifetime box office accrues from releases ($${Math.round(t.boxOffice).toLocaleString()})`);
}

console.log('');
if (failures) {
  console.error(`FAILED: ${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log('PASSED: all assertions held.');
