// Раздел «Ловушки»: дракон, испанская, староиндийская. Поймай соперника / не попадись сам.
import { summary } from '../store.js';
import { esc, pl, richText } from '../ui.js';

const KIND = { catch: ['поймай', 'warn'], avoid: ['не попадись', 'bad'], idea: ['приём', 'info'] };

export const trIds = (T, group) => T.drills.filter(d => !group || d.group === group).map(d => 'tr:' + d.id);

const bar = s => `<div class="bar"><i class="g" style="width:${100 * s.mastered / Math.max(1, s.total)}%"></i><i class="o" style="width:${100 * s.review / Math.max(1, s.total)}%"></i><i class="w" style="width:${100 * (s.learning + s.due) / Math.max(1, s.total)}%"></i></div>`;

export function renderTraps(app, D, groupId) {
  const T = D.tr;
  if (groupId) return groupPage(app, T, T.groups.find(g => g.id === groupId));
  const all = summary(trIds(T));
  app.innerHTML = `
  <div class="page-head"><div class="eyebrow">Три главных дебюта · только конкретные ловушки</div><h1>Ловушки</h1>
  <p>${richText(T.intro)}</p></div>
  <div class="card mb"><div class="row between"><div><b>Освоено ${all.mastered} из ${all.total}</b> · повторить ${all.due} · новых ${all.new}</div><a class="btn primary" href="#/session/tr-all">Тренировать всё →</a></div></div>
  <div class="grid g2">${T.groups.map(g => {
    const s = summary(trIds(T, g.id));
    return `<a class="card course-card" href="#/traps/${g.id}" style="color:inherit;text-decoration:none">
      <div class="row between"><h3 style="margin:0">${esc(g.title)}</h3><span class="small muted">${esc(g.side)}</span></div>
      <p class="small muted" style="margin:0">${esc(g.lead)}</p>
      ${bar(s)}
      <div class="small muted">${pl(s.total, 'задача', 'задачи', 'задач')} · освоено ${s.mastered}${s.due ? ` · <b style="color:var(--warn)">повторить ${s.due}</b>` : ''}</div></a>`;
  }).join('')}</div>`;
  return () => { };
}

function groupPage(app, T, g) {
  if (!g) { location.hash = '#/traps'; return () => { }; }
  const drills = T.drills.filter(d => d.group === g.id); const ids = trIds(T, g.id); const s = summary(ids);
  const byBranch = {}; drills.forEach(d => (byBranch[d.branch] = byBranch[d.branch] || []).push(d));
  app.innerHTML = `
  <div class="card prose" style="max-width:none">
    <div class="row mb"><a class="btn small ghost" href="#/traps">← Ловушки</a><span class="small muted">${esc(g.side)}</span></div>
    <h1>${esc(g.title)}</h1>
    <p>${richText(g.lead)}</p>
    ${g.notes && g.notes.length ? `<ul>${g.notes.map(x => `<li>${richText(x)}</li>`).join('')}</ul>` : ''}
    <div class="row mt"><a class="btn primary" href="#/session/tr-${g.id}">Тренировать (${ids.length}) →</a><span class="small muted">освоено ${s.mastered} · повторить ${s.due}</span></div>
    <p class="small muted mt">Задачи идут по веткам дебюта, от первых ходов к дальним. В каждой партия проигрывается с начала.</p>
    ${(g.branches || []).filter(b => byBranch[b]).map(b => `
      <h3 class="mt2">${esc(b)} · ${byBranch[b].length}</h3>
      <div class="list">${byBranch[b].map(d => `<a class="item" href="#/session/one-${encodeURIComponent('tr:' + d.id)}"><span class="badge ${KIND[d.kind][1]}">${esc(KIND[d.kind][0])}</span><div class="grow"><div class="title">${esc(d.title)}</div><div class="sub">${esc((d.freq ? d.freq + ' · ' : '') + (d.source || ''))}</div></div><span>→</span></a>`).join('')}</div>`).join('')}
  </div>`;
  return () => { };
}
