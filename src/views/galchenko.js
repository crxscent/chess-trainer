// Раздел «Курс Гальченко»: конспекты уроков «Крепыш» и «Громила» и задачи по ним.
import { summary } from '../store.js';
import { esc, pl, richText } from '../ui.js';

const KIND = { trap: ['ловушка', 'warn'], idea: ['идея урока', 'accent'], lesson: ['позиция урока', 'info'], hw: ['домашнее задание', 'violet'], blunder: ['накажи зевок', 'bad'] };

export const gkIds = (G, lessonId) => G.drills.filter(d => !lessonId || d.lesson === lessonId).map(d => 'gk:' + d.id);

const bar = s => `<div class="bar"><i class="g" style="width:${100 * s.mastered / Math.max(1, s.total)}%"></i><i class="o" style="width:${100 * s.review / Math.max(1, s.total)}%"></i><i class="w" style="width:${100 * (s.learning + s.due) / Math.max(1, s.total)}%"></i></div>`;

export function renderGalchenko(app, D, lessonId) {
  const G = D.gk;
  if (lessonId) return lessonPage(app, D, G.lessons.find(l => l.id === lessonId));
  const all = summary(gkIds(G));
  app.innerHTML = `
  <div class="page-head"><div class="eyebrow">Видеокурс Матвея Гальченко · ${G.lessons.length} уроков</div><h1>Курс Гальченко</h1>
  <p>Главные идеи каждого урока (по расшифровке видео и студиям lichess) и задачи по ним: позиции из урока, домашние задания, дебютные ловушки (только испанская, сицилианская, французская, староиндийская), «накажи зевок» и вопросы на понимание. Все ответы проверены Stockfish.</p></div>
  <div class="card mb"><div class="row between"><div><b>Освоено ${all.mastered} из ${all.total}</b> · повторить ${all.due} · новых ${all.new}</div><a class="btn primary" href="#/session/gk-all">Тренировать всё →</a></div></div>
  ${Object.entries(G.courses).map(([cid, ct]) => `
    <h2 class="mt2">${esc(ct)}</h2>
    <div class="grid g2">${G.lessons.filter(l => l.course === cid).map(l => {
      const s = summary(gkIds(G, l.id));
      const lead = l.notes && l.notes.lead[0] ? l.notes.lead[0].replace(/\*\*/g, '') : '';
      return `<a class="card course-card" href="#/galchenko/${l.id}" style="color:inherit;text-decoration:none">
        <div class="row between"><h3 style="margin:0">${l.n}. ${esc(l.title)}</h3><span class="small muted">${esc(l.dur)}</span></div>
        <p class="small muted" style="margin:0">${esc(lead.slice(0, 160))}${lead.length > 160 ? '…' : ''}</p>
        ${bar(s)}
        <div class="small muted">${pl(s.total, 'задача', 'задачи', 'задач')} · освоено ${s.mastered}${s.due ? ` · <b style="color:var(--warn)">повторить ${s.due}</b>` : ''}</div></a>`;
    }).join('')}</div>`).join('')}`;
  return () => { };
}

function lessonPage(app, D, l) {
  if (!l) { location.hash = '#/galchenko'; return () => { }; }
  const G = D.gk; const ids = gkIds(G, l.id); const s = summary(ids);
  const drills = G.drills.filter(d => d.lesson === l.id);
  const byKind = {}; drills.forEach(d => (byKind[d.kind] = byKind[d.kind] || []).push(d));
  const N = l.notes;
  app.innerHTML = `
  <div class="card prose" style="max-width:none">
    <div class="row mb"><a class="btn small ghost" href="#/galchenko">← Курс Гальченко</a><span class="small muted">${esc(G.courses[l.course])} · урок ${l.n} · видео ${esc(l.dur)}</span></div>
    <h1>${esc(l.title)}</h1>
    ${N ? N.lead.map(p => `<p>${richText(p)}</p>`).join('') + N.sections.map(sec => `<h3>${richText(sec.h)}</h3><ul>${sec.items.map(x => `<li>${richText(x)}</li>`).join('')}</ul>`).join('') : '<p class="muted">Конспект появится после расшифровки видео.</p>'}
    <div class="row mt">${ids.length ? `<a class="btn primary" href="#/session/gk-${l.id}">Тренировать урок (${ids.length}) →</a>` : '<span class="muted">Задачи появятся позже.</span>'}<span class="small muted">освоено ${s.mastered} · повторить ${s.due}</span></div>
    ${Object.entries(KIND).filter(([k]) => byKind[k]).map(([k, [t, cls]]) => `
      <h3 class="mt2">${esc(t[0].toUpperCase() + t.slice(1))} · ${byKind[k].length}</h3>
      <div class="list">${byKind[k].map(d => `<a class="item" href="#/session/one-${encodeURIComponent('gk:' + d.id)}"><span class="badge ${cls}">${esc(t)}</span><div class="grow"><div class="title">${esc(d.title)}</div><div class="sub">${esc((d.q || '').slice(0, 110))}</div></div><span>→</span></a>`).join('')}</div>`).join('')}
  </div>`;
  return () => { };
}
