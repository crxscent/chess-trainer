// Раздел «Эндшпиль»: темы с теорией, тренировки против базы и применение на своих партиях.
import { Board } from '../board.js';
import { summary } from '../store.js';
import { esc, pl } from '../ui.js';
import { lineViewer } from './exercise.js';

const GROUPS = [['basic', 'Основы'], ['rook', 'Ладейные эндшпили'], ['pawns', 'Многопешечные и лёгкие фигуры'], ['apply', 'Применение']];

export const egIds = (E, topic) => E.drills.filter(d => !topic || d.topic === topic).map(d => 'eg:' + d.id);

export function renderEndgames(app, D, topicId) {
  const E = D.eg;
  if (topicId) return topicPage(app, D, E.topics.find(t => t.id === topicId));
  const all = summary(egIds(E));
  const own = D.ex.filter(e => e.cat === 'endgame').length;
  app.innerHTML = `
  <div class="page-head"><div class="eyebrow">Техника, которая выигрывает очки</div><h1>Эндшпиль</h1>
  <p>Основные эндшпили, Лусена и Филидор, многопешечные эндшпили и применение на позициях из твоих партий. В тренировках соперник защищается <b>идеально</b> — его ходы берутся из эндшпильной базы lichess. Ошибёшься — тренажёр сразу скажет, какой ход упустил результат.</p></div>
  <div class="card mb"><div class="row between"><div><b>Освоено ${all.mastered} из ${all.total}</b> · на повторение ${all.due} · новых ${all.new}</div>
    <div class="row"><a class="btn primary" href="#/session/eg-all">Тренировать всё →</a>${own ? `<a class="btn" href="#/session/excat-endgame">Эндшпили из партий (движок): ${own}</a>` : ''}</div></div></div>
  ${GROUPS.map(([g, title]) => {
    const ts = E.topics.filter(t => t.group === g); if (!ts.length) return '';
    return `<h2 class="mt2">${esc(title)}</h2><div class="grid g2">${ts.map(t => {
      const ids = egIds(E, t.id); const s = summary(ids);
      return `<a class="card course-card" href="#/endgames/${t.id}" style="color:inherit;text-decoration:none">
        <h3 style="margin:0">${esc(t.title)}</h3>
        <p class="small muted" style="margin:0">${esc(t.text[0])}</p>
        <div class="bar"><i class="g" style="width:${100 * s.mastered / Math.max(1, s.total)}%"></i><i class="o" style="width:${100 * s.review / Math.max(1, s.total)}%"></i><i class="w" style="width:${100 * (s.learning + s.due) / Math.max(1, s.total)}%"></i></div>
        <div class="small muted">${pl(s.total, 'тренировка', 'тренировки', 'тренировок')} · освоено ${s.mastered}${s.due ? ` · <b style="color:var(--warn)">повторить ${s.due}</b>` : ''}</div></a>`;
    }).join('')}</div>`;
  }).join('')}`;
  return () => { };
}

function topicPage(app, D, t) {
  if (!t) { location.hash = '#/endgames'; return () => { }; }
  const E = D.eg;
  const drills = E.drills.filter(d => d.topic === t.id);
  const theory = `
    <div class="row mb"><a class="btn small ghost" href="#/endgames">← Эндшпиль</a></div>
    <h1>${esc(t.title)}</h1>
    <ul>${t.text.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    ${t.apply ? `<div class="lesson-rule"><b>Применение:</b> ${esc(t.apply)}</div>` : ''}
    <div class="row mt"><a class="btn primary" href="#/session/eg-${t.id}">Тренировать тему →</a></div>
    <h3 class="mt2">Тренировки (${drills.length})</h3>
    <div class="list">${drills.map(d => `<a class="item" href="#/session/eg-one-${d.id}"><span class="badge ${d.type === 'move' ? 'info' : d.goal === 'draw' ? 'violet' : 'good'}">${d.type === 'move' ? 'найди ход' : d.goal === 'draw' ? 'удержи ничью' : d.goal === 'mate' ? 'поставь мат' : 'выиграй'}</span><div class="grow"><div class="title">${esc(d.title)}</div></div><span>→</span></a>`).join('') || '<p class="muted">Пока нет позиций.</p>'}</div>`;
  if (!t.fen) { app.innerHTML = `<div class="card prose">${theory}</div>`; return () => { }; }
  app.innerHTML = `
  <div class="trainer">
    <div class="board-col"><div class="board-wrap"><div class="cgb"></div></div>
      ${t.line && t.line.length ? '<div class="row mt"><button class="btn small" id="showLine">▶ Показать технику</button><button class="btn small ghost" id="reset">Исходная позиция</button></div><div id="lv"></div>' : ''}
    </div>
    <div class="panel"><div class="card prose">${theory}</div></div>
  </div>`;
  const board = new Board(app.querySelector('.cgb'), { fen: t.fen, orientation: t.orient || 'w' });
  board.setPosition(t.fen);
  const sl = app.querySelector('#showLine');
  if (sl) {
    sl.onclick = () => lineViewer(app.querySelector('#lv'), board, t.fen, t.line, 'Лучшая игра (по эндшпильной базе)', null);
    app.querySelector('#reset').onclick = () => { app.querySelector('#lv').innerHTML = ''; board.setPosition(t.fen); };
  }
  return () => board.destroy();
}
