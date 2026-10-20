// Тренировка «Оценка позиции»: особенности → план через дисбаланс → не помогает ли сопернику → после размена заново.
import { Board, Chess, sanOf, uciToMove } from '../board.js';
import { analyse, engineAvailable, fmtCp } from '../engine.js';
import { esc, richText, bindSanChips } from '../ui.js';
import { factQuiz, featureDiff, featureFacts } from '../features.js';
import { verdictOf } from './exercise.js';

const STEPS = ['Особенности', 'План', 'Не помогает ли сопернику?', 'После размена', 'Разбор'];

export function mountEval(root, ex, { onDone, sessionInfo = '' } = {}) {
  const color = ex.color;
  root.innerHTML = `
  <div class="trainer">
    <div class="board-col">
      <div class="board-wrap"><div class="cgb"></div></div>
      <div class="board-meta"><span><span class="turn-dot ${color}"></span>Ты играешь ${color === 'w' ? 'белыми' : 'чёрными'}</span><span>${ex.game ? `${esc(ex.game.opp)} · ход ${ex.game.n}` : ''}</span></div>
    </div>
    <div class="panel"><div class="card">
      <div class="row between mb"><span class="badge info">Оценка позиции</span><span class="timer">${esc(sessionInfo)}</span></div>
      <div class="steps">${STEPS.map((s, i) => `<span class="step-pill" data-i="${i}">${s}</span>`).join('')}</div>
      <div class="body"></div>
    </div></div>
  </div>`;
  const board = new Board(root.querySelector('.cgb'), { fen: ex.fen, orientation: color });
  board.setPosition(ex.fen, ex.last);
  const body = root.querySelector('.body');
  bindSanChips(body, board);
  const pill = i => root.querySelectorAll('.step-pill').forEach((p, k) => { p.classList.toggle('on', k === i); p.classList.toggle('done', k < i); });
  const R = { quiz: 0, base: null, move: null, verdict: null };
  let dead = false;

  // ---- 1. особенности
  function step1() {
    pill(0);
    const { items, truth } = factQuiz(ex.fen, color, 6);
    body.innerHTML = `
      <div class="q">Начни с особенностей позиции, а не с поиска хода</div>
      <p class="hint">Слабости, сильные поля, линии, структура, активность фигур. Отметь утверждения, которые <b>верны</b> для этой позиции.</p>
      <div class="options">${items.map((it, i) => `<label class="opt" style="display:flex;gap:8px;align-items:flex-start"><input type="checkbox" data-i="${i}" style="margin-top:4px"><span>${esc(it.text)}</span></label>`).join('')}</div>
      <div class="row"><button class="btn primary" data-a="check">Проверить</button></div><div class="fb"></div>`;
    body.querySelector('[data-a=check]').onclick = e => {
      e.currentTarget.disabled = true;
      let ok = 0;
      body.querySelectorAll('input[data-i]').forEach(inp => {
        const it = items[+inp.dataset.i]; const right = inp.checked === !it.fake; if (right) ok++;
        const lab = inp.parentElement; lab.classList.add(right ? 'right' : 'wrong'); inp.disabled = true;
        lab.insertAdjacentHTML('beforeend', `<span class="why" style="margin-left:auto">${it.fake ? 'неверно' : 'верно'}</span>`);
      });
      R.quiz = ok / items.length;
      const hl = {}; truth.forEach(t => (t.sq || []).forEach(s => { hl[s] = t.c === color ? (t.kind === 'weak' || t.kind === 'king' ? 'mark-bad' : 'mark-good') : (t.kind === 'weak' || t.kind === 'king' ? 'mark-good' : 'mark-bad'); }));
      board.highlight(hl);
      const missed = truth.filter(t => !items.some(i => i.key === t.key)).slice(0, 5);
      body.querySelector('.fb').innerHTML = `
        <div class="verdict ${R.quiz >= 0.8 ? 'good' : R.quiz >= 0.6 ? 'ok' : 'warn'}">Верно ${ok} из ${items.length}.</div>
        ${missed.length ? `<p class="small">Ещё в позиции: ${missed.map(m => esc(m.text)).join('; ')}.</p>` : ''}
        <p class="small muted">Зелёным — то, что работает на тебя, красным — твои слабости и сильные поля соперника.</p>
        <div class="row mt"><button class="btn primary" data-a="next">Дальше: план →</button></div>`;
      body.querySelector('[data-a=next]').onclick = () => { board.highlight({}); step2(truth); };
    };
  }

  // ---- 2. план через дисбаланс
  function step2(truth) {
    pill(1);
    const chips = truth.filter(t => t.key !== 'mat').slice(0, 8);
    body.innerHTML = `
      <div class="q">Какой дисбаланс использует твой план?</div>
      <p class="hint">Выбери особенность, на которую опирается план, — и сделай ход, который её использует.</p>
      <div class="checks">${chips.map((c, i) => `<label class="chk"><input type="radio" name="imb" value="${i}">${esc(c.text)}</label>`).join('')}<label class="chk"><input type="radio" name="imb" value="-1">Другое / не вижу</label></div>
      <p class="hint mt">Теперь сыграй ход на доске.</p><div class="fb"></div>`;
    body.querySelectorAll('input[name=imb]').forEach(i => i.onchange = () => body.querySelectorAll('.chk').forEach(l => l.classList.toggle('on', l.querySelector('input').checked)));
    board.setPosition(ex.fen, ex.last);
    board.allowMoves(color, async mv => {
      const uci = mv.from + mv.to + (mv.promotion || '');
      R.base = (body.querySelector('input[name=imb]:checked') || {}).value;
      R.move = uci;
      let v = verdictOf(ex, uci);
      if (!v && engineAvailable()) { try { const r = await analyse(ex.fen, { depth: 12, moves: [uci] }); if (r[0]) { ex.evals[uci] = r[0].cp; v = verdictOf(ex, uci); } } catch (e) { } }
      R.verdict = v || { g: 1, cls: 'warn', t: 'Ход не удалось оценить', cp: null, best: null };
      step3();
    });
  }

  // ---- 3. не помогает ли сопернику
  async function step3() {
    pill(2);
    const c = new Chess(ex.fen); c.move(uciToMove(R.move)); const after = c.fen();
    const d = featureDiff(ex.fen, after, color);
    const bad = d.added.filter(f => (f.c === color && (f.kind === 'weak' || f.kind === 'king')) || (f.c && f.c !== color && ['square', 'line', 'strong'].includes(f.kind)));
    const good = d.added.filter(f => !bad.includes(f));
    body.innerHTML = `
      <div class="verdict ${R.verdict.cls}"><b>${esc(R.verdict.t)}</b>${R.verdict.cp != null ? ` · твой ход ${fmtCp(R.verdict.cp)}, лучший ${fmtCp(R.verdict.best)}` : ''}</div>
      <div class="q">Не помогает ли твой ход сопернику?</div>
      <p class="hint">Что изменилось в позиции после ${esc(sanOf(ex.fen, R.move))}:</p>
      ${bad.length ? `<div class="verdict bad">Соперник получил: ${bad.map(f => esc(f.text)).join('; ')}.</div>` : '<p class="small">Новых слабостей и полей для соперника ход не создал.</p>'}
      ${good.length ? `<p class="small">В твою пользу: ${good.map(f => esc(f.text)).join('; ')}.</p>` : ''}
      ${d.gone.length ? `<p class="small muted">Исчезло: ${d.gone.map(f => esc(f.text)).join('; ')}.</p>` : ''}
      <div class="comment" id="reply">${engineAvailable() ? 'Ищу лучший ответ соперника…' : ''}</div>
      <div class="row mt"><button class="btn primary" data-a="next">Дальше →</button></div>`;
    board.highlight(Object.fromEntries(bad.flatMap(f => (f.sq || []).map(s => [s, 'mark-bad']))));
    body.querySelector('[data-a=next]').onclick = () => { board.highlight({}); board.clearArrows(); step4(); };
    if (engineAvailable() && !c.isGameOver()) {
      try {
        const r = await analyse(after, { depth: 11 });
        if (dead || !r[0]) return;
        const el = body.querySelector('#reply');
        if (el) { el.innerHTML = `Лучший ответ соперника: <b>${esc(sanOf(after, r[0].move))}</b> (оценка для тебя ${fmtCp(-r[0].cp)}). Это ответ на твой план — его нужно было увидеть до хода.`; board.arrowUci(r[0].move, 'red'); }
      } catch (e) { }
    } else { const el = body.querySelector('#reply'); if (el) el.remove(); }
  }

  // ---- 4. после размена — заново
  function step4() {
    pill(3);
    const best = Object.entries(ex.evals).sort((a, b) => b[1] - a[1])[0][0];
    const pv = (ex.pvs && ex.pvs[best]) || [best];
    const c = new Chess(ex.fen); let exFen = null; let k = 0;
    for (const u of pv.slice(0, 8)) {
      let m; try { m = c.move(uciToMove(u)); } catch (e) { break; }
      if (!m) break; k++;
      if (m.captured && m.captured !== 'p') {
        const nxt = pv[k]; let m2 = null;
        if (nxt) { try { m2 = c.move(uciToMove(nxt)); } catch (e) { m2 = null; } }
        if (m2 && m2.captured) k++;
        exFen = c.fen(); break;
      }
    }
    if (!exFen) return step5();
    const d = featureDiff(ex.fen, exFen, color);
    board.setPosition(exFen);
    const facts = featureFacts(exFen, color).sort((a, b) => (b.key === 'mat') - (a.key === 'mat')).slice(0, 6);
    body.innerHTML = `
      <div class="q">После размена — оцени позицию заново</div>
      <p class="hint">В лучшей линии происходит размен: ${esc(lineText(ex.fen, pv.slice(0, k)))}. Структура и баланс изменились — старый план мог устареть.</p>
      ${d.added.length ? `<p><b>Появилось:</b> ${d.added.map(f => esc(f.text)).join('; ')}.</p>` : ''}
      ${d.gone.length ? `<p><b>Исчезло:</b> ${d.gone.map(f => esc(f.text)).join('; ')}.</p>` : ''}
      ${!d.added.length && !d.gone.length ? '<p class="small">Структура почти не изменилась — но фигур стало меньше: кому это выгодно?</p>' : ''}
      <p class="small muted">Главное в новой позиции: ${facts.map(f => esc(f.text)).join('; ') || '—'}.</p>
      <div class="row mt"><button class="btn primary" data-a="next">К разбору →</button></div>`;
    body.querySelector('[data-a=next]').onclick = step5;
  }

  // ---- 5. разбор
  function step5() {
    pill(4);
    board.setPosition(ex.fen, ex.last);
    if (R.move) board.play(R.move);
    body.innerHTML = `
      <div class="verdict ${R.verdict.cls}"><b>${esc(R.verdict.t)}</b> · особенности: ${Math.round(R.quiz * 100)}%</div>
      <div class="explain"><p>${richText(ex.text || '')}</p></div>
      <div class="lesson-rule">Особенности → дисбаланс → план → проверка ответа соперника → после размена оценка заново.</div>
      <div class="row mt2"><button class="btn primary" data-a="done">Дальше →</button></div>`;
    body.querySelector('[data-a=done]').onclick = () => {
      let g = R.verdict.g ?? 1;
      if (R.quiz < 0.6 && g > 1) g = 1;
      dead = true; board.destroy(); onDone && onDone(g);
    };
  }

  step1();
  return { destroy: () => { dead = true; board.destroy(); } };
}

function lineText(fen, ucis) {
  const c = new Chess(fen); const out = [];
  for (const u of ucis) { let m; try { m = c.move(uciToMove(u)); } catch (e) { break; } if (!m) break; out.push(m.san); }
  return out.join(' ');
}
