// Дневник: разборы партий, частота типичных ошибок, самооценка.
import { S, save } from '../store.js';
import { esc, pl, fmtDate } from '../ui.js';
import { MISTAKE_TAGS } from './exercise.js';

const CRIT = ['Тактика', 'Профилактика', 'Улучшение фигур', 'Пешечная структура', 'Техника реализации'];

export function renderJournal(app) {
  const s = S();
  const J = s.journal || [];
  const counts = {};
  J.forEach(j => (j.tags || []).forEach(t => counts[t] = (counts[t] || 0) + 1));
  (s.mistakeLog || []).forEach(m => m.tags.forEach(t => counts[t] = (counts[t] || 0) + 1));
  (s.customTags || []).forEach(t => counts[t] = counts[t] || 0);
  const tagRows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const maxC = Math.max(1, ...tagRows.map(r => r[1]));
  const ratings = [].concat((s.selfRatings || []).map(r => r.vals), J.filter(j => j.ratings && Object.keys(j.ratings).length).map(j => j.ratings));
  const avg = c => { const v = ratings.map(r => r[c]).filter(Boolean); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const recent = c => { const v = ratings.slice(-5).map(r => r[c]).filter(Boolean); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

  app.innerHTML = `
  <div class="page-head"><div class="eyebrow">Свои выводы</div><h1>Дневник</h1>
  <p>Список твоих типичных ошибок и разборов партий. Отмечай ошибки в разборах и после задач — со временем станет видно, какие привычки уже ушли, а какие нет.</p></div>
  <div class="grid g2">
    <div class="card">
      <h3>Мои типичные ошибки</h3>
      ${tagRows.length ? `<div class="hbars">${tagRows.map(([t, c]) => `<div class="hbar"><span>${esc(t)}</span><div class="track"><div class="fill ${c === maxC ? 'bad' : 'warn'}" style="width:${100 * c / maxC}%"></div></div><span class="num">${c}</span></div>`).join('')}</div>` : '<p class="muted small">Пока пусто. Отмечай ошибки в разборе партий и после упражнений («Что я упустил?»).</p>'}
      <div class="row mt"><input type="text" id="newTag" placeholder="Своя типичная ошибка…" style="flex:1"><button class="btn small" id="addTag">Добавить</button></div>
    </div>
    <div class="card">
      <h3>Самооценка (1–5)</h3>
      ${ratings.length ? `<div class="hbars">${CRIT.map(c => { const a = avg(c), r = recent(c); return `<div class="hbar"><span>${c}</span><div class="track"><div class="fill ${a >= 4 ? 'good' : a >= 3 ? '' : 'warn'}" style="width:${(a || 0) * 20}%"></div></div><span class="num">${a ? a.toFixed(1) : '—'}${r && a && Math.abs(r - a) >= 0.3 ? (r > a ? ' ↑' : ' ↓') : ''}</span></div>`; }).join('')}</div><p class="small muted mt">${pl(ratings.length, 'оценка', 'оценки', 'оценок')}. Стрелка — тренд последних 5.</p>` : '<p class="muted small">Оценивай себя после тренировки дня и после разбора партии.</p>'}
    </div>
  </div>
  <h3 class="mt2">Разборы партий (${J.length})</h3>
  <div class="row mb"><a class="btn small primary" href="#/review">+ Разобрать партию</a></div>
  <div class="list">${J.map((j, i) => `
    <details class="card flat">
      <summary><b>${esc(j.opp || 'партия')}</b> · ${esc(j.date || fmtDate(j.ts))} · <span class="badge ${j.result === 'loss' || j.result === (j.color === 'w' ? '0-1' : '1-0') ? 'bad' : ''}">${esc({ win: 'победа', loss: 'поражение', draw: 'ничья' }[j.result] || j.result || '')}</span></summary>
      <dl class="kv mt">
        <dt>Моё «первое ухудшение»</dt><dd>${esc(j.firstBadLabel || '—')}</dd>
        <dt>По движку</dt><dd>${esc(j.engineFirstBadLabel || '—')}</dd>
        <dt>Мой план</dt><dd>${esc(j.plan || '—')}</dd>
        <dt>Что хотел соперник</dt><dd>${esc(j.oppWant || '—')}</dd>
        <dt>Кандидаты</dt><dd>${esc(j.cands || '—')}</dd>
        <dt>Почему ход хуже</dt><dd>${esc(j.why || '—')}</dd>
        <dt>Ошибки</dt><dd>${(j.tags || []).map(t => `<span class="badge warn">${esc(t)}</span>`).join(' ') || '—'}</dd>
        <dt>Движок нашёл</dt><dd>${(j.mistakes || []).map(m => `${esc(m.label)} (−${m.drop}%)`).join(', ') || '—'}</dd>
      </dl>
      <div class="row mt">${j.gameId ? `<a class="btn small ghost" target="_blank" rel="noopener" href="https://lichess.org/${j.gameId}">Партия на lichess ↗</a>` : ''}<button class="btn small danger" data-del="${i}">Удалить</button></div>
    </details>`).join('') || '<p class="muted">Ещё нет разборов. Раз в неделю — одна проигранная партия, сначала без движка.</p>'}</div>`;
  app.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { if (confirm('Удалить разбор?')) { s.journal.splice(+b.dataset.del, 1); save(true); renderJournal(app); } });
  app.querySelector('#addTag').onclick = () => {
    const v = app.querySelector('#newTag').value.trim(); if (!v) return;
    s.customTags = (s.customTags || []).concat([v]); if (!MISTAKE_TAGS.includes(v)) MISTAKE_TAGS.push(v);
    s.mistakeLog = (s.mistakeLog || []).concat([{ ts: Date.now(), src: 'manual', tags: [v] }]);
    save(true); renderJournal(app);
  };
  return () => { };
}
