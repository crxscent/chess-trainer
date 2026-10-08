// Дебютная линия: режим «изучение» и режим «повторение по памяти».
import { Board, fig } from '../board.js';
import { esc, richText } from '../ui.js';

export function mountLine(root, course, line, { mode = 'drill', onDone, sessionInfo = '' } = {}) {
  const side = course.side; // 'w' | 'b'
  root.innerHTML = `
  <div class="trainer">
    <div class="board-col">
      <div class="board-wrap"><div class="cgb"></div></div>
      <div class="board-meta"><span><span class="turn-dot ${side}"></span>Ты играешь ${side === 'w' ? 'белыми' : 'чёрными'}</span><span class="prog"></span></div>
    </div>
    <div class="panel"><div class="card">
      <div class="row between mb"><div class="row"><span class="badge accent">${esc(course.title)}</span><span class="badge ${mode === 'learn' ? 'info' : 'good'}">${mode === 'learn' ? 'Изучение' : 'Повторение'}</span></div><span class="timer">${esc(sessionInfo)}</span></div>
      <h2>${esc(line.name)}</h2>
      <div class="moves mvlist"></div>
      <div class="comment"></div>
      <div class="fb"></div>
      <div class="row mt actions"></div>
    </div></div>
  </div>`;
  const board = new Board(root.querySelector('.cgb'), { orientation: side });
  const mvlist = root.querySelector('.mvlist');
  const cmt = root.querySelector('.comment');
  const fb = root.querySelector('.fb');
  const actions = root.querySelector('.actions');
  const prog = root.querySelector('.prog');
  const M = line.moves; // [{san, uci, c}]
  let i = 0; let mistakes = 0; let phase = mode; // learn -> drill
  let t0 = Date.now(); let destroyed = false;

  function renderList() {
    const out = [];
    M.forEach((m, k) => {
      if (k % 2 === 0) out.push(`<span class="n">${k / 2 + 1}.</span>`);
      const shown = k < i;
      out.push(`<span class="m ${k === i - 1 ? 'cur' : ''}">${shown ? esc(fig(m.san)) : (k === i ? '?' : '…')}</span>`);
    });
    mvlist.innerHTML = out.join(' ');
    prog.textContent = `${Math.min(i, M.length)} / ${M.length}`;
  }
  function comment(k) {
    const c = k >= 0 && M[k] && M[k].c;
    // комментарий остаётся на экране, пока не появится следующий
    if (c) cmt.innerHTML = `<div class="small muted mb">После ${Math.floor(k / 2) + 1}${k % 2 ? '...' : '.'}${esc(fig(M[k].san))}</div>` + richText(c, { fig });
    else if (k < 0) cmt.innerHTML = phase === 'learn' ? '<span class="muted">Играй ходы линии. Стрелка подсказывает следующий ход.</span>' : '<span class="muted">Играй по памяти. Комментарии появятся по ходу линии.</span>';
  }
  function reset() {
    i = 0; board.setPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    renderList(); comment(-1); fb.innerHTML = ''; step();
  }
  function step() {
    if (destroyed) return;
    renderList();
    if (i >= M.length) return end();
    const ourTurn = (i % 2 === 0) === (side === 'w');
    if (!ourTurn) {
      setTimeout(() => { if (destroyed) return; board.play(M[i].uci); i++; comment(i - 1); step(); }, i === 0 ? 400 : 450);
      return;
    }
    if (phase === 'learn') board.arrowUci(M[i].uci, 'green');
    board.allowMoves(side, mv => {
      const u = mv.from + mv.to + (mv.promotion || '');
      board.clearArrows();
      if (u === M[i].uci || mv.san === M[i].san) { fb.innerHTML = ''; i++; comment(i - 1); step(); }
      else {
        mistakes++;
        fb.innerHTML = `<div class="verdict bad">Не по репертуару. Правильно: <b>${esc(fig(M[i].san))}</b> — сыграй его.</div>`;
        setTimeout(() => {
          if (destroyed) return;
          board.chess.undo(); board.cg.set({ fen: board.chess.fen() }); board.sync(null);
          board.arrowUci(M[i].uci, 'red');
          board.allowMoves(side, mv2 => {
            const u2 = mv2.from + mv2.to + (mv2.promotion || '');
            board.clearArrows();
            if (u2 === M[i].uci) { fb.innerHTML = ''; i++; comment(i - 1); step(); }
            else { board.chess.undo(); board.sync(null); reset(); }
          });
        }, 650);
      }
    });
  }
  function end() {
    board.lock();
    if (phase === 'learn') {
      fb.innerHTML = `<div class="verdict good">Линия пройдена с подсказками. Теперь сыграй её по памяти — без стрелок.</div>`;
      actions.innerHTML = `<button class="btn primary" data-a="drill">Сыграть по памяти →</button>`;
      actions.querySelector('[data-a=drill]').onclick = () => { phase = 'drill'; mistakes = 0; t0 = Date.now(); actions.innerHTML = ''; reset(); };
      return;
    }
    const ours = Math.ceil(M.length / 2);
    const sec = (Date.now() - t0) / 1000;
    let g = mistakes === 0 ? (sec / ours < 4 && mode === 'drill' ? 3 : 2) : mistakes === 1 ? 1 : 0;
    if (mode === 'learn' && g > 2) g = 2;
    fb.innerHTML = `<div class="verdict ${g >= 2 ? 'good' : g === 1 ? 'warn' : 'bad'}">${mistakes === 0 ? 'Без ошибок!' : `Ошибок: ${mistakes}.`} ${g === 0 ? 'Линия вернётся на повторение скоро.' : ''}</div>`;
    actions.innerHTML = `<button class="btn" data-a="again">Ещё раз</button><button class="btn primary" data-a="done">Дальше →</button>`;
    actions.querySelector('[data-a=again]').onclick = () => { mistakes = 0; t0 = Date.now(); actions.innerHTML = ''; reset(); };
    actions.querySelector('[data-a=done]').onclick = () => { destroyed = true; board.destroy(); onDone && onDone(g); };
  }
  reset();
  return { destroy: () => { destroyed = true; board.destroy(); } };
}

// Просмотр линии без проверки (для страницы курса)
export function mountLineBrowse(root, course, line) {
  root.innerHTML = `
  <div class="trainer">
    <div class="board-col"><div class="board-wrap"><div class="cgb"></div></div></div>
    <div class="panel"><div class="card">
      <span class="badge accent">${esc(course.title)}</span>
      <h2 class="mt">${esc(line.name)}</h2>
      <div class="moves mvlist"></div>
      <div class="comment"></div>
      <div class="ctrl"><button class="btn small" data-v="0">⏮</button><button class="btn small" data-v="-1">◀</button><button class="btn small" data-v="1">▶</button><button class="btn small" data-v="9">⏭</button></div>
    </div></div>
  </div>`;
  const board = new Board(root.querySelector('.cgb'), { orientation: course.side });
  const M = line.moves; let i = 0;
  const mvlist = root.querySelector('.mvlist'); const cmt = root.querySelector('.comment');
  function render() {
    board.setPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    for (let k = 0; k < i; k++) board.play(M[k].uci);
    const out = [];
    M.forEach((m, k) => { if (k % 2 === 0) out.push(`<span class="n">${k / 2 + 1}.</span>`); out.push(`<span class="m ${k === i - 1 ? 'cur' : ''}" data-k="${k + 1}">${esc(fig(m.san))}</span>`); });
    mvlist.innerHTML = out.join(' ');
    mvlist.querySelectorAll('[data-k]').forEach(s => s.onclick = () => { i = +s.dataset.k; render(); });
    const c = i > 0 && M[i - 1].c;
    cmt.innerHTML = c ? richText(c, { fig }) : (i === 0 && course.intro ? richText(course.intro) : '<span class="muted">—</span>');
  }
  root.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { const v = +b.dataset.v; i = v === 0 ? 0 : v === 9 ? M.length : Math.max(0, Math.min(M.length, i + v)); render(); });
  const key = e => { if (e.key === 'ArrowRight') { i = Math.min(M.length, i + 1); render(); } if (e.key === 'ArrowLeft') { i = Math.max(0, i - 1); render(); } };
  document.addEventListener('keydown', key);
  render();
  return { destroy: () => { document.removeEventListener('keydown', key); board.destroy(); } };
}
