// Тренажёры визуализации: поля, цвет полей, ходы коня, позиция по памяти.
import { Board, Chess } from '../board.js';
import { esc, toast } from '../ui.js';
import { S, save } from '../store.js';

const FILES = 'abcdefgh';
const rnd = n => Math.floor(Math.random() * n);
const randSq = () => FILES[rnd(8)] + (rnd(8) + 1);
const isLight = sq => (FILES.indexOf(sq[0]) + +sq[1]) % 2 === 1;
function knightDist(a, b) {
  const q = [[a, 0]]; const seen = new Set([a]);
  while (q.length) {
    const [s, d] = q.shift(); if (s === b) return d;
    const f = FILES.indexOf(s[0]), r = +s[1];
    for (const [df, dr] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) {
      const nf = f + df, nr = r + dr; if (nf < 0 || nf > 7 || nr < 1 || nr > 8) continue;
      const n = FILES[nf] + nr; if (!seen.has(n)) { seen.add(n); q.push([n, d + 1]); }
    }
  }
  return -1;
}
const PIECE_RU = { p: 'пешка', n: 'конь', b: 'слон', r: 'ладья', q: 'ферзь', k: 'король' };

function best(key) { const v = S().vision || {}; return (v[key] && v[key].best) || 0; }
function record(key, score) {
  const s = S(); s.vision = s.vision || {};
  const v = s.vision[key] = s.vision[key] || { best: 0, runs: [] };
  const isBest = score > v.best; if (isBest) v.best = score;
  v.runs = (v.runs || []).concat([[Date.now(), score]]).slice(-30); save();
  return isBest;
}

function squareFromEvent(el, e, orientation) {
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
  if (x < 0 || x >= 1 || y < 0 || y >= 1) return null;
  let f = Math.floor(x * 8), rank = 7 - Math.floor(y * 8);
  if (orientation === 'black') { f = 7 - f; rank = 7 - rank; }
  return FILES[f] + (rank + 1);
}

export function renderVision(app, D) {
  let board = null; let timer = null; let cleanupFns = [];
  const stop = () => { clearInterval(timer); timer = null; cleanupFns.forEach(f => f()); cleanupFns = []; if (board) { board.destroy(); board = null; } };
  menu();

  function menu() {
    stop();
    const modes = [
      ['square', 'Найди поле', 'Называется поле — кликни его на доске без координат. 30 секунд. Ускоряет счёт вариантов и запись партии.'],
      ['color', 'Цвет поля', 'Светлое или тёмное? 30 секунд. Нужен, чтобы мгновенно видеть диагонали слонов.'],
      ['knight', 'Маршруты коня', 'За сколько ходов конь дойдёт с одного поля на другое? 10 вопросов, в уме.'],
      ['memory', 'Позиция по памяти', 'Позиция из твоих партий показывается на 12 секунд, потом фигуры исчезают. Найди, где что стояло.'],
    ];
    app.innerHTML = `
    <div class="page-head"><div class="eyebrow">Тренажёры зрения</div><h1>Визуализация</h1>
    <p>Короткие упражнения на 1–3 минуты. Чем лучше ты видишь доску в уме, тем точнее CCT и счёт вариантов. Делай одно-два перед игрой как разминку.</p></div>
    <div class="grid g2">${modes.map(([k, t, d]) => `<div class="card course-card"><h3 style="margin:0">${t}</h3><p class="small muted" style="margin:0">${d}</p><div class="row between"><span class="small muted">рекорд: <b>${best(k)}</b></span><button class="btn primary small" data-m="${k}">Начать</button></div></div>`).join('')}</div>`;
    app.querySelectorAll('[data-m]').forEach(b => b.onclick = () => ({ square, color, knight, memory })[b.dataset.m]());
  }

  function shell(title, extra = '') {
    app.innerHTML = `
    <div class="trainer">
      <div class="board-col"><div class="board-wrap"><div class="cgb"></div></div></div>
      <div class="panel"><div class="card">
        <div class="row between"><h2 style="margin:0">${title}</h2><span class="badge accent" id="tm"></span></div>
        <div id="q" class="mt" style="font-size:2.2rem;font-weight:800;letter-spacing:.02em"></div>
        <div id="ctl" class="row mt">${extra}</div>
        <div id="fb" class="mt"></div>
        <div class="row mt2"><button class="btn ghost" id="back">← К упражнениям</button></div>
      </div></div>
    </div>`;
    app.querySelector('#back').onclick = menu;
  }

  function countdown(sec, onEnd) {
    const tm = app.querySelector('#tm'); let left = sec; tm.textContent = left + ' с';
    timer = setInterval(() => { left--; tm.textContent = left + ' с'; if (left <= 0) { clearInterval(timer); timer = null; onEnd(); } }, 1000);
  }

  function finishRun(key, score, unit) {
    const isBest = record(key, score);
    app.querySelector('#q').textContent = `${score} ${unit}`;
    app.querySelector('#fb').innerHTML = `<div class="verdict ${isBest ? 'good' : ''}">${isBest ? 'Новый рекорд!' : `Рекорд: ${best(key)}`}</div>`;
    app.querySelector('#ctl').innerHTML = '<button class="btn primary" id="again">Ещё раз</button>';
    app.querySelector('#again').onclick = () => ({ square, color, knight, memory })[key]();
  }

  function square() {
    stop(); shell('Найди поле', '<label class="chk"><input type="checkbox" id="flip"> за чёрных</label>');
    const flipEl = app.querySelector('#flip');
    let orient = 'white';
    board = new Board(app.querySelector('.cgb'), { fen: '8/8/8/8/8/8/8/8 w - - 0 1', orientation: orient, coordinates: false });
    board.cg.set({ viewOnly: true });
    let target = randSq(); let score = 0; let running = true;
    const q = app.querySelector('#q'); q.textContent = target;
    flipEl.onchange = () => { orient = flipEl.checked ? 'black' : 'white'; board.setOrientation(orient); };
    const el = app.querySelector('.cgb');
    const handler = e => {
      if (!running) return;
      const sq = squareFromEvent(el, e, orient); if (!sq) return;
      if (sq === target) { score++; board.highlight({ [sq]: 'mark-good' }); target = randSq(); q.textContent = target; }
      else board.highlight({ [sq]: 'mark-bad', [target]: 'mark-good' });
    };
    el.addEventListener('pointerdown', handler); cleanupFns.push(() => el.removeEventListener('pointerdown', handler));
    countdown(30, () => { running = false; finishRun('square', score, 'полей'); });
  }

  function color() {
    stop(); shell('Цвет поля', '<button class="btn" data-c="1" style="min-width:120px">Светлое</button><button class="btn" data-c="0" style="min-width:120px;background:#333;color:#eee">Тёмное</button>');
    board = new Board(app.querySelector('.cgb'), { fen: '8/8/8/8/8/8/8/8 w - - 0 1', coordinates: true });
    board.cg.set({ viewOnly: true });
    let target = randSq(); let score = 0; let running = true;
    const q = app.querySelector('#q'); q.textContent = target;
    app.querySelectorAll('[data-c]').forEach(b => b.onclick = () => {
      if (!running) return;
      const ok = (+b.dataset.c === 1) === isLight(target);
      board.highlight({ [target]: ok ? 'mark-good' : 'mark-bad' });
      if (ok) score++; else toast(`${target} — ${isLight(target) ? 'светлое' : 'тёмное'}`, 900);
      target = randSq(); q.textContent = target;
    });
    countdown(30, () => { running = false; finishRun('color', score, 'верно'); });
  }

  function knight() {
    stop(); shell('Маршруты коня', [1, 2, 3, 4, 5, 6].map(n => `<button class="btn" data-n="${n}" style="min-width:48px">${n}</button>`).join(''));
    board = new Board(app.querySelector('.cgb'), { fen: '8/8/8/8/8/8/8/8 w - - 0 1', coordinates: true });
    board.cg.set({ viewOnly: true });
    let k = 0; let score = 0; const t0 = Date.now(); let a, b, d;
    const q = app.querySelector('#q');
    const next = () => {
      if (k >= 10) { const sec = Math.round((Date.now() - t0) / 1000); finishRun('knight', score, `из 10 (${sec} с)`); return; }
      do { a = randSq(); b = randSq(); d = knightDist(a, b); } while (d < 2 || d > 5);
      q.textContent = `${a} → ${b}`;
      board.setPosition(`8/8/8/8/8/8/8/8 w - - 0 1`); board.cg.set({ viewOnly: true });
      board.highlight({ [a]: 'mark-sel', [b]: 'mark-good' });
      app.querySelector('#tm').textContent = `${k + 1}/10`;
    };
    app.querySelectorAll('[data-n]').forEach(btn => btn.onclick = () => {
      if (k >= 10) return;
      const ok = +btn.dataset.n === d; if (ok) score++;
      app.querySelector('#fb').innerHTML = `<div class="verdict ${ok ? 'good' : 'bad'}">${a} → ${b}: ${d} ${d === 1 ? 'ход' : d < 5 ? 'хода' : 'ходов'}</div>`;
      k++; next();
    });
    next();
  }

  function memory() {
    stop(); shell('Позиция по памяти');
    const pool = D.ex.filter(e => new Chess(e.fen).board().flat().filter(Boolean).length >= 12);
    const ex = pool[rnd(pool.length)];
    const ch = new Chess(ex.fen);
    const orient = ex.color === 'w' ? 'white' : 'black';
    board = new Board(app.querySelector('.cgb'), { fen: ex.fen, orientation: orient });
    board.cg.set({ viewOnly: true });
    const q = app.querySelector('#q'); q.style.fontSize = '1.2rem';
    q.textContent = 'Запоминай расстановку…';
    // вопросы: фигуры, кроме пешек; для повторяющихся — «любой»
    const pieces = []; ch.board().forEach(row => row.forEach(p => { if (p && p.type !== 'p') pieces.push(p); }));
    const qs = []; const used = new Set();
    for (const p of pieces.sort(() => Math.random() - .5)) {
      const key = p.color + p.type; if (used.has(key)) continue; used.add(key);
      const all = pieces.filter(x => x.color === p.color && x.type === p.type).map(x => x.square);
      qs.push({ text: `${all.length > 1 ? 'Любой: ' : ''}${p.color === 'w' ? 'белый' : 'чёрный'} ${PIECE_RU[p.type]}`.replace('белый ладья', 'белая ладья').replace('чёрный ладья', 'чёрная ладья'), squares: all });
      if (qs.length >= 5) break;
    }
    let k = 0; let score = 0; let accepting = false;
    const el = app.querySelector('.cgb');
    const handler = e => {
      if (!accepting) return;
      const sq = squareFromEvent(el, e, orient); if (!sq) return;
      const cur = qs[k]; const ok = cur.squares.includes(sq); if (ok) score++;
      const hl = {}; cur.squares.forEach(s => hl[s] = 'mark-good'); if (!ok) hl[sq] = 'mark-bad';
      board.highlight(hl);
      k++;
      if (k >= qs.length) { accepting = false; board.setPosition(ex.fen); board.cg.set({ viewOnly: true }); finishRun('memory', score, `из ${qs.length}`); return; }
      q.textContent = qs[k].text;
    };
    el.addEventListener('pointerdown', handler); cleanupFns.push(() => el.removeEventListener('pointerdown', handler));
    countdown(12, () => {
      board.setPosition('8/8/8/8/8/8/8/8 w - - 0 1'); board.cg.set({ viewOnly: true });
      app.querySelector('#tm').textContent = 'вспоминай';
      accepting = true; q.textContent = qs[0].text;
      app.querySelector('#fb').innerHTML = '<p class="small muted">Кликни поле, где стояла фигура.</p>';
    });
  }

  return stop;
}
