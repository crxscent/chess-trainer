// Раздел «Турнир»: разбор партий с бланков и задачи из собственных ошибок.
import { Board } from '../board.js';
import { summary } from '../store.js';
import { esc, pl, richText } from '../ui.js';
import { mountStory } from './story.js';

export const tnIds = (T, theme) => T.drills.filter(d => !theme || d.theme === theme).map(d => 'tn:' + d.id);

const bar = s => `<div class="bar"><i class="g" style="width:${100 * s.mastered / Math.max(1, s.total)}%"></i><i class="o" style="width:${100 * s.review / Math.max(1, s.total)}%"></i><i class="w" style="width:${100 * (s.learning + s.due) / Math.max(1, s.total)}%"></i></div>`;
const cp = v => Math.abs(v) >= 900 ? (v > 0 ? 'выигрыш' : 'проигрыш') : (v > 0 ? '+' : '') + (v / 100).toFixed(1);
const verdict = g => g.score === 1 ? ['победа', 'good'] : g.score === 0 ? ['поражение', 'bad'] : ['ничья', 'warn'];

export function renderTournament(app, D, id) {
  const T = D.tn;
  if (id) return gamePage(app, T, T.games.find(g => g.id === id));
  const all = summary(tnIds(T));
  app.innerHTML = `
  <div class="page-head"><div class="eyebrow">${esc(T.dates)} · ${T.score} из ${T.games.length}</div><h1>Турнир</h1><p>${richText(T.lead)}</p></div>
  <div class="card mb"><div class="row between"><div><b>Освоено ${all.mastered} из ${all.total}</b> · повторить ${all.due} · новых ${all.new}</div><a class="btn primary" href="#/session/tn-all">Тренировать ошибки →</a></div></div>
  <h2>Что мешает больше всего</h2>
  <div class="grid g2">${T.themes.map(t => {
    const s = summary(tnIds(T, t.id));
    return `<div class="card course-card"><h3 style="margin:0">${esc(t.title)}</h3><p class="small" style="margin:0">${richText(t.text)}</p><p class="small muted" style="margin:0"><b>Привычка:</b> ${richText(t.habit)}</p>${bar(s)}
      <div class="row between"><span class="small muted">${pl(s.total, 'задача', 'задачи', 'задач')} · освоено ${s.mastered}</span><a class="btn small" href="#/session/tn-${t.id}">Тренировать →</a></div></div>`;
  }).join('')}</div>
  <h2 class="mt2">Партии</h2>
  <div class="list">${T.games.map(g => {
    const [t, cls] = verdict(g);
    return `<a class="item" href="#/tournament/${g.id}"><span class="badge ${cls}">${t}</span><div class="grow"><div class="title">Тур ${g.round}, ${g.color === 'w' ? 'белыми' : 'чёрными'}</div><div class="sub">${esc(g.short)}</div></div><span>→</span></a>`;
  }).join('')}</div>
  <h2 class="mt2">План до следующего турнира</h2>
  <div class="card prose" style="max-width:none"><ol>${T.plan.map(x => `<li>${richText(x)}</li>`).join('')}</ol></div>`;
  return () => { };
}

function gamePage(app, T, g) {
  if (!g) { location.hash = '#/tournament'; return () => { }; }
  const [t, cls] = verdict(g);
  const drills = T.drills.filter(d => d.game === g.id);
  app.innerHTML = `
  <div class="trainer">
    <div class="board-col"><div class="board-wrap"><div class="cgb"></div></div></div>
    <div class="panel"><div class="card">
      <div class="row between mb"><a class="btn small ghost" href="#/tournament">← Турнир</a><span class="badge ${cls}">${t}</span></div>
      <h2>Тур ${g.round}, ${g.color === 'w' ? 'белыми' : 'чёрными'}</h2>
      <p>${richText(g.lead)}</p>
      ${g.cut ? `<p class="hint">${esc(g.cut)}</p>` : ''}
      <div class="story-slot"></div>
      <h3 class="mt2">Ключевые моменты</h3>
      <div class="list">${drills.map(d => `<a class="item" href="#/session/one-${encodeURIComponent('tn:' + d.id)}"><span class="badge ${d.kind === 'good' ? 'good' : 'bad'}">ход ${d.n}</span><div class="grow"><div class="title">${esc(d.title)}</div><div class="sub">сыграно ${esc(d.played)} · оценка ${cp(d.before)} → ${cp(d.after)}</div></div><span>→</span></a>`).join('')}</div>
    </div></div>
  </div>`;
  const board = new Board(app.querySelector('.cgb'), { fen: g.final, orientation: g.color });
  board.setPosition(g.final, g.last);
  const story = mountStory(app.querySelector('.story-slot'), board, { path: g.path, storyTitle: 'Вся партия' }, { fen: g.final, last: g.last });
  story.reveal();
  return () => { story.destroy(); board.destroy(); };
}
