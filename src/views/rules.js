// Золотые правила: список, практика по каждому правилу.
import { summary, status, DAY } from '../store.js';
import { esc, pl } from '../ui.js';

// Все карточки практики для правила: новые позиции, доигрывания, задачи школы плана, позиции из партий
export function rulePractice(D, r) {
  const ids = [];
  r.drills.forEach(id => ids.push('rd:' + id));
  r.playouts.forEach(id => ids.push('pl:' + id));
  (r.links.ls || []).forEach(id => { if (D.lsById[id]) ids.push('ls:' + id); });
  const cats = r.links.ex || []; const tags = r.links.tags || [];
  const ex = D.ex.filter(e => cats.includes(e.cat) || (e.tags || []).some(t => tags.includes(t)))
    .sort((a, b) => (b.weight || 0) - (a.weight || 0)).map(e => 'ex:' + e.id);
  return { own: ids, ex };
}

export function ruleOfDay(D) {
  const withPractice = D.rules.rules.filter(r => { const p = rulePractice(D, r); return p.own.length + p.ex.length > 0; });
  // в первую очередь — правила, где меньше всего освоено
  const scored = withPractice.map(r => {
    const p = rulePractice(D, r); const s = summary(p.own.concat(p.ex.slice(0, 8)));
    return { r, k: s.total ? s.mastered / s.total : 1 };
  }).sort((a, b) => a.k - b.k);
  const pool = scored.slice(0, Math.max(5, Math.ceil(scored.length / 2)));
  return pool[Math.floor(Date.now() / DAY) % pool.length].r;
}

export function renderRules(app, D) {
  const R = D.rules;
  const today = ruleOfDay(D);
  app.innerHTML = `
  <div class="page-head"><div class="eyebrow">База, которую нужно знать на автомате</div><h1>Золотые правила</h1>
  <p>${R.rules.length} базовых правил: как думать за доской, дебют, миддлшпиль, реализация, эндшпиль и практика игры. У каждого — объяснение, когда оно <b>не</b> работает, и практика: новые позиции, задачи из твоих партий по этой теме и эндшпили против идеальной защиты (эндшпильная база lichess).</p></div>
  <div class="card mb"><div class="row between"><div><div class="eyebrow">Правило дня</div><h3 style="margin:0">${esc(today.title)}</h3></div><a class="btn primary" href="#/session/rule-${today.id}">Практика →</a></div></div>
  ${R.areas.map(a => {
    const rs = R.rules.filter(r => r.area === a.id);
    if (!rs.length) return '';
    return `<h2 class="mt2">${esc(a.t)}</h2><div class="grid g2">${rs.map(r => ruleCard(D, r)).join('')}</div>`;
  }).join('')}`;
  return () => { };
}

function ruleCard(D, r) {
  const p = rulePractice(D, r);
  const s1 = summary(p.own); const s2 = summary(p.ex);
  const total = p.own.length + p.ex.length;
  const parts = [];
  if (r.drills.length) parts.push(pl(r.drills.length, 'позиция', 'позиции', 'позиций'));
  if (r.playouts.length) parts.push(pl(r.playouts.length, 'эндшпиль', 'эндшпиля', 'эндшпилей') + ' против базы');
  const lsn = (r.links.ls || []).length; if (lsn) parts.push(pl(lsn, 'задача плана', 'задачи плана', 'задач плана'));
  if (p.ex.length) parts.push(pl(p.ex.length, 'позиция', 'позиции', 'позиций') + ' из партий');
  return `<div class="card course-card" id="rule-${r.id}">
    <h3 style="margin:0">${esc(r.title)}</h3>
    <p class="small" style="margin:0">${esc(r.text)}</p>
    ${r.exception ? `<p class="small muted" style="margin:0"><b>Когда не работает:</b> ${esc(r.exception)}</p>` : ''}
    ${r.you ? `<div class="lesson-rule" style="margin:4px 0">${esc(r.you)}</div>` : ''}
    ${total ? `<div class="bar"><i class="g" style="width:${100 * (s1.mastered + s2.mastered) / total}%"></i><i class="o" style="width:${100 * (s1.review + s2.review) / total}%"></i><i class="w" style="width:${100 * (s1.learning + s1.due + s2.learning + s2.due) / total}%"></i></div>
    <div class="row between small muted"><span>${parts.join(' · ')}</span><a class="btn small" href="#/session/rule-${r.id}">Практика →</a></div>`
    : `<div class="small muted">${r.id === 'after-game' ? '<a href="#/review">Практика — разбор своей партии →</a>' : r.id === 'time' ? '<a href="#/card">Карточка за доской →</a>' : ''}</div>`}
  </div>`;
}
