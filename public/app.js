'use strict';
/* ============================================================
   RAMI 51 — client
   ============================================================ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const E = window.E;

const SUIT = { S: '♠', H: '♥', D: '♦', C: '♣' };
const AVATARS = ['🦊', '🐼', '🐯', '🐸', '🦁', '🐵', '🐧', '🐨', '🐙', '🦄', '🐳', '🦉'];
const EMOJIS = ['😂', '🔥', '👏', '😭', '😎', '🤝', '💪', '🃏', '🍀', '💥'];

const S = {
  ws: null, name: localStorage.getItem('rami_name') || '', avatar: localStorage.getItem('rami_avatar') || AVATARS[Math.floor(Math.random() * AVATARS.length)],
  token: localStorage.getItem('rami_token') || null, room: null, pid: null, state: null,
  sel: new Set(), selMeld: null, sound: localStorage.getItem('rami_sound') !== '0',
  auto: null, spectator: false, lastSeq: -1, tab: 'journal', prevTurn: null, seenMelds: new Set(),
  theme: localStorage.getItem('rami_theme') || 'classic',
  sortMode: 'auto', sortKind: 'suit', handOrder: [], customModal: false, warnedManual: false,
};
try {
  const sv = JSON.parse(localStorage.getItem('rami_sort') || '{}');
  if (sv.mode === 'manual' || sv.mode === 'auto') S.sortMode = sv.mode;
  if (sv.kind === 'suit' || sv.kind === 'num') S.sortKind = sv.kind;
} catch (e) { }
function saveSort() { try { localStorage.setItem('rami_sort', JSON.stringify({ mode: S.sortMode, kind: S.sortKind })); } catch (e) { } }

/* sha2a9 el wara9 */
const CARD_THEMES = [
  { id: 'classic', name: '🂡 كلاسيكي', desc: 'ورق بيض عادي — كما الكارطة العادية' },
  { id: 'neon', name: '🌌 نيون', desc: 'أسود و أزرق يلمع — vibe مta3 الليل' },
  { id: 'royal', name: '👑 رويال', desc: 'إطار ذهبي — كما الكازينوهات' },
  { id: 'modern', name: '🃏 مودرن', desc: 'نقي و بسيط — شكل 2026' },
];
function applyTheme(id) {
  S.theme = id;
  document.body.dataset.theme = id;
  try { localStorage.setItem('rami_theme', id); } catch (e) { }
}

/* ============================================================
   SOUND (WebAudio — bla fichiers)
   ============================================================ */
let AC = null;
function ac() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } } return AC; }
function tone(f, dur = .08, type = 'sine', vol = .06, delay = 0) {
  if (!S.sound) return; const c = ac(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(0, c.currentTime + delay);
  g.gain.linearRampToValueAtTime(vol, c.currentTime + delay + .012);
  g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + delay + dur);
  o.connect(g).connect(c.destination); o.start(c.currentTime + delay); o.stop(c.currentTime + delay + dur + .02);
}
const SFX = {
  draw: () => tone(520, .05, 'square', .04),
  discard: () => { tone(200, .1, 'triangle', .07); tone(140, .14, 'triangle', .05, .02); },
  meld: () => [523, 659, 784].forEach((f, i) => tone(f, .12, 'sine', .05, i * .07)),
  open: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, .22, 'triangle', .06, i * .1)),
  win: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, .3, 'sine', .07, i * .12)),
  err: () => { tone(180, .12, 'sawtooth', .05); tone(120, .16, 'sawtooth', .05, .1); },
  turn: () => { tone(880, .1, 'sine', .06); tone(1175, .14, 'sine', .05, .1); },
  click: () => tone(660, .04, 'square', .03),
  join: () => [659, 880].forEach((f, i) => tone(f, .12, 'sine', .05, i * .08)),
};

/* ============================================================
   HELPERS DOM
   ============================================================ */
function el(tag, cls, html) { const d = document.createElement(tag); if (cls) d.className = cls; if (html != null) d.innerHTML = html; return d; }
function cardEl(card, opt = {}) {
  const d = el('div', 'card');
  if (opt.small) d.classList.add('small');
  if (!card || opt.back) { d.classList.add('back'); return d; }
  if (card.r === 'JOKER') { d.classList.add('joker'); d.innerHTML = '<div class="jk">🃏</div><div class="jkt">JOKER</div><div class="gloss"></div>'; }
  else {
    d.classList.add(card.s === 'H' || card.s === 'D' ? 'red' : 'black');
    const g = SUIT[card.s] || '';
    d.innerHTML = `<div class="corner tl"><span>${card.r}</span><span>${g}</span></div>
      <div class="pip">${g}</div>
      <div class="corner br"><span>${card.r}</span><span>${g}</span></div>
      <div class="gloss"></div>`;
  }
  if (card.id) d.dataset.id = card.id;
  if (opt.cls) opt.cls.split(/\s+/).forEach(c => { if (c) d.classList.add(c); });
  return d;
}
function toast(msg, kind) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (kind === 'info' ? ' info' : '');
  clearTimeout(t._h); t._h = setTimeout(() => t.className = 'toast' + (kind === 'info' ? ' info' : ''), 2600);
}
function openModal(html, boxCls) { $('#modalBox').className = 'modalbox' + (boxCls ? ' ' + boxCls : ''); $('#modalBox').innerHTML = html; $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); S.customModal = false; }
function send(o) { if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(o)); }

/* ============================================================
   CONFETTI
   ============================================================ */
function confetti(n = 90) {
  const cv = $('#fx'); if (!cv) return; const ctx = cv.getContext && cv.getContext('2d'); if (!ctx) return;
  cv.width = window.innerWidth || 800; cv.height = window.innerHeight || 600;
  const cols = ['#2ff3e0', '#ff3d9a', '#ffd93d', '#a8ff60', '#ff9f1c', '#a855f7'];
  const parts = [];
  for (let i = 0; i < n; i++) parts.push({
    x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * .4,
    vx: (Math.random() - .5) * 3, vy: 2 + Math.random() * 4, s: 5 + Math.random() * 9,
    c: cols[i % cols.length], rot: Math.random() * 6, vr: (Math.random() - .5) * .3,
  });
  let frames = 0;
  (function loop() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    parts.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += .04; p.rot += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * .6); ctx.restore();
    });
    frames++;
    if (frames < 180) requestAnimationFrame(loop); else ctx.clearRect(0, 0, cv.width, cv.height);
  })();
}

/* ============================================================
   HOME
   ============================================================ */
function initHome() {
  $('#nameInput').value = S.name;
  const ap = $('#avatarPick'); ap.innerHTML = '';
  AVATARS.forEach(a => {
    const b = el('button', a === S.avatar ? 'sel' : '', a);
    b.onclick = () => { S.avatar = a; localStorage.setItem('rami_avatar', a); $$('#avatarPick button').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); SFX.click(); };
    ap.appendChild(b);
  });
  const url = new URL(location.href);
  const rc = url.searchParams.get('r');
  if (rc) $('#codeInput').value = rc.toUpperCase().slice(0, 4);

  $('#quickBtn').onclick = () => { if (!getName()) return; S.auto = 'quick'; connect(''); };
  $('#createBtn').onclick = () => { if (!getName()) return; connect(''); };
  $('#joinBtn').onclick = () => {
    if (!getName()) return;
    const c = $('#codeInput').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length < 3) return toast('اكتب كود الروم (4 حروف)');
    connect(c);
  };
  $('#codeInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('#joinBtn').click(); });
  $('#nameInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('#quickBtn').click(); });
  $('#rulesBtn').onclick = () => $('#rules').classList.remove('hidden');
  $('#rules').onclick = e => { if (e.target.id === 'rules') $('#rules').classList.add('hidden'); };
}
function getName() {
  const n = $('#nameInput').value.trim().slice(0, 14);
  if (!n) { toast('اكتب اسمك أولا 😊'); $('#nameInput').focus(); return null; }
  S.name = n; localStorage.setItem('rami_name', n);
  return n;
}

/* ============================================================
   CONNEXION
   ============================================================ */
function connect(code) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  try { S.ws = new WebSocket(proto + '://' + location.host); } catch (e) { return toast('ما نجّمناش نتوصلو بالسيرفر'); }
  S.ws.onopen = () => send({ t: 'hello', room: code, name: S.name, avatar: S.avatar, token: S.token });
  S.ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } onMessage(m); };
  S.ws.onclose = () => { if (!$('#game').classList.contains('hidden')) toast('تقطعت الاتصال... أعمل تحديث'); };
  S.ws.onerror = () => toast('مشكلة في الاتصال');
}
function onMessage(m) {
  if (m.type === 'joined') {
    S.room = m.room; S.pid = m.playerId || null; S.spectator = !!m.spectator;
    if (m.token) { S.token = m.token; localStorage.setItem('rami_token', m.token); }
    if (m.spectator) toast('الروم عامر — راقب فقط 👀', 'info');
    else { SFX.join(); showGame(); }
    if (m.room) { const u = new URL(location.href); u.searchParams.set('r', m.room); history.replaceState(null, '', u); }
    if (S.auto === 'quick') {
      S.auto = null;
      if (m.spectator) return;
      setTimeout(() => send({ t: 'addBot' }), 150);
      setTimeout(() => send({ t: 'addBot' }), 420);
      setTimeout(() => send({ t: 'addBot' }), 690);
      setTimeout(() => send({ t: 'start' }), 1050);
    }
    if (S.spectator) showGame();
    return;
  }
  if (m.type === 'state') { onState(m); return; }
  if (m.type === 'error') { SFX.err(); toast(m.msg || 'ما نجّمش'); return; }
  if (m.type === 'hint') { S.hint = m; renderActions(); return; }
  if (m.type === 'left') { location.href = location.pathname; return; }
}
function showGame() { $('#home').classList.add('hidden'); $('#game').classList.remove('hidden'); }

/* ============================================================
   STATE
   ============================================================ */
function onState(st) {
  const prev = S.state; S.state = st;
  const myTurnNew = st.canAct && st.phase === 'draw';
  if (myTurnNew && S.prevTurn !== 'me') SFX.turn();
  S.prevTurn = st.canAct ? 'me' : 'other';

  const la = st.lastAction;
  if (la && st.seq !== S.lastSeq && prev && la.type) {
    if (la.type === 'discard') SFX.discard();
    else if (la.type === 'draw') SFX.draw();
    else if (la.type === 'meld') SFX.meld();
    else if (la.type === 'open') { SFX.open(); confetti(70); }
    else if (la.type === 'roundend') { SFX.win(); confetti(120); }
  }
  if (la) S.lastSeq = st.seq;

  // n7aydou mel ikhtiyar ay carte ma3adet fi yed
  const ids = new Set(st.hand.map(c => c.id));
  S.sel.forEach(id => { if (!ids.has(id)) S.sel.delete(id); });
  if (S.selMeld && !st.table.some(m => m.id === S.selMeld)) S.selMeld = null;
  if (!st.canAct || st.phase !== 'action') S.selMeld = null;

  renderAll(st);
}

function renderAll(st) {
  $('#roomCode').textContent = st.code || '----';
  $('#roundChip').textContent = 'روندا ' + (st.round || 1);
  $('#targetChip').textContent = '🎯 ' + st.target;
  $('#rTarget').textContent = st.target;

  renderPlayers(st);
  renderOpponents(st);
  renderPiles(st);
  renderMelds(st);
  renderHand(st);
  renderMe(st);
  renderActions();
  renderFeeds(st);
  renderModals(st);
}

/* ---------- players ---------- */
function renderPlayers(st) {
  const box = $('#players'); box.innerHTML = '';
  const order = st.players.slice().sort((a, b) => (a.id === st.youAre ? -1 : b.id === st.youAre ? 1 : 0));
  order.forEach(p => {
    const row = el('div', 'prow' + (p.isTurn ? ' turn' : '') + (p.id === st.youAre ? ' me' : ''));
    const av = el('div', 'pav', p.avatar || '🙂');
    row.appendChild(av);
    const meta = el('div', 'pmeta');
    meta.appendChild(el('div', 'pname', `${p.name} ${p.isHost ? '👑' : ''} ${p.bot ? '<span class="badge b-bot">بوت</span>' : ''}`));
    const sub = el('div', 'psub');
    sub.innerHTML = `<span>🃏 ${p.handCount}</span><span>⭐ ${p.score}</span>`;
    if (!p.connected && !p.bot) sub.innerHTML += `<span class="dot off"></span>`;
    meta.appendChild(sub);
    const badges = el('div', 'psub');
    badges.innerHTML = p.opened ? '<span class="badge b-opened">حلّ ✓</span>' : '<span class="badge b-not">ما حلّش</span>';
    meta.appendChild(badges);
    row.appendChild(meta);
    box.appendChild(row);
  });
}

/* ---------- opponents ---------- */
function renderOpponents(st) {
  const box = $('#opponents'); box.innerHTML = '';
  st.players.filter(p => p.id !== st.youAre).forEach(p => {
    const o = el('div', 'opp' + (p.isTurn ? ' turn' : ''));
    o.innerHTML = `<div class="oname">${p.avatar} ${p.name}${p.bot ? ' 🤖' : ''}</div>`;
    const fan = el('div', 'ofan');
    const n = Math.min(p.handCount, 14);
    for (let i = 0; i < n; i++) fan.appendChild(cardEl(null, { back: true }));
    o.appendChild(fan);
    o.appendChild(el('div', 'ocount', `${p.handCount} ورقة · ${p.score} نقطة`));
    box.appendChild(o);
  });
}

/* ---------- piles ---------- */
function renderPiles(st) {
  $('#stockCount').textContent = st.stockCount;
  const box = $('#discard'); box.innerHTML = '';
  (st.discard || []).forEach((c, i, a) => {
    const card = cardEl(c, { cls: i === a.length - 1 ? 'top slam' : '' });
    box.appendChild(card);
  });
  const canDraw = st.canAct && st.phase === 'draw';
  $('#stockBox').classList.toggle('clickable', canDraw);
  $('#discardBox').classList.toggle('clickable', canDraw && (st.discard || []).length > 0);

  const badge = $('#turnBadge');
  const cur = st.players.find(p => p.isTurn);
  if (st.phase === 'lobby') badge.textContent = '⏳ نستناو اللاعبين';
  else if (st.phase === 'roundend') badge.textContent = '🏁 سالت الروندا';
  else if (st.phase === 'gameover') badge.textContent = '👑 سالت اللعبة';
  else if (st.canAct) badge.textContent = st.phase === 'draw' ? 'دورك! خوذ ورقة 👇' : 'دورك! نزّل ولا اطرد 👇';
  else badge.textContent = 'دور ' + (cur ? cur.name : '...') + ' ⏳';
  badge.className = 'turnbadge' + (st.canAct ? ' mine' : '');
}

/* ---------- melds ---------- */
function renderMelds(st) {
  const box = $('#melds'); box.innerHTML = '';
  if (!st.table.length) {
    box.appendChild(el('div', 'emptyhint', 'الطاولة خاوية — أول واحد يحلّ لازم يجمع ' + st.openMin + ' نقطة 💪'));
    return;
  }
  const canAdd = st.canAct && st.phase === 'action' && st.opened;
  st.table.forEach(m => {
    const owner = st.players.find(p => p.id === m.ownerId);
    const row = el('div', 'meldrow' + (S.selMeld === m.id ? ' sel' : ''));
    const own = el('div', 'mown', (owner ? owner.avatar : '❓'));
    if (canAdd) { own.title = 'اختار هذي الكومبيناسيون باش تزيد عليها'; own.onclick = () => { S.selMeld = S.selMeld === m.id ? null : m.id; SFX.click(); renderMelds(st); renderActions(); }; }
    row.appendChild(own);
    const cards = el('div', 'mcards');
    const isNew = !S.seenMelds.has(m.id);
    m.cards.forEach(c => cards.appendChild(cardEl(c, { cls: isNew ? 'pop' : '' })));
    S.seenMelds.add(m.id);
    row.appendChild(cards);
    row.appendChild(el('div', 'mpts', `${m.type === 'set' ? 'كولور' : 'سويت'} · ${m.points} نقطة`));
    box.appendChild(row);
  });
}

/* ---------- hand + tartib ---------- */
const RANK_OF = () => E.rankNum, SUIT_OF = () => E.SUIT_ORDER;

function orderHand(hand) {
  const arr = hand.slice();
  if (S.sortMode === 'manual') {
    const inHand = new Set(arr.map(c => c.id));
    let ord = S.handOrder.filter(id => inHand.has(id));
    for (const c of arr) if (!ord.includes(c.id)) ord.push(c.id);
    S.handOrder = ord;
    const byId = {}; arr.forEach(c => byId[c.id] = c);
    return ord.map(id => byId[id]).filter(Boolean);
  }
  const rn = E.rankNum, so = E.SUIT_ORDER;
  if (S.sortKind === 'num') {
    arr.sort((a, b) => {
      if (a.r === 'JOKER' && b.r === 'JOKER') return 0;
      if (a.r === 'JOKER') return 1;
      if (b.r === 'JOKER') return -1;
      const d = rn(a.r) - rn(b.r); return d || (so[a.s] - so[b.s]);
    });
  } else {
    arr.sort((a, b) => {
      if (a.r === 'JOKER' && b.r === 'JOKER') return 0;
      if (a.r === 'JOKER') return 1;
      if (b.r === 'JOKER') return -1;
      const d = so[a.s] - so[b.s]; return d || (rn(a.r) - rn(b.r));
    });
  }
  const ids = arr.map(c => c.id);
  if (ids.join() !== S.handOrder.join()) S.handOrder = ids;
  return arr;
}

function renderSortBar() {
  $$('#sortBar button').forEach(b => {
    const k = b.dataset.sort;
    const active = (k === 'manual' && S.sortMode === 'manual') || (S.sortMode === 'auto' && k === S.sortKind);
    b.classList.toggle('act', active);
  });
}

function renderHand(st) {
  const box = $('#hand'); box.innerHTML = '';
  box.classList.toggle('dragging-on', S.sortMode === 'manual');
  renderSortBar();
  if (st.spectator || !st.hand.length) { box.appendChild(el('div', 'emptyhint', st.spectator ? 'أنت متفرج — ما عندكش ورق 👀' : 'ما عندكش ورق')); return; }
  const canSel = st.canAct && st.phase === 'action';
  orderHand(st.hand).forEach(c => {
    const d = cardEl(c, { cls: (S.sel.has(c.id) ? 'sel ' : '') + (canSel ? 'clickable grabbable' : '') });
    box.appendChild(d);
  });
  if (canSel) attachHandDrag(box);
}

/* --- sa7b el wara9 : mouse dima, touch ken fi mode 'بيدي' --- */
function attachHandDrag(box) {
  let el = null, id = null, sx = 0, sy = 0, moved = false, canDrag = false, pid = null;

  const pointCard = (x, y, fallbackTarget) => {
    let t = null;
    try { t = document.elementFromPoint ? document.elementFromPoint(x, y) : null; } catch (_) { t = null; }
    if (!t) t = fallbackTarget || null;
    return t && t.closest ? t.closest('.card') : null;
  };

  box.onpointerdown = (e) => {
    if (!S.state || !S.state.canAct || S.state.phase !== 'action') return;
    const card = e.target.closest && e.target.closest('.card');
    if (!card || !box.contains(card)) return;
    el = card; id = card.dataset.id; sx = e.clientX; sy = e.clientY; moved = false; pid = e.pointerId;
    canDrag = (e.pointerType === 'mouse') || S.sortMode === 'manual';
    try { box.setPointerCapture(e.pointerId); } catch (_) { }
  };

  box.onpointermove = (e) => {
    if (!el || e.pointerId !== pid) return;
    if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) > 8) {
      moved = true;
      if (!canDrag) {  // mouse fel mode 'شكل/رقم' -> ywali tartib bidi
        S.sortMode = 'manual'; saveSort(); canDrag = true;
        box.classList.add('dragging-on'); renderSortBar();
        if (!S.warnedManual) { S.warnedManual = true; toast('✋ وضع الترتيب بيدك — اسحب الورق فين تحب', 'info'); }
      }
      el.classList.add('lifting');
      box.classList.add('issorting');
      SFX.click();
    }
    if (!moved) return;
    const over = pointCard(e.clientX, e.clientY, e.target);
    if (over && over !== el && box.contains(over)) {
      const r = over.getBoundingClientRect();
      if (e.clientX > r.left + r.width / 2) box.insertBefore(el, over.nextSibling);
      else box.insertBefore(el, over);
    }
  };

  const finish = (e) => {
    if (!el) return;
    if (e && e.pointerId !== pid) return;
    const wasMoved = moved, card = el, cardId = id;
    card.classList.remove('lifting');
    box.classList.remove('issorting');
    el = null; moved = false;
    if (!wasMoved) {                     // click : selection
      if (S.sel.has(cardId)) S.sel.delete(cardId); else S.sel.add(cardId);
      SFX.click();
      card.classList.toggle('sel', S.sel.has(cardId));
      renderActions(); renderMe(S.state);
      return;
    }
    S.handOrder = [...box.querySelectorAll('.card')].map(c => c.dataset.id);
    S.sortMode = 'manual'; saveSort(); renderSortBar();
  };
  box.onpointerup = finish;
  box.onpointercancel = finish;

  // fallback : click 3adi (keyboard / AT / test) — ken el pointer ma khdemch
  let lastPointerTs = 0;
  const _finish = finish;
  box.onpointerup = (e) => { lastPointerTs = Date.now(); _finish(e); };
  box.onclick = (e) => {
    if (Date.now() - lastPointerTs < 700) return;
    const card = e.target.closest && e.target.closest('.card');
    if (!card || !box.contains(card)) return;
    const cid = card.dataset.id;
    if (S.sel.has(cid)) S.sel.delete(cid); else S.sel.add(cid);
    SFX.click();
    card.classList.toggle('sel', S.sel.has(cid));
    renderActions(); renderMe(S.state);
  };
}

/* ---------- me ---------- */
function renderMe(st) {
  const me = st.players.find(p => p.id === st.youAre);
  const box = $('#meBox');
  if (!me) { box.innerHTML = '<span>👀 متفرج</span>'; }
  else {
    box.innerHTML = `<div class="pav">${me.avatar}</div><span>${me.name}</span>
      <span class="badge ${me.opened ? 'b-opened' : 'b-not'}">${me.opened ? 'حلّ ✓' : 'ما حلّش'}</span>
      <span class="badge b-not">🃏 ${me.handCount}</span>
      <span class="badge b-not">⭐ ${me.score}</span>`;
  }
  const line = $('#statusLine'); line.className = 'statusline';
  if (st.phase === 'lobby') { line.textContent = 'نستناو باش يبدا الشيف 🚀'; return; }
  if (st.phase === 'roundend' || st.phase === 'gameover') { line.textContent = 'الروندا سالت — شوف النتيجة 👇'; return; }
  if (st.youAre && !st.opened) {
    line.textContent = `🎯 باش تحلّ: ${st.pendingPts}/${st.openMin} نقطة ${st.pendingPts ? '(كمل أو رجّع الورق!)' : ''}`;
    if (st.pendingPts > 0) line.classList.add('ok');
    return;
  }
  if (st.canAct) {
    const v = validateSel();
    if (S.sel.size === 0) { line.textContent = st.phase === 'draw' ? 'خوذ ورقة من البوك ولا من الديفوس' : 'اختار ورق من يدّك 👇'; return; }
    line.textContent = v.ok ? `✓ باهي! ${v.type === 'set' ? 'كولور' : 'سويت'} = ${v.points} نقطة` : '✗ ' + v.reason;
    line.classList.add(v.ok ? 'ok' : 'bad');
  } else {
    const cur = st.players.find(p => p.isTurn);
    line.textContent = 'دور ' + (cur ? cur.name : '...') + ' — استنى شوية ⏳';
  }
}

function validateSel() {
  const st = S.state; if (!st) return { ok: false, reason: '...' };
  const cards = st.hand.filter(c => S.sel.has(c.id));
  if (cards.length < 3) return { ok: false, reason: 'لازم 3 ورقات على الأقل' };
  return E.arrangeMeld(cards);
}

/* ---------- actions ---------- */
function renderActions() {
  const st = S.state; if (!st) return;
  const box = $('#actions'); box.innerHTML = '';
  const add = (txt, cls, fn, dis) => { const b = el('button', 'btn ' + cls, txt); b.disabled = !!dis; b.onclick = fn; box.appendChild(b); return b; };

  if (st.spectator) return;
  if (st.phase === 'lobby') { add('🚀 ابدا اللعبة', 'grad4', () => { send({ t: 'ready', v: true }); toast('أنت باهي ✓ — استنى الباقي', 'info'); }); return; }
  if (st.phase === 'roundend' || st.phase === 'gameover') return;

  if (st.canAct && st.phase === 'draw') {
    add('🃏 خوذ من البوك', 'grad3', () => send({ t: 'draw', source: 'stock' }));
    if ((st.discard || []).length) add('👆 خوذ من الديفوس', 'grad1', () => send({ t: 'draw', source: 'discard' }));
    return;
  }
  if (st.canAct && st.phase === 'action') {
    const v = validateSel();
    const cards = st.hand.filter(c => S.sel.has(c.id));
    if (S.selMeld) {
      const m = st.table.find(x => x.id === S.selMeld);
      add(`➕ زيّد ${cards.length} ورقة على الكومبيناسيون`, 'grad4', () => { send({ t: 'add', meldId: S.selMeld, ids: cards.map(c => c.id) }); clearSel(); }, cards.length === 0);
    } else {
      add(`⬇️ نزّل الكومبيناسيون${v.ok ? ' (' + v.points + ' نقطة)' : ''}`, 'grad4', () => { send({ t: 'meld', ids: cards.map(c => c.id) }); clearSel(); }, !v.ok);
    }
    add('🗑️ اطرد ورقة', 'grad5', () => {
      if (cards.length !== 1) { SFX.err(); return toast('اختار ورقة وحدة باش تطردها'); }
      S.selMeld = null;                       // nkhalliwh 3al défausse
      send({ t: 'discard', id: cards[0].id }); clearSel();
    }, !(cards.length === 1));
    if (st.pendingPts > 0) add('↩️ رجّع الورق', 'small', () => send({ t: 'undo' }));
    if (S.sel.size || S.selMeld) add('✖️ امسح', 'small', () => clearSel());
    add('💡 اقتراح', 'small', () => send({ t: 'hint' }));
    if (S.hint && S.hint.cands && S.hint.cands.length) {
      const wrap = el('div', 'melds'); wrap.style.cssText = 'flex:1;min-height:0;display:flex;gap:6px;align-items:center;padding:6px;width:100%';
      wrap.appendChild(el('span', 'emptyhint', `أفكار (${S.hint.points} ن):`));
      S.hint.cands.slice(0, 5).forEach(cd => {
        const b = el('button', 'btn small', cd.ids.length + ' ورقة · ' + cd.points + 'ن');
        b.onclick = () => { S.sel = new Set(cd.ids); S.selMeld = null; S.hint = null; SFX.click(); renderHand(st); renderActions(); renderMe(st); };
        wrap.appendChild(b);
      });
      box.appendChild(wrap);
    }
    return;
  }
  const cur = st.players.find(p => p.isTurn);
  add('⏳ دور ' + (cur ? cur.name : '') + '...', 'small', () => { }, true);
}
function clearSel() { S.sel.clear(); S.selMeld = null; S.hint = null; if (S.state) { renderHand(S.state); renderActions(); renderMe(S.state); renderMelds(S.state); } }

/* ---------- feeds ---------- */
function renderFeeds(st) {
  const j = $('#journal');
  j.innerHTML = '';
  (st.log || []).slice().reverse().forEach(l => j.appendChild(el('div', 'logline ' + (l.kind || ''), l.text)));
  const c = $('#chatFeed'); const atBottom = c.scrollTop + c.clientHeight >= c.scrollHeight - 40;
  c.innerHTML = '';
  (st.chat || []).forEach(m => {
    const d = el('div', 'chatmsg', `<b>${esc(m.avatar + ' ' + m.name)}:</b> ${esc(m.text)}`);
    c.appendChild(d);
  });
  if (atBottom) c.scrollTop = c.scrollHeight;
}
function esc(s) { return (s || '').replace(/[<>&]/g, x => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[x])); }

/* ---------- modals ---------- */
function renderModals(st) {
  if (S.customModal && st.phase !== 'lobby' && st.phase !== 'roundend' && st.phase !== 'gameover') return;
  S.customModal = false;
  if (st.phase === 'lobby') return lobbyModal(st);
  if (st.phase === 'roundend') return roundModal(st);
  if (st.phase === 'gameover') return overModal(st);
  closeModal();
}
function lobbyModal(st) {
  const me = st.players.find(p => p.id === st.youAre);
  const isHost = !!(me && me.isHost);
  const link = location.origin + location.pathname + '?r=' + st.code;
  let h = `<h2>🏠 الروم <span class="neon">${st.code}</span></h2>`;
  h += st.players.map(p => `
    <div class="lobbyrow">
      <div class="pav">${p.avatar}</div>
      <div class="pmeta">
        <div class="pname">${esc(p.name)} ${p.isHost ? '👑' : ''} ${p.bot ? '<span class="badge b-bot">بوت</span>' : ''}</div>
        <div class="psub">${p.isHost ? 'صاحب الروم' : p.bot ? 'بوت' : (p.ready ? '<span style="color:var(--lime)">باهي ✓</span>' : 'نستناو...')}</div>
      </div>
      ${isHost && (p.bot || !p.connected) && p.id !== st.youAre ? `<button class="btn small" onclick="window.__kick('${p.id}')">خرّج</button>` : ''}
    </div>`).join('');
  h += `<div class="settings">
    <div class="setting"><label>باش تحلّ (نقطة)</label>
      <select id="setOpen" ${isHost ? '' : 'disabled'}>
        ${[31, 41, 51].map(v => `<option value="${v}" ${st.openMin === v ? 'selected' : ''}>${v}</option>`).join('')}
      </select></div>
    <div class="setting"><label>الهدف (نقطة)</label>
      <select id="setTarget" ${isHost ? '' : 'disabled'}>
        ${[300, 500, 1000].map(v => `<option value="${v}" ${st.target === v ? 'selected' : ''}>${v}</option>`).join('')}
      </select></div>
  </div>`;
  h += `<div class="invitebox"><input value="${link}" readonly onclick="this.select()"><button class="btn grad3" onclick="window.__copy('${link}')">📋 نسخ</button></div>`;
  h += `<p style="text-align:center;font-size:13px">ابعث اللينك لأصحابك، وقتاش يولّيو "باهي" ابدا 🚀</p>`;
  h += `<div class="actions" style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn grad4" style="flex:1" onclick="window.__ready()">${me && me.ready ? '✓ أنت باهي' : '✋ آني باهي'}</button>
      ${isHost && st.players.length < 4 ? `<button class="btn grad1" onclick="window.__addBot()">🤖 زيد بوت</button>` : ''}
      ${isHost ? `<button class="btn grad2" style="flex:1" onclick="window.__start()">🚀 ابدا اللعبة</button>` : ''}
    </div>`;
  openModal(h);
  const so = $('#setOpen'), stg = $('#setTarget');
  if (so && isHost) so.onchange = () => send({ t: 'mode', openMin: +so.value, target: +stg.value });
  if (stg && isHost) stg.onchange = () => send({ t: 'mode', openMin: +so.value, target: +stg.value });
}
function roundModal(st) {
  const d = st.roundDetail || [];
  const win = st.players.find(p => p.id === st.winnerId);
  let h = `<h2>🏁 روندا ${st.round} سالت</h2>`;
  if (d.length) {
    const names = st.players;
    h += `<table class="scoretable"><thead><tr><th></th><th>اللاعب</th><th>هذي الروندا</th><th>المجموع</th><th>الورق اللي بقى</th></tr></thead><tbody>`;
    d.slice().sort((a, b) => a.pts - b.pts).forEach(x => {
      const p = names.find(n => n.id === x.id) || {}; const w = x.pts === 0;
      h += `<tr class="${w ? 'win' : ''}"><td>${p.avatar || ''}</td><td>${esc(p.name || '')} ${w ? '🏆' : ''}</td><td>+${x.pts}</td><td>${p.score}</td>
        <td><div class="minicards">${(x.hand || []).slice(0, 14).map(c => miniCard(c)).join('')}</div></td></tr>`;
    });
    h += `</tbody></table>`;
  }
  const me = st.players.find(p => p.id === st.youAre);
  const host = st.players.find(p => p.isHost);
  const iAmHost = me && me.isHost;
  h += `<div style="display:flex;gap:8px">
    ${iAmHost ? '<button class="btn grad4" style="flex:1" onclick="window.__next()">▶️ روندا جديدة</button>'
      : `<div class="waitpulse" style="flex:1">نستناو ${host ? esc(host.name) : 'صاحب الروم'} يبدا الروندا الجاية...</div>`}
  </div>`;
  openModal(h);
}
function miniCard(c) { return cardEl(c).outerHTML; }
function overModal(st) {
  const sorted = st.players.slice().sort((a, b) => a.score - b.score);
  const champ = sorted[0];
  let h = `<h2>👑 ${esc(champ.name)} ربح اللعبة!</h2>`;
  h += `<table class="scoretable"><thead><tr><th></th><th>اللاعب</th><th>المجموع</th></tr></thead><tbody>` +
    sorted.map((p, i) => `<tr class="${i === 0 ? 'win' : ''}"><td>${p.avatar}</td><td>${esc(p.name)} ${i === 0 ? '🏆' : ''}</td><td>${p.score}</td></tr>`).join('') +
    `</tbody></table>`;
  h += `<p style="text-align:center">الترتيب: الأقل نقطة هو الرابح 🥇</p>`;
  const me = st.players.find(p => p.id === st.youAre);
  h += me && me.isHost ? `<button class="btn grad4 big" onclick="window.__next()">🔄 لعبة جديدة</button>` : `<div class="waitpulse">نستناو صاحب الروم يبدا لعبة جديدة...</div>`;
  h += `<button class="btn small" style="margin-top:10px;width:100%" onclick="window.__leave()">🚪 اخرج</button>`;
  openModal(h);
}

/* ---------- theme picker ---------- */
function themeModal() {
  let h = '<h2>🎨 شكل الورق</h2><div class="themes">';
  CARD_THEMES.forEach(t => {
    h += `<div class="themerow${S.theme === t.id ? ' act' : ''}" data-pick="${t.id}">
      <div class="thcards" data-theme="${t.id}">
        ${miniCard({ r: 'A', s: 'S' })}${miniCard({ r: 'K', s: 'H' })}${miniCard({ r: 'JOKER' })}
      </div>
      <div style="flex:1"><div class="thname">${t.name}</div><div class="thdesc">${t.desc}</div></div>
      ${S.theme === t.id ? '<div style="color:var(--cyan);font-size:19px;font-weight:900">✓</div>' : ''}
    </div>`;
  });
  h += '</div><p style="text-align:center;font-size:12.5px">الشكل يتبدّل عندك برك 😉 — أصحابك يشوفو الورق كما هو.</p>';
  h += `<div style="display:flex;gap:8px"><button class="btn grad3" style="flex:1" onclick="window.__resetSort()">🔄 رتّب ورقك أوتوماتيك</button>
        <button class="btn grad2" style="flex:1" onclick="window.__closeModal()">تمام 👌</button></div>`;
  openModal(h);
  $$('#modalBox .themerow').forEach(r => r.onclick = () => {
    applyTheme(r.dataset.pick); SFX.click();
    if (S.state) { S.customModal = true; themeModal(); }
    else themeModal();
  });
}
window.__closeModal = () => { SFX.click(); closeModal(); };
window.__resetSort = () => { S.sortMode = 'auto'; S.sortKind = 'suit'; S.handOrder = []; saveSort(); renderSortBar(); if (S.state) renderHand(S.state); SFX.meld(); toast('رتّبنا الورق بالشكل و الرقم ✓', 'info'); };

/* ---------- globals mta3 les boutons ---------- */
window.__copy = (txt) => { navigator.clipboard?.writeText(txt).then(() => toast('تنسخ الكود 📋', 'info'), () => toast('انسخ يدويا: ' + txt)); };
window.__kick = id => send({ t: 'kick', id });
window.__addBot = () => send({ t: 'addBot' });
window.__ready = () => send({ t: 'ready', v: true });
window.__start = () => send({ t: 'start' });
window.__next = () => send({ t: 'nextRound' });
window.__state = () => S.state;
window.__leave = () => { send({ t: 'leave' }); setTimeout(() => location.replace(location.pathname), 150); };

/* ============================================================
   INIT
   ============================================================ */
function initGame() {
  $('#stockBox').onclick = () => { if (S.state && S.state.canAct && S.state.phase === 'draw') send({ t: 'draw', source: 'stock' }); };
  $('#discardBox').onclick = () => { if (S.state && S.state.canAct && S.state.phase === 'draw') send({ t: 'draw', source: 'discard' }); };
  $('#copyBtn').onclick = () => window.__copy(location.origin + location.pathname + '?r=' + (S.state ? S.state.code : ''));
  $('#soundBtn').onclick = () => {
    S.sound = !S.sound; localStorage.setItem('rami_sound', S.sound ? '1' : '0');
    $('#soundBtn').textContent = S.sound ? '🔊' : '🔇'; $('#soundBtn').classList.toggle('off', !S.sound);
    if (S.sound) SFX.click();
  };
  $('#soundBtn').textContent = S.sound ? '🔊' : '🔇';
  $('#rulesBtn2').onclick = () => $('#rules').classList.remove('hidden');
  $('#themeBtn').onclick = () => { S.customModal = true; SFX.click(); themeModal(); };
  $$('#sortBar button').forEach(b => b.onclick = () => {
    const k = b.dataset.sort;
    if (k === 'manual') {
      S.sortMode = 'manual'; saveSort(); renderSortBar();
      toast('✋ الترتيب بيدك: اسحب الورقة (بتونسي: طيّحها فين تحب)', 'info');
      SFX.click();
    } else {
      S.sortKind = k; S.sortMode = 'auto'; S.handOrder = []; saveSort(); renderSortBar(); SFX.click();
    }
    if (S.state) renderHand(S.state);
  });
  $('#leaveBtn').onclick = () => { if (confirm('متأكد تحب تخرج؟')) window.__leave(); };
  $('#panelBtn').onclick = () => $('#sidePanel').classList.toggle('open');

  $$('.tab').forEach(t => t.onclick = () => {
    $$('.tab').forEach(x => x.classList.remove('active')); t.classList.add('active');
    S.tab = t.dataset.tab;
    $('#journal').classList.toggle('hidden', S.tab !== 'journal');
    $('#chatFeed').classList.toggle('hidden', S.tab !== 'chat');
    $('#chatRow').classList.toggle('hidden', S.tab !== 'chat');
  });
  const em = $('#quickEmojis');
  EMOJIS.forEach(e => { const b = el('button', '', e); b.onclick = () => { send({ t: 'chat', text: e }); SFX.click(); }; em.appendChild(b); });
  const doChat = () => { const v = $('#chatInput').value.trim(); if (!v) return; send({ t: 'chat', text: v }); $('#chatInput').value = ''; };
  $('#chatSend').onclick = doChat;
  $('#chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') doChat(); });
  // touch: click 3al carte bla delay
  document.addEventListener('touchstart', () => { }, { passive: true });
}

document.addEventListener('DOMContentLoaded', () => {
  applyTheme(S.theme || 'classic');
  initHome(); initGame();
  // auto-rejoin : ken ja mel lien w 3andou smiya mahfoutha, ydkhol direct
  const rc = new URL(location.href).searchParams.get('r');
  if (rc && S.name) {
    toast('قاعدين نرجعوك للروم ' + rc.toUpperCase() + '...', 'info');
    setTimeout(() => connect(rc.toUpperCase().slice(0, 4)), 300);
  }
});
window.addEventListener('resize', () => { const cv = $('#fx'); if (cv) { cv.width = window.innerWidth; cv.height = window.innerHeight; } });
