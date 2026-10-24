// «Тренер»: как ты учишься (данные тренажёра) и как играешь (партии до/после начала тренировок).
import { S, DAY, dayKey } from '../store.js';
import { esc, getJSON, pl } from '../ui.js';
import { CATS } from './exercise.js';

const pct = v => (v * 100).toFixed(0) + '%';

export function trainingStats(D) {
  const srs = S().srs; const now = Date.now();
  const byKind = {}; const byCat = {}; const stuck = [];
  for (const [id, c] of Object.entries(srs)) {
    const kind = id.split(':')[0];
    const h = c.h || []; const ok = h.filter(x => x[1] >= 2).length;
    const k = byKind[kind] = byKind[kind] || { n: 0, att: 0, ok: 0, due: 0 };
    k.n++; k.att += h.length; k.ok += ok; if (c.d <= now) k.due++;
    if (kind === 'ex' || kind === 'ak' || kind === 'ev') {
      const ex = kind === 'ak' ? D.atk.drills.find(d => 'ak:' + d.id === id) : D.exById[id.slice(3)];
      if (ex) { const b = byCat[ex.cat] = byCat[ex.cat] || { att: 0, ok: 0 }; b.att += h.length; b.ok += ok; }
    }
    if (c.l >= 2) stuck.push({ id, lapses: c.l });
  }
  return { byKind, byCat, stuck: stuck.sort((a, b) => b.lapses - a.lapses) };
}

export async function renderCoach(app, D) {
  let G = null; try { G = await getJSON('data/coach.json'); } catch (e) { }
  const T = trainingStats(D); const s = S();
  const days = Object.entries(s.days || {}); const last14 = [];
  for (let i = 13; i >= 0; i--) { const k = dayKey(Date.now() - i * DAY); const d = s.days[k]; last14.push(d ? d.ex + d.ls + d.ol : 0); }
  const active14 = last14.filter(x => x > 0).length;
  const due = Object.values(T.byKind).reduce((a, k) => a + k.due, 0);
  const tips = [];
  // советы по тренировкам
  if (!days.length) tips.push(['warn', 'Ты ещё не начинал тренировки дня. Начни с 30 минут: «Сегодня» → «Начать тренировку дня».']);
  if (active14 && active14 < 7) tips.push(['warn', `Занятий за 2 недели: ${active14} дн. Интервальное повторение работает, только если заниматься почти каждый день — лучше 20 минут ежедневно, чем 2 часа раз в неделю.`]);
  if (due > 40) tips.push(['bad', `Накопился долг повторений: ${due}. Пока он больше 40, тренажёр сам уменьшает число новых задач — сначала повторения.`]);
  const catAcc = Object.entries(T.byCat).filter(([, v]) => v.att >= 4).map(([c, v]) => [c, v.ok / v.att]).sort((a, b) => a[1] - b[1]);
  if (catAcc.length && catAcc[0][1] < 0.6) tips.push(['bad', `Слабее всего в тренировках: «${CATS[catAcc[0][0]]?.t || catAcc[0][0]}» — ${pct(catAcc[0][1])} уверенных решений. Добавь эту тему в день отдельной сессией.`]);
  if (T.stuck.length) tips.push(['warn', `${pl(T.stuck.length, 'задача', 'задачи', 'задач')} ты проваливал 2+ раза. Их нельзя «запомнить» — разбери каждую на доске без спешки (список ниже).`]);
  const thr = T.byCat.threat; if (thr && thr.att >= 5 && thr.ok / thr.att < 0.7) tips.push(['warn', 'Профилактика («что хочет соперник?») пока ниже 70%. Не выключай шаг «Найди идею соперника» в настройках — это главная привычка.']);
  // советы по партиям
  if (G) {
    const r = G.recent, b = G.base;
    if (r.games >= 10) {
      if (r.blitz3 > 0.5) tips.push(['bad', `${pct(r.blitz3)} последних партий — 3+0 и быстрее. Для роста нужно 10+5 и 15+10: в 3+0 ты закрепляешь спешку, а не новые привычки.`]);
      if (r.err < b.err - 0.5) tips.push(['good', `Доля ошибок снизилась: ${b.err.toFixed(1)}% → ${r.err.toFixed(1)}% ходов. Тренировки работают.`]);
      else if (r.err > b.err + 0.5) tips.push(['warn', `Доля ошибок не снизилась (${b.err.toFixed(1)}% → ${r.err.toFixed(1)}%). Проверь, переносишь ли 4 вопроса в партии, особенно в быстрых.`]);
      if (r.conv && b.conv && r.conv.lostShare > 0.25) tips.push(['bad', `Из выигранных позиций всё ещё проиграно ${pct(r.conv.lostShare)} партий. Раздел «Эндшпиль» и задачи «Реализуй перевес» — в приоритете.`]);
    }
  }
  app.innerHTML = `
  <div class="page-head"><div class="eyebrow">Как ты учишься и играешь</div><h1>Тренер</h1>
  <p>Разбор по данным: как идут тренировки (из этого браузера) и что меняется в партиях (до и после начала тренировок). Советы обновляются сами.</p></div>
  <div class="card"><h3>Советы</h3>${tips.length ? tips.map(([c, t]) => `<div class="verdict ${c}">${esc(t)}</div>`).join('') : '<p class="muted">Пока нечего сказать — нужно больше данных.</p>'}</div>
  <div class="grid g2 mt">
    <div class="card"><h3>Тренировки</h3>
      <div class="small muted mb">Последние 14 дней: ${last14.map(x => `<span title="${x}" style="display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:2px;background:${x ? (x >= 15 ? 'var(--good)' : 'color-mix(in srgb, var(--good) 45%, var(--panel2))') : 'var(--panel2)'}"></span>`).join('')}</div>
      <table class="mvtable"><tbody>${Object.entries(T.byKind).map(([k, v]) => `<tr><td>${{ ex: 'Мои ошибки', ls: 'Школа плана', ol: 'Дебюты', rd: 'Правила', pl: 'Эндшпиль (правила)', eg: 'Эндшпиль', ev: 'Оценка позиции', ak: 'Атака и защита', pp: 'Сыграй структуру' }[k] || k}</td><td class="muted">${v.n} карточек</td><td>${v.att ? pct(v.ok / v.att) : '—'} уверенно</td></tr>`).join('') || '<tr><td class="muted">нет данных</td></tr>'}</tbody></table>
      ${catAcc.length ? `<h4 class="mt">По темам задач</h4><table class="mvtable"><tbody>${catAcc.map(([c, a]) => `<tr><td>${esc(CATS[c]?.t || c)}</td><td>${pct(a)}</td></tr>`).join('')}</tbody></table>` : ''}
    </div>
    <div class="card"><h3>Партии: до и после</h3>${G ? `
      <table class="mvtable"><tbody>
        <tr><td></td><td class="muted">до ${esc(G.split)}</td><td class="muted">после</td></tr>
        <tr><td>Партий</td><td>${G.base.games}</td><td>${G.recent.games}</td></tr>
        <tr><td>Результат</td><td>${pct(G.base.score)}</td><td>${pct(G.recent.score)}</td></tr>
        <tr><td>Ходов-ошибок</td><td>${G.base.err.toFixed(1)}%</td><td>${G.recent.err.toFixed(1)}%</td></tr>
        <tr><td>Ошибки, когда «просто лучше»</td><td>${G.base.errBetter.toFixed(0)}%</td><td>${G.recent.errBetter.toFixed(0)}%</td></tr>
        <tr><td>Проиграно из выигранных</td><td>${G.base.conv ? pct(G.base.conv.lostShare) : '—'}</td><td>${G.recent.conv ? pct(G.recent.conv.lostShare) : '—'}</td></tr>
        <tr><td>Доля 3+0 и быстрее</td><td>${pct(G.base.blitz3)}</td><td>${pct(G.recent.blitz3)}</td></tr>
      </tbody></table>
      <h4 class="mt">Испанская и сицилианская</h4>
      <table class="mvtable"><tbody>${G.openings.map(o => `<tr><td>${esc(o.name)}</td><td class="muted">${o.games} партий</td><td>${pct(o.score)}</td><td class="muted">${o.firstBad ? 'ошибка ~' + o.firstBad + '-й ход' : ''}</td></tr>`).join('')}</tbody></table>
      ${G.notes.map(n => `<p class="small">${esc(n)}</p>`).join('')}` : '<p class="muted">Нет данных по партиям.</p>'}
    </div>
  </div>
  ${T.stuck.length ? `<div class="card mt"><h3>Застревающие задачи</h3><p class="small muted">Провалены 2 раза и больше. Разбери каждую медленно, проговаривая 4 вопроса.</p><div class="list">${T.stuck.slice(0, 15).map(x => {
    const [k, ...r] = x.id.split(':'); const rid = r.join(':');
    const href = k === 'ex' ? `#/ex/${encodeURIComponent(rid)}` : k === 'ls' ? `#/plan/${encodeURIComponent(rid)}` : k === 'ol' ? `#/line/${encodeURIComponent(rid)}` : `#/session/one-${encodeURIComponent(x.id)}`;
    return `<a class="item" href="${href}"><span class="badge bad">${x.lapses}×</span><div class="grow title">${esc(rid)}</div><span>→</span></a>`;
  }).join('')}</div></div>` : ''}`;
  return () => { };
}
