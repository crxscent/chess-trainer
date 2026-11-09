// Раздел «Паттерны»: тактика и маты, пешечные структуры, манёвры, эндшпиль. Конспект + задачи.
import { summary } from '../store.js';
import { esc, pl, richText } from '../ui.js';

export const ptIds = (P, pid) => P.patterns.filter(p => !pid || p.id === pid).flatMap(p => p.items);
const own = P => ptIds(P).filter(id => id.startsWith('pt:'));
export { own as ptOwnIds };

const bar = s => `<div class="bar"><i class="g" style="width:${100 * s.mastered / Math.max(1, s.total)}%"></i><i class="o" style="width:${100 * s.review / Math.max(1, s.total)}%"></i><i class="w" style="width:${100 * (s.learning + s.due) / Math.max(1, s.total)}%"></i></div>`;

export function renderPatterns(app, D, pid) {
  const P = D.pt;
  if (pid) return patternPage(app, D, P.patterns.find(p => p.id === pid));
  const all = summary(ptIds(P));
  app.innerHTML = `
  <div class="page-head"><div class="eyebrow">${P.patterns.length} паттернов · ${pl(all.total, 'задача', 'задачи', 'задач')}</div><h1>Паттерны</h1><p>${richText(P.intro)}</p></div>
  <div class="card mb"><div class="row between"><div><b>Освоено ${all.mastered} из ${all.total}</b> · повторить ${all.due} · новых ${all.new}</div><a class="btn primary" href="#/session/pt-all">Тренировать всё →</a></div></div>
  ${P.groups.map(g => `
    <h2 class="mt2">${esc(g.title)}</h2>
    <div class="grid g2">${P.patterns.filter(p => p.group === g.id).map(p => {
      const s = summary(p.items);
      return `<a class="card course-card" href="#/patterns/${p.id}" style="color:inherit;text-decoration:none">
        <h3 style="margin:0">${esc(p.title)}</h3><p class="small muted" style="margin:0">${esc(p.lead)}</p>${bar(s)}
        <div class="small muted">${pl(s.total, 'задача', 'задачи', 'задач')} · освоено ${s.mastered}${s.due ? ` · <b style="color:var(--warn)">повторить ${s.due}</b>` : ''}</div></a>`;
    }).join('')}</div>`).join('')}`;
  return () => { };
}

function title(D, id) {
  const [t, ...r] = id.split(':'); const k = r.join(':');
  if (t === 'pt') { const d = D.ptById[k]; return d ? [d.title, d.source || '', d.seq ? 'серия ходов' : 'ход'] : null; }
  if (t === 'eg') { const d = D.egById[k]; return d ? [d.title, 'раздел «Эндшпиль»', d.type === 'play' ? 'доиграй' : 'ход'] : null; }
  return null;
}

function patternPage(app, D, p) {
  if (!p) { location.hash = '#/patterns'; return () => { }; }
  const s = summary(p.items); const g = D.pt.groups.find(x => x.id === p.group);
  app.innerHTML = `
  <div class="card prose" style="max-width:none">
    <div class="row mb"><a class="btn small ghost" href="#/patterns">← Паттерны</a><span class="small muted">${esc(g.title)}</span></div>
    <h1>${esc(p.title)}</h1>
    <p>${richText(p.lead)}</p>
    ${p.sections.map(([h, t]) => `<h3>${esc(h)}</h3><p>${richText(t)}</p>`).join('')}
    <div class="row mt"><a class="btn primary" href="#/session/pt-${p.id}">Тренировать (${p.items.length}) →</a><span class="small muted">освоено ${s.mastered} · повторить ${s.due}</span></div>
    <div class="list mt">${p.items.map(id => { const t = title(D, id); return t ? `<a class="item" href="#/session/one-${encodeURIComponent(id)}"><span class="badge info">${esc(t[2])}</span><div class="grow"><div class="title">${esc(t[0])}</div><div class="sub">${esc(t[1])}</div></div><span>→</span></a>` : ''; }).join('')}</div>
  </div>`;
  return () => { };
}
