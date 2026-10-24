// Раздел «Атака и защита»: темы, задачи из партий и структур, «сыграй структуру».
import { Board } from '../board.js';
import { summary } from '../store.js';
import { esc, pl } from '../ui.js';

const TOPIC_CATS = { attack: ['attack'], storm: ['storm', 'stormwrong'], defense: ['defense'], initiative: ['initiative'], race: null };

function kingsOpposite(fen) {
  const rows = fen.split(' ')[0].split('/'); let wf = -1, bf = -1;
  rows.forEach(row => { let f = 0; for (const ch of row) { if (/\d/.test(ch)) { f += +ch; continue; } if (ch === 'K') wf = f; if (ch === 'k') bf = f; f++; } });
  return (wf <= 2 && bf >= 5) || (wf >= 5 && bf <= 2);
}

export function atkDrills(A, topic) {
  if (!topic) return A.drills;
  if (topic === 'race') return A.drills.filter(d => kingsOpposite(d.fen) && ['attack', 'storm', 'defense', 'initiative'].includes(d.cat));
  return A.drills.filter(d => TOPIC_CATS[topic].includes(d.cat));
}
export const atkIds = (A, topic) => atkDrills(A, topic).map(d => 'ak:' + d.id);

export function renderAttack(app, D, topicId) {
  const A = D.atk;
  if (topicId) return topicPage(app, D, A.topics.find(t => t.id === topicId));
  const all = summary(atkIds(A));
  const fromGames = A.drills.filter(d => d.src === 'game').length;
  app.innerHTML = `
  <div class="page-head"><div class="eyebrow">Испанская и сицилианская — в живой игре</div><h1>Атака и защита</h1>
  <p>Атака на короля, пешечный штурм при закрытом центре, защита, слом инициативы и разноимённые рокировки. Задачи — из твоих партий (${fromGames}) и из позиций твоего репертуара, доигранных движком (${A.drills.length - fromGames}). Все ходы в каждой задаче оценены Stockfish; в позициях из структур лучший ход заметно сильнее остальных.</p></div>
  <div class="card mb"><div class="row between"><div><b>Освоено ${all.mastered} из ${all.total}</b> · повторить ${all.due} · новых ${all.new}</div><a class="btn primary" href="#/session/atk-all">Тренировать всё →</a></div></div>
  <div class="grid g2">${A.topics.map(t => {
    const s = summary(atkIds(A, t.id));
    return `<a class="card course-card" href="#/attack/${t.id}" style="color:inherit;text-decoration:none">
      <div class="row between"><h3 style="margin:0">${esc(t.icon)} ${esc(t.title)}</h3><span class="small muted">${s.total}</span></div>
      <p class="small muted" style="margin:0">${esc(t.text[0])}</p>
      <div class="bar"><i class="g" style="width:${100 * s.mastered / Math.max(1, s.total)}%"></i><i class="o" style="width:${100 * s.review / Math.max(1, s.total)}%"></i><i class="w" style="width:${100 * (s.learning + s.due) / Math.max(1, s.total)}%"></i></div>
      <div class="small muted">${pl(s.total, 'задача', 'задачи', 'задач')} · освоено ${s.mastered}${s.due ? ` · <b style="color:var(--warn)">повторить ${s.due}</b>` : ''}</div></a>`;
  }).join('')}</div>
  <h2 class="mt2">Сыграй структуру против движка</h2>
  <p class="muted">Позиция из твоего дебюта — доиграй 20 ходов по плану против движка нужной силы. Каждый твой ход проверяется; ошибки показываются сразу или в конце.</p>
  <div class="list">${A.play.map(p => `<a class="item" href="#/session/pp-${p.id}"><span class="badge ${p.side === 'w' ? '' : 'violet'}">${p.side === 'w' ? 'белыми' : 'чёрными'}</span><div class="grow"><div class="title">${esc(p.title)}</div><div class="sub">${esc(p.plan)}</div></div><span>→</span></a>`).join('')}</div>`;
  return () => { };
}

function topicPage(app, D, t) {
  if (!t) { location.hash = '#/attack'; return () => { }; }
  const A = D.atk; const ids = atkIds(A, t.id); const s = summary(ids);
  app.innerHTML = `
  <div class="trainer">
    <div class="board-col"><div class="board-wrap"><div class="cgb"></div></div><p class="small muted mt">Ключевая структура темы из твоего репертуара.</p></div>
    <div class="panel"><div class="card prose">
      <div class="row mb"><a class="btn small ghost" href="#/attack">← Атака и защита</a></div>
      <h1>${esc(t.icon)} ${esc(t.title)}</h1>
      <ul>${t.text.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      ${t.you ? `<div class="lesson-rule">${esc(t.you)}</div>` : ''}
      <div class="row mt">${ids.length ? `<a class="btn primary" href="#/session/atk-${t.id}">Тренировать тему (${ids.length}) →</a>` : '<span class="muted">Задачи по теме появятся после следующего обновления.</span>'}<span class="small muted">освоено ${s.mastered} · повторить ${s.due}</span></div>
      <h3 class="mt2">Сыграй структуру</h3>
      <div class="list">${A.play.map(p => `<a class="item" href="#/session/pp-${p.id}"><div class="grow"><div class="title">${esc(p.title)}</div></div><span>→</span></a>`).join('')}</div>
    </div></div>
  </div>`;
  const board = new Board(app.querySelector('.cgb'), { fen: t.fen, orientation: t.orient });
  board.setPosition(t.fen, t.last);
  return () => board.destroy();
}
