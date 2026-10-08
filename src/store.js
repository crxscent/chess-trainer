// Хранилище прогресса (localStorage) + интервальное повторение.
const KEY = 'ct.v1';
export const DAY = 864e5;

const DEFAULT = {
  v: 1,
  srs: {},            // id -> {r, l, e, i, d, last, h:[[ts,grade]]}
  days: {},           // 'YYYY-MM-DD' -> {ex, ls, ol, newEx, newLs, newOl, sec, conv}
  journal: [],        // разборы партий
  customEx: [],       // упражнения, созданные из новых партий в браузере
  settings: {
    lichess: 'Fem_T_o',
    newEx: 8, newLs: 4, newOl: 5,
    threatStep: true, pieceStep: true,
    theme: 'auto',
  },
  created: Date.now(),
};

function clone(x) { return JSON.parse(JSON.stringify(x)); }

function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { /* приватный режим */ }
  const st = clone(DEFAULT);
  if (!raw) return st;
  try {
    const s = JSON.parse(raw);
    Object.assign(st, s);
    st.settings = Object.assign(clone(DEFAULT.settings), s.settings || {});
  } catch (e) { /* битые данные — начинаем с чистого */ }
  return st;
}

let state = load();
let saveTimer = null;
const listeners = new Set();

export function S() { return state; }
export function settings() { return state.settings; }
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function save(now = false) {
  const write = () => {
    saveTimer = null;
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { console.warn('save failed', e); }
    listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  };
  if (now) { if (saveTimer) clearTimeout(saveTimer); write(); return; }
  if (!saveTimer) saveTimer = setTimeout(write, 150);
}

export function exportData() {
  return JSON.stringify(Object.assign({ exported: new Date().toISOString() }, state), null, 1);
}
export function importData(txt) {
  const s = JSON.parse(txt);
  if (!s || typeof s !== 'object' || !s.srs) throw new Error('Это не файл прогресса тренажёра');
  const st = clone(DEFAULT);
  Object.assign(st, s);
  delete st.exported;
  st.settings = Object.assign(clone(DEFAULT.settings), s.settings || {});
  state = st; save(true);
}
export function resetAll() { state = clone(DEFAULT); save(true); }

// ---------- даты ----------
export function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function startOfDay(ts = Date.now()) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
export function todayLog() {
  const k = dayKey();
  if (!state.days[k]) state.days[k] = { ex: 0, ls: 0, ol: 0, newEx: 0, newLs: 0, newOl: 0, sec: 0, conv: 0, ok: 0, bad: 0 };
  return state.days[k];
}
export function addSeconds(sec) { if (sec > 0 && sec < 3600) { todayLog().sec += Math.round(sec); save(); } }

export function streak() {
  let n = 0; let t = Date.now();
  const has = k => { const d = state.days[k]; return d && (d.ex + d.ls + d.ol + (d.conv || 0)) > 0; };
  if (!has(dayKey(t))) t -= DAY; // сегодня ещё не занимался — считаем со вчера
  while (has(dayKey(t))) { n++; t -= DAY; }
  return n;
}

// ---------- SRS ----------
// grade: 0 — провал, 1 — с трудом, 2 — хорошо, 3 — легко
// kind: 'ex' (упражнение на мышление), 'ls' (урок плана), 'ol' (дебютная линия — память)
export function card(id) { return state.srs[id]; }
export function status(id, now = Date.now()) {
  const c = state.srs[id];
  if (!c) return 'new';
  if (c.i >= 21) return 'mastered';
  if (c.d <= now) return 'due';
  return c.r >= 1 ? 'review' : 'learning';
}
export function isDue(id, now = Date.now()) { const c = state.srs[id]; return !!c && c.d <= now; }

export function grade(id, g, kind = 'ex') {
  const now = Date.now();
  const isNew = !state.srs[id];
  const c = state.srs[id] || { r: 0, l: 0, e: 2.5, i: 0, d: now, h: [] };
  if (g === 0) {
    c.l++; c.r = 0; c.e = Math.max(1.3, c.e - 0.2);
    c.i = kind === 'ol' ? 0.5 : 1;  // линия — повторить уже сегодня вечером/завтра, упражнение — завтра
  } else {
    if (c.r === 0) c.i = kind === 'ol' ? [0, 1, 2, 4][g] : [0, 2, 4, 10][g];
    else if (c.r === 1) c.i = kind === 'ol' ? [0, 2, 4, 8][g] : Math.max(c.i + 1, Math.round(c.i * [0, 1.4, c.e, c.e * 1.3][g]));
    else c.i = Math.max(c.i + 1, Math.round(c.i * [0, 1.2, c.e, c.e * 1.3][g]));
    if (g === 1) c.e = Math.max(1.3, c.e - 0.15);
    if (g === 3) c.e = Math.min(3.2, c.e + 0.1);
    c.r++;
  }
  c.i = Math.min(c.i, 180);
  c.d = c.i < 1 ? now + c.i * DAY : startOfDay(now) + Math.round(c.i) * DAY + 4 * 3600e3; // в 4 утра нужного дня
  c.last = now;
  c.h = (c.h || []).concat([[now, g]]).slice(-12);
  state.srs[id] = c;
  const log = todayLog();
  log[kind] = (log[kind] || 0) + 1;
  if (isNew) log['new' + kind[0].toUpperCase() + kind.slice(1)] = (log['new' + kind[0].toUpperCase() + kind.slice(1)] || 0) + 1;
  if (g >= 2) log.ok = (log.ok || 0) + 1; else log.bad = (log.bad || 0) + 1;
  save();
  return c;
}

export function newLeftToday(kind) {
  const lim = { ex: state.settings.newEx, ls: state.settings.newLs, ol: state.settings.newOl }[kind] ?? 5;
  const used = todayLog()['new' + kind[0].toUpperCase() + kind.slice(1)] || 0;
  return Math.max(0, lim - used);
}

// Очередь: сначала просроченные (самые старые первыми), затем новые в пределах лимита.
export function buildQueue(ids, kind, { newLimit = null, maxDue = 999 } = {}) {
  const now = Date.now();
  const due = ids.filter(id => isDue(id, now)).sort((a, b) => state.srs[a].d - state.srs[b].d).slice(0, maxDue);
  const lim = newLimit == null ? newLeftToday(kind) : newLimit;
  const fresh = ids.filter(id => !state.srs[id]).slice(0, lim);
  return { due, fresh, all: due.concat(fresh) };
}

export function summary(ids) {
  const now = Date.now();
  const out = { total: ids.length, new: 0, due: 0, learning: 0, review: 0, mastered: 0 };
  for (const id of ids) out[status(id, now)]++;
  return out;
}

export function nextDueIn(ids) {
  const now = Date.now(); let best = Infinity;
  for (const id of ids) { const c = state.srs[id]; if (c && c.d > now && c.d < best) best = c.d; }
  return best === Infinity ? null : best;
}
