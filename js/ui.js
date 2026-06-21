// ui.js — rendering & event wiring
import { CLASSES, GENRES, GENRE_KEYS, CEREMONIES, MILESTONES, BILLING, ASSETS, fameTier } from './data.js';
import {
  audition, auditionChance, takeClass, network, rest, sideJob, extraWork, toggleAgent,
  writeScript, sellScript, startProduction, estimateProduction, advanceWeek, isBusy, BUDGET_TIERS,
  catchUp, quitSeries, specialty, diffOf, agentReady, AGENT_FAME_REQ, AGENT_CREDITS_REQ,
  retire, careerLegacy, checkMilestones, typecastInfo, negotiate, resolveChoice,
  buyAsset, ownedAssets, prepareRole,
} from './engine.js';

let S = null;        // current game state
let onMutate = null; // callback after any state change (persist + rerender)
let activeTab = 'auditions';
let toastTimer = null;

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const money = (n) => (n < 0 ? '-$' + Math.abs(n).toLocaleString() : '$' + n.toLocaleString());
// Compact money for big release figures: $1.2M, $340K, $2.1B.
const bigMoney = (n) => {
  const a = Math.abs(n);
  if (a >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
  if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
  return '$' + Math.round(n);
};
// Human text for a release result (box office or viewership).
const resultText = (r) => (!r ? '' : r.type === 'box' ? `${bigMoney(r.value)} box office` : `${r.value}M viewers`);

export function bindUI(state, mutateCb) {
  S = state;
  onMutate = mutateCb;
  const help = $('#help');
  if (help) help.onclick = () => showTutorial(true);
  render();
  showTutorial(false); // first-time only
}

// ---- Tutorial overlay ------------------------------------------------------
const TUTORIAL_KEY = 'stardom.tutorialSeen';
const TUTORIAL = [
  { t: '🎬 Welcome to Stardom', d: 'You\'re an aspiring actor chasing fame and fortune. Each turn is one week — spend energy on actions, then hit <b>Advance Week</b> to make progress.' },
  { t: '🎟️ Auditions', d: 'Audition for roles on the casting board. Win or lose, every audition sharpens your craft, and near-misses become 📞 callbacks. You can also 🤝 negotiate a deal before auditioning.' },
  { t: '💵 Staying Afloat', d: 'Rent is due every week (and income is taxed yearly). Between roles, take 🎬 extra work or a 🍽️ side job for cash — don\'t go broke.' },
  { t: '📚 Build & Break In', d: 'Train to raise your craft, then sign an agent (18 fame + 3 credits) to unlock studio films, streaming and TV. Climb from cameos to leading roles.' },
  { t: '🎯 Goals, Awards & Legacy', d: 'The <b>Goals</b> tab guides your rise. Prestige work earns nominations across awards season — co-stars and rivals included — until you retire into the Hall of Fame.' },
];

function showTutorial(force) {
  try {
    if (!force && localStorage.getItem(TUTORIAL_KEY)) return;
  } catch (e) { /* ignore */ }
  let step = 0;
  const overlay = el('div', 'modal-overlay');
  overlay.id = 'tutorial';
  const card = el('div', 'modal-card');
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const finish = () => {
    try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch (e) { /* ignore */ }
    overlay.remove();
  };

  const draw = () => {
    const s = TUTORIAL[step];
    card.innerHTML = `<div class="modal-ic">${s.t.split(' ')[0]}</div>
      <h2>${s.t.replace(/^\S+\s/, '')}</h2>
      <p class="modal-text">${s.d}</p>
      <p class="muted small">Step ${step + 1} of ${TUTORIAL.length}</p>`;
    const row = el('div', 'card-actions');
    if (step > 0) row.appendChild(actionBtn('← Back', () => { step--; draw(); }));
    if (step < TUTORIAL.length - 1) {
      const skip = actionBtn('Skip', finish); row.appendChild(skip);
      const next = actionBtn('Next →', () => { step++; draw(); }); next.classList.add('primary'); row.appendChild(next);
    } else {
      const done = actionBtn('Let\'s go! 🎬', finish); done.classList.add('primary'); row.appendChild(done);
    }
    card.appendChild(row);
  };
  draw();
}

function act(result) {
  if (result && result.msg) toast(result.msg, result.ok === false ? 'bad' : 'good');
  // Surface any milestones completed by this action.
  const done = checkMilestones(S);
  if (done.length) toast(`🎯 ${done[0].icon} ${done[0].name}!`, 'good');
  if (onMutate) onMutate(S);
  render();
}

function toast(msg, kind = 'good') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 2200);
}

// ---- Top stat bar ----------------------------------------------------------
function renderStats() {
  const bar = $('#stats');
  bar.innerHTML = '';
  const items = [
    ['💵', 'Money', bigMoney(S.money), S.money < 0 ? 'warn' : ''],
    ['⭐', 'Fame', `${S.fame.toFixed(0)} · ${fameTier(S.fame)}`, ''],
    ['🎭', 'Acting', S.acting.toFixed(0), ''],
    ['🤝', 'Reputation', S.reputation.toFixed(0), ''],
    ['⚡', 'Energy', `${S.energy}/${S.maxEnergy}`, S.energy < 25 ? 'warn' : ''],
    ['📅', 'Date', `Wk ${S.week}, Yr ${S.year}`, ''],
    ['🎂', 'Age', S.age, ''],
  ];
  for (const [icon, label, val, cls] of items) {
    const card = el('div', 'stat ' + cls);
    card.innerHTML = `<span class="stat-ic">${icon}</span><span class="stat-lab">${label}</span><span class="stat-val">${val}</span>`;
    bar.appendChild(card);
  }
}

// ---- Status banner (what you're currently doing) ---------------------------
function renderBanner() {
  const b = $('#banner');
  b.innerHTML = '';
  const parts = [];
  if (S.active) {
    const a = S.active;
    const cs = (a.costars || []).map((c) => c.name).join(', ');
    const card = progressCard(`${a.role.genreIcon} Filming "${a.role.title}" — ${a.role.part}`,
      a.totalWeeks - a.weeksLeft, a.totalWeeks, `${a.weeksLeft} wk left`,
      cs ? `with ${cs}` : '');
    card.appendChild(prepControl(a));
    parts.push(card);
  }
  if (S.activeSeries && S.activeSeries.status === 'filming') {
    const sh = S.activeSeries;
    const cs = (sh.costars || []).map((c) => c.name).join(', ');
    const card = progressCard(`📡 "${sh.title}" — Season ${sh.season}`,
      sh.totalWeeks - sh.weeksLeft, sh.totalWeeks, `${sh.weeksLeft} wk left`,
      `${cs ? 'with ' + cs : ''}${sh.ratings ? ' · last rating ' + sh.ratings : ''}`);
    card.appendChild(prepControl(sh));
    const quit = actionBtn('🚪 Leave the show', () => { if (confirm('Leave this series for good?')) act(quitSeries(S)); });
    quit.classList.add('mini');
    card.appendChild(quit);
    parts.push(card);
  }
  for (const p of S.productions) {
    const card = progressCard(`${p.genreIcon || '🎥'} Producing "${p.title}" (${p.budgetName})${p.star ? ' — starring you' : ''}`, p.totalWeeks - p.weeksLeft, p.totalWeeks, `${p.weeksLeft} wk left`);
    if (p.star) card.appendChild(prepControl(p));
    parts.push(card);
  }
  if (!parts.length) {
    b.appendChild(el('div', 'banner-idle', '🟢 You\'re free this week — audition, train, or create.'));
    return;
  }
  parts.forEach((p) => b.appendChild(p));
}

// Rehearse control shown on the project you're currently filming.
function prepControl(proj) {
  const prep = proj.prep || 0;
  const wrap = el('div', 'prep-row');
  wrap.innerHTML = `<span class="muted small">🎭 Prep ${prep}/4</span>`;
  const btn = actionBtn('Rehearse (18⚡)', () => act(prepareRole(S)), prep >= 4 || S.energy < 18);
  btn.classList.add('mini');
  wrap.appendChild(btn);
  return wrap;
}

function progressCard(label, done, total, right, sub) {
  const pct = Math.round((done / total) * 100);
  const c = el('div', 'banner-active');
  c.innerHTML = `<div class="banner-row"><span>${label}</span><span class="muted">${right}</span></div>
    <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
    ${sub ? `<div class="muted small" style="margin-top:6px">${sub}</div>` : ''}`;
  return c;
}

// ---- Tabs ------------------------------------------------------------------
const TABS = [
  ['auditions', '🎟️ Auditions'],
  ['goals', '🎯 Goals'],
  ['train', '📚 Train'],
  ['create', '🎬 Create'],
  ['finances', '💰 Finances'],
  ['people', '👥 People'],
  ['career', '👤 Career'],
];

function renderTabs() {
  const t = $('#tabs');
  t.innerHTML = '';
  for (const [key, label] of TABS) {
    const btn = el('button', 'tab' + (activeTab === key ? ' active' : ''), label);
    btn.onclick = () => { activeTab = key; render(); };
    t.appendChild(btn);
  }
}

function renderPanel() {
  const p = $('#panel');
  p.innerHTML = '';
  if (S.gameOver) { p.appendChild(gameOverView()); return; }
  if (activeTab === 'auditions') p.appendChild(auditionsView());
  else if (activeTab === 'goals') p.appendChild(goalsView());
  else if (activeTab === 'train') p.appendChild(trainView());
  else if (activeTab === 'create') p.appendChild(createView());
  else if (activeTab === 'finances') p.appendChild(financesView());
  else if (activeTab === 'people') p.appendChild(peopleView());
  else if (activeTab === 'career') p.appendChild(careerView());
}

// ---- Auditions view --------------------------------------------------------
function auditionsView() {
  const wrap = el('div', 'view');
  // Quick actions
  const quick = el('div', 'quick');
  quick.appendChild(actionBtn('🎬 Extra work (+$, +craft)', () => act(extraWork(S)), isBusy(S) || S.energy < 14));
  quick.appendChild(actionBtn('🍽️ Side job (+$)', () => act(sideJob(S)), S.energy < 20));
  quick.appendChild(actionBtn('😴 Rest (+energy)', () => act(rest(S))));
  quick.appendChild(actionBtn('🥂 Network (+rep)', () => act(network(S)), S.energy < 15));
  const aReq = agentReady(S);
  quick.appendChild(actionBtn(
    S.hasAgent ? '👋 Drop agent' : '🕴️ Sign an agent',
    () => act(toggleAgent(S)),
    !S.hasAgent && !aReq.met,
  ));
  wrap.appendChild(quick);

  // Early-game direction: progress toward representation.
  if (!S.hasAgent) {
    const fameOk = S.fame >= AGENT_FAME_REQ;
    const credOk = aReq.credits >= AGENT_CREDITS_REQ;
    const tip = el('div', 'agent-goal');
    tip.innerHTML = `🕴️ <b>Goal: land an agent</b> — they unlock studio films & series TV.
      <span class="${fameOk ? 'good' : 'bad'}">Fame ${Math.floor(S.fame)}/${AGENT_FAME_REQ}</span> ·
      <span class="${credOk ? 'good' : 'bad'}">Credits ${aReq.credits}/${AGENT_CREDITS_REQ}</span>`;
    wrap.appendChild(tip);
  }

  wrap.appendChild(el('h2', null, S.hasAgent ? 'Casting Board' : 'Open Calls'));
  if (isBusy(S)) {
    wrap.appendChild(el('p', 'muted', 'You\'re committed to a project — finish it before taking new acting roles. Advance the week to make progress.'));
    return wrap;
  }
  if (!S.offers.length) {
    wrap.appendChild(el('p', 'muted', 'No auditions on the board. Take extra work to keep the lights on and build craft, network for new leads, or advance the week.'));
    return wrap;
  }
  const grid = el('div', 'grid');
  for (const r of S.offers) grid.appendChild(roleCard(r));
  wrap.appendChild(grid);
  return wrap;
}

function roleCard(r) {
  const chance = Math.round(auditionChance(S, r) * 100);
  const chCls = chance >= 60 ? 'good' : chance >= 30 ? 'mid' : 'bad';
  const c = el('div', 'card' + (r.callback ? ' callback' : ''));
  c.innerHTML = `
    ${r.callback ? '<div class="badge">📞 Callback — they liked you</div>' : ''}
    <div class="card-head"><span class="card-ic">${r.icon}</span>
      <div><div class="card-title">${r.title} <span class="bill bill-${r.billing || 'supporting'}">${(BILLING[r.billing] || BILLING.supporting).label}</span></div>
      <div class="muted small">${r.genreIcon} ${r.genreName} ${r.catName} · ${r.part}${r.openCall ? ' · 📭 open call' : ''}</div></div></div>
    <div class="reqs">
      <span>💵 ${money(r.pay)}${r.negotiated === 'up' ? ' 🤝' : ''}</span>
      <span>⭐ +${r.fameGain}</span>
      <span>🎭 +${r.skillGain}</span>
      <span>${r.category === 'tvshow' ? '📺 series' : '⏱️ ' + r.weeks + ' wk'}</span>
    </div>
    <div class="reqs muted small">
      <span>Needs acting ${r.skillReq}</span>
      <span>Needs fame ${r.fameReq}</span>
    </div>
    <div class="chance ${chCls}">Audition odds: ${chance}%</div>
    ${offTypeNote(r)}
    ${r.negotiated === 'down' ? '<div class="bad small">😬 Casting cooled after a failed negotiation.</div>' : ''}`;
  const row = el('div', 'card-actions');
  row.appendChild(actionBtn(r.callback ? '🎟️ Callback audition (18⚡)' : '🎟️ Audition (18⚡)',
    () => act(audition(S, r.id)), S.energy < 18));
  row.appendChild(actionBtn(r.negotiated ? '🤝 Negotiated' : '🤝 Negotiate',
    () => act(negotiate(S, r.id)), !!r.negotiated));
  c.appendChild(row);
  return c;
}

function offTypeNote(r) {
  const tc = typecastInfo(S);
  if (!tc.genre || tc.degree <= 0) return '';
  if (r.genre === tc.genre) return `<div class="muted small">🎯 On-brand for your ${GENRES[tc.genre].name} image.</div>`;
  return `<div class="bad small">⚠️ Against type — you're known for ${GENRES[tc.genre].name} (−${Math.round(tc.degree * 15)}% odds).</div>`;
}

// ---- Train view ------------------------------------------------------------
function trainView() {
  const wrap = el('div', 'view');
  wrap.appendChild(el('h2', null, 'Develop Your Craft'));
  const grid = el('div', 'grid');
  for (const c of CLASSES) {
    const locked = c.unlockFame && S.fame < c.unlockFame;
    const cur = S[c.stat];
    const card = el('div', 'card');
    card.innerHTML = `
      <div class="card-head"><span class="card-ic">${c.icon}</span>
        <div><div class="card-title">${c.name}</div>
        <div class="muted small">${c.desc}</div></div></div>
      <div class="bar"><div class="bar-fill" style="width:${cur}%"></div></div>
      <div class="reqs small"><span>${c.stat}: ${cur.toFixed(0)}/100</span>
        <span>💵 ${money(c.cost)}</span><span>⚡ ${c.energy}</span></div>
      ${locked ? `<div class="chance bad">🔒 Unlocks at ${c.unlockFame} fame</div>` : ''}`;
    card.appendChild(actionBtn('📚 Attend class', () => act(takeClass(S, c.key)),
      locked || S.money < c.cost || S.energy < c.energy || cur >= c.cap));
    grid.appendChild(card);
  }
  wrap.appendChild(grid);
  return wrap;
}

// ---- Create view (write / produce / direct) --------------------------------
function createView() {
  const wrap = el('div', 'view');

  // Writing
  wrap.appendChild(el('h2', null, '✍️ Screenwriting'));
  if (S.writing < 5) {
    wrap.appendChild(el('p', 'muted', 'Take a Screenwriting Course (Train tab) to start writing your own scripts.'));
  } else {
    const w = el('div', 'panel-block');
    w.appendChild(el('p', 'muted', `Your writing skill: ${S.writing.toFixed(0)}. Better skill = higher quality scripts.`));
    w.appendChild(actionBtn('✍️ Write a script (30⚡)', () => act(writeScript(S)), S.energy < 30));
    wrap.appendChild(w);
  }

  // Scripts owned
  if (S.scripts.length) {
    wrap.appendChild(el('h3', null, 'Your Scripts'));
    const grid = el('div', 'grid');
    for (const sc of S.scripts) {
      const card = el('div', 'card');
      card.innerHTML = `<div class="card-title">📄 ${sc.title}</div>
        <div class="muted small">${sc.genreIcon ? sc.genreIcon + ' ' + sc.genreName + ' · ' : ''}Quality ${sc.quality}</div>`;
      card.appendChild(actionBtn(`💰 Sell to studio (~${money(sc.quality * 220)})`, () => act(sellScript(S, sc.id))));
      grid.appendChild(card);
    }
    wrap.appendChild(grid);
  }

  // Producing
  wrap.appendChild(el('h2', null, '🎬 Produce a Project'));
  if (S.producing < 5) {
    wrap.appendChild(el('p', 'muted', 'Take a Producing Bootcamp (Train tab) to greenlight your own films.'));
  } else {
    wrap.appendChild(producerForm());
  }
  return wrap;
}

function producerForm() {
  const block = el('div', 'panel-block');
  const state = { budgetKey: 'micro', scriptId: '', direct: false, star: false };

  // Budget select
  const bSel = el('select', 'select');
  for (const b of BUDGET_TIERS) {
    const o = el('option', null, `${b.name} — ${money(b.cost)}`);
    o.value = b.key;
    bSel.appendChild(o);
  }
  bSel.onchange = () => { state.budgetKey = bSel.value; };

  // Script select
  const sSel = el('select', 'select');
  const none = el('option', null, 'Generic script (lower quality)');
  none.value = '';
  sSel.appendChild(none);
  for (const sc of S.scripts) {
    const o = el('option', null, `${sc.genreIcon ? sc.genreIcon + ' ' : ''}${sc.title} (Q${sc.quality})`);
    o.value = sc.id;
    sSel.appendChild(o);
  }
  sSel.onchange = () => { state.scriptId = sSel.value; };

  // Direct checkbox
  const dirLabel = el('label', 'check');
  const dirBox = document.createElement('input');
  dirBox.type = 'checkbox';
  dirBox.disabled = S.directing < 5;
  dirBox.onchange = () => { state.direct = dirBox.checked; update(); };
  dirLabel.appendChild(dirBox);
  dirLabel.appendChild(document.createTextNode(
    S.directing < 5 ? ' Also direct (needs directing 5+)' : ' Also direct it (+prestige)'));

  // Star-in-it checkbox (full auteur)
  const starLabel = el('label', 'check');
  const starBox = document.createElement('input');
  starBox.type = 'checkbox';
  starBox.onchange = () => { state.star = starBox.checked; update(); };
  starLabel.appendChild(starBox);
  starLabel.appendChild(document.createTextNode(' Star in it (your acting boosts quality; you can rehearse during the shoot)'));

  // Live projection + affordability-gated greenlight
  const preview = el('div', 'estimate');
  const go = el('button', 'btn primary', '🎬 Greenlight production');
  go.onclick = () => act(startProduction(S, state));
  bSel.onchange = () => { state.budgetKey = bSel.value; update(); };
  sSel.onchange = () => { state.scriptId = sSel.value; update(); };

  function update() {
    const est = estimateProduction(S, state);
    if (!est) { preview.innerHTML = ''; return; }
    const profit = est.grossExp - est.cost;
    go.disabled = !est.affordable;
    preview.innerHTML = `
      <div class="est-row"><span>Projected quality</span><span>${est.qLow}–${est.qHigh} <span class="muted">(~${est.qExp})</span></span></div>
      <div class="est-row"><span>Budget</span><span>${money(est.cost)}</span></div>
      <div class="est-row"><span>Projected box office</span><span>~${money(est.grossExp)}</span></div>
      <div class="est-row ${profit >= 0 ? 'good' : 'bad'}"><span>Projected profit</span><span>${profit >= 0 ? '+' : ''}${money(profit)}</span></div>
      ${est.affordable ? '' : '<div class="bad small">You can\'t afford this budget yet.</div>'}`;
  }

  block.appendChild(labeled('Budget', bSel));
  block.appendChild(labeled('Script', sSel));
  block.appendChild(dirLabel);
  block.appendChild(starLabel);
  block.appendChild(preview);
  block.appendChild(go);
  block.appendChild(el('p', 'muted small', 'Producing ties up no energy but locks in your money. Projections ignore luck — actual results swing higher or lower. Each production also builds your affinity in its genre.'));
  update();
  return block;
}

function labeled(label, node) {
  const w = el('div', 'field');
  w.appendChild(el('span', 'field-lab', label));
  w.appendChild(node);
  return w;
}

// ---- Goals view (milestones) -----------------------------------------------
function goalsView() {
  const wrap = el('div', 'view');
  const done = MILESTONES.filter((m) => S.milestonesDone[m.key]);
  const pending = MILESTONES.filter((m) => !S.milestonesDone[m.key]);
  wrap.appendChild(el('h2', null, `🎯 Career Goals — ${done.length}/${MILESTONES.length}`));
  wrap.appendChild(el('p', 'muted small', 'Milestones chart your rise from unknown to icon. Each grants a small reward when reached.'));

  if (pending.length) {
    wrap.appendChild(el('h3', null, 'Up Next'));
    const grid = el('div', 'grid');
    for (const m of pending) grid.appendChild(goalCard(m, false));
    wrap.appendChild(grid);
  }
  if (done.length) {
    wrap.appendChild(el('h3', null, '✅ Achieved'));
    const grid = el('div', 'grid');
    for (const m of done) grid.appendChild(goalCard(m, true));
    wrap.appendChild(grid);
  }
  return wrap;
}

function goalCard(m, complete) {
  const r = m.reward || {};
  const reward = [r.money ? `+$${r.money}` : null, r.rep ? `+${r.rep} rep` : null, r.fame ? `+${r.fame} fame` : null].filter(Boolean).join(' · ');
  const card = el('div', 'card goal' + (complete ? ' goal-done' : ''));
  card.innerHTML = `<div class="card-head"><span class="card-ic">${complete ? '✅' : m.icon}</span>
    <div><div class="card-title">${m.name}</div>
    <div class="muted small">${m.desc}</div></div></div>
    ${reward ? `<div class="muted small">Reward: ${reward}${complete && S.milestonesDone[m.key] ? ` · <span class="good">done Yr ${S.milestonesDone[m.key]}</span>` : ''}</div>` : ''}`;
  return card;
}

// ---- Finances view (income, taxes, lifestyle assets) -----------------------
function financesView() {
  const wrap = el('div', 'view');
  wrap.appendChild(el('h2', null, '💰 Finances'));

  const upkeep = ownedAssets(S).reduce((t, a) => t + a.upkeep, 0);
  const summary = el('div', 'hof-grid');
  const stat = (lab, val) => `<div class="hof-stat"><span class="hof-val">${val}</span><span class="hof-lab">${lab}</span></div>`;
  summary.innerHTML = stat('Net worth', bigMoney(S.money))
    + stat('Income this yr', bigMoney(Math.round(S.yearIncome || 0)))
    + stat('Tax withheld', bigMoney(Math.round(S.taxWithheld || 0)))
    + stat('Weekly upkeep', bigMoney(diffOf(S).living + upkeep));
  wrap.appendChild(summary);
  wrap.appendChild(el('p', 'muted small', 'Income is taxed progressively, withheld as you earn (the figures above are gross). Lifestyle assets cost a fortune to maintain but boost your fame and status — live large, but keep the work coming.'));

  wrap.appendChild(el('h3', null, '🏛️ Lifestyle & Assets'));
  const grid = el('div', 'grid');
  for (const a of ASSETS) {
    const owned = (S.assets || []).includes(a.key);
    const card = el('div', 'card' + (owned ? ' goal-done' : ''));
    card.innerHTML = `<div class="card-head"><span class="card-ic">${a.icon}</span>
      <div><div class="card-title">${a.name}</div>
      <div class="muted small">${a.desc}</div></div></div>
      <div class="reqs small"><span>💵 ${money(a.cost)}</span><span>🔧 ${money(a.upkeep)}/wk</span>
        <span>⭐ +${a.fame}</span>${a.energy ? `<span>⚡ +${a.energy}/wk</span>` : ''}</div>`;
    if (owned) card.appendChild(el('div', 'good small', '✅ Owned'));
    else card.appendChild(actionBtn(`Buy (${money(a.cost)})`, () => act(buyAsset(S, a.key)), S.money < a.cost));
    grid.appendChild(card);
  }
  wrap.appendChild(grid);
  return wrap;
}

// ---- People view (co-stars & relationships) --------------------------------
function peopleView() {
  const wrap = el('div', 'view');

  // Rivals
  if (S.rivals && S.rivals.length) {
    wrap.appendChild(el('h2', null, '😤 Rivals'));
    wrap.appendChild(el('p', 'muted small', 'Peers who compete with you for roles and awards across your career. They keep working — and getting more famous — too.'));
    const nemesis = [...S.rivals].sort((a, b) => b.rivalry - a.rivalry)[0];
    const grid = el('div', 'grid');
    for (const r of [...S.rivals].sort((a, b) => b.fame - a.fame)) {
      const lead = r.fame > S.fame;
      const card = el('div', 'card');
      card.innerHTML = `<div class="card-head"><span class="card-ic">${r === nemesis && r.rivalry > 40 ? '🔥' : '🎭'}</span>
        <div><div class="card-title">${r.name}${r === nemesis && r.rivalry > 40 ? ' <span class="muted small">· nemesis</span>' : ''}</div>
        <div class="muted small">⭐ Fame ${r.fame} ${lead ? '(ahead of you)' : '(behind you)'} · Skill ${r.skill}</div></div></div>
        <div class="bar"><div class="bar-fill" style="width:${r.rivalry}%"></div></div>
        <div class="reqs small"><span class="${r.rivalry >= 60 ? 'bad' : r.rivalry >= 30 ? 'mid' : 'muted'}">Rivalry ${Math.round(r.rivalry)}/100</span></div>`;
      grid.appendChild(card);
    }
    wrap.appendChild(grid);
  }

  wrap.appendChild(el('h2', null, '👥 Relationships'));
  wrap.appendChild(el('p', 'muted small', 'Co-stars you work with become contacts. Close, famous friends boost your audition odds, and on-set chemistry can turn romantic. Catch up to keep bonds strong.'));

  if (S.partner) {
    const p = S.contacts.find((c) => c.id === S.partner);
    if (p) wrap.appendChild(el('div', 'panel-block', `💞 <b>Dating ${p.name}</b> <span class="muted">(fame ${p.fame})</span> — Hollywood's favorite couple.`));
  }

  if (!S.contacts.length) {
    wrap.appendChild(el('p', 'muted', 'You haven\'t met anyone yet. Land a role to meet your first co-stars.'));
    return wrap;
  }

  const sorted = [...S.contacts].sort((a, b) => b.rel - a.rel);
  const grid = el('div', 'grid');
  for (const c of sorted) {
    const card = el('div', 'card');
    const relCls = c.rel >= 60 ? 'good' : c.rel >= 30 ? 'mid' : 'bad';
    card.innerHTML = `
      <div class="card-head"><span class="card-ic">${c.romance ? '💞' : '🎭'}</span>
        <div><div class="card-title">${c.name}</div>
        <div class="muted small">⭐ Fame ${c.fame} · ${c.projects} project${c.projects === 1 ? '' : 's'} together</div></div></div>
      <div class="bar"><div class="bar-fill" style="width:${c.rel}%"></div></div>
      <div class="reqs small"><span class="${relCls}">Relationship ${Math.round(c.rel)}/100</span></div>`;
    card.appendChild(actionBtn('☕ Catch up (10⚡)', () => act(catchUp(S, c.id)), S.energy < 10));
    grid.appendChild(card);
  }
  wrap.appendChild(grid);
  return wrap;
}

// ---- Career view (profile, filmography, awards) ----------------------------
function careerView() {
  const wrap = el('div', 'view');
  const spec = specialty(S);
  const title = spec ? `${fameTier(S.fame)} · ${spec.icon} ${spec.specialty}` : fameTier(S.fame);
  wrap.appendChild(el('h2', null, `👤 ${S.name} — ${title}`));
  const D = diffOf(S);
  wrap.appendChild(el('p', 'muted small', `${D.icon} ${D.name} difficulty`));

  const skills = el('div', 'skills');
  for (const [lab, key] of [['Acting', 'acting'], ['Directing', 'directing'], ['Writing', 'writing'], ['Producing', 'producing']]) {
    const row = el('div', 'skill-row');
    row.innerHTML = `<span class="skill-lab">${lab}</span>
      <div class="bar"><div class="bar-fill" style="width:${S[key]}%"></div></div>
      <span class="skill-num">${S[key].toFixed(0)}</span>`;
    skills.appendChild(row);
  }
  wrap.appendChild(skills);

  // Genre specialization
  wrap.appendChild(el('h3', null, '🎬 Genre Specialization'));
  const maxAff = Math.max(1, ...GENRE_KEYS.map((k) => S.genres[k] || 0));
  const gskills = el('div', 'skills');
  for (const k of GENRE_KEYS) {
    const v = S.genres[k] || 0;
    const row = el('div', 'skill-row');
    row.innerHTML = `<span class="skill-lab">${GENRES[k].icon} ${GENRES[k].name}</span>
      <div class="bar"><div class="bar-fill" style="width:${(v / maxAff) * 100}%"></div></div>
      <span class="skill-num">${v.toFixed(0)}</span>`;
    gskills.appendChild(row);
  }
  wrap.appendChild(gskills);
  const tc = typecastInfo(S);
  if (tc.genre && tc.degree > 0) {
    const sev = tc.degree > 0.6 ? 'bad' : 'mid';
    wrap.appendChild(el('p', `small ${sev === 'bad' ? 'chance bad' : ''}`,
      `🎭 <b>Typecast</b> as a ${GENRES[tc.genre].icon} ${GENRES[tc.genre].name} actor (${Math.round(tc.share * 100)}% of your work). ` +
      `Casting against type is ${Math.round(tc.degree * 15)}% harder. Work other genres to broaden your range.`));
  } else {
    wrap.appendChild(el('p', 'muted small', 'More experience in a genre raises your audition odds for similar roles — and defines your public brand. Spread too thin in one and you risk being typecast.'));
  }

  const meta = el('div', 'meta-row');
  meta.innerHTML = `<span>Agent: ${S.hasAgent ? '✅ Signed' : '— None'}</span>
    <span>💵 Net worth: ${bigMoney(S.money)}</span>
    <span>🏅 Career prestige: ${Math.round(S.careerPrestige || 0)}</span>
    <span>Auditions: ${S.stats.auditions}</span>
    <span>Roles landed: ${S.stats.landed}</span>
    <span>Extra gigs: ${S.stats.extra || 0}</span>
    <span>TV seasons: ${S.stats.seasons || 0}</span>
    <span>Scripts sold: ${(S.writingCredits || []).length}</span>
    <span>Contacts: ${S.contacts.length}</span>
    <span>Classes: ${S.stats.classes}</span>`;
  wrap.appendChild(meta);

  wrap.appendChild(awardsSection());

  // Filmography
  wrap.appendChild(el('h3', null, `🎞️ Filmography (${S.filmography.length})`));
  if (!S.filmography.length) wrap.appendChild(el('p', 'muted', 'No credits yet. Land your first role!'));
  else {
    const ul = el('ul', 'list');
    for (const f of [...S.filmography].reverse()) {
      const rec = f.reception ? ` <span class="muted small">· ${f.reception}</span>` : '';
      const res = f.result ? ` <span class="muted small">· ${resultText(f.result)}</span>` : '';
      ul.appendChild(el('li', null, `<b>${f.title}</b> — ${f.role} <span class="muted">(${f.genre ? f.genre + ' ' : ''}${f.category}, Yr ${f.year})</span>${f.quality != null ? ` <span class="qchip">★ ${f.quality}</span>` : ''}${rec}${res}`));
    }
    wrap.appendChild(ul);
  }

  // Retirement: cement your legacy and end the game on your own terms.
  const leg = careerLegacy(S);
  const retireBlock = el('div', 'panel-block retire-block');
  retireBlock.innerHTML = `<p>🎬 <b>Retire</b> — end your career and take your place in history.
    <span class="muted">Current legacy: ${leg.rank.icon} ${leg.rank.label} (${leg.score})${leg.lifetimeAchievement ? ' · 🎖️ Lifetime Achievement eligible' : ''}</span></p>`;
  retireBlock.appendChild(actionBtn('🎬 Retire & cement your legacy', () => {
    if (window.confirm('Retire for good? This ends your career and shows your final legacy.')) act(retire(S));
  }));
  wrap.appendChild(retireBlock);
  return wrap;
}

// ---- Awards & nominations --------------------------------------------------
function awardsSection() {
  const wrap = el('div');
  const wins = S.awards.filter((a) => a.won);
  const noms = S.awards.filter((a) => !a.won);
  wrap.appendChild(el('h3', null, `🏆 Awards — ${wins.length} win${wins.length === 1 ? '' : 's'}, ${noms.length} nomination${noms.length === 1 ? '' : 's'}`));

  if (!S.awards.length) {
    wrap.appendChild(el('p', 'muted', 'No nominations yet. Awards go to prestigious work — strong films, acclaimed TV, and projects you direct or produce. Commercials don\'t count.'));
    const cal = el('div', 'awards-cal');
    for (const c of CEREMONIES) {
      cal.appendChild(el('div', 'cal-chip', `${c.icon} ${c.name} <span class="muted">· wk ${c.week}</span>`));
    }
    wrap.appendChild(cal);
    return wrap;
  }

  // Group by ceremony, in calendar order.
  for (const cer of CEREMONIES) {
    const mine = S.awards.filter((a) => a.ceremonyKey === cer.key);
    if (!mine.length) continue;
    const w = mine.filter((a) => a.won).length;
    wrap.appendChild(el('h4', 'award-head', `${cer.icon} ${cer.name} <span class="muted">— ${w} win${w === 1 ? '' : 's'} / ${mine.length} nom${mine.length === 1 ? '' : 's'}</span>`));
    const ul = el('ul', 'list');
    for (const a of [...mine].reverse()) {
      ul.appendChild(el('li', a.won ? 'award-win' : '',
        `${a.won ? '🥇' : '🎗️'} <b>${a.category}</b> — ${a.project} <span class="muted">(Yr ${a.year})</span>`));
    }
    wrap.appendChild(ul);
  }
  // Any legacy awards from older saves (pre-ceremony format).
  const legacy = S.awards.filter((a) => !a.ceremonyKey);
  if (legacy.length) {
    const ul = el('ul', 'list');
    for (const a of legacy) ul.appendChild(el('li', null, `🏆 ${a.name || a.category || 'Award'} <span class="muted">(Yr ${a.year})</span> — ${a.project || ''}`));
    wrap.appendChild(ul);
  }
  return wrap;
}

// ---- Game over / retirement ------------------------------------------------
function gameOverView() {
  const v = el('div', 'view gameover');
  const retired = S.gameOverReason === 'retired';
  const leg = S.legacy || careerLegacy(S);

  v.appendChild(el('div', 'hof-rank', `${leg.rank.icon}`));
  v.appendChild(el('h2', null, retired
    ? `${S.name} — ${leg.rank.label}`
    : '💀 Career Over'));
  v.appendChild(el('p', null, retired
    ? `After ${S.year} year(s) in the business, you retire and take your place in the Hall of Fame.`
    : `${S.name} went broke and left the business after ${S.year} year(s).`));

  if (retired && leg.lifetimeAchievement) {
    v.appendChild(el('div', 'lifetime', '🎖️ Honored with a <b>Lifetime Achievement Award</b> for a storied career.'));
  }

  // Legacy scorecard
  const wins = S.awards.filter((a) => a.won).length;
  const noms = S.awards.filter((a) => !a.won).length;
  const grid = el('div', 'hof-grid');
  const stat = (lab, val) => `<div class="hof-stat"><span class="hof-val">${val}</span><span class="hof-lab">${lab}</span></div>`;
  grid.innerHTML = stat('Legacy score', leg.score)
    + stat('Peak fame', `${S.fame.toFixed(0)}`)
    + stat('Award wins', wins)
    + stat('Nominations', noms)
    + stat('Oscar wins', leg.oscarWins)
    + stat('Credits', S.filmography.length)
    + stat('Career prestige', Math.round(S.careerPrestige || 0))
    + stat('Final net worth', bigMoney(S.money));
  v.appendChild(grid);

  // Hall of Fame ladder
  v.appendChild(el('p', 'muted small', `Hall of Fame rank: ${leg.rank.icon} ${leg.rank.label}`));

  const btn = actionBtn('🔄 Start a new career', () => { if (window.__stardomNewGame) window.__stardomNewGame(); });
  v.appendChild(btn);
  return v;
}

// ---- Awards-night summary modal --------------------------------------------
// Show at most one modal: awards night takes priority over a pending dilemma.
function renderModals() {
  const existing = document.querySelector('#modal');
  if (existing) existing.remove();
  if (S.gameOver) return;
  if (S.releaseNight) buildReleaseModal();
  else if (S.ceremonyNight) buildCeremonyModal();
  else if (S.pendingChoice) buildChoiceModal();
}

function buildReleaseModal() {
  const r = S.releaseNight;
  const { overlay, card } = modalShell();
  card.appendChild(el('div', 'modal-ic', r.emoji || r.icon || '🎬'));
  card.appendChild(el('h2', null, `"${r.title}"`));
  card.appendChild(el('p', 'muted', `${r.icon ? r.icon + ' ' : ''}${r.category}${r.role ? ' · ' + r.role : ''}`));

  const rows = el('div', 'estimate');
  const row = (lab, val, cls) => `<div class="est-row ${cls || ''}"><span>${lab}</span><span>${val}</span></div>`;
  let html = '';
  if (r.result) html += row(r.result.type === 'box' ? 'Box office' : 'Viewership', resultText(r.result));
  if (r.rating != null) html += row('Rating', `${r.rating}/100`);
  if (r.quality != null) html += row('Your performance', `${r.quality}/100`);
  if (r.profit != null) html += row('Profit', `${r.profit >= 0 ? '+' : ''}${money(r.profit)}`, r.profit >= 0 ? 'good' : 'bad');
  if (r.fameGain != null) html += row('Fame gained', `+${r.fameGain}`);
  rows.innerHTML = html;
  card.appendChild(rows);

  card.appendChild(el('p', `modal-headline ${/Hit|Smash/.test(r.reception) ? 'good' : ''}`,
    `${r.emoji} ${r.reception}${r.verdict ? ' — ' + r.verdict : '!'}`));
  if (r.costars && r.costars.length) {
    card.appendChild(el('p', 'muted small', `Starring you, with ${r.costars.slice(0, 3).join(', ')}`));
  }

  const btn = actionBtn('Continue', () => {
    S.releaseNight = null;
    if (onMutate) onMutate(S);
    overlay.remove();
    render();
  });
  btn.classList.add('primary');
  card.appendChild(btn);
}

function modalShell() {
  const overlay = el('div', 'modal-overlay');
  overlay.id = 'modal';
  const card = el('div', 'modal-card');
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  return { overlay, card };
}

function buildCeremonyModal() {
  const night = S.ceremonyNight;
  const { overlay, card } = modalShell();
  const won = night.wins > 0;
  card.appendChild(el('div', 'modal-ic', night.icon));
  card.appendChild(el('h2', null, `${night.name}`));
  card.appendChild(el('p', 'muted', `Awards Night · Year ${night.year}`));

  const ul = el('ul', 'list modal-list');
  for (const r of night.results) {
    const react = (r.reactions && r.reactions.length)
      ? `<div class="muted small">${r.won ? '🤝 Celebrating with' : '👏 Supported by'} ${r.reactions.slice(0, 3).join(', ')}</div>`
      : '';
    const lost = (!r.won && r.beatenBy) ? `<div class="muted small">Lost to ${r.beatenBy}</div>` : '';
    ul.appendChild(el('li', r.won ? 'award-win' : '',
      `${r.won ? '🥇 WON' : '🎗️ Nominated'} — <b>${r.category}</b> <span class="muted">(${r.project})</span>${lost}${react}`));
  }
  card.appendChild(ul);
  card.appendChild(el('p', won ? 'modal-headline good' : 'modal-headline',
    won ? `🎉 ${night.wins} win${night.wins === 1 ? '' : 's'} tonight!` : 'A nomination is its own honor.'));

  const btn = actionBtn('Continue', () => {
    S.ceremonyNight = null;
    if (onMutate) onMutate(S);
    overlay.remove();
    render();
  });
  btn.classList.add('primary');
  card.appendChild(btn);
}

function buildChoiceModal() {
  const ch = S.pendingChoice;
  const { overlay, card } = modalShell();
  card.appendChild(el('div', 'modal-ic', '🎬'));
  card.appendChild(el('h2', null, ch.title));
  card.appendChild(el('p', 'modal-text', ch.text));

  const opts = el('div', 'choice-opts');
  ch.options.forEach((o, i) => {
    const b = el('button', 'btn choice-btn', o.label);
    b.onclick = () => {
      const res = resolveChoice(S, i);
      overlay.remove();
      // Show the outcome, then continue.
      const o2 = modalShell();
      o2.card.appendChild(el('div', 'modal-ic', '🎬'));
      o2.card.appendChild(el('h2', null, ch.title));
      o2.card.appendChild(el('p', 'modal-text', res.msg || 'Done.'));
      const cont = actionBtn('Continue', () => {
        o2.overlay.remove();
        if (onMutate) onMutate(S);
        render();
      });
      cont.classList.add('primary');
      o2.card.appendChild(cont);
    };
    opts.appendChild(b);
  });
  card.appendChild(opts);
}

// ---- Log -------------------------------------------------------------------
function renderLog() {
  const l = $('#log');
  l.innerHTML = '<div class="log-title">📜 Activity Log</div>';
  for (const entry of S.log) {
    l.appendChild(el('div', 'log-entry', `<span class="muted">Y${entry.year}W${entry.week}</span> ${entry.msg}`));
  }
}

// ---- Helpers ---------------------------------------------------------------
function actionBtn(label, fn, disabled = false) {
  const b = el('button', 'btn', label);
  if (disabled) b.disabled = true;
  else b.onclick = fn;
  return b;
}

// ---- Master render ---------------------------------------------------------
export function render() {
  renderStats();
  renderBanner();
  renderTabs();
  renderPanel();
  renderLog();
  const adv = $('#advance');
  adv.disabled = S.gameOver;
  adv.onclick = () => { advanceWeek(S); act({ ok: true }); };
  renderModals();
}
