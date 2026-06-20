// ui.js — rendering & event wiring
import { CLASSES, fameTier, AWARD_NAME } from './data.js';
import {
  audition, auditionChance, takeClass, network, rest, sideJob, toggleAgent,
  writeScript, sellScript, startProduction, advanceWeek, isBusy, BUDGET_TIERS,
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

export function bindUI(state, mutateCb) {
  S = state;
  onMutate = mutateCb;
  render();
}

function act(result) {
  if (result && result.msg) toast(result.msg, result.ok === false ? 'bad' : 'good');
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
    ['💵', 'Money', money(S.money), S.money < 0 ? 'warn' : ''],
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
    parts.push(progressCard(`🎬 Filming "${a.role.title}" — ${a.role.part}`, a.totalWeeks - a.weeksLeft, a.totalWeeks, `${a.weeksLeft} wk left`));
  }
  for (const p of S.productions) {
    parts.push(progressCard(`🎥 Producing "${p.title}" (${p.budgetName})`, p.totalWeeks - p.weeksLeft, p.totalWeeks, `${p.weeksLeft} wk left`));
  }
  if (!parts.length) {
    b.appendChild(el('div', 'banner-idle', '🟢 You\'re free this week — audition, train, or create.'));
    return;
  }
  parts.forEach((p) => b.appendChild(p));
}

function progressCard(label, done, total, right) {
  const pct = Math.round((done / total) * 100);
  const c = el('div', 'banner-active');
  c.innerHTML = `<div class="banner-row"><span>${label}</span><span class="muted">${right}</span></div>
    <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>`;
  return c;
}

// ---- Tabs ------------------------------------------------------------------
const TABS = [
  ['auditions', '🎟️ Auditions'],
  ['train', '📚 Train'],
  ['create', '🎬 Create'],
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
  else if (activeTab === 'train') p.appendChild(trainView());
  else if (activeTab === 'create') p.appendChild(createView());
  else if (activeTab === 'career') p.appendChild(careerView());
}

// ---- Auditions view --------------------------------------------------------
function auditionsView() {
  const wrap = el('div', 'view');
  // Quick actions
  const quick = el('div', 'quick');
  quick.appendChild(actionBtn('😴 Rest (+energy)', () => act(rest(S))));
  quick.appendChild(actionBtn('🥂 Network (+rep)', () => act(network(S)), S.energy < 15));
  quick.appendChild(actionBtn('🍽️ Side job (+$)', () => act(sideJob(S)), S.energy < 20));
  quick.appendChild(actionBtn(
    S.hasAgent ? '👋 Drop agent' : '🕴️ Get agent',
    () => act(toggleAgent(S)),
    !S.hasAgent && S.fame < 12,
  ));
  wrap.appendChild(quick);

  wrap.appendChild(el('h2', null, 'Casting Board'));
  if (isBusy(S)) {
    wrap.appendChild(el('p', 'muted', 'You\'re committed to a project — finish it before taking new acting roles. Advance the week to make progress.'));
    return wrap;
  }
  if (!S.offers.length) {
    wrap.appendChild(el('p', 'muted', 'No auditions available. Network or advance the week for new listings.'));
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
  const c = el('div', 'card');
  c.innerHTML = `
    <div class="card-head"><span class="card-ic">${r.icon}</span>
      <div><div class="card-title">${r.title}</div>
      <div class="muted small">${r.catName} · ${r.part}</div></div></div>
    <div class="reqs">
      <span>💵 ${money(r.pay)}</span>
      <span>⭐ +${r.fameGain}</span>
      <span>🎭 +${r.skillGain}</span>
      <span>⏱️ ${r.weeks} wk</span>
    </div>
    <div class="reqs muted small">
      <span>Needs acting ${r.skillReq}</span>
      <span>Needs fame ${r.fameReq}</span>
    </div>
    <div class="chance ${chCls}">Audition odds: ${chance}%</div>`;
  const btn = actionBtn('🎟️ Audition (18⚡)', () => act(audition(S, r.id)), S.energy < 18);
  c.appendChild(btn);
  return c;
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
        <div class="muted small">Quality ${sc.quality}</div>`;
      card.appendChild(actionBtn('💰 Sell to studio', () => act(sellScript(S, sc.id))));
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
  const state = { budgetKey: 'micro', scriptId: '', direct: false };

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
    const o = el('option', null, `${sc.title} (Q${sc.quality})`);
    o.value = sc.id;
    sSel.appendChild(o);
  }
  sSel.onchange = () => { state.scriptId = sSel.value; };

  // Direct checkbox
  const dirLabel = el('label', 'check');
  const dirBox = document.createElement('input');
  dirBox.type = 'checkbox';
  dirBox.disabled = S.directing < 5;
  dirBox.onchange = () => { state.direct = dirBox.checked; };
  dirLabel.appendChild(dirBox);
  dirLabel.appendChild(document.createTextNode(
    S.directing < 5 ? ' Also direct (needs directing 5+)' : ' Also direct it (+prestige)'));

  block.appendChild(labeled('Budget', bSel));
  block.appendChild(labeled('Script', sSel));
  block.appendChild(dirLabel);
  block.appendChild(actionBtn('🎬 Greenlight production', () => act(startProduction(S, state))));
  block.appendChild(el('p', 'muted small', 'Producing ties up no energy but locks in your money. Quality (and box office) depend on your script, producing skill, and—if you direct—your directing skill.'));
  return block;
}

function labeled(label, node) {
  const w = el('div', 'field');
  w.appendChild(el('span', 'field-lab', label));
  w.appendChild(node);
  return w;
}

// ---- Career view (profile, filmography, awards) ----------------------------
function careerView() {
  const wrap = el('div', 'view');
  wrap.appendChild(el('h2', null, `👤 ${S.name} — ${fameTier(S.fame)}`));

  const skills = el('div', 'skills');
  for (const [lab, key] of [['Acting', 'acting'], ['Directing', 'directing'], ['Writing', 'writing'], ['Producing', 'producing']]) {
    const row = el('div', 'skill-row');
    row.innerHTML = `<span class="skill-lab">${lab}</span>
      <div class="bar"><div class="bar-fill" style="width:${S[key]}%"></div></div>
      <span class="skill-num">${S[key].toFixed(0)}</span>`;
    skills.appendChild(row);
  }
  wrap.appendChild(skills);

  const meta = el('div', 'meta-row');
  meta.innerHTML = `<span>Agent: ${S.hasAgent ? '✅ Signed' : '— None'}</span>
    <span>Auditions: ${S.stats.auditions}</span>
    <span>Roles landed: ${S.stats.landed}</span>
    <span>Classes: ${S.stats.classes}</span>`;
  wrap.appendChild(meta);

  // Awards
  wrap.appendChild(el('h3', null, `🏆 ${AWARD_NAME} Awards (${S.awards.length})`));
  if (!S.awards.length) wrap.appendChild(el('p', 'muted', 'No wins yet. Do prestigious work to earn nominations at year\'s end.'));
  else {
    const ul = el('ul', 'list');
    for (const a of S.awards) ul.appendChild(el('li', null, `🏆 ${a.name} (Yr ${a.year}) — ${a.project}`));
    wrap.appendChild(ul);
  }

  // Filmography
  wrap.appendChild(el('h3', null, `🎞️ Filmography (${S.filmography.length})`));
  if (!S.filmography.length) wrap.appendChild(el('p', 'muted', 'No credits yet. Land your first role!'));
  else {
    const ul = el('ul', 'list');
    for (const f of [...S.filmography].reverse()) {
      ul.appendChild(el('li', null, `<b>${f.title}</b> — ${f.role} <span class="muted">(${f.category}, Yr ${f.year})</span>`));
    }
    wrap.appendChild(ul);
  }
  return wrap;
}

// ---- Game over -------------------------------------------------------------
function gameOverView() {
  const v = el('div', 'view gameover');
  v.appendChild(el('h2', null, '💀 Game Over'));
  v.appendChild(el('p', null, `${S.name}'s acting career has come to an end after ${S.year} year(s).`));
  v.appendChild(el('p', 'muted', `Peak fame: ${S.fame.toFixed(0)} (${fameTier(S.fame)}) · ${S.filmography.length} credits · ${S.awards.length} ${AWARD_NAME} award(s).`));
  const btn = actionBtn('🔄 Start a new career', () => { if (window.__stardomNewGame) window.__stardomNewGame(); });
  v.appendChild(btn);
  return v;
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
}
