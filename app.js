/* ============================================================
   LEAN TRAINER — app.js
   PWA offline: jadwal Senin–Kamis, log set, timer rest,
   dashboard volume mingguan, grafik progress, export/import.
   Data disimpan di localStorage HP.
   ============================================================ */
(function () {
'use strict';

/* ---------------- utils ---------------- */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const pad = n => String(n).padStart(2, '0');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : null; };

const LS = {
  get(k, d) { try { const v = localStorage.getItem('lt_' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('lt_' + k, JSON.stringify(v)); } catch (e) { console.warn(e); } }
};

function todayISO(offset) {
  const d = new Date();
  if (offset) d.setDate(d.getDate() + offset);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function parseISO(s) { const p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function fmtDate(s) {
  const d = parseISO(s);
  return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
}
function fmtShort(s) {
  const d = parseISO(s);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
}
/* index hari Senin=0 ... Minggu=6 */
function dowIndex(iso) { return (parseISO(iso).getDay() + 6) % 7; }
/* awal minggu (Senin) dari sebuah tanggal */
function weekStart(iso) {
  const d = parseISO(iso || todayISO());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function weekLabel(iso) {
  const a = parseISO(weekStart(iso));
  const b = new Date(a); b.setDate(b.getDate() + 6);
  const f = x => x.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
  return f(a) + ' – ' + f(b);
}

/* ---------------- state ---------------- */
const S = {
  tab: 'workout',
  dayId: null,               // hari jadwal yang dibuka di tab Latihan
  date: todayISO(),          // tanggal sesi yang dibuka
  plan: null,                // rencana latihan (bisa diedit user)
  lib: null,                 // pustaka gerakan (bisa ditambah user)
  sessions: {},              // { 'YYYY-MM-DD': sessionObj }
  settings: null,
  chartEx: null,
  bodylog: null
};

const DEFAULT_SETTINGS = {
  name: '',
  bw: null,
  restVibrate: true,
  restBeep: true,
  autoRest: true,
  unit: 'kg',
  installPromptSeen: false
};

function loadAll() {
  S.plan = LS.get('plan', null) || clone(DEFAULT_PLAN);
  S.lib = LS.get('lib', null) || clone(EXERCISE_LIB);
  S.sessions = LS.get('sessions', {});
  S.settings = Object.assign({}, DEFAULT_SETTINGS, LS.get('settings', {}));
  S.bodylog = LS.get('bodylog', []);
}
function savePlan() { LS.set('plan', S.plan); }
function saveSessions() { LS.set('sessions', S.sessions); }
function saveSettings() { LS.set('settings', S.settings); }
function saveLib() { LS.set('lib', S.lib); }
function saveBody() { LS.set('bodylog', S.bodylog); }

const libById = id => S.lib.find(e => e.id === id);

/* ---------------- sesi ---------------- */
function ensureSession(iso, dayId) {
  if (!S.sessions[iso]) {
    S.sessions[iso] = { date: iso, dayId: dayId || null, ex: [], start: Date.now(), end: null };
  }
  const s = S.sessions[iso];
  if (dayId && !s.dayId) s.dayId = dayId;
  return s;
}

/* Bangun kerangka sesi dari plan kalau masih kosong */
function buildFromPlan(dayId) {
  const day = S.plan.find(d => d.id === dayId);
  if (!day) return [];
  const out = [];
  day.blocks.forEach((b, bi) => {
    (b.picks && b.picks.length ? b.picks : []).forEach(pid => {
      const e = libById(pid);
      if (!e) return;
      const perEx = Math.max(1, Math.round(b.targetSets / (b.picks.length || 1)));
      out.push({
        key: bi + '_' + pid,
        blockIdx: bi,
        exId: e.id, name: e.name, muscle: b.muscle || e.muscle, type: e.type,
        reps: b.reps || e.reps, rest: Array.isArray(b.rest) ? b.rest[0] : (b.rest || e.rest),
        sets: mkSets(perEx), note: '', done: false
      });
    });
    if (!b.picks || !b.picks.length) {
      out.push({
        key: bi + '_kosong', blockIdx: bi, exId: null, name: '(belum ada gerakan)',
        muscle: b.muscle, type: 'isolasi', reps: b.reps, rest: Array.isArray(b.rest) ? b.rest[0] : b.rest,
        sets: mkSets(b.targetSets), note: '', done: false, empty: true
      });
    }
  });
  return out;
}
function mkSets(n, last) {
  const a = [];
  for (let i = 0; i < Math.max(1, n); i++) a.push({ w: '', r: '', done: false });
  if (last && a.length) {
    a.forEach((s, i) => { if (last[i]) { s.w = last[i].w; s.r = last[i].r; } });
  }
  return a;
}

/* isi beban/rep dari sesi terakhir gerakan yang sama (acuan progressive overload) */
function lastPerformance(exId, beforeISO) {
  const keys = Object.keys(S.sessions).filter(k => k < beforeISO).sort().reverse();
  for (const k of keys) {
    const s = S.sessions[k];
    const e = (s.ex || []).find(x => x.exId === exId);
    if (e && e.sets && e.sets.some(x => x.done)) return { date: k, sets: e.sets };
  }
  return null;
}

function openDay(dayId, iso) {
  iso = iso || todayISO();
  S.date = iso;
  S.dayId = dayId;
  const s = ensureSession(iso, dayId);
  if (!s.ex.length) {
    const built = buildFromPlan(dayId);
    /* prefill dari sesi terakhir tiap gerakan */
    built.forEach(b => {
      const lp = b.exId ? lastPerformance(b.exId, iso) : null;
      if (lp) b.sets = mkSets(b.sets.length, lp.sets);
    });
    s.ex = built;
    saveSessions();
  }
}

/* hitung set selesai per otot dalam rentang minggu */
function volumeFor(weekStartISO) {
  const res = {};
  Object.keys(MUSCLE_TARGETS).forEach(m => res[m] = 0);
  const end = parseISO(weekStartISO); end.setDate(end.getDate() + 7);
  Object.keys(S.sessions).forEach(iso => {
    const d = parseISO(iso);
    if (d < parseISO(weekStartISO) || d >= end) return;
    (S.sessions[iso].ex || []).forEach(e => {
      const done = (e.sets || []).filter(x => x.done).length;
      if (e.muscle && res[e.muscle] != null) res[e.muscle] += done;
    });
  });
  return res;
}
function volumeDay(iso) {
  const res = {};
  Object.keys(MUSCLE_TARGETS).forEach(m => res[m] = 0);
  const s = S.sessions[iso];
  if (s) (s.ex || []).forEach(e => {
    const d = (e.sets || []).filter(x => x.done).length;
    if (e.muscle && res[e.muscle] != null) res[e.muscle] += d;
  });
  return res;
}
function planTargetSets(dayId) {
  const day = S.plan.find(d => d.id === dayId);
  if (!day) return 0;
  return day.blocks.reduce((a, b) => a + (b.targetSets || 0), 0);
}
function planSetsDone(iso) {
  const s = S.sessions[iso];
  if (!s) return 0;
  return (s.ex || []).reduce((a, e) => a + (e.sets || []).filter(x => x.done).length, 0);
}
function volTone(v, t) { return v >= t ? 'var(--ok)' : v >= t * 0.6 ? 'var(--warn)' : 'var(--acc)'; }

/* ---------------- toast ---------------- */
let toastT;
function toast(msg) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 1900);
}

/* ---------------- rest timer ---------------- */
const T = { left: 0, total: 0, iv: null, name: '', ctx: null };
function beep() {
  if (!S.settings.restBeep) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    T.ac = T.ac || new AC();
    const t0 = T.ac.currentTime;
    [0, 0.22, 0.44].forEach((o, i) => {
      const osc = T.ac.createOscillator(), g = T.ac.createGain();
      osc.type = 'sine'; osc.frequency.value = 880 + i * 120;
      g.gain.setValueAtTime(0.0001, t0 + o);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + o + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + o + 0.18);
      osc.connect(g); g.connect(T.ac.destination);
      osc.start(t0 + o); osc.stop(t0 + o + 0.2);
    });
  } catch (e) { }
}
function buzz(ms) { if (S.settings.restVibrate && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { } } }

function startRest(seconds, name, ctx) {
  T.total = Math.max(5, Math.round(seconds));
  T.left = T.total; T.name = name || ''; T.ctx = ctx || null;
  const o = $('#timer'); o.classList.add('on');
  buzz(20);
  clearInterval(T.iv);
  T.iv = setInterval(tick, 1000);
  renderTimer();
  if ('wakeLock' in navigator && S.settings.keepAwake !== false) {
    navigator.wakeLock.request('screen').catch(() => { });
  }
}
function tick() {
  T.left--;
  if (T.left <= 0) {
    T.left = 0; clearInterval(T.iv);
    beep(); buzz([180, 90, 180, 90, 300]);
    renderTimer(true);
    return;
  }
  if (T.left % 5 === 0) renderTimer();
  else { const el = $('#tNum'); if (el) el.textContent = fmtTime(T.left); }
}
function fmtTime(s) { return pad(Math.floor(s / 60)) + ':' + pad(s % 60); }
function renderTimer(finished) {
  const el = $('#tNum'), ring = $('#tRingFg'), sub = $('#tSub'), nm = $('#tName');
  if (!el) return;
  el.textContent = fmtTime(T.left);
  el.style.color = finished ? 'var(--ok)' : '';
  if (nm) nm.textContent = T.name;
  if (sub) sub.textContent = finished ? 'Waktunya set berikutnya 💪' : (T.left <= 10 ? 'Siap-siap…' : 'Istirahat');
  if (ring) {
    const c = 2 * Math.PI * 104;
    ring.style.strokeDasharray = c;
    ring.style.strokeDashoffset = c * (1 - T.left / T.total);
  }
  $('#tDone').style.display = finished ? '' : 'none';
  $('#tAgain').style.display = finished ? 'none' : '';
}
function stopRest() { clearInterval(T.iv); $('#timer').classList.remove('on'); }
function nudge(d) { T.left = Math.max(0, T.left + d); T.total = Math.max(T.total, T.left); clearInterval(T.iv); if (T.left > 0) T.iv = setInterval(tick, 1000); renderTimer(); }

/* ---------------- SVG charts ---------------- */
function lineChart(series, opt) {
  opt = opt || {};
  const W = 320, H = opt.h || 130, P = { l: 30, r: 8, t: 10, b: 20 };
  const pts = series.flatMap(s => s.pts);
  if (!pts.length) return '<div class="empty"><div class="em">📉</div>Belum ada data. Selesaikan beberapa sesi dulu.</div>';
  let mn = Math.min(...pts.map(p => p.y)), mx = Math.max(...pts.map(p => p.y));
  if (opt.min0) mn = Math.min(0, mn);
  if (mx === mn) { mx += 1; mn -= 1; }
  const padY = (mx - mn) * 0.15; mn -= padY; mx += padY; if (opt.min0) mn = Math.max(0, mn);
  const xs = pts.map(p => p.x), x0 = Math.min(...xs), x1 = Math.max(...xs);
  const X = x => P.l + (x1 === x0 ? 0.5 : (x - x0) / (x1 - x0)) * (W - P.l - P.r);
  const Y = y => P.t + (1 - (y - mn) / (mx - mn)) * (H - P.t - P.b);
  let g = '';
  for (let i = 0; i <= 3; i++) {
    const y = P.t + i * (H - P.t - P.b) / 3;
    const val = mx - i * (mx - mn) / 3;
    g += `<line x1="${P.l}" y1="${y.toFixed(1)}" x2="${W - P.r}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,.06)" stroke-width="1"/>`;
    g += `<text x="${P.l - 5}" y="${(y + 3.5).toFixed(1)}" font-size="8.5" fill="#63748f" text-anchor="end">${opt.fmtY ? opt.fmtY(val) : Math.round(val)}</text>`;
  }
  let body = '';
  series.forEach(s => {
    const d = s.pts.map((p, i) => (i ? 'L' : 'M') + X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join(' ');
    if (s.area) {
      body += `<path d="${d} L ${X(s.pts[s.pts.length - 1].x).toFixed(1)} ${H - P.b} L ${X(s.pts[0].x).toFixed(1)} ${H - P.b} Z" fill="${s.c}" opacity=".13"/>`;
    }
    body += `<path d="${d}" fill="none" stroke="${s.c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
    s.pts.forEach(p => { body += `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="2.6" fill="#0d1220" stroke="${s.c}" stroke-width="2"/>`; });
  });
  /* label x: awal & akhir */
  const lbl = opt.xLabels || [];
  if (lbl.length) {
    lbl.forEach(L => { body += `<text x="${X(L.x).toFixed(1)}" y="${H - 5}" font-size="8.5" fill="#63748f" text-anchor="${L.a || 'middle'}">${esc(L.t)}</text>`; });
  }
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${g}${body}</svg>`;
}

function barChart(bars, opt) {
  opt = opt || {};
  const W = 320, H = opt.h || 140, P = { l: 26, r: 6, t: 10, b: 34 };
  if (!bars.length) return '<div class="empty"><div class="em">📊</div>Belum ada data.</div>';
  const mx = Math.max(...bars.map(b => b.v), opt.max || 0, 1);
  const bw = (W - P.l - P.r) / bars.length;
  let g = '';
  for (let i = 0; i <= 3; i++) {
    const y = P.t + i * (H - P.t - P.b) / 3, val = mx - i * mx / 3;
    g += `<line x1="${P.l}" y1="${y.toFixed(1)}" x2="${W - P.r}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,.06)"/>`;
    g += `<text x="${P.l - 4}" y="${(y + 3).toFixed(1)}" font-size="8" fill="#63748f" text-anchor="end">${Math.round(val)}</text>`;
  }
  let b = '';
  bars.forEach((bar, i) => {
    const h = (bar.v / mx) * (H - P.t - P.b);
    const x = P.l + i * bw + bw * 0.18, w = bw * 0.64;
    const y = H - P.b - h;
    b += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" rx="4" fill="${bar.c || '#ff7a45'}" opacity="${bar.dim ? .35 : 1}"/>`;
    if (bar.v) b += `<text x="${(x + w / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" font-size="8.5" fill="#e8eefc" text-anchor="middle" font-weight="700">${bar.v}</text>`;
    b += `<text x="${(x + w / 2).toFixed(1)}" y="${(H - P.b + 12).toFixed(1)}" font-size="8" fill="#8fa1c4" text-anchor="middle">${esc(bar.l)}</text>`;
    if (bar.l2) b += `<text x="${(x + w / 2).toFixed(1)}" y="${(H - P.b + 22).toFixed(1)}" font-size="7.5" fill="#63748f" text-anchor="middle">${esc(bar.l2)}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${g}${b}</svg>`;
}

/* ---------------- render: nav ---------------- */
function setTab(t) {
  S.tab = t;
  $$('.navb').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  render();
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

/* ---------------- render: header ---------------- */
function renderHeader() {
  const wk = weekLabel(todayISO());
  const d = new Date();
  const nm = S.settings.name ? 'Halo, ' + S.settings.name.split(' ')[0] : 'Siap latihan?';
  $('#hdrName').textContent = nm;
  $('#hdrDate').innerHTML = `<b>${d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' })}</b>Minggu ${wk}`;
}

/* =============== TAB: JADWAL =============== */
function renderSchedule() {
  const ws = weekStart(todayISO());
  const vol = volumeFor(ws);
  const todayIdx = dowIndex(todayISO());

  let dayCards = '';
  S.plan.forEach((d, i) => {
    const isToday = i === todayIdx;
    const lastIso = Object.keys(S.sessions).filter(k => S.sessions[k].dayId === d.id && (S.sessions[k].ex || []).some(e => (e.sets || []).some(x => x.done))).sort().pop();
    const st = lastIso ? '✓ ' + fmtShort(lastIso) : 'Belum pernah';
    dayCards += `
    <div class="daytab ${S.dayId === d.id ? 'active' : ''} ${isToday ? 'today' : ''}" data-day="${d.id}" style="${isToday ? 'box-shadow:0 0 0 1px rgba(74,222,128,.35)' : ''}">
      <span class="dl">${d.label}</span><span class="de">${d.emoji}</span>
      <span class="dc">${st}</span>
    </div>`;
  });

  let volRows = '';
  Object.keys(MUSCLE_TARGETS).forEach(m => {
    const t = MUSCLE_TARGETS[m], v = vol[m] || 0;
    const pct = Math.min(100, (v / t) * 100);
    volRows += `<div class="vol-row">
      <div class="vol-name" style="color:${MUSCLE_COLOR[m]}">${m}</div>
      <div class="vol-track"><div class="vol-fill" style="width:${pct}%;background:${volTone(v, t)}"></div></div>
      <div class="vol-num">${v} / ${t}</div></div>`;
  });
  const totTarget = Object.values(MUSCLE_TARGETS).reduce((a, b) => a + b, 0);
  const totDone = Object.values(vol).reduce((a, b) => a + b, 0);

  let detail = '';
  S.plan.forEach((d, i) => {
    const tot = planTargetSets(d.id);
    let rows = '';
    const agg = {};
    d.blocks.forEach(b => {
      const k = b.muscle;
      agg[k] = agg[k] || { sets: 0, reps: b.reps, rest: b.rest };
      agg[k].sets += b.targetSets;
    });
    const td = 'padding:7px 0;';
    Object.keys(agg).forEach(m => {
      const a = agg[m];
      rows += `<tr style="border-top:1px solid rgba(34,48,76,.5)">
        <td style="${td}color:${MUSCLE_COLOR[m] || '#fff'};font-weight:700">${m}</td>
        <td style="${td}text-align:center;color:var(--mut)">${a.sets} set</td>
        <td style="${td}text-align:center;color:var(--mut)">${a.reps[0]}–${a.reps[1]}</td>
        <td style="${td}text-align:center;color:var(--mut)">${a.rest[0]}–${a.rest[1]} dtk</td></tr>`;
    });
    detail += `
    <div class="card" style="margin-bottom:10px;border-left:3px solid ${d.accent}">
      <div style="display:flex;align-items:center;gap:9px">
        <div style="font-size:20px">${d.emoji}</div>
        <div style="flex:1"><h3 style="font-size:14.5px">${d.label} — ${tot} set</h3>
        <div class="tiny">${esc(d.title)}</div></div>
        ${i === todayIdx ? '<span class="chip" style="border-color:rgba(74,222,128,.4);color:#8ff0b0">Hari ini</span>' : ''}
      </div>
      <table style="width:100%;margin-top:11px;font-size:12.5px;border-collapse:collapse">
        <thead><tr style="color:var(--mut2);font-size:10px;text-transform:uppercase;letter-spacing:.07em">
          <th style="text-align:left;font-weight:700;padding-bottom:6px">Bagian otot</th><th style="padding-bottom:6px">Volume</th><th style="padding-bottom:6px">Rep</th><th style="padding-bottom:6px">Rest</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <button class="btn ghost sm full" style="margin-top:11px" data-go="${d.id}">Buka sesi ${d.label} →</button>
    </div>`;
  });

  let why = '';
  WHY.forEach(w => { why += `<div class="why-row ${w.avoid ? 'avoid' : ''}"><b>${w.avoid ? '🚫 ' : ''}${w.m}</b><span class="muted">${w.d}</span></div>`; });
  let rules = '';
  RULES.forEach(r => { rules += `<div class="why-row"><b>${r.icon} ${r.t}</b><span class="muted">${r.d}</span></div>`; });
  let nutr = '';
  NUTRITION.forEach(n => { nutr += `<div class="why-row"><b>${n.icon} ${n.t}</b><span class="muted">${n.d}</span></div>`; });

  $('#view').innerHTML = `<div class="fade">
    <div class="sec-t"><h2>Jadwal Mingguan</h2><span class="sub">${weekLabel(todayISO())}</span></div>
    <div class="daytabs">${dayCards}</div>

    <div class="sec-t"><h2>Volume minggu ini</h2><span class="sub">${totDone} / ${totTarget} set</span></div>
    <div class="card">
      <div class="vol-track" style="height:12px;margin-bottom:6px"><div class="vol-fill" style="height:12px;width:${Math.min(100, totDone / totTarget * 100)}%;background:linear-gradient(90deg,var(--acc),var(--acc2))"></div></div>
      ${volRows}
      <div class="tiny" style="margin-top:10px">Target total ±${totTarget} set/minggu. Hijau = tercapai, kuning = ≥60%, oranye = masih kurang.</div>
    </div>

    <div class="sec-t"><h2>Rincian per hari</h2><span class="sub">Senin–Kamis</span></div>
    ${detail}

    <div class="sec-t"><h2>🎯 Kenapa bagian ini?</h2></div>
    <div class="card">${why}</div>

    <div class="sec-t"><h2>⚙️ Aturan latihan</h2></div>
    <div class="card">${rules}
      <div class="divider"></div>
      <div class="small" style="color:var(--mut)">Kaki tidak masuk jadwal. Untuk keseimbangan, tambahkan leg press / squat 2× seminggu di luar jadwal ini.</div>
    </div>

    <div class="sec-t"><h2>🍽️ Pendukung (nutrisi)</h2></div>
    <div class="card">${nutr}</div>
  </div>`;
}

/* =============== TAB: LATIHAN =============== */
function renderWorkout() {
  const iso = S.date;
  const dayIdx = dowIndex(iso);
  const dayPlan = S.plan.find(d => d.id === S.dayId);
  const sess = S.sessions[iso];
  const ex = sess ? sess.ex : [];
  const doneSets = ex.reduce((a, e) => a + (e.sets || []).filter(x => x.done).length, 0);
  const totSets = ex.reduce((a, e) => a + (e.sets || []).length, 0);
  const pct = totSets ? Math.round(doneSets / totSets * 100) : 0;
  const R = 40, C = 2 * Math.PI * R;

  /* strip tanggal */
  let strip = '';
  for (let i = -3; i <= 3; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    const s2 = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const on = s2 === iso;
    const hasS = S.sessions[s2] && (S.sessions[s2].ex || []).some(e => (e.sets || []).some(x => x.done));
    strip += `<button class="dchip ${on ? 'on' : ''}" data-date="${s2}">
      <span>${['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'][d.getDay()]}</span>
      <b>${d.getDate()}</b>
      <i class="${hasS ? 'dot-on' : ''}"></i></button>`;
  }

  /* saran hari */
  let suggest = '';
  if (!dayPlan && dayIdx < 4) {
    const d = S.plan[dayIdx];
    suggest = `<div class="card" style="margin-bottom:12px;border-color:${d.accent}55;background:linear-gradient(180deg,${d.accent}18,transparent)">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="font-size:22px">${d.emoji}</div>
        <div style="flex:1"><b style="font-size:13.5px">Hari ini jadwal ${d.label}</b>
        <div class="tiny">${esc(d.title)} · ${planTargetSets(d.id)} set</div></div>
        <button class="btn sm" data-startday="${d.id}">Mulai</button>
      </div></div>`;
  } else if (!dayPlan) {
    suggest = `<div class="card" style="margin-bottom:12px">
      <b style="font-size:13.5px">🦵 Hari istirahat / kaki</b>
      <div class="tiny" style="margin-top:4px">Jadwal utama Senin–Kamis. Kamu tetap bisa bikin sesi bebas (kaki atau cardio) lewat tombol di bawah.</div>
      <div class="row" style="margin-top:10px">
        <button class="btn ghost sm" style="flex:1" data-freeday="1">Sesi bebas</button>
      </div></div>`;
  }

  let body = '';
  if (!ex.length) {
    body = `<div class="empty"><div class="em">🏋️</div>
      <b>Belum ada sesi untuk tanggal ini</b>
      <div class="tiny" style="margin:6px 0 14px">Pilih hari jadwal, atau mulai sesi bebas.</div>
      <div class="row" style="justify-content:center;flex-wrap:wrap">
        ${S.plan.map(d => `<button class="btn ghost sm" data-startday="${d.id}">${d.emoji} ${d.label}</button>`).join('')}
      </div></div>`;
  } else {
    /* kelompokkan per block */
    const byBlock = {};
    ex.forEach((e, i) => { const k = e.blockIdx == null ? 'x' : e.blockIdx; (byBlock[k] = byBlock[k] || []).push({ e, i }); });
    Object.keys(byBlock).forEach(k => {
      const first = byBlock[k][0].e;
      const blk = dayPlan ? dayPlan.blocks[k] : null;
      const m = first.muscle;
      const bsets = byBlock[k].reduce((a, o) => a + o.e.sets.length, 0);
      const bdone = byBlock[k].reduce((a, o) => a + o.e.sets.filter(x => x.done).length, 0);
      body += `<div class="blockhd">
        <span class="dot" style="background:${MUSCLE_COLOR[m] || '#8fa1c4'}"></span>
        <h3 style="color:${MUSCLE_COLOR[m] || '#fff'}">${esc(m)}</h3>
        <span class="cnt">${bdone}/${bsets} set${blk ? ' · target ' + blk.targetSets : ''}</span>
      </div>`;
      if (blk && blk.note) body += `<div class="blocknote">${blk.note}</div>`;
      byBlock[k].forEach(o => { body += exCard(o.e, o.i, iso); });
    });
    body += `<button class="addex" data-addex="1">＋ Tambah gerakan</button>`;
  }

  const lpNote = ex.length && dayPlan ? `<div class="tiny" style="margin:10px 2px 0">💡 Beban & rep otomatis diisi dari sesi terakhir gerakan yang sama — tinggal naikkan sedikit (progressive overload).</div>` : '';

  $('#view').innerHTML = `<div class="fade">
    <div class="dstrip">${strip}</div>
    ${suggest}
    ${ex.length ? `<div class="card" style="margin-bottom:12px">
      <div class="ringwrap">
        <div class="ring">
          <svg width="92" height="92"><circle cx="46" cy="46" r="${R}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="9"/>
          <circle cx="46" cy="46" r="${R}" fill="none" stroke="${pct >= 100 ? 'var(--ok)' : 'url(#gr)'}" stroke-width="9" stroke-linecap="round"
            stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct / 100)}" style="transition:stroke-dashoffset .5s"/>
          <defs><linearGradient id="gr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff7a45"/><stop offset="1" stop-color="#ffb648"/></linearGradient></defs></svg>
          <div class="ring-c"><div><b>${pct}%</b><span>selesai</span></div></div>
        </div>
        <div style="flex:1">
          <h3 style="font-size:15px">${dayPlan ? dayPlan.emoji + ' ' + dayPlan.label : '🏋️ Sesi bebas'}</h3>
          <div class="small muted" style="margin-top:2px">${dayPlan ? esc(dayPlan.title) : fmtDate(iso)}</div>
          <div class="row" style="margin-top:9px;flex-wrap:wrap;gap:6px">
            <span class="chip">✅ ${doneSets} set</span>
            <span class="chip">🎯 ${totSets} set</span>
            <span class="chip">📅 ${fmtShort(iso)}</span>
          </div>
        </div>
      </div>
      <div class="row" style="margin-top:12px">
        <button class="btn ghost sm" style="flex:1" data-finish="1">${pct >= 100 ? '✓ Selesai & simpan' : 'Selesaikan sesi'}</button>
        <button class="btn line sm" data-clear="1">Reset</button>
      </div>
    </div>${lpNote}` : ''}
    ${body}
  </div>`;
}

function exCard(e, i, iso) {
  const lib = e.exId ? libById(e.exId) : null;
  const c = MUSCLE_COLOR[e.muscle] || '#8fa1c4';
  const dn = (e.sets || []).filter(x => x.done).length;
  const allDone = dn === e.sets.length && dn > 0;
  const lp = e.exId ? lastPerformance(e.exId, iso) : null;
  let setRows = '';
  (e.sets || []).forEach((s, si) => {
    setRows += `<div class="setrow">
      <div class="sn">${si + 1}</div>
      <input type="number" inputmode="decimal" step="0.5" placeholder="kg" value="${esc(s.w)}" data-w="${i}_${si}" class="${s.done ? 'done-in' : ''}" aria-label="beban set ${si + 1}">
      <input type="number" inputmode="numeric" step="1" placeholder="rep" value="${esc(s.r)}" data-r="${i}_${si}" class="${s.done ? 'done-in' : ''}" aria-label="rep set ${si + 1}">
      <button class="chk ${s.done ? 'on' : ''}" data-set="${i}_${si}">${s.done ? '✓' : ''}</button>
    </div>`;
  });
  return `<div class="excard ${allDone ? 'done' : ''}" style="--mc:${c}" data-ex="${i}">
    <div class="ex-hd">
      <div class="ex-ttl">
        <div class="ex-name">${esc(e.name)}</div>
        <div class="ex-meta">
          <span>${e.reps[0]}–${e.reps[1]} rep</span>
          <span>⏱ ${e.rest} dtk</span>
          <span>${e.type === 'compound' ? '🔩 compound' : '🎯 isolasi'}</span>
          ${dn ? `<span style="color:#8ff0b0">${dn}/${e.sets.length} set</span>` : ''}
        </div>
      </div>
      <button class="icobtn" data-exmenu="${i}" title="Opsi">⋯</button>
    </div>
    ${lp ? `<div class="tiny" style="margin-top:8px;padding-left:1px">Terakhir (${fmtShort(lp.date)}): ${lp.sets.filter(x => x.done).map(x => (x.w || '–') + '×' + (x.r || '–')).join(', ') || '–'}</div>` : ''}
    <div class="sethdr"><div>Set</div><div>Beban</div><div>Rep</div><div>✓</div></div>
    ${setRows}
    <div class="ex-foot">
      <button class="btn line sm" data-rest="${i}">⏱ Rest ${e.rest}s</button>
      <button class="btn line sm" data-addset="${i}">＋ Set</button>
      <button class="btn line sm" data-note="${i}">📝</button>
    </div>
    ${e.note ? `<div class="tiny" style="margin-top:8px">📝 ${esc(e.note)}</div>` : ''}
  </div>`;
}

/* =============== TAB: PROGRESS =============== */
function renderProgress() {
  const isoDates = Object.keys(S.sessions).filter(k => (S.sessions[k].ex || []).some(e => (e.sets || []).some(x => x.done))).sort();
  const totalSessions = isoDates.length;
  const totalSets = isoDates.reduce((a, k) => a + (S.sessions[k].ex || []).reduce((x, e) => x + (e.sets || []).filter(s => s.done).length, 0), 0);
  const totalVol = isoDates.reduce((a, k) => a + (S.sessions[k].ex || []).reduce((x, e) => x + (e.sets || []).filter(s => s.done).reduce((y, s) => y + (num(s.w) || 0) * (num(s.r) || 0), 0), 0), 0);

  /* streak minggu */
  const weeks = new Set(isoDates.map(k => weekStart(k)));
  const curW = weekStart(todayISO());
  const streak = (() => { let n = 0, d = parseISO(curW); for (; ;) { const key = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); if (weeks.has(key)) { n++; d.setDate(d.getDate() - 7); } else break; if (n > 200) break; } return n; })();

  /* daftar gerakan yang pernah dilatih */
  const exIds = [];
  isoDates.forEach(k => (S.sessions[k].ex || []).forEach(e => { if (e.exId && e.sets.some(x => x.done) && !exIds.includes(e.exId)) exIds.push(e.exId); }));
  if (!S.chartEx || !exIds.includes(S.chartEx)) S.chartEx = exIds[0] || null;

  /* grafik gerakan terpilih: top set (w*r max) per tanggal */
  let chart = '';
  let chartTitle = '';
  if (S.chartEx) {
    const lib = libById(S.chartEx);
    chartTitle = lib ? lib.name : S.chartEx;
    const pts = [];
    isoDates.forEach(k => {
      const e = (S.sessions[k].ex || []).find(x => x.exId === S.chartEx);
      if (!e) return;
      const done = e.sets.filter(s => s.done);
      if (!done.length) return;
      let best = 0, bw = 0, br = 0;
      done.forEach(s => { const v = (num(s.w) || 0) * (num(s.r) || 0); if (v > best) { best = v; bw = num(s.w) || 0; br = num(s.r) || 0; } });
      pts.push({ x: parseISO(k).getTime(), y: bw || br || best, w: bw, r: br, iso: k });
    });
    if (pts.length) {
      chart = lineChart([{ c: '#ff7a45', pts, area: true }], {
        h: 140, fmtY: v => Math.round(v),
        xLabels: [{ x: pts[0].x, t: fmtShort(pts[0].iso), a: 'start' }, { x: pts[pts.length - 1].x, t: fmtShort(pts[pts.length - 1].iso), a: 'end' }]
      });
      const first = pts[0], last = pts[pts.length - 1];
      const diff = last.y - first.y;
      chart += `<div class="row" style="margin-top:10px;gap:8px">
        <div class="stat" style="flex:1"><b>${last.w ? last.w + ' kg' : '–'}</b><span>Beban terakhir</span></div>
        <div class="stat" style="flex:1"><b>${last.r || '–'}</b><span>Rep terakhir</span></div>
        <div class="stat" style="flex:1"><b style="color:${diff > 0 ? 'var(--ok)' : diff < 0 ? 'var(--bad)' : 'var(--mut)'}">${diff > 0 ? '+' : ''}${Math.round(diff * 10) / 10}</b><span>Perubahan</span></div>
      </div>`;
    } else chart = '<div class="empty"><div class="em">📈</div>Belum ada set tercatat untuk gerakan ini.</div>';
  } else {
    chart = '<div class="empty"><div class="em">📈</div>Selesaikan 1 sesi dulu, grafik progress akan muncul di sini.</div>';
  }

  /* grafik volume 8 minggu terakhir */
  const wbars = [];
  for (let i = 7; i >= 0; i--) {
    const start = parseISO(weekStart(todayISO())); start.setDate(start.getDate() - i * 7);
    const key = start.getFullYear() + '-' + pad(start.getMonth() + 1) + '-' + pad(start.getDate());
    const v = volumeFor(key);
    const tot = Object.values(v).reduce((a, b) => a + b, 0);
    wbars.push({ l: 'M' + (8 - i), l2: fmtShort(key), v: tot, c: i === 0 ? '#ff7a45' : '#4da3ff', dim: i !== 0 });
  }

  /* riwayat sesi */
  let hist = '';
  isoDates.slice().reverse().slice(0, 25).forEach(k => {
    const s = S.sessions[k];
    const dn = (s.ex || []).reduce((a, e) => a + (e.sets || []).filter(x => x.done).length, 0);
    const day = S.plan.find(d => d.id === s.dayId);
    const musc = {};
    (s.ex || []).forEach(e => { const n = (e.sets || []).filter(x => x.done).length; if (n) musc[e.muscle] = (musc[e.muscle] || 0) + n; });
    const mm = Object.keys(musc).map(m => m + ' ' + musc[m]).join(' · ');
    hist += `<div class="hist" data-hist="${k}">
      <div class="hd">${fmtShort(k)}<br><span class="tiny">${(day ? day.emoji + ' ' + day.label : 'Bebas')}</span></div>
      <div class="hb"><div class="hn">${(s.ex || []).filter(e => (e.sets || []).some(x => x.done)).length} gerakan</div><div class="hv">${esc(mm || '–')}</div></div>
      <div class="hx">${dn} set</div></div>`;
  });
  if (!hist) hist = '<div class="empty"><div class="em">🗓️</div>Belum ada riwayat sesi.</div>';

  /* bodyweight */
  let bwChart = '';
  if (S.bodylog.length >= 2) {
    const pts = S.bodylog.slice(-14).map(b => ({ x: parseISO(b.date).getTime(), y: b.w, iso: b.date }));
    bwChart = lineChart([{ c: '#4de0c0', pts, area: true }], { h: 110, fmtY: v => v.toFixed(0), xLabels: [{ x: pts[0].x, t: fmtShort(pts[0].iso), a: 'start' }, { x: pts[pts.length - 1].x, t: fmtShort(pts[pts.length - 1].iso), a: 'end' }] });
  }

  $('#view').innerHTML = `<div class="fade">
    <div class="sec-t"><h2>Progress</h2><span class="sub">${totalSessions} sesi tercatat</span></div>
    <div class="stat-grid">
      <div class="stat"><b>${totalSets}</b><span>Total set selesai</span></div>
      <div class="stat"><b>${Math.round(totalVol / 100) / 10 >= 1000 ? (totalVol / 1000).toFixed(1) + 'k' : Math.round(totalVol).toLocaleString('id-ID')}</b><span>Total volume (kg)</span></div>
      <div class="stat"><b style="color:var(--ok)">${streak}</b><span>Minggu berturut-turut</span></div>
      <div class="stat"><b>${exIds.length}</b><span>Gerakan dilatih</span></div>
    </div>

    <div class="sec-t"><h2>📈 Progress beban</h2></div>
    <div class="card">
      ${exIds.length ? `<select id="chartSel">${exIds.map(id => { const l = libById(id); return `<option value="${id}" ${id === S.chartEx ? 'selected' : ''}>${esc(l ? l.name : id)}</option>`; }).join('')}</select>
      <div class="tiny" style="margin:8px 0 2px">Angka = beban (kg) set terkuat per sesi. Kalau tanpa beban, yang dihitung jumlah rep.</div>` : ''}
      ${chart}
    </div>

    <div class="sec-t"><h2>📊 Volume 8 minggu</h2><span class="sub">total set/minggu</span></div>
    <div class="card">${barChart(wbars, { max: 70 })}
      <div class="tiny" style="margin-top:6px">Target ±60 set/minggu untuk 4 hari latihan.</div>
    </div>

    <div class="sec-t"><h2>⚖️ Berat badan</h2>
      <button class="btn ghost sm" data-addbw="1">＋ Catat</button></div>
    <div class="card">
      ${S.bodylog.length ? bwChart || `<div class="small">Terakhir: <b>${S.bodylog[S.bodylog.length - 1].w} kg</b> (${fmtShort(S.bodylog[S.bodylog.length - 1].date)})</div>` : '<div class="empty" style="padding:16px"><div class="em">⚖️</div>Catat berat badan tiap pagi (puasa) untuk pantau cutting.</div>'}
      ${S.bodylog.length >= 2 ? `<div class="tiny" style="margin-top:8px">Perubahan 7 hari terakhir: <b style="color:${(S.bodylog[S.bodylog.length - 1].w - (S.bodylog[Math.max(0, S.bodylog.length - 8)] || {}).w) <= 0 ? 'var(--ok)' : 'var(--warn)'}">${Math.round((S.bodylog[S.bodylog.length - 1].w - (S.bodylog[Math.max(0, S.bodylog.length - 8)] || S.bodylog[0]).w) * 10) / 10} kg</b></div>` : ''}
    </div>

    <div class="sec-t"><h2>🗓️ Riwayat sesi</h2><span class="sub">ketuk untuk detail</span></div>
    <div class="card" style="padding:6px 14px">${hist}</div>
  </div>`;

  const sel = $('#chartSel');
  if (sel) sel.onchange = () => { S.chartEx = sel.value; renderProgress(); };
}

/* =============== TAB: SETELAN =============== */
function renderSettings() {
  $('#view').innerHTML = `<div class="fade">
    <div class="sec-t"><h2>Setelan</h2></div>
    <div class="card">
      <div class="setting"><div class="si">👤</div><div class="st"><b>Nama</b><span>Muncul di header aplikasi</span></div>
        <input id="setName" style="max-width:130px;text-align:right" placeholder="Nama kamu" value="${esc(S.settings.name)}"></div>
      <div class="setting"><div class="si">⚖️</div><div class="st"><b>Berat badan</b><span>Dipakai untuk hitung kebutuhan protein</span></div>
        <input id="setBw" type="number" inputmode="decimal" step="0.1" style="max-width:100px;text-align:right" placeholder="kg" value="${S.settings.bw || ''}"></div>
      <div class="setting"><div class="si">🔢</div><div class="st"><b>Satuan beban</b><span>kg atau lb</span></div>
        <select id="setUnit" style="max-width:100px"><option value="kg" ${S.settings.unit === 'kg' ? 'selected' : ''}>kg</option><option value="lb" ${S.settings.unit === 'lb' ? 'selected' : ''}>lb</option></select></div>
    </div>

    <div class="sec-t"><h2>⏱️ Timer istirahat</h2></div>
    <div class="card">
      <div class="setting"><div class="si">▶️</div><div class="st"><b>Auto-start timer</b><span>Langsung jalan setelah set dicentang ✓</span></div>
        <button class="switch ${S.settings.autoRest ? 'on' : ''}" data-tog="autoRest"></button></div>
      <div class="setting"><div class="si">📳</div><div class="st"><b>Getar</b><span>Getar saat waktu habis</span></div>
        <button class="switch ${S.settings.restVibrate ? 'on' : ''}" data-tog="restVibrate"></button></div>
      <div class="setting"><div class="si">🔔</div><div class="st"><b>Suara</b><span>Bunyi beep 3× saat waktu habis</span></div>
        <button class="switch ${S.settings.restBeep ? 'on' : ''}" data-tog="restBeep"></button></div>
    </div>

    ${S.settings.bw ? `<div class="sec-t"><h2>🍽️ Angka harian kamu</h2></div>
    <div class="card">
      <div class="why-row"><b>🥩 Protein</b><span class="muted">${Math.round(S.settings.bw * 1.8)}–${Math.round(S.settings.bw * 2.2)} g/hari (1,8–2,2 g/kg)</span></div>
      <div class="why-row"><b>🔻 Kalori</b><span class="muted">TDEE ±${Math.round(S.settings.bw * 33)} kkal → defisit ${Math.round(S.settings.bw * 33 - 400)}–${Math.round(S.settings.bw * 33 - 300)} kkal</span></div>
      <div class="why-row"><b>💊 Kreatin</b><span class="muted">5 g/hari, kapan saja</span></div>
      <div class="why-row"><b>💧 Air</b><span class="muted">3–4 liter/hari</span></div>
      <div class="tiny" style="margin-top:8px">Estimasi kasar. Jadwal kamu menargetkan 100–130 g protein/hari — angka di atas penyesuaian menurut berat badan.</div>
    </div>` : ''}

    <div class="sec-t"><h2>🗂️ Data</h2></div>
    <div class="card">
      <div class="setting"><div class="si">💾</div><div class="st"><b>Ekspor data</b><span>Unduh backup .json (bisa dipindah ke HP lain)</span></div>
        <button class="btn ghost sm" data-export="1">Ekspor</button></div>
      <div class="setting"><div class="si">📥</div><div class="st"><b>Impor data</b><span>Pulihkan dari file backup</span></div>
        <button class="btn ghost sm" data-import="1">Impor</button></div>
      <div class="setting"><div class="si">📄</div><div class="st"><b>Ekspor teks</b><span>Ringkasan .txt untuk dibaca/dibagikan</span></div>
        <button class="btn ghost sm" data-exporttxt="1">Ekspor</button></div>
      <div class="setting"><div class="si">♻️</div><div class="st"><b>Reset jadwal ke default</b><span>Kembalikan gerakan bawaan (riwayat tetap aman)</span></div>
        <button class="btn line sm" data-resetplan="1">Reset</button></div>
      <div class="setting"><div class="si">🗑️</div><div class="st"><b>Hapus semua data</b><span>Riwayat + jadwal + setelan</span></div>
        <button class="btn danger sm" data-wipe="1">Hapus</button></div>
    </div>

    <div class="sec-t"><h2>ℹ️ Tentang</h2></div>
    <div class="card">
      <div class="why-row"><b>Aplikasi</b><span class="muted">Lean Trainer · PWA offline</span></div>
      <div class="why-row"><b>Program</b><span class="muted">Upper-body aesthetic split, Senin–Kamis · ±60 set/minggu</span></div>
      <div class="why-row"><b>Penyimpanan</b><span class="muted">Semua data di HP kamu (localStorage). Tidak ada akun, tidak ada internet.</span></div>
      <div class="why-row"><b>Instal ulang</b><span class="muted">Chrome → ⋮ → “Tambahkan ke layar utama”. Data tetap tersimpan selama tidak hapus data situs.</span></div>
    </div>
    <input type="file" id="impFile" accept="application/json,.json" style="display:none">
  </div>`;

  $('#setName').onchange = e => { S.settings.name = e.target.value.trim(); saveSettings(); renderHeader(); toast('Nama disimpan'); };
  $('#setBw').onchange = e => { S.settings.bw = num(e.target.value); saveSettings(); renderSettings(); toast('Berat badan disimpan'); };
  $('#setUnit').onchange = e => { S.settings.unit = e.target.value; saveSettings(); toast('Satuan: ' + e.target.value); };
}

/* ---------------- master render ---------------- */
function render() {
  renderHeader();
  if (S.tab === 'schedule') renderSchedule();
  else if (S.tab === 'workout') renderWorkout();
  else if (S.tab === 'progress') renderProgress();
  else renderSettings();
}

/* ---------------- modal helpers ---------------- */
function sheet(title, bodyHTML, onMount) {
  closeModal();
  const m = document.createElement('div');
  m.className = 'modal'; m.id = 'modal';
  m.innerHTML = `<div class="sheet"><div class="grab"></div>
    <div class="sheet-hd"><h3>${title}</h3><button class="icobtn" data-close="1">✕</button></div>
    <div class="sheet-bd">${bodyHTML}</div></div>`;
  document.body.appendChild(m);
  requestAnimationFrame(() => m.classList.add('on'));
  m.addEventListener('click', ev => { if (ev.target === m || ev.target.closest('[data-close]')) closeModal(); });
  if (onMount) onMount(m);
  return m;
}
function closeModal() { const m = $('#modal'); if (m) m.remove(); }

/* pemilih gerakan */
function exercisePicker(muscleFilter, cb) {
  const groups = {};
  S.lib.forEach(e => { (groups[e.muscle] = groups[e.muscle] || []).push(e); });
  let html = `<input id="pickSearch" placeholder="🔍 Cari gerakan…" style="margin-bottom:6px">`;
  const order = muscleFilter ? [muscleFilter].concat(Object.keys(groups).filter(g => g !== muscleFilter)) : Object.keys(groups);
  order.forEach(g => {
    if (!groups[g]) return;
    html += `<div class="picker-group" style="color:${MUSCLE_COLOR[g] || '#8fa1c4'}">${g}</div>`;
    groups[g].forEach(e => {
      html += `<button class="picker-item" data-pick="${e.id}" data-norm="${esc((e.name + ' ' + e.muscle).toLowerCase())}">
        <div style="width:4px;height:30px;border-radius:9px;background:${MUSCLE_COLOR[g] || '#8fa1c4'};flex:none"></div>
        <div style="flex:1;min-width:0"><div class="pn">${esc(e.name)}</div><div class="pm">${e.type === 'compound' ? '🔩 compound' : '🎯 isolasi'} · ${e.reps[0]}–${e.reps[1]} rep · ⏱${e.rest}s</div></div>
        <span class="tiny">＋</span></button>`;
    });
  });
  html += `<div class="picker-group">Lainnya</div>
    <button class="picker-item" data-custom="1"><div style="flex:1"><div class="pn">✏️ Gerakan buatan sendiri</div><div class="pm">Ketik nama gerakan custom</div></div></button>`;
  sheet('Pilih gerakan', html, m => {
    const inp = $('#pickSearch', m);
    inp.focus();
    inp.oninput = () => {
      const q = inp.value.toLowerCase().trim();
      $$('.picker-item', m).forEach(b => { b.style.display = !q || (b.dataset.norm || '').includes(q) ? '' : 'none'; });
    };
    m.addEventListener('click', ev => {
      const p = ev.target.closest('[data-pick]');
      if (p) { closeModal(); cb(p.dataset.pick); return; }
      if (ev.target.closest('[data-custom]')) { customExercise(muscleFilter, cb); }
    });
  });
}
function customExercise(muscle, cb) {
  sheet('Gerakan baru', `
    <label class="tiny">Nama gerakan</label>
    <input id="cxName" placeholder="mis. Machine Chest Press">
    <div style="margin-top:12px"><label class="tiny">Bagian otot</label>
    <select id="cxMuscle">${Object.keys(MUSCLE_TARGETS).map(m => `<option ${m === muscle ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
    <div class="row" style="margin-top:12px">
      <div style="flex:1"><label class="tiny">Tipe</label><select id="cxType"><option value="isolasi">Isolasi</option><option value="compound">Compound</option></select></div>
      <div style="flex:1"><label class="tiny">Rest (dtk)</label><input id="cxRest" type="number" inputmode="numeric" value="90"></div>
    </div>
    <button class="btn full" style="margin-top:16px" id="cxSave">Simpan gerakan</button>`, m => {
      $('#cxSave', m).onclick = () => {
        const name = $('#cxName', m).value.trim();
        if (!name) { toast('Nama gerakan belum diisi'); return; }
        const id = 'c_' + Date.now().toString(36);
        const type = $('#cxType', m).value;
        const e = {
          id, name, muscle: $('#cxMuscle', m).value, tag: '', type,
          reps: type === 'compound' ? [8, 12] : [12, 15],
          rest: num($('#cxRest', m).value) || 90, custom: true
        };
        S.lib.push(e); saveLib(); closeModal(); cb(id); toast('Gerakan ditambahkan');
      };
    });
}

/* menu opsi gerakan */
function exMenu(i) {
  const s = S.sessions[S.date]; if (!s) return;
  const e = s.ex[i]; if (!e) return;
  sheet(e.name || 'Opsi gerakan', `
    <button class="picker-item" data-act="replace"><div style="flex:1"><div class="pn">🔄 Ganti gerakan</div><div class="pm">Pilih dari pustaka / custom</div></div></button>
    <button class="picker-item" data-act="sets"><div style="flex:1"><div class="pn">🔢 Ubah jumlah set</div><div class="pm">Sekarang: ${e.sets.length} set</div></div></button>
    <button class="picker-item" data-act="rest"><div style="flex:1"><div class="pn">⏱️ Ubah waktu rest</div><div class="pm">Sekarang: ${e.rest} detik</div></div></button>
    <button class="picker-item" data-act="note"><div style="flex:1"><div class="pn">📝 Catatan</div><div class="pm">${e.note ? esc(e.note) : 'Tambah catatan (RIR, tempo, dll)'}</div></div></button>
    <button class="picker-item" data-act="dup"><div style="flex:1"><div class="pn">📑 Duplikat</div><div class="pm">Salin gerakan ini</div></div></button>
    <button class="picker-item" data-act="del" style="border-color:rgba(255,93,108,.35)"><div style="flex:1"><div class="pn" style="color:#ff8b96">🗑️ Hapus gerakan</div><div class="pm">Hilangkan dari sesi ini</div></div></button>
  `, m => {
    m.addEventListener('click', ev => {
      const b = ev.target.closest('[data-act]'); if (!b) return;
      const act = b.dataset.act;
      if (act === 'replace') {
        closeModal();
        exercisePicker(e.muscle, id => {
          const lib = libById(id);
          e.exId = id; e.name = lib.name; e.type = lib.type; e.empty = false;
          if (!e.sets.some(x => x.done)) { e.rest = lib.rest; e.reps = lib.reps; }
          saveSessions(); render(); toast('Gerakan diganti');
        });
      } else if (act === 'sets') {
        closeModal();
        sheet('Jumlah set', `<div class="row" style="justify-content:center;gap:9px;flex-wrap:wrap">
          ${[1, 2, 3, 4, 5, 6].map(n => `<button class="btn ${n === e.sets.length ? '' : 'ghost'} sm" data-n="${n}" style="min-width:56px">${n} set</button>`).join('')}
          </div><div class="tiny" style="text-align:center;margin-top:10px">Set yang sudah dicentang tidak akan hilang kalau jumlahnya ditambah.</div>`, mm => {
            mm.addEventListener('click', ev2 => {
              const b2 = ev2.target.closest('[data-n]'); if (!b2) return;
              const n = +b2.dataset.n;
              if (n > e.sets.length) while (e.sets.length < n) e.sets.push({ w: '', r: '', done: false });
              else e.sets = e.sets.slice(0, n);
              saveSessions(); closeModal(); render();
            });
          });
      } else if (act === 'rest') {
        closeModal();
        sheet('Waktu rest', `<div class="row" style="justify-content:center;gap:8px;flex-wrap:wrap">
          ${[45, 60, 75, 90, 120, 150, 180].map(n => `<button class="btn ${n === e.rest ? '' : 'ghost'} sm" data-s="${n}">${n}s</button>`).join('')}
          </div>`, mm => {
            mm.addEventListener('click', ev2 => { const b2 = ev2.target.closest('[data-s]'); if (!b2) return; e.rest = +b2.dataset.s; saveSessions(); closeModal(); render(); });
          });
      } else if (act === 'note') {
        closeModal();
        sheet('Catatan', `<textarea id="nt" rows="3" placeholder="mis. RIR 2, tempo 3-1-1, tangan agak lebar">${esc(e.note || '')}</textarea>
          <button class="btn full" style="margin-top:12px" id="ntSave">Simpan</button>`, mm => {
            $('#ntSave', mm).onclick = () => { e.note = $('#nt', mm).value.trim(); saveSessions(); closeModal(); render(); };
          });
      } else if (act === 'dup') {
        const c = clone(e); c.key = c.key + '_d' + Date.now(); c.sets = mkSets(e.sets.length);
        s.ex.splice(i + 1, 0, c); saveSessions(); closeModal(); render(); toast('Gerakan diduplikat');
      } else if (act === 'del') {
        s.ex.splice(i, 1); saveSessions(); closeModal(); render(); toast('Gerakan dihapus');
      }
    });
  });
}

/* detail riwayat */
function histDetail(iso) {
  const s = S.sessions[iso]; if (!s) return;
  const day = S.plan.find(d => d.id === s.dayId);
  let rows = '';
  (s.ex || []).forEach(e => {
    const dn = (e.sets || []).filter(x => x.done);
    if (!dn.length) return;
    rows += `<div class="why-row"><b style="width:auto;color:${MUSCLE_COLOR[e.muscle] || '#fff'}">${esc(e.name)}</b>
      <span class="muted" style="flex:1;text-align:right">${dn.map(x => (x.w || '–') + '×' + (x.r || '–')).join(' · ')}</span></div>`;
  });
  sheet(fmtDate(iso), `
    <div class="row" style="gap:7px;margin-bottom:12px;flex-wrap:wrap">
      <span class="chip">${day ? day.emoji + ' ' + day.label : '🏋️ Bebas'}</span>
      <span class="chip">✅ ${(s.ex || []).reduce((a, e) => a + (e.sets || []).filter(x => x.done).length, 0)} set</span>
      ${s.end ? `<span class="chip">⏱ ${Math.max(1, Math.round((s.end - s.start) / 60000))} menit</span>` : ''}
    </div>
    ${rows || '<div class="empty">Tidak ada set selesai.</div>'}
    <div class="row" style="margin-top:16px">
      <button class="btn ghost sm" style="flex:1" data-reopen="1">Buka lagi sesi ini</button>
      <button class="btn danger sm" data-delses="1">Hapus</button>
    </div>`, m => {
      m.addEventListener('click', ev => {
        if (ev.target.closest('[data-reopen]')) { closeModal(); S.date = iso; S.dayId = s.dayId; setTab('workout'); }
        if (ev.target.closest('[data-delses]')) { delete S.sessions[iso]; saveSessions(); closeModal(); render(); toast('Sesi dihapus'); }
      });
    });
}

/* ---------------- export / import ---------------- */
function download(name, content, type) {
  const b = new Blob([content], { type: type || 'application/octet-stream' });
  const u = URL.createObjectURL(b);
  const a = document.createElement('a'); a.href = u; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}
function exportJSON() {
  const data = { app: 'LeanTrainer', v: 1, exported: new Date().toISOString(), plan: S.plan, lib: S.lib, sessions: S.sessions, bodylog: S.bodylog, settings: S.settings };
  download('lean-trainer-backup-' + todayISO() + '.json', JSON.stringify(data, null, 2), 'application/json');
  toast('Backup diunduh');
}
function importJSON(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!d.sessions) throw new Error('format');
      if (d.plan) { S.plan = d.plan; savePlan(); }
      if (d.lib) { S.lib = d.lib; saveLib(); }
      S.sessions = Object.assign(S.sessions, d.sessions); saveSessions();
      if (d.bodylog) { S.bodylog = d.bodylog; saveBody(); }
      if (d.settings) { S.settings = Object.assign(S.settings, d.settings); saveSettings(); }
      closeModal(); render(); toast('Data berhasil dipulihkan ✅');
    } catch (e) { toast('File tidak valid'); }
  };
  r.readAsText(file);
}
function exportTXT() {
  let t = 'LEAN TRAINER — RINGKASAN LATIHAN\n';
  t += 'Dicetak: ' + new Date().toLocaleString('id-ID') + '\n';
  t += '='.repeat(46) + '\n\nJADWAL (SENIN–KAMIS)\n';
  S.plan.forEach(d => {
    t += `\n${d.emoji} ${d.label.toUpperCase()} — ${d.title} (${planTargetSets(d.id)} set)\n`;
    const agg = {};
    d.blocks.forEach(b => { agg[b.muscle] = agg[b.muscle] || { s: 0, reps: b.reps, rest: b.rest }; agg[b.muscle].s += b.targetSets; });
    Object.keys(agg).forEach(m => { const a = agg[m]; t += `  • ${m.padEnd(12)} ${a.s} set   ${a.reps[0]}–${a.reps[1]} rep   rest ${a.rest[0]}–${a.rest[1]} dtk\n`; });
    (d.blocks || []).forEach(b => {
      (b.picks || []).forEach(p => { const e = libById(p); if (e) t += `      – ${e.name}\n`; });
    });
  });
  t += '\n' + '='.repeat(46) + '\nRIWAYAT SESI\n';
  Object.keys(S.sessions).sort().forEach(k => {
    const s = S.sessions[k];
    const dn = (s.ex || []).reduce((a, e) => a + (e.sets || []).filter(x => x.done).length, 0);
    if (!dn) return;
    const day = S.plan.find(d => d.id === s.dayId);
    t += `\n[${k}] ${day ? day.label : 'Bebas'} — ${dn} set\n`;
    (s.ex || []).forEach(e => {
      const sets = (e.sets || []).filter(x => x.done);
      if (!sets.length) return;
      t += `  ${e.name}: ${sets.map(x => (x.w || '–') + 'kg×' + (x.r || '–')).join(', ')}${e.note ? '  // ' + e.note : ''}\n`;
    });
  });
  t += '\n' + '='.repeat(46) + '\nVOLUME MINGGU INI\n';
  const v = volumeFor(weekStart(todayISO()));
  Object.keys(MUSCLE_TARGETS).forEach(m => { t += `  ${m.padEnd(12)} ${v[m]}/${MUSCLE_TARGETS[m]} set\n`; });
  download('lean-trainer-ringkasan-' + todayISO() + '.txt', t, 'text/plain');
  toast('Ringkasan .txt diunduh');
}

/* ---------------- events ---------------- */
function bind() {
  document.addEventListener('click', ev => {
    const t = ev.target;

    /* nav */
    const nb = t.closest('.navb'); if (nb) { setTab(nb.dataset.tab); return; }
    /* day tab (jadwal) */
    const dt = t.closest('[data-day]'); if (dt) { S.dayId = dt.dataset.day; render(); return; }
    const go = t.closest('[data-go]'); if (go) { openDay(go.dataset.go, todayISO()); setTab('workout'); return; }
    const sd = t.closest('[data-startday]'); if (sd) { openDay(sd.dataset.startday, S.date); render(); toast('Sesi dimulai 💪'); return; }
    const fd = t.closest('[data-freeday]'); if (fd) { ensureSession(S.date, null); if (!S.sessions[S.date].ex.length) S.sessions[S.date].ex = []; saveSessions(); exercisePicker(null, id => { addExercise(id); }); return; }
    /* strip tanggal */
    const dc = t.closest('[data-date]'); if (dc) {
      S.date = dc.dataset.date;
      const s = S.sessions[S.date];
      S.dayId = s && s.dayId ? s.dayId : (dowIndex(S.date) < 4 ? S.plan[dowIndex(S.date)].id : null);
      if (s && s.dayId) openDay(s.dayId, S.date);
      render(); return;
    }
    /* centang set */
    const ck = t.closest('[data-set]');
    if (ck) {
      const [i, si] = ck.dataset.set.split('_').map(Number);
      const e = S.sessions[S.date].ex[i]; const set = e.sets[si];
      set.done = !set.done;
      if (set.done) {
        buzz(15);
        e.done = e.sets.every(x => x.done);
        saveSessions();
        renderWorkout();
        if (S.settings.autoRest && si < e.sets.length - 1) startRest(e.rest, e.name + ' · set ' + (si + 2), { i, si });
        else if (S.settings.autoRest && si === e.sets.length - 1) startRest(Math.round(e.rest * 1.4), 'Selesai ' + e.name + ' 🎉');
        return;
      }
      saveSessions(); renderWorkout(); return;
    }
    /* tombol rest manual */
    const rs = t.closest('[data-rest]'); if (rs) { const e = S.sessions[S.date].ex[+rs.dataset.rest]; startRest(e.rest, e.name); return; }
    /* tambah set */
    const as = t.closest('[data-addset]'); if (as) { const e = S.sessions[S.date].ex[+as.dataset.addset]; e.sets.push({ w: '', r: '', done: false }); saveSessions(); renderWorkout(); toast('Set ditambahkan'); return; }
    /* note shortcut */
    const nt = t.closest('[data-note]'); if (nt) { exMenu(+nt.dataset.note); return; }
    /* menu gerakan */
    const em = t.closest('[data-exmenu]'); if (em) { exMenu(+em.dataset.exmenu); return; }
    /* tambah gerakan */
    const ax = t.closest('[data-addex]'); if (ax) {
      const s = S.sessions[S.date];
      const musc = s.ex.length ? s.ex[s.ex.length - 1].muscle : null;
      exercisePicker(musc, id => addExercise(id)); return;
    }
    /* selesai / reset */
    const fn = t.closest('[data-finish]'); if (fn) { finishSession(); return; }
    const cl = t.closest('[data-clear]'); if (cl) { resetSession(); return; }
    /* riwayat */
    const hs = t.closest('[data-hist]'); if (hs) { histDetail(hs.dataset.hist); return; }
    /* timer */
    if (t.closest('#tSkip')) { stopRest(); return; }
    if (t.closest('#tAgain')) { startRest(T.total, T.name, T.ctx); return; }
    if (t.closest('#tPlus')) { nudge(15); return; }
    if (t.closest('#tMinus')) { nudge(-15); return; }
    if (t.closest('#tDone')) { stopRest(); toast('Lanjut set berikutnya 🔥'); return; }
    /* settings */
    const tg = t.closest('[data-tog]'); if (tg) { const k = tg.dataset.tog; S.settings[k] = !S.settings[k]; saveSettings(); tg.classList.toggle('on', S.settings[k]); return; }
    if (t.closest('[data-export]')) { exportJSON(); return; }
    if (t.closest('[data-exporttxt]')) { exportTXT(); return; }
    if (t.closest('[data-import]')) { $('#impFile').click(); return; }
    if (t.closest('[data-addbw]')) { addBodyweight(); return; }
    if (t.closest('[data-resetplan]')) {
      sheet('Reset jadwal?', `<p class="small muted">Gerakan & setelan jadwal dikembalikan ke bawaan (Senin–Kamis). Riwayat latihan kamu <b>tidak</b> dihapus.</p>
        <div class="row" style="margin-top:14px"><button class="btn" style="flex:1" id="rpYes">Ya, reset</button><button class="btn ghost" style="flex:1" data-close="1">Batal</button></div>`,
        m => { $('#rpYes', m).onclick = () => { S.plan = clone(DEFAULT_PLAN); S.lib = clone(EXERCISE_LIB); savePlan(); saveLib(); closeModal(); render(); toast('Jadwal dikembalikan ke default'); }; });
      return;
    }
    if (t.closest('[data-wipe]')) {
      sheet('Hapus semua data?', `<p class="small muted">Semua riwayat latihan, jadwal kustom, dan setelan akan hilang permanen dari HP ini. Ekspor dulu kalau mau backup.</p>
        <div class="row" style="margin-top:14px"><button class="btn danger" style="flex:1" id="wpYes">Hapus semua</button><button class="btn ghost" style="flex:1" data-close="1">Batal</button></div>`,
        m => { $('#wpYes', m).onclick = () => { ['plan', 'lib', 'sessions', 'settings', 'bodylog'].forEach(k => localStorage.removeItem('lt_' + k)); location.reload(); }; });
      return;
    }
  });

  /* input beban & rep (event delegation, tanpa re-render agar kursor tidak lompat) */
  document.addEventListener('input', ev => {
    const el = ev.target;
    const s = S.sessions[S.date]; if (!s) return;
    if (el.dataset.w != null) {
      const [i, si] = el.dataset.w.split('_').map(Number);
      if (s.ex[i]) { s.ex[i].sets[si].w = el.value; clearTimeout(el._t); el._t = setTimeout(saveSessions, 400); }
    } else if (el.dataset.r != null) {
      const [i, si] = el.dataset.r.split('_').map(Number);
      if (s.ex[i]) { s.ex[i].sets[si].r = el.value; clearTimeout(el._t); el._t = setTimeout(saveSessions, 400); }
    }
  });

  const imp = () => { const f = $('#impFile'); if (f) f.onchange = e => { if (e.target.files[0]) importJSON(e.target.files[0]); }; };
  const obs = new MutationObserver(imp); obs.observe(document.body, { childList: true, subtree: true }); imp();
}

function addExercise(id, blockIdx) {
  const s = ensureSession(S.date, S.dayId);
  const lib = libById(id); if (!lib) return;
  const day = S.plan.find(d => d.id === s.dayId);
  let bi = blockIdx;
  if (bi == null) {
    /* taruh di block yang ototnya sama, kalau tidak ada buat block baru */
    if (day) { bi = day.blocks.findIndex(b => b.muscle === lib.muscle); if (bi < 0) bi = day.blocks.length - 1; }
    else bi = 0;
  }
  const blk = day ? day.blocks[bi] : null;
  s.ex.push({
    key: (bi) + '_' + id + '_' + Date.now().toString(36),
    blockIdx: bi, exId: id, name: lib.name, muscle: lib.muscle, type: lib.type,
    reps: blk ? blk.reps : lib.reps,
    rest: blk ? (Array.isArray(blk.rest) ? blk.rest[0] : blk.rest) : lib.rest,
    sets: mkSets(blk ? Math.max(1, Math.round(blk.targetSets / Math.max(1, (blk.picks || []).length))) : lib.sets),
    note: '', done: false
  });
  const lp = lastPerformance(id, S.date);
  if (lp) s.ex[s.ex.length - 1].sets = mkSets(s.ex[s.ex.length - 1].sets.length, lp.sets);
  saveSessions(); render(); toast(lib.name + ' ditambahkan');
}

function finishSession() {
  const s = S.sessions[S.date]; if (!s) return;
  s.end = Date.now(); s.dayId = s.dayId || S.dayId;
  saveSessions();
  const dn = (s.ex || []).reduce((a, e) => a + (e.sets || []).filter(x => x.done).length, 0);
  const mins = Math.max(1, Math.round((s.end - s.start) / 60000));
  const vol = volumeDay(S.date);
  let rows = '';
  Object.keys(vol).forEach(m => { if (vol[m]) rows += `<div class="why-row"><b style="color:${MUSCLE_COLOR[m]}">${m}</b><span class="muted">${vol[m]} set</span></div>`; });
  sheet('Sesi selesai 🎉', `
    <div style="text-align:center;padding:6px 0 14px">
      <div style="font-size:44px">💪</div>
      <b style="font-size:19px">${dn} set · ${mins} menit</b>
      <div class="tiny" style="margin-top:4px">${fmtDate(S.date)}</div>
    </div>
    <div class="card" style="padding:8px 14px">${rows || '<div class="tiny">Belum ada set yang dicentang.</div>'}</div>
    <div class="tiny" style="margin-top:10px">Volume minggu ini: ${Object.values(volumeFor(weekStart(S.date))).reduce((a, b) => a + b, 0)} dari ±${Object.values(MUSCLE_TARGETS).reduce((a, b) => a + b, 0)} set target.</div>
    <div class="row" style="margin-top:14px">
      <button class="btn ghost" style="flex:1" data-close="1">Tutup</button>
      <button class="btn" style="flex:1" id="goProg">Lihat progress</button>
    </div>`, m => { $('#goProg', m).onclick = () => { closeModal(); setTab('progress'); }; });
  buzz([60, 40, 60]);
}
function resetSession() {
  const s = S.sessions[S.date]; if (!s) return;
  sheet('Reset sesi?', `<p class="small muted">Semua centang, beban, dan rep pada tanggal ini akan dikosongkan. Gerakan & jadwal tetap.</p>
    <div class="row" style="margin-top:14px"><button class="btn danger" style="flex:1" id="rsYes">Reset</button><button class="btn ghost" style="flex:1" data-close="1">Batal</button></div>`,
    m => {
      $('#rsYes', m).onclick = () => {
        s.ex = buildFromPlan(s.dayId || S.dayId);
        s.end = null; s.start = Date.now();
        saveSessions(); closeModal(); render(); toast('Sesi direset');
      };
    });
}
function addBodyweight() {
  const last = S.bodylog.length ? S.bodylog[S.bodylog.length - 1].w : (S.settings.bw || '');
  sheet('Catat berat badan', `
    <label class="tiny">Tanggal</label><input id="bwDate" type="date" value="${todayISO()}">
    <label class="tiny" style="display:block;margin-top:12px">Berat (kg)</label><input id="bwW" type="number" inputmode="decimal" step="0.1" value="${last}">
    <div class="tiny" style="margin-top:8px">Timbang pagi hari setelah bangun & sebelum makan, biar konsisten.</div>
    <button class="btn full" style="margin-top:14px" id="bwSave">Simpan</button>
    ${S.bodylog.length ? '<button class="btn line sm full" style="margin-top:8px" id="bwList">Lihat semua (' + S.bodylog.length + ')</button>' : ''}`,
    m => {
      $('#bwSave', m).onclick = () => {
        const w = num($('#bwW', m).value); const d = $('#bwDate', m).value || todayISO();
        if (!w) { toast('Isi berat badan dulu'); return; }
        S.bodylog = S.bodylog.filter(b => b.date !== d);
        S.bodylog.push({ date: d, w }); S.bodylog.sort((a, b) => a.date < b.date ? -1 : 1);
        S.settings.bw = w; saveSettings(); saveBody(); closeModal(); render(); toast('Berat ' + w + ' kg tersimpan');
      };
      const bl = $('#bwList', m);
      if (bl) bl.onclick = () => {
        sheet('Riwayat berat badan', S.bodylog.slice().reverse().map(b => `<div class="why-row"><b>${fmtShort(b.date)}</b><span class="muted" style="flex:1;text-align:right">${b.w} kg</span></div>`).join(''));
      };
    });
}

/* ---------------- PWA ---------------- */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; showInstallBar(); });
function showInstallBar() {
  if ($('#installBar') || S.settings.installPromptSeen) return;
  const b = document.createElement('div');
  b.id = 'installBar';
  b.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:80;max-width:536px;margin:0 auto;background:linear-gradient(135deg,#ff7a45,#ffb648);color:#1a0f05;border-radius:16px;padding:12px 14px;display:flex;gap:10px;align-items:center;box-shadow:0 14px 34px rgba(0,0,0,.45);font-size:13px;font-weight:600';
  b.innerHTML = `<div style="flex:1">📲 Pasang sebagai aplikasi<br><span style="font-weight:500;font-size:11.5px;opacity:.8">Buka penuh, tanpa browser bar</span></div>
    <button id="instYes" style="background:#1a0f05;color:#ffd7b0;padding:8px 14px;border-radius:11px;font-weight:800;font-size:12.5px">Pasang</button>
    <button id="instNo" style="font-size:17px;padding:4px 8px;opacity:.6">✕</button>`;
  document.body.appendChild(b);
  $('#instYes').onclick = async () => {
    S.settings.installPromptSeen = true; saveSettings();
    b.remove();
    if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; }
    else toast('Chrome → ⋮ → “Tambahkan ke layar utama”');
  };
  $('#instNo').onclick = () => { S.settings.installPromptSeen = true; saveSettings(); b.remove(); };
}

/* ---------------- init ---------------- */
function init() {
  loadAll();
  const iso = todayISO();
  const idx = dowIndex(iso);
  S.dayId = idx < 4 ? S.plan[idx] ? S.plan[idx].id : null : null;
  const saved = LS.get('tab', 'workout');
  S.tab = ['schedule', 'workout', 'progress', 'settings'].includes(saved) ? saved : 'workout';
  if (S.sessions[iso] && S.sessions[iso].dayId) S.dayId = S.sessions[iso].dayId;
  openDay(S.dayId, iso);

  bind();
  $$('.navb').forEach(b => b.addEventListener('click', () => LS.set('tab', b.dataset.tab)));
  setTab(S.tab);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  }
  /* ingatkan instalasi kalau belum */
  setTimeout(() => { if (!window.matchMedia('(display-mode: standalone)').matches) showInstallBar(); }, 2500);
}

document.addEventListener('DOMContentLoaded', init);
})();
