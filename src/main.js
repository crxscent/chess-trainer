import { S, settings, save, summary, buildQueue, grade, status, todayLog, streak, addSeconds, nextDueIn, newLeftToday, DAY, dayKey } from './store.js';
import { esc, toast, getJSON, pl, fmtWhen, fmtMin, $ } from './ui.js';
import { mountExercise, CATS } from './views/exercise.js';
import { mountLesson, THEMES } from './views/lesson.js';
import { mountLine, mountLineBrowse } from './views/opening.js';
import { renderReview } from './views/review.js';
import { renderJournal } from './views/journal.js';
import { renderDiagnosis } from './views/diagnosis.js';
import { renderProgress, renderSettings } from './views/progress.js';
import { renderRules, rulePractice, ruleOfDay } from './views/rules.js';
import { mountPlayout } from './views/playout.js';
import { renderGuide, renderCard } from './views/guide.js';
import { renderVision } from './views/vision.js';
import { renderRepCheck } from './views/repcheck.js';

const app = document.getElementById('app');
let cleanup = null;

// ---------- данные ----------
let DATA = null;
async function data() {
  if (DATA) return DATA;
  const [ex, op, ls, rules] = await Promise.all([getJSON('data/exercises.json'), getJSON('data/openings.json'), getJSON('data/lessons.json'), getJSON('data/rules.json')]);
  DATA = { ex: ex.concat(S().customEx || []), op, ls, rules };
  DATA.drillById = Object.fromEntries(rules.drills.map(d => [d.id, d]));
  DATA.playoutById = Object.fromEntries(rules.playouts.map(p => [p.id, p]));
  DATA.ruleById = Object.fromEntries(rules.rules.map(r => [r.id, r]));
  DATA.exById = Object.fromEntries(DATA.ex.map(e => [e.id, e]));
  DATA.lsById = Object.fromEntries(ls.map(e => [e.id, e]));
  DATA.lines = {}; DATA.lineCourse = {};
  for (const c of op.courses) for (const l of c.lines) { DATA.lines[l.id] = l; DATA.lineCourse[l.id] = c; }
  return DATA;
}
export function refreshCustom() { if (DATA) { DATA = null; } }

// ---------- навигация ----------
const NAV = [
  ['today', 'Сегодня', '☀'], ['ex', 'Мои ошибки', '♟'], ['rules', 'Золотые правила', '★'], ['plan', 'Школа плана', '♜'], ['openings', 'Дебюты', '♞'],
  ['review', 'Разбор партии', '✎'], ['guide', 'Справочник', '📖'], ['more', 'Ещё', '⋯'],
];
const MORE = [
  ['vision', 'Визуализация', '👁', 'Найди поле, цвет поля, маршруты коня, позиция по памяти'],
  ['repcheck', 'Проверка репертуара', '✓', 'Где ты и соперники отклонялись от курсов в живых партиях'],
  ['journal', 'Дневник', '☰', 'Типичные ошибки, разборы, самооценка'],
  ['diagnosis', 'Диагноз', '◎', 'Анализ 207 партий: где и почему ты теряешь очки'],
  ['progress', 'Прогресс', '▲', 'Рейтинг lichess, активность, освоение по разделам'],
  ['card', 'Карточка за доской', '▤', 'Чек-лист для печати: 4 вопроса, CCT, время'],
  ['settings', 'Настройки', '⚙', 'Лимиты, ник lichess, перенос прогресса'],
];
const BOTTOM = ['today', 'ex', 'rules', 'openings', 'more'];
function renderNav(route) {
  const top = route.split('/')[0];
  const inMore = MORE.some(m => m[0] === top) || top === 'more';
  document.getElementById('nav').innerHTML = NAV.map(([k, t]) => `<a href="#/${k}" class="${top === k || (k === 'more' && inMore) ? 'active' : ''}">${t}</a>`).join('');
  const more = inMore || ['review', 'guide', 'plan'].includes(top);
  document.getElementById('bottomnav').innerHTML = BOTTOM.map(k => {
    if (k === 'more') return `<a href="#/more" class="${more ? 'active' : ''}"><span class="i">⋯</span>Ещё</a>`;
    const n = NAV.find(x => x[0] === k);
    const short = { ex: 'Ошибки', plan: 'План', rules: 'Правила' }[k] || n[1];
    return `<a href="#/${k}" class="${top === k ? 'active' : ''}"><span class="i">${n[2]}</span>${short}</a>`;
  }).join('');
}

// ---------- тема ----------
function applyTheme() {
  const t = settings().theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}
document.getElementById('themeBtn').onclick = () => {
  const cur = settings().theme;
  const dark = cur === 'dark' || (cur === 'auto' && !matchMedia('(prefers-color-scheme: light)').matches);
  settings().theme = dark ? 'light' : 'dark'; save(); applyTheme();
};
applyTheme();

// ---------- роутер ----------
async function route() {
  const h = location.hash.replace(/^#\/?/, '') || 'today';
  renderNav(h);
  if (cleanup) { try { cleanup(); } catch (e) { } cleanup = null; }
  window.scrollTo(0, 0);
  const [page, ...rest] = h.split('/');
  const arg = rest.join('/');
  try {
    const D = await data();
    switch (page) {
      case 'today': return pageToday(D);
      case 'session': return pageSession(D, arg);
      case 'ex': return arg ? pageSingleEx(D, decodeURIComponent(arg)) : pageExList(D);
      case 'plan': return arg ? pageSingleLesson(D, decodeURIComponent(arg)) : pagePlan(D);
      case 'openings': return arg ? pageCourse(D, arg) : pageOpenings(D);
      case 'line': return pageLine(D, decodeURIComponent(arg));
      case 'review': cleanup = await renderReview(app, D); return;
      case 'journal': cleanup = renderJournal(app, D); return;
      case 'diagnosis': cleanup = await renderDiagnosis(app, D); return;
      case 'progress': cleanup = renderProgress(app, D); return;
      case 'settings': cleanup = renderSettings(app, D, () => { DATA = null; }); return;
      case 'more': return pageMore();
      case 'rules': cleanup = renderRules(app, D); return;
      case 'guide': cleanup = await renderGuide(app, arg); return;
      case 'card': cleanup = renderCard(app); return;
      case 'vision': cleanup = renderVision(app, D); return;
      case 'repcheck': cleanup = renderRepCheck(app, D); return;
      default: location.hash = '#/today';
    }
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="card"><h2>Что-то пошло не так</h2><p class="muted">${esc(e.message)}</p><a class="btn" href="#/today">На главную</a></div>`;
  }
}
window.addEventListener('hashchange', route);

// ---------- ID-шники ----------
const exIds = (D, f = () => true) => D.ex.filter(f).map(e => 'ex:' + e.id);
const lsIds = (D, f = () => true) => D.ls.filter(f).map(l => 'ls:' + l.id);
const olIds = (D, courseId) => D.op.courses.filter(c => !courseId || c.id === courseId).flatMap(c => c.lines.map(l => 'ol:' + l.id));

// Приоритет новых упражнений: сначала главные темы (профилактика, пешки, реализация)
const CAT_PRI = { threat: 0, pawn: 1, convert: 2, cct: 3, active: 4, plan: 5, endgame: 6 };
function exOrdered(D, f = () => true) {
  return D.ex.filter(f).slice().sort((a, b) => (CAT_PRI[a.cat] ?? 9) - (CAT_PRI[b.cat] ?? 9) || (b.weight || 0) - (a.weight || 0));
}
// Перемешиваем категории, чтобы новые задачи шли «вперемешку» по темам
function interleave(list, key) {
  const groups = {}; list.forEach(x => (groups[key(x)] = groups[key(x)] || []).push(x));
  const out = []; const ks = Object.keys(groups);
  while (out.length < list.length) for (const k of ks) if (groups[k].length) out.push(groups[k].shift());
  return out;
}

// ---------- план дня ----------
function dailyPlan(D) {
  const exPos = exOrdered(D, e => ['pawn', 'active', 'plan'].includes(e.cat));
  const exThreat = exOrdered(D, e => ['threat', 'cct'].includes(e.cat));
  const exConv = exOrdered(D, e => ['convert', 'endgame'].includes(e.cat));
  const nEx = newLeftToday('ex'); const nLs = newLeftToday('ls'); const nOl = newLeftToday('ol');
  const q1ls = buildQueue(lsIds(D), 'ls', { newLimit: Math.min(nLs, 3), maxDue: 6 });
  const q1ex = buildQueue(interleave(exPos, e => e.cat).map(e => 'ex:' + e.id), 'ex', { newLimit: Math.ceil(nEx * 0.35), maxDue: 6 });
  const q2 = buildQueue(exThreat.map(e => 'ex:' + e.id), 'ex', { newLimit: Math.ceil(nEx * 0.35), maxDue: 6 });
  const q3 = buildQueue(exConv.map(e => 'ex:' + e.id), 'ex', { newLimit: Math.max(0, nEx - Math.ceil(nEx * 0.35) * 2), maxDue: 5 });
  const q4 = buildQueue(olIds(D), 'ol', { newLimit: nOl, maxDue: 12 });
  const rd = ruleOfDay(D);
  const ruleOwnAll = D.rules.rules.flatMap(r => r.drills.map(x => 'rd:' + x).concat(r.playouts.map(x => 'pl:' + x)));
  const dueRule = buildQueue(ruleOwnAll, 'ls', { newLimit: 0, maxDue: 3 }).due;
  const own = rulePractice(D, rd).own.filter(id => id.startsWith('rd:') || id.startsWith('pl:'));
  const freshRule = own.filter(id => status(id) === 'new').slice(0, 2);
  return [
    { key: 'rule', t: 'Золотое правило дня', d: rd.title, min: 5, items: [...new Set(dueRule.concat(freshRule))], rule: rd },
    { key: 'pos', t: 'Позиционные задачи', d: 'План, худшая фигура, «нужен ли пешечный ход?»', min: 15, items: interleave(q1ls.all.map(x => ({ x, k: 'ls' })).concat(q1ex.all.map(x => ({ x, k: 'ex' }))), o => o.k).map(o => o.x) },
    { key: 'pro', t: 'Профилактика', d: '«Что хочет соперник?» и проверка CCT из твоих партий', min: 10, items: q2.all },
    { key: 'conv', t: 'Реализация и эндшпиль', d: 'Простой путь к победе + доигрывание против движка', min: 10, items: q3.all },
    { key: 'open', t: 'Дебюты', d: 'Повторение линий по памяти', min: 5, items: q4.all },
  ];
}

const RULES = [
  'Если убрать тактику с доски, твой ход всё ещё делает позицию лучше?',
  'Не «что я могу сделать активного?», а «что объективно улучшает мою позицию сильнее всего?»',
  'Чем больше преимущество, тем меньше нужно осложнений.',
  'Прежде чем двинуть пешку, найди три идеи без пешечных ходов.',
  'Сначала проверь самые неприятные ответы соперника (шахи, взятия, угрозы), потом реализуй свою идею.',
  'Если у соперника одна слабость — создай вторую.',
  'Не обязательно форсировать лучшую позицию. Улучшение → ограничение → накопление → атака.',
  'Какой самый ПРОСТОЙ способ выиграть? Не самый красивый.',
  'Последний зевок — часто следствие более раннего позиционного решения.',
];

function pageToday(D) {
  const plan = dailyPlan(D);
  const log = todayLog();
  const st = streak();
  const total = plan.reduce((a, b) => a + b.items.length, 0);
  const rule = RULES[Math.floor(Date.now() / DAY) % RULES.length];
  const lastReview = (S().journal || []).filter(j => j.full).map(j => j.ts).sort().pop();
  const needWeekly = !lastReview || Date.now() - lastReview > 7 * DAY;
  const doneToday = log.ex + log.ls + log.ol;
  app.innerHTML = `
  <div class="page-head">
    <div class="eyebrow">${new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
    <h1>Тренировка дня · 30–45 минут</h1>
    <p>Цель этапа — не стать ещё агрессивнее, а <b>убрать партии, где ты сам создаёшь себе проблемы</b>. Сначала профилактика и контроль пешечных ходов, потом всё остальное.</p>
  </div>
  <div class="hero">
    <div class="card">
      <div class="row between"><h2 style="margin:0">План на сегодня</h2><span class="badge ${total ? 'accent' : 'good'}">${total ? pl(total, 'задание', 'задания', 'заданий') : 'всё сделано'}</span></div>
      ${plan.map((b, i) => `
        <div class="block ${b.items.length ? '' : 'done'}">
          <div class="num">${b.items.length ? i + 1 : '✓'}</div>
          <div class="grow"><div class="title"><b>${esc(b.t)}</b> <span class="muted small">· ~${b.min} мин</span></div><div class="small muted">${esc(b.d)}</div></div>
          <div>${b.items.length ? `<a class="btn small" href="#/session/block-${b.key}">${b.items.length} →</a>` : '<span class="small muted">готово</span>'}</div>
        </div>`).join('')}
      <div class="row mt">
        ${total ? '<a class="btn primary" href="#/session/daily">Начать тренировку дня →</a>' : `<span class="muted">На сегодня всё. Следующие повторения — ${(() => { const n = nextDueIn(Object.keys(S().srs)); return n ? fmtWhen(n) : 'когда добавишь новое'; })()}.</span>`}
        <a class="btn ghost" href="#/review">Разобрать свою партию</a>
      </div>
    </div>
    <div class="stack">
      <div class="card questions">
        <h3>Перед каждым ходом — 4 вопроса</h3>
        <ol><li>Что изменилось после последнего хода соперника?</li><li>Что он хочет сделать следующим ходом?</li><li>Какая моя фигура стоит хуже всего?</li><li>Могу ли я улучшить её без пешечного хода?</li></ol>
        <div class="rule-big">${esc(rule)}</div>
      </div>
      <div class="grid g3">
        <div class="card stat"><div class="v">${st}</div><div class="l">${pl(st, 'день', 'дня', 'дней').replace(/^\d+ /, '')} подряд</div></div>
        <div class="card stat"><div class="v">${doneToday}</div><div class="l">заданий сегодня</div></div>
        <div class="card stat"><div class="v">${fmtMin(log.sec || 0)}</div><div class="l">время сегодня</div></div>
      </div>
      <div class="card"><h3>Полезное</h3><div class="list">
        <a class="item" href="#/vision"><div class="grow"><div class="title">Разминка перед игрой</div><div class="sub">2 минуты визуализации: поля, кони, позиция по памяти</div></div><span>→</span></a>
        <a class="item" href="#/review"><div class="grow"><div class="title">Обновить упражнения из новых партий</div><div class="sub">${S().lastImport ? 'последнее обновление ' + new Date(S().lastImport).toLocaleDateString('ru-RU') : 'ещё не обновлялись'}</div></div><span>→</span></a>
        <a class="item" href="#/repcheck"><div class="grow"><div class="title">Проверка репертуара</div><div class="sub">Где ты отклонился от выученных линий</div></div><span>→</span></a>
        <a class="item" href="#/card"><div class="grow"><div class="title">Карточка за доской</div><div class="sub">4 вопроса, CCT, время — распечатать</div></div><span>→</span></a>
      </div></div>
      ${needWeekly ? `<div class="card"><h3>Разбор недели</h3><p class="small muted">Раз в неделю — полноценный разбор одной проигранной партии <b>сначала без движка</b>, потом проверка.</p><a class="btn small" href="#/review">Разобрать поражение →</a></div>` : ''}
    </div>
  </div>
  <div class="card mt2 flat">
    <h3>Почему такой план</h3>
    <p class="small muted">Анализ твоих 207 партий: больше всего ошибок в миддлшпиле (10% ходов — ошибки, в дебюте 3,6%). Когда позиция у тебя <b>лучше</b> (70–85%), ошибка случается почти в каждом четвёртом ходу. Из 100 партий, где у тебя был выигрыш (85%+), ты проиграл 33. Поэтому задания строятся вокруг профилактики, контроля пешечных ходов и простой реализации. <a href="#/diagnosis">Подробный диагноз →</a></p>
  </div>`;
}

// ---------- сессия ----------
function pageSession(D, kind) {
  let queue = [];
  let title = 'Тренировка';
  if (kind === 'daily') { const p = dailyPlan(D); queue = p.flatMap(b => b.items.map(id => ({ id, block: b.t }))); title = 'Тренировка дня'; }
  else if (kind.startsWith('block-')) { const b = dailyPlan(D).find(x => 'block-' + x.key === kind); queue = (b ? b.items : []).map(id => ({ id, block: b.t })); title = b ? b.t : title; }
  else if (kind.startsWith('excat-')) {
    const cat = kind.slice(6);
    const q = buildQueue(exOrdered(D, e => e.cat === cat).map(e => 'ex:' + e.id), 'ex', { newLimit: 10 });
    queue = q.all.map(id => ({ id, block: CATS[cat]?.t || cat }));
  } else if (kind.startsWith('course-')) {
    const cid = kind.slice(7); const c = D.op.courses.find(x => x.id === cid);
    const q = buildQueue(olIds(D, cid), 'ol', { newLimit: Math.max(newLeftToday('ol'), 0) });
    queue = q.all.map(id => ({ id, block: c ? c.title : 'Дебют' }));
  } else if (kind.startsWith('learn-')) {
    const cid = kind.slice(6); const c = D.op.courses.find(x => x.id === cid);
    const fresh = olIds(D, cid).filter(id => status(id) === 'new').slice(0, 3);
    queue = fresh.map(id => ({ id, block: 'Новые линии', learn: true }));
  } else if (kind.startsWith('rule-')) {
    const r = D.ruleById[kind.slice(5)];
    if (r) {
      title = r.title;
      const p = rulePractice(D, r);
      const own = buildQueue(p.own, 'ls', { newLimit: 99 });
      const ex = buildQueue(p.ex, 'ex', { newLimit: 4, maxDue: 4 });
      const rest = own.all.length + ex.all.length ? [] : p.own; // всё освоено — можно повторить своё
      queue = own.all.concat(ex.all, rest).map(id => ({ id, block: r.title }));
    }
  } else if (kind.startsWith('plan-')) {
    const cid = kind.slice(5);
    const ids = lsIds(D, l => l.course === cid);
    const q = buildQueue(ids, 'ls', { newLimit: 99 });
    const rest = ids.filter(id => !q.all.includes(id));
    queue = q.all.concat(rest).map(id => ({ id, block: 'Идеи дебюта' }));
  } else if (kind === 'plan') {
    const q = buildQueue(lsIds(D), 'ls', { newLimit: Math.max(newLeftToday('ls'), 3) });
    queue = q.all.map(id => ({ id, block: 'Школа плана' }));
  }
  if (!queue.length) {
    app.innerHTML = `<div class="card empty"><h2>Здесь пока нечего повторять</h2><p>Всё, что нужно, уже повторено. Возвращайся позже — система сама покажет задания, когда придёт время.</p><a class="btn" href="#/today">К плану дня</a></div>`;
    return;
  }
  let k = 0; let cur = null; let t0 = Date.now(); const results = [];
  const tick = () => { addSeconds((Date.now() - t0) / 1000); t0 = Date.now(); };
  function show() {
    if (k >= queue.length) return finish();
    const q = queue[k];
    const info = `${q.block} · ${k + 1}/${queue.length}`;
    const kindOf = id => id.startsWith('ol:') ? 'ol' : id.startsWith('ex:') ? 'ex' : 'ls';
    const done = g => { tick(); results.push({ id: q.id, g }); grade(q.id, g, kindOf(q.id)); k++; show(); };
    const [type, ...r] = q.id.split(':'); const rid = r.join(':');
    if (type === 'rd') { const d = D.drillById[rid]; if (!d) { k++; return show(); } cur = mountLesson(app, d, { onDone: done, sessionInfo: info, badge: 'Золотое правило', ruleTitle: D.ruleById[d.rule]?.title }); }
    else if (type === 'pl') { const p = D.playoutById[rid]; if (!p) { k++; return show(); } cur = mountPlayout(app, p, { onDone: done, sessionInfo: info, ruleTitle: D.ruleById[p.rule]?.title }); }
    else if (type === 'ex') { const ex = D.exById[rid]; if (!ex) { k++; return show(); } cur = mountExercise(app, JSON.parse(JSON.stringify(ex)), { onDone: done, sessionInfo: info }); }
    else if (type === 'ls') { const ls = D.lsById[rid]; if (!ls) { k++; return show(); } cur = mountLesson(app, ls, { onDone: done, sessionInfo: info }); }
    else if (type === 'ol') { const l = D.lines[rid]; if (!l) { k++; return show(); } cur = mountLine(app, D.lineCourse[rid], l, { mode: q.learn || status(q.id) === 'new' ? 'learn' : 'drill', onDone: done, sessionInfo: info }); }
    window.scrollTo(0, 0);
  }
  function finish() {
    cur = null;
    const good = results.filter(r => r.g >= 2).length;
    app.innerHTML = `<div class="card" style="max-width:640px;margin:0 auto">
      <div class="eyebrow">${esc(title)}</div><h1>Готово!</h1>
      <p>Выполнено ${pl(results.length, 'задание', 'задания', 'заданий')}, уверенно — ${good}. Слабые места вернутся на повторение раньше, уверенные — позже.</p>
      <h3 class="mt2">Оцени себя сегодня (1–5)</h3>
      <div class="rating" id="rate"></div>
      <div class="row mt2"><button class="btn primary" id="saveRate">Сохранить и на главную</button><a class="btn ghost" href="#/today">Пропустить</a></div>
    </div>`;
    const crit = ['Тактика', 'Профилактика', 'Улучшение фигур', 'Пешечная структура', 'Техника реализации'];
    const vals = {};
    $('#rate').innerHTML = crit.map(c => `<div>${c}</div><div class="dots" data-c="${c}">${[1, 2, 3, 4, 5].map(n => `<button data-n="${n}">${n}</button>`).join('')}</div>`).join('');
    $('#rate').querySelectorAll('.dots').forEach(d => d.onclick = e => {
      const b = e.target.closest('button'); if (!b) return; vals[d.dataset.c] = +b.dataset.n;
      d.querySelectorAll('button').forEach(x => x.classList.toggle('on', +x.dataset.n <= vals[d.dataset.c]));
    });
    $('#saveRate').onclick = () => {
      if (Object.keys(vals).length) { const s = S(); s.selfRatings = s.selfRatings || []; s.selfRatings.push({ ts: Date.now(), vals }); save(); toast('Сохранено'); }
      location.hash = '#/today';
    };
  }
  show();
  cleanup = () => { tick(); if (cur) cur.destroy(); };
}

// ---------- мои ошибки ----------
function pageExList(D) {
  const cats = Object.keys(CATS).filter(c => D.ex.some(e => e.cat === c));
  app.innerHTML = `
  <div class="page-head"><div class="eyebrow">Упражнения из твоих партий</div><h1>Мои ошибки</h1>
  <p>${pl(D.ex.length, 'позиция', 'позиции', 'позиций')} из твоих партий, где ход стоил тебе оценки. Это не «найди комбинацию»: каждая задача проходит протокол мышления — <b>угроза соперника → худшая фигура → ход → разбор</b>. Решённые уверенно вернутся нескоро, ошибки — скоро.</p></div>
  <div class="grid g2">${cats.map(c => {
    const ids = exIds(D, e => e.cat === c); const s = summary(ids);
    return `<div class="card course-card">
      <div class="row between"><span class="badge ${CATS[c].badge}">${esc(CATS[c].s)}</span><span class="small muted">${s.total}</span></div>
      <h3 style="margin:0">${esc(CATS[c].t)}</h3>
      <p class="small muted" style="margin:0">${esc(CATS[c].d)}</p>
      <div class="bar"><i class="g" style="width:${100 * s.mastered / s.total}%"></i><i class="o" style="width:${100 * s.review / s.total}%"></i><i class="w" style="width:${100 * (s.learning + s.due) / s.total}%"></i></div>
      <div class="row between small muted"><span>освоено ${s.mastered} · в работе ${s.review + s.learning + s.due} · новых ${s.new}</span><a class="btn small" href="#/session/excat-${c}">Тренировать →</a></div>
    </div>`;
  }).join('')}</div>
  <details class="mt2"><summary>Все позиции списком</summary><div class="list mt">${exOrdered(D).map(e => {
    const stt = status('ex:' + e.id);
    return `<a class="item" href="#/ex/${encodeURIComponent(e.id)}"><span class="badge ${CATS[e.cat]?.badge || ''}">${esc(CATS[e.cat]?.s || e.cat)}</span><div class="grow"><div class="title">${e.game ? esc(e.game.opp) + ' · ход ' + e.game.n : esc(e.id)}</div><div class="sub">${e.game ? esc(e.game.date + ' · ' + e.game.tc) : ''}</div></div><span class="badge ${stt === 'mastered' ? 'good' : stt === 'due' ? 'warn' : ''}">${{ new: 'новая', due: 'пора повторить', learning: 'изучается', review: 'повторение', mastered: 'освоена' }[stt]}</span></a>`;
  }).join('')}</div></details>`;
}

function pageSingleEx(D, id) {
  const ex = D.exById[id];
  if (!ex) { location.hash = '#/ex'; return; }
  const c = mountExercise(app, JSON.parse(JSON.stringify(ex)), {
    onDone: g => { grade('ex:' + id, g, 'ex'); toast('Результат записан'); location.hash = '#/ex'; }, sessionInfo: 'одиночная задача',
  });
  cleanup = () => c.destroy();
}

// ---------- школа плана ----------
function pagePlan(D) {
  const themes = [...new Set(D.ls.map(l => l.theme))];
  const s = summary(lsIds(D));
  app.innerHTML = `
  <div class="page-head"><div class="eyebrow">Позиционные задачи</div><h1>Школа плана</h1>
  <p>Задачи «найди план», а не «найди мат»: какую фигуру улучшить, что предотвратить, какой прорыв готовить, стоит ли вообще двигать пешку. Многие позиции — из структур твоего репертуара (Гёринг, испанская, Алапин, французская, ферзевый гамбит).</p></div>
  <div class="row mb"><a class="btn primary" href="#/session/plan">Тренировать (${s.due} на повторение, новых сегодня до ${newLeftToday('ls')})</a><span class="small muted">освоено ${s.mastered} из ${s.total}</span></div>
  ${themes.map(t => `<h3 class="mt2">${esc(THEMES[t] || t)}</h3><div class="list">${D.ls.filter(l => l.theme === t).map(l => {
    const stt = status('ls:' + l.id);
    return `<a class="item" href="#/plan/${encodeURIComponent(l.id)}"><div class="grow"><div class="title">${esc(l.title)}</div><div class="sub">${esc(l.source || '')}</div></div><span class="badge ${stt === 'mastered' ? 'good' : stt === 'due' ? 'warn' : ''}">${{ new: 'новая', due: 'повторить', learning: 'изучается', review: 'повторение', mastered: 'освоена' }[stt]}</span></a>`;
  }).join('')}</div>`).join('')}`;
}
function pageSingleLesson(D, id) {
  const ls = D.lsById[id]; if (!ls) { location.hash = '#/plan'; return; }
  const c = mountLesson(app, ls, { onDone: g => { grade('ls:' + id, g, 'ls'); location.hash = '#/plan'; }, sessionInfo: '' });
  cleanup = () => c.destroy();
}

// ---------- дебюты ----------
function pageOpenings(D) {
  app.innerHTML = `
  <div class="page-head"><div class="eyebrow">Репертуар</div><h1>Дебюты</h1>
  <p>Каждая линия проверена Stockfish. Новые линии сначала проходишь со стрелками, потом по памяти. Дальше система сама решает, когда линию повторить: ошибся — завтра, сыграл уверенно — через несколько дней, потом недель.</p></div>
  <div class="grid g2">${D.op.courses.map(c => {
    const ids = olIds(D, c.id); const s = summary(ids);
    return `<a class="card course-card" href="#/openings/${c.id}" style="color:inherit;text-decoration:none">
      <div class="row between"><span class="badge ${c.side === 'w' ? '' : 'violet'} side">${c.side === 'w' ? 'за белых' : 'за чёрных'}</span><span class="small muted">${pl(s.total, 'линия', 'линии', 'линий')}</span></div>
      <h3 style="margin:0">${esc(c.title)}</h3>
      <p class="small muted" style="margin:0">${esc(c.tagline || '')}</p>
      <div class="bar"><i class="g" style="width:${100 * s.mastered / s.total}%"></i><i class="o" style="width:${100 * s.review / s.total}%"></i><i class="w" style="width:${100 * (s.learning + s.due) / s.total}%"></i></div>
      <div class="small muted">освоено ${s.mastered} · в работе ${s.review + s.learning + s.due} · новых ${s.new}${s.due ? ` · <b style="color:var(--warn)">повторить ${s.due}</b>` : ''}</div>
    </a>`;
  }).join('')}</div>`;
}

function pageCourse(D, cid) {
  const c = D.op.courses.find(x => x.id === cid); if (!c) { location.hash = '#/openings'; return; }
  const ids = olIds(D, cid); const s = summary(ids);
  const lessons = D.ls.filter(l => l.course === cid);
  app.innerHTML = `
  <div class="page-head"><div class="eyebrow"><a href="#/openings">Дебюты</a> · ${c.side === 'w' ? 'за белых' : 'за чёрных'}</div><h1>${esc(c.title)}</h1></div>
  <div class="hero">
    <div class="card"><div class="explain">${c.intro.split('\n\n').map(p => `<p>${esc(p)}</p>`).join('')}</div>
      ${c.ideas ? `<h3 class="mt">Главные идеи</h3><ul class="small">${c.ideas.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}
    </div>
    <div class="card stack">
      <div class="grid g3"><div class="stat"><div class="v">${s.new}</div><div class="l">новых</div></div><div class="stat"><div class="v ${s.due ? 'warn' : ''}">${s.due}</div><div class="l">повторить</div></div><div class="stat"><div class="v good">${s.mastered}</div><div class="l">освоено</div></div></div>
      ${s.new ? `<a class="btn primary wide" href="#/session/learn-${cid}">Учить новые линии (до 3)</a>` : ''}
      ${s.due ? `<a class="btn wide" href="#/session/course-${cid}">Повторить ${s.due}</a>` : '<div class="small muted">Повторять пока нечего.</div>'}
      ${lessons.length ? `<a class="btn ghost wide" href="#/session/plan-${cid}">Задачи на план в этой структуре: ${lessons.length}</a>` : ''}
    </div>
  </div>
  <h3 class="mt2">Линии</h3>
  <div class="list">${c.lines.map(l => {
    const stt = status('ol:' + l.id);
    return `<a class="item" href="#/line/${encodeURIComponent(l.id)}"><div class="grow"><div class="title">${esc(l.name)}</div><div class="sub">${esc(l.preview)}</div></div><span class="badge ${stt === 'mastered' ? 'good' : stt === 'due' ? 'warn' : ''}">${{ new: 'новая', due: 'повторить', learning: 'изучается', review: 'повторение', mastered: 'освоена' }[stt]}</span></a>`;
  }).join('')}</div>`;
}

function pageLine(D, lid) {
  const l = D.lines[lid]; if (!l) { location.hash = '#/openings'; return; }
  const c = D.lineCourse[lid];
  app.innerHTML = `<div class="row mb"><a class="btn small ghost" href="#/openings/${c.id}">← ${esc(c.title)}</a><span class="spacer"></span><button class="btn small" id="drillBtn">Проверить себя по памяти</button></div><div id="lv"></div>`;
  let m = mountLineBrowse($('#lv'), c, l);
  $('#drillBtn').onclick = () => {
    m.destroy();
    m = mountLine($('#lv'), c, l, { mode: status('ol:' + lid) === 'new' ? 'learn' : 'drill', onDone: g => { grade('ol:' + lid, g, 'ol'); toast('Записано'); location.hash = '#/openings/' + c.id; } });
  };
  cleanup = () => m.destroy();
}

function pageMore() {
  const items = [['plan', 'Школа плана', '♜', 'Задачи «найди план» в структурах твоего репертуара'], ['review', 'Разбор партии', '✎', 'Свои партии: сначала без движка, потом проверка; новые упражнения'], ['guide', 'Справочник', '📖', 'Структуры, атакующие схемы, время, тильт, план на месяц']].concat(MORE);
  app.innerHTML = `<div class="page-head"><h1>Ещё</h1></div><div class="list">${items.map(([k, t, i, d]) => `<a class="item" href="#/${k}"><span style="font-size:20px;width:28px;text-align:center">${i}</span><div class="grow"><div class="title">${t}</div><div class="sub">${d}</div></div><span>→</span></a>`).join('')}</div>`;
}

route();
