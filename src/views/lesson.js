// Урок «Школы плана»: позиция + вопрос (выбор плана) или «найди ход/манёвр».
import { Board, sanOf, fig } from '../board.js';
import { esc, richText, bindSanChips } from '../ui.js';
import { lineViewer } from './exercise.js';

export const THEMES = {
  prophylaxis: 'Профилактика', worstpiece: 'Худшая фигура', pawnmove: 'Стоит ли двигать пешку?',
  plan: 'Лучший план', break: 'Пешечный прорыв', second: 'Вторая слабость', convert: 'Простой путь к победе',
  structure: 'Пешечная структура', endgame: 'Эндшпиль', calm: 'Не форсируй',
};

export function mountLesson(root, ls, { onDone, sessionInfo = '' } = {}) {
  root.innerHTML = `
  <div class="trainer">
    <div class="board-col">
      <div class="board-wrap"><div class="cgb"></div></div>
      <div class="board-meta"><span><span class="turn-dot ${ls.color}"></span>Ход ${ls.color === 'w' ? 'белых' : 'чёрных'}</span><span>${esc(ls.source || '')}</span></div>
    </div>
    <div class="panel"><div class="card">
      <div class="row between mb"><div class="row"><span class="badge accent">Школа плана</span><span class="badge">${esc(THEMES[ls.theme] || ls.theme)}</span></div><span class="timer">${esc(sessionInfo)}</span></div>
      <h2>${esc(ls.title)}</h2>
      ${ls.context ? `<p class="hint">${richText(ls.context, { fig })}</p>` : ''}
      <div class="q">${richText(ls.q, { fig })}</div>
      <div class="body"></div>
    </div></div>
  </div>`;
  const board = new Board(root.querySelector('.cgb'), { fen: ls.fen, orientation: ls.orient || ls.color });
  board.setPosition(ls.fen, ls.last);
  const body = root.querySelector('.body');
  bindSanChips(root.querySelector('.panel'), board);
  let grade = null;

  if (ls.type === 'move') {
    body.innerHTML = `<p class="hint">Сыграй ход на доске.</p><div class="row"><button class="btn ghost" data-a="giveup">Показать ответ</button></div><div class="fb"></div>`;
    let tries = 0;
    const ask = () => board.allowMoves(ls.color, mv => {
      const u = mv.from + mv.to + (mv.promotion || '');
      tries++;
      if (ls.accept.includes(u)) { grade = tries === 1 ? 3 : 1; finish(true, u); }
      else if ((ls.partial || []).some(p => p[0] === u)) {
        const p = ls.partial.find(p => p[0] === u);
        body.querySelector('.fb').innerHTML = `<div class="verdict warn">${richText(p[1], { fig })} Попробуй ещё.</div>`;
        setTimeout(() => { board.setPosition(ls.fen, ls.last); ask(); }, 700);
      } else {
        body.querySelector('.fb').innerHTML = `<div class="verdict bad">Не то. ${tries >= 2 ? 'Подумай о худшей фигуре и об идее соперника.' : 'Попробуй ещё.'}</div>`;
        setTimeout(() => { board.setPosition(ls.fen, ls.last); if (tries >= 3) { grade = 0; finish(false); } else ask(); }, 700);
      }
    });
    ask();
    body.querySelector('[data-a=giveup]').onclick = () => { board.lock(); grade = 0; finish(false); };
  } else {
    body.innerHTML = `<div class="options">${ls.options.map((o, i) => `<button class="opt" data-i="${i}">${richText(o.t, { fig })}</button>`).join('')}</div><div class="fb"></div>`;
    body.querySelectorAll('.opt').forEach(b => b.onclick = () => {
      const i = +b.dataset.i; const o = ls.options[i];
      grade = o.ok ? 3 : 0;
      body.querySelectorAll('.opt').forEach((x, k) => {
        x.disabled = true;
        const oo = ls.options[k];
        if (oo.ok) x.classList.add('right'); else if (k === i) x.classList.add('wrong');
        if (oo.why) x.insertAdjacentHTML('beforeend', `<span class="why">${richText(oo.why, { fig })}</span>`);
      });
      finish(o.ok);
    });
  }

  function finish(ok, played) {
    board.lock();
    if (ls.arrows) board.arrows(ls.arrows);
    const fb = body.querySelector('.fb');
    fb.insertAdjacentHTML('beforeend', `
      ${ls.type === 'move' ? `<div class="verdict ${ok ? 'good' : 'bad'}">${ok ? 'Верно!' : `Ответ: ${ls.accept.map(u => `<span class="san" data-uci="${u}">${esc(fig(sanOf(ls.fen, u)))}</span>`).join(' или ')}`}</div>` : ''}
      <div class="explain mt"><p>${richText(ls.explain, { fig })}</p></div>
      ${ls.rule ? `<div class="lesson-rule">${richText(ls.rule)}</div>` : ''}
      ${ls.line ? '<div class="row"><button class="btn small" data-a="line">▶ Показать план на доске</button></div>' : ''}
      <div class="lineview"></div>
      <div class="row mt2"><button class="btn primary" data-a="done">Дальше →</button></div>`);
    const lv = fb.querySelector('.lineview');
    const lb = fb.querySelector('[data-a=line]');
    if (lb) lb.onclick = () => lineViewer(lv, board, ls.fen, ls.line, 'План', ls.last);
    fb.querySelector('[data-a=done]').onclick = () => { board.destroy(); onDone && onDone(grade ?? 0); };
  }
  return { destroy: () => board.destroy() };
}
