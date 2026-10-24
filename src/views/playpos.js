// «Сыграй структуру»: позиция из дебюта — доигрываешь против движка выбранной силы, каждый ход проверяется.
import { Board, Chess, sanOf } from '../board.js';
import { analyse, engineAvailable, fmtCp, wp } from '../engine.js';
import { esc, richText } from '../ui.js';
import { settings, save } from '../store.js';

const LEVELS = [['~1200', 3], ['~1500', 7], ['~1800', 11], ['полная сила', 20]];

export function mountPlay(root, p, { onDone, sessionInfo = '' } = {}) {
  const color = p.side; const opp = color === 'w' ? 'b' : 'w';
  const st = settings();
  if (st.playSkill == null) st.playSkill = 7;
  if (st.playHint == null) st.playHint = true;
  root.innerHTML = `
  <div class="trainer">
    <div class="board-col">
      <div class="board-wrap"><div class="cgb"></div></div>
      <div class="board-meta"><span><span class="turn-dot ${color}"></span>Ты играешь ${color === 'w' ? 'белыми' : 'чёрными'}</span><span class="mvn"></span></div>
    </div>
    <div class="panel"><div class="card">
      <div class="row between mb"><span class="badge accent">Сыграй структуру</span><span class="timer">${esc(sessionInfo)}</span></div>
      <h2>${esc(p.title)}</h2>
      <div class="lesson-rule"><b>План:</b> ${esc(p.plan)}</div>
      <div class="row mt small">
        <label>Соперник: <select id="lvl" style="width:auto">${LEVELS.map(([t, v]) => `<option value="${v}" ${v === st.playSkill ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="chk ${st.playHint ? 'on' : ''}"><input type="checkbox" id="hint" ${st.playHint ? 'checked' : ''}> сразу сообщать об ошибках</label>
      </div>
      <details class="mt"><summary>Перед каждым ходом</summary><ol class="small"><li>Что изменилось после хода соперника? Что он хочет?</li><li>CCT: шахи, взятия, угрозы — после моего хода.</li><li>Какая моя фигура хуже всего?</li><li>Мой ход служит плану или он просто «активный»?</li></ol></details>
      <div class="status comment mt">Твой ход. Играй 20 ходов по плану.</div>
      <div class="list mt" id="log"></div>
      <div class="row mt actions"><button class="btn small ghost" data-a="stop">Завершить</button></div>
    </div></div>
  </div>`;
  const board = new Board(root.querySelector('.cgb'), { fen: p.fen, orientation: color });
  board.setPosition(p.fen, p.last);
  const status = root.querySelector('.status'); const log = root.querySelector('#log'); const mvn = root.querySelector('.mvn');
  root.querySelector('#lvl').onchange = e => { st.playSkill = +e.target.value; save(); };
  root.querySelector('#hint').onchange = e => { st.playHint = e.target.checked; e.target.parentElement.classList.toggle('on', st.playHint); save(); };
  let dead = false; let lastReply = ''; let n = 0; const MAX = 20; const mistakes = []; let evalBefore = null;
  root.querySelector('[data-a=stop]').onclick = () => finish();

  async function myTurn() {
    if (dead) return;
    if (board.chess.isGameOver() || n >= MAX) return finish();
    if (evalBefore == null) { try { const r = await analyse(board.fen(), { depth: 10 }); evalBefore = r[0] ? r[0].cp : 0; } catch (e) { evalBefore = 0; } }
    if (dead) return;
    const fenBefore = board.fen();
    board.allowMoves(color, async mv => {
      n++; mvn.textContent = `ход ${n} из ${MAX}`;
      status.textContent = 'Проверяю ход…';
      let after = 0;
      try { const r = await analyse(board.fen(), { depth: 10 }); after = r[0] ? -r[0].cp : 0; } catch (e) { }
      if (dead) return;
      const drop = wp(evalBefore) - wp(after);
      if (drop >= 12) {
        let best = null; try { const r = await analyse(fenBefore, { depth: 11 }); best = r[0] && r[0].move; } catch (e) { }
        mistakes.push({ n, san: mv.san, before: evalBefore, after, best: best && sanOf(fenBefore, best), drop });
        if (st.playHint) log.insertAdjacentHTML('beforeend', `<div class="item"><span class="badge ${drop >= 25 ? 'bad' : 'warn'}">${drop >= 25 ? 'ошибка' : 'неточность'}</span><div class="grow small">${esc(mv.san)}: ${fmtCp(evalBefore)} → ${fmtCp(after)}${best ? `, сильнее ${esc(sanOf(fenBefore, best))}` : ''}</div></div>`);
      }
      if (board.chess.isGameOver() || n >= MAX) return finish();
      status.textContent = 'Соперник думает…';
      let reply = null;
      try { const r = await analyse(board.fen(), { depth: 10, skill: st.playSkill }); reply = r.bestmove || (r[0] && r[0].move); } catch (e) { }
      if (dead || !reply) return finish();
      const fenR = board.fen(); lastReply = sanOf(fenR, reply);
      board.play(reply);
      try { const r = await analyse(board.fen(), { depth: 10 }); evalBefore = r[0] ? r[0].cp : 0; } catch (e) { }
      if (dead) return;
      myTurn();
    });
    status.innerHTML = n ? `Соперник: <b>${esc(lastReply)}</b>. Оценка: ${fmtCp(evalBefore)}. Твой ход.` : 'Твой ход. Играй 20 ходов по плану.';
  }

  function finish() {
    if (dead) return; board.lock();
    const big = mistakes.filter(m => m.drop >= 25).length;
    const g = mistakes.length === 0 ? 3 : big === 0 ? 2 : big === 1 ? 1 : 0;
    status.className = 'status comment verdict ' + (g >= 2 ? 'good' : g === 1 ? 'warn' : 'bad');
    status.innerHTML = `Сыграно ходов: ${n}. ${mistakes.length ? `Ошибок и неточностей: ${mistakes.length}.` : 'Без ошибок — план выдержан!'} Итоговая оценка: ${fmtCp(evalBefore ?? 0)}.`;
    log.innerHTML = mistakes.map(m => `<div class="item"><span class="badge ${m.drop >= 25 ? 'bad' : 'warn'}">ход ${m.n}</span><div class="grow small"><b>${esc(m.san)}</b>: ${fmtCp(m.before)} → ${fmtCp(m.after)}${m.best ? `. Сильнее было <b>${esc(m.best)}</b>` : ''}</div></div>`).join('');
    const a = root.querySelector('.actions');
    a.innerHTML = '<button class="btn" data-a="again">Сыграть ещё раз</button><button class="btn primary" data-a="done">Дальше →</button>';
    a.querySelector('[data-a=again]').onclick = () => { dead = true; board.destroy(); mountPlay(root, p, { onDone, sessionInfo }); };
    a.querySelector('[data-a=done]').onclick = () => { dead = true; board.destroy(); onDone && onDone(g); };
  }
  if (!engineAvailable()) { status.textContent = 'Движок не поддерживается в этом браузере.'; return { destroy: () => board.destroy() }; }
  myTurn();
  return { destroy: () => { dead = true; board.destroy(); } };
}
