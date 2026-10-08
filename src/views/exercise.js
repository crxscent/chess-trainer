// Упражнение из собственной партии: протокол мышления в 3 шага + разбор.
import { Board, Chess, flipTurn, sanOf, lineSan, fig, uciToMove } from '../board.js';
import { wp, fmtCp, analyse, engineAvailable } from '../engine.js';
import { esc, richText, bindSanChips, toast } from '../ui.js';
import { settings, S, save, todayLog } from '../store.js';

export const CATS = {
  threat: { t: 'Что хочет соперник?', s: 'Профилактика', badge: 'bad', d: 'Позиции, где у соперника была угроза, а ты её пропустил. Сначала найди его идею — потом свой ход.' },
  cct: { t: 'Проверь ответ соперника', s: 'CCT: шахи, взятия, угрозы', badge: 'warn', d: 'Твой ход в партии позволил сильный ответ. Перед ходом проверь все шахи, взятия и угрозы соперника.' },
  pawn: { t: 'Нужен ли пешечный ход?', s: 'Контроль пешечных ходов', badge: 'accent', d: 'В партии ты сделал пешечный ход, а сильнее было улучшить фигуру. Помни правило «3 хода без пешек».' },
  active: { t: 'Активный ≠ хороший', s: 'Шах, взятие или угроза — не значит лучший', badge: 'violet', d: 'Ты выбрал «активный» ход (шах/взятие), но спокойный ход был сильнее.' },
  convert: { t: 'Реализуй перевес просто', s: 'Техника выигранных позиций', badge: 'good', d: 'У тебя был большой перевес. Ищи самый простой и безопасный путь, а не самый красивый.' },
  plan: { t: 'Улучши позицию без тактики', s: 'Худшая фигура и план', badge: 'info', d: 'Спокойная позиция. Если убрать тактику с доски — какой ход делает позицию лучше?' },
  endgame: { t: 'Эндшпиль', s: 'Точность в концовке', badge: 'good', d: 'Ошибки в эндшпиле из твоих партий.' },
};

export const MISTAKE_TAGS = [
  'лишний пешечный ход', 'не заметил ответ соперника', 'переоценил атаку', 'не улучшил худшую фигуру',
  'слишком рано форсировал', 'не упростил выигранную позицию', 'не проверил шахи/взятия', 'спешка',
];

const PIECE_RU = { p: 'пешка', n: 'конь', b: 'слон', r: 'ладья', q: 'ферзь', k: 'король' };

function verdictOf(ex, uci) {
  const ev = ex.evals;
  const best = Math.max(...Object.values(ev));
  const mine = ev[uci];
  if (mine == null) return null;
  const loss = wp(best) - wp(mine);
  const res = { cp: mine, best, loss };
  if (ex.cat === 'convert' && wp(mine) >= 85 && loss <= 10) { res.cls = 'good'; res.t = 'Перевес сохранён'; res.g = loss <= 3 ? 3 : 2; return res; }
  if (loss <= 3) { res.cls = 'good'; res.t = 'Отлично — лучший ход или равноценный'; res.g = 3; }
  else if (loss <= 8) { res.cls = 'ok'; res.t = 'Хороший ход'; res.g = 2; }
  else if (loss <= 15) { res.cls = 'warn'; res.t = 'Неточность'; res.g = 1; }
  else { res.cls = 'bad'; res.t = 'Ошибка'; res.g = 0; }
  return res;
}

function sortedMoves(ex) {
  return Object.entries(ex.evals).sort((a, b) => b[1] - a[1]);
}

export function mountExercise(root, ex, { onDone, sessionInfo = '' } = {}) {
  const st = settings();
  const color = ex.color;              // 'w' | 'b'
  const opp = color === 'w' ? 'b' : 'w';
  const cat = CATS[ex.cat] || CATS.plan;
  const inCheck = new Chess(ex.fen).inCheck();
  const hasThreatStep = st.threatStep && ex.threat && !inCheck;
  const hasPieceStep = st.pieceStep && ex.worst && ['plan', 'pawn', 'active', 'convert', 'endgame'].includes(ex.cat);
  const steps = [];
  if (hasThreatStep) steps.push('threat');
  if (hasPieceStep) steps.push('piece');
  steps.push('move', 'review');
  const stepNames = { threat: 'Что хочет соперник', piece: 'Худшая фигура', move: 'Твой ход', review: 'Разбор' };

  root.innerHTML = `
  <div class="trainer">
    <div class="board-col">
      <div class="board-wrap"><div class="cgb"></div></div>
      <div class="board-meta">
        <span><span class="turn-dot ${color}"></span>Ты играешь ${color === 'w' ? 'белыми' : 'чёрными'}</span>
        <span>${ex.game ? `${esc(ex.game.opp)} · ${esc(ex.game.tc)} · ход ${ex.game.n}` : ''}</span>
      </div>
    </div>
    <div class="panel">
      <div class="card">
        <div class="row between mb">
          <div class="row"><span class="badge ${cat.badge}">${esc(cat.s)}</span>${(ex.tags || []).includes('turning') ? '<span class="badge bad">Поворотный момент партии</span>' : ''}</div>
          <span class="timer">${esc(sessionInfo)}</span>
        </div>
        <h2>${esc(cat.t)}</h2>
        <div class="steps">${steps.map(s => `<span class="step-pill" data-s="${s}">${stepNames[s]}</span>`).join('')}</div>
        <div class="body"></div>
      </div>
    </div>
  </div>`;
  const board = new Board(root.querySelector('.cgb'), { fen: ex.fen, orientation: color });
  const body = root.querySelector('.body');
  bindSanChips(body, board);
  const result = { threatOk: null, piece: null, move: null, verdict: null, shown: false };
  let stepIdx = 0;

  function setStep(i) {
    stepIdx = i;
    root.querySelectorAll('.step-pill').forEach((p, k) => { p.classList.toggle('on', k === i); p.classList.toggle('done', k < i); });
    ({ threat: stepThreat, piece: stepPiece, move: stepMove, review: stepReview })[steps[i]]();
  }
  const next = () => setStep(stepIdx + 1);

  function resetPos() { board.setPosition(ex.fen, ex.last); }

  function lastMoveText() {
    if (!ex.last) return '';
    const prev = ex.prevFen ? sanOf(ex.prevFen, ex.last) : null;
    return prev ? `Последний ход соперника: <span class="san" data-uci="${ex.last}">${esc(fig(prev))}</span>. Что он изменил?` : '';
  }

  // ---------- шаг 1: угроза ----------
  function stepThreat() {
    const fen2 = flipTurn(ex.fen);
    board.setPosition(fen2, ex.last);
    body.innerHTML = `
      <div class="q">Шаг 1 · Найди идею соперника</div>
      <p class="hint">${lastMoveText()}</p>
      <p class="hint">Представь, что ты пропускаешь ход. <b>Сыграй на доске ход за соперника</b> — что он сделает? Если серьёзной угрозы нет, нажми кнопку.</p>
      <div class="row mt"><button class="btn" data-a="none">Серьёзной угрозы нет</button><button class="btn ghost small" data-a="skip">Пропустить шаг</button></div>
      <div class="fb"></div>`;
    board.allowMoves(opp, mv => answer(mv.from + mv.to + (mv.promotion || '')));
    body.querySelector('[data-a=none]').onclick = () => { board.lock(); answer(null); };
    body.querySelector('[data-a=skip]').onclick = () => { board.lock(); resetPos(); next(); };

    function answer(uci) {
      const th = ex.threat; const real = th.drop >= 100;
      const bestT = th.moves[0];
      let cls, txt;
      if (uci === null) {
        if (!real) { cls = 'good'; txt = 'Верно: у соперника нет серьёзной угрозы. Можно спокойно улучшать позицию.'; result.threatOk = true; }
        else { cls = 'bad'; txt = `Угроза была: ${chip(fen2, bestT[0], 'red')} — это стоило бы тебе около ${fmtLoss(th.drop)}.`; result.threatOk = false; }
      } else {
        const hit = th.moves.find(m => m[0] === uci);
        if (real && hit && hit[1] <= bestT[1] + 80) { cls = 'good'; txt = `Точно! Соперник хочет ${chip(fen2, uci, 'red')}. Это главная угроза — теперь её нужно учесть.`; result.threatOk = true; }
        else if (real) { cls = 'bad'; txt = `Главная угроза другая: ${chip(fen2, bestT[0], 'red')} (≈ ${fmtLoss(th.drop)}).${hit ? '' : ''}`; result.threatOk = false; }
        else { cls = 'ok'; txt = `Серьёзной угрозы здесь не было (лучший ход соперника «с пропуском» — ${chip(fen2, bestT[0], 'red')}, почти ничего не меняет). Важно, что ты задал вопрос.`; result.threatOk = true; }
      }
      board.lock();
      setTimeout(() => {
        resetPos();
        board.arrows([{ from: bestT[0].slice(0, 2), to: bestT[0].slice(2, 4), brush: real ? 'red' : 'paleGrey' }]);
      }, uci ? 450 : 0);
      body.querySelector('.fb').innerHTML = `<div class="verdict ${cls}">${txt}</div>
        ${th.pv && real ? `<p class="hint">Линия угрозы: ${esc(lineSan(fen2, th.pv, 6))}</p>` : ''}
        <div class="row mt"><button class="btn primary" data-a="go">Дальше →</button></div>`;
      body.querySelectorAll('[data-a=none],[data-a=skip]').forEach(b => b.disabled = true);
      body.querySelector('[data-a=go]').onclick = () => { board.clearArrows(); next(); };
    }
  }

  // ---------- шаг 2: худшая фигура ----------
  function stepPiece() {
    resetPos();
    body.innerHTML = `
      <div class="q">Шаг 2 · Какая твоя фигура приносит меньше всего пользы?</div>
      <p class="hint">Кликни по своей фигуре (не пешке и не королю). Здесь нет «единственно верного» ответа — тренируем привычку задавать вопрос.</p>
      <div class="row mt"><button class="btn ghost small" data-a="skip">Пропустить шаг</button></div>
      <div class="fb"></div>`;
    body.querySelector('[data-a=skip]').onclick = () => { board.onSelect = null; next(); };
    board.onSelect = key => {
      const p = board.chess.get(key);
      if (!p || p.color !== color || p.type === 'p' || p.type === 'k') return;
      board.onSelect = null; board.cg.selectSquare(null);
      result.piece = key;
      const w = ex.worst;
      const match = w.list.some(x => x.sq === key) || w.plan === key;
      const hl = {}; hl[key] = 'mark-sel';
      w.list.forEach(x => { hl[x.sq] = hl[x.sq] || 'mark-bad'; });
      board.highlight(hl);
      if (w.planMove) board.arrows([{ from: w.planMove.slice(0, 2), to: w.planMove.slice(2, 4), brush: 'green' }]);
      const lst = w.list.map(x => `<li><b>${PIECE_RU[x.p]} ${x.sq}</b> — ${esc(x.why)}</li>`).join('');
      body.querySelector('.fb').innerHTML = `
        <div class="verdict ${match ? 'good' : 'ok'}">${match ? 'Совпадает с анализом.' : 'Интересный выбор — сравни с анализом.'}</div>
        <ul class="small">${lst}</ul>
        ${w.planText ? `<p class="small">${richText(w.planText, { fig })}</p>` : ''}
        <div class="row mt"><button class="btn primary" data-a="go">Дальше →</button></div>`;
      body.querySelector('[data-a=go]').onclick = () => { board.highlight({}); board.clearArrows(); next(); };
    };
  }

  // ---------- шаг 3: ход ----------
  function stepMove() {
    resetPos();
    const hints = {
      threat: 'Учитывай идею соперника: сначала профилактика, потом свои планы.',
      cct: 'Перед ходом проверь: какие шахи, взятия и угрозы будут у соперника ПОСЛЕ твоего хода?',
      pawn: 'Сначала поищи три фигурных хода. Пешка — только если без неё нельзя.',
      active: 'Не путай «активный» и «хороший». Какой ход объективно улучшает позицию сильнее всего?',
      convert: 'Какой самый ПРОСТОЙ способ выиграть? Чем больше перевес, тем меньше риска.',
      plan: 'Если убрать тактику с доски — какой ход делает твою позицию лучше?',
      endgame: 'Активный король, проходные, слабости соперника — и никакой спешки.',
    };
    body.innerHTML = `
      <div class="q">Твой ход</div>
      <p class="hint">${hasThreatStep ? '' : lastMoveText() + ' '}${esc(hints[ex.cat] || '')}</p>
      <div class="row mt"><button class="btn ghost" data-a="giveup">Не знаю — показать</button></div>
      <div class="fb"></div>`;
    board.allowMoves(color, mv => onMove(mv.from + mv.to + (mv.promotion || '')));
    body.querySelector('[data-a=giveup]').onclick = () => { board.lock(); result.shown = true; result.verdict = { g: 0, cls: 'bad', t: 'Показан ответ' }; next(); };

    async function onMove(uci) {
      let v = verdictOf(ex, uci);
      if (!v && engineAvailable()) {
        body.querySelector('.fb').innerHTML = '<p class="hint">Оцениваю ход движком…</p>';
        try {
          const r = await analyse(ex.fen, { depth: 12, moves: [uci] });
          if (r[0]) { ex.evals[uci] = r[0].cp; v = verdictOf(ex, uci); }
        } catch (e) { }
      }
      if (!v) { v = { g: 1, cls: 'warn', t: 'Ход не удалось оценить', cp: null, best: null, loss: 0 }; }
      result.move = uci; result.verdict = v;
      next();
    }
  }

  // ---------- шаг 4: разбор ----------
  function stepReview() {
    const v = result.verdict;
    resetPos();
    const best = sortedMoves(ex)[0][0];
    if (result.move) board.play(result.move);
    const top = sortedMoves(ex).slice(0, 4);
    const rows = [];
    const seen = new Set();
    const addRow = (uci, label, cls = '') => {
      if (!uci || seen.has(uci + label)) return; seen.add(uci + label);
      rows.push(`<tr class="${cls}"><td>${label}</td><td><span class="san" data-uci="${uci}">${esc(fig(sanOf(ex.fen, uci)))}</span></td><td>${fmtCp(ex.evals[uci])}</td></tr>`);
    };
    if (result.move) addRow(result.move, 'Твой ход', 'me');
    addRow(best, 'Лучший');
    if (ex.played) addRow(ex.played, 'В партии');
    top.slice(1).forEach(([u]) => addRow(u, 'Тоже неплохо'));
    const mistakeChips = MISTAKE_TAGS.map(t => `<label class="chk"><input type="checkbox" value="${esc(t)}">${esc(t)}</label>`).join('');
    body.innerHTML = `
      <div class="verdict ${v.cls}"><span class="t">${esc(v.t)}</span>${v.cp != null && result.move ? ` · твой ход ${fmtCp(v.cp)}, лучший ${fmtCp(v.best)}` : ''}</div>
      <table class="mvtable"><tbody>${rows.join('')}</tbody></table>
      <div class="explain"><p>${richText(ex.text || '', { fig })}</p></div>
      ${ex.rule ? `<div class="lesson-rule">${richText(ex.rule)}</div>` : ''}
      <div class="row mt">
        <button class="btn small" data-a="best">▶ Лучшая линия</button>
        ${ex.played && ex.after ? '<button class="btn small" data-a="game">▶ Ход из партии и ответ</button>' : ''}
        ${ex.threat && ex.threat.drop >= 100 ? '<button class="btn small" data-a="threat">Угроза соперника</button>' : ''}
        ${(ex.cat === 'convert' || ex.evals[best] >= 250) && engineAvailable() ? '<button class="btn small" data-a="play">♟ Доиграть против движка</button>' : ''}
        ${ex.game ? `<a class="btn small ghost" target="_blank" rel="noopener" href="https://lichess.org/${ex.game.id}${ex.color === 'b' ? '/black' : ''}#${ex.game.ply}">Партия на lichess ↗</a>` : ''}
      </div>
      <div class="lineview"></div>
      <details class="mt"><summary>Что я упустил? (отметь — попадёт в дневник ошибок)</summary><div class="checks mt">${mistakeChips}</div></details>
      <div class="row mt2"><button class="btn primary" data-a="done">Дальше →</button></div>`;
    const lv = body.querySelector('.lineview');
    const showLine = (startFen, ucis, title, lastMv) => {
      lineViewer(lv, board, startFen, ucis, title, lastMv);
    };
    body.querySelector('[data-a=best]').onclick = () => showLine(ex.fen, ex.pvs?.[best] || [best], 'Лучшая линия', ex.last);
    const g = body.querySelector('[data-a=game]');
    if (g) g.onclick = () => showLine(ex.fen, [ex.played].concat(ex.after.pv || []), 'В партии ты сыграл — и вот что мог ответить соперник', ex.last);
    const t = body.querySelector('[data-a=threat]');
    if (t) t.onclick = () => { lv.innerHTML = ''; resetPos(); board.arrows([{ from: ex.threat.moves[0][0].slice(0, 2), to: ex.threat.moves[0][0].slice(2, 4), brush: 'red' }]); };
    const p = body.querySelector('[data-a=play]');
    if (p) p.onclick = () => playout(lv, board, ex);
    body.querySelectorAll('.chk input').forEach(i => i.onchange = () => i.parentElement.classList.toggle('on', i.checked));
    body.querySelector('[data-a=done]').onclick = () => {
      const tags = [...body.querySelectorAll('.chk input:checked')].map(i => i.value);
      if (tags.length) {
        const s = S(); s.mistakeLog = s.mistakeLog || [];
        s.mistakeLog.push({ ts: Date.now(), src: 'ex', id: ex.id, tags }); save();
      }
      let gr = v.g;
      if (gr === 3 && result.threatOk === false) gr = 2;
      board.destroy();
      onDone && onDone(gr, result);
    };
  }

  function chip(fen, uci, brush) {
    return `<span class="san" data-uci="${uci}" data-brush="${brush}">${esc(fig(sanOf(fen, uci)))}</span>`;
  }

  setStep(0);
  return { destroy: () => board.destroy() };
}

function fmtLoss(cp) {
  if (cp >= 9000) return 'мата';
  const p = cp / 100;
  return p >= 1 ? `${p.toFixed(1)} пешки` : `${p.toFixed(1)} пешки`;
}

// Просмотр линии с кнопками ◀ ▶
export function lineViewer(el, board, fen, ucis, title, lastMv) {
  const c = new Chess(fen);
  const fens = [fen]; const sans = []; const moves = [];
  for (const u of ucis) {
    let m; try { m = c.move(uciToMove(u)); } catch (e) { break; }
    if (!m) break;
    fens.push(c.fen()); sans.push(m); moves.push(u);
  }
  let i = 0;
  const startNo = +fen.split(' ')[5]; const startW = fen.split(' ')[1] === 'w';
  function render() {
    board.setPosition(fens[i], i ? moves[i - 1] : lastMv);
    if (i < moves.length) board.arrowUci(moves[i], 'paleBlue');
    let out = []; let no = startNo; let w = startW;
    sans.forEach((m, k) => {
      if (w) out.push(`<span class="n">${no}.</span>`); else if (k === 0) out.push(`<span class="n">${no}...</span>`);
      out.push(`<span class="m ${k + 1 === i ? 'cur' : k + 1 > i ? 'future' : ''}" data-k="${k + 1}">${esc(fig(m.san))}</span>`);
      if (!w) no++; w = !w;
    });
    el.innerHTML = `<div class="comment"><div class="small muted mb">${esc(title)}</div><div class="moves">${out.join('')}</div>
      <div class="ctrl"><button class="btn small" data-v="0">⏮</button><button class="btn small" data-v="-1">◀</button><button class="btn small" data-v="1">▶</button><button class="btn small" data-v="9">⏭</button></div></div>`;
    el.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
      const v = +b.dataset.v; i = v === 0 ? 0 : v === 9 ? moves.length : Math.max(0, Math.min(moves.length, i + v)); render();
    });
    el.querySelectorAll('.m[data-k]').forEach(s => s.onclick = () => { i = +s.dataset.k; render(); });
  }
  render();
  // автопроигрывание первого хода
  setTimeout(() => { if (i === 0 && moves.length) { i = 1; render(); } }, 350);
}

// Доиграть позицию против движка (техника реализации)
export function playout(el, board, ex) {
  const color = ex.color;
  const opp = color === 'w' ? 'b' : 'w';
  board.setPosition(ex.fen, ex.last);
  board.lock();
  let plies = 0; let lastEval = 0; let startEval = 0; let stopped = false;
  el.innerHTML = `<div class="comment"><div class="small muted mb">Доигрывание против движка</div>
    <p class="small">Цель — довести перевес до победы <b>без риска</b>. Движок защищается в полную силу. Успех — мат или через 30 полуходов перевес не меньше стартового (допуск 1 пешка). Если перевес упал на 2 пешки — попытка не удалась.</p>
    <div class="pstat small">Движок оценивает стартовую позицию…</div>
    <div class="row mt"><button class="btn small danger" data-a="stop">Завершить</button></div></div>`;
  const pstat = el.querySelector('.pstat');
  el.querySelector('[data-a=stop]').onclick = () => finish(null);
  const failAt = () => Math.max(50, startEval - 200);
  const alive = () => !stopped && document.body.contains(el);
  const turn = () => {
    if (!alive()) return;
    const ch = board.chess;
    if (ch.isGameOver()) { finish(ch.isCheckmate() ? (ch.turn() === opp ? 'win' : 'loss') : 'draw'); return; }
    if (plies >= 30) { finish(lastEval >= Math.max(150, startEval - 100) ? 'win-eval' : 'fail-eval'); return; }
    if (ch.turn() === color) board.allowMoves(color, () => { plies++; turn(); });
    else {
      pstat.innerHTML = 'Движок думает…';
      analyse(ch.fen(), { depth: 11 }).then(async r => {
        if (!alive()) return;
        const mv = r[0] && r[0].move; if (!mv) { finish('draw'); return; }
        board.play(mv); plies++;
        const e = await analyse(board.fen(), { depth: 10 });
        if (e[0]) lastEval = board.turn() === color ? e[0].cp : -e[0].cp;
        if (!alive()) return;
        pstat.innerHTML = `Полуходов: ${plies}/30 · оценка: <b>${fmtCp(lastEval)}</b> (старт ${fmtCp(startEval)})${lastEval < startEval - 100 ? ' — <span style="color:var(--bad)">перевес тает!</span>' : ''}`;
        if (lastEval < failAt()) { finish('fail-eval'); return; }
        turn();
      }).catch(() => finish(null));
    }
  };
  function finish(res) {
    if (stopped) return;
    stopped = true;
    board.lock();
    const ok = res === 'win' || res === 'win-eval';
    if (res) { const l = todayLog(); l.conv = (l.conv || 0) + 1; save(); }
    const msg = { win: 'Мат! Перевес реализован.', 'win-eval': 'Перевес сохранён и упрочен — техника на месте.', 'fail-eval': 'Перевес упущен. Посмотри, где оценка упала, и попробуй снова: проще, без лишнего риска.', loss: 'Поражение — бывает. Разбери, где был риск.', draw: 'Ничья — перевес не реализован.' }[res] || 'Доигрывание остановлено.';
    el.querySelector('.comment').insertAdjacentHTML('beforeend', `<div class="verdict ${ok ? 'good' : res ? 'bad' : ''} mt">${msg}</div><div class="row"><button class="btn small" data-a="again">Ещё раз</button></div>`);
    el.querySelector('[data-a=again]').onclick = () => playout(el, board, ex);
    if (!ok && res) toast('Перевес не реализован — попробуй ещё раз, проще и безопаснее');
  }
  analyse(ex.fen, { depth: 11 }).then(r => {
    startEval = lastEval = r[0] ? r[0].cp : 0;
    pstat.innerHTML = `Стартовая оценка: <b>${fmtCp(startEval)}</b>. Твой ход.`;
    turn();
  }).catch(() => { pstat.innerHTML = 'Движок не запустился в этом браузере.'; });
}
