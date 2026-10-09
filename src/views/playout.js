// Доигрывание эндшпиля против идеальной защиты (эндшпильная база lichess, до 7 фигур).
import { Board, Chess, fig, sanOf } from '../board.js';
import { esc, richText } from '../ui.js';

const FLIP = { win: 'loss', loss: 'win', 'cursed-win': 'blessed-loss', 'blessed-loss': 'cursed-win', 'maybe-win': 'maybe-loss', 'maybe-loss': 'maybe-win', draw: 'draw', unknown: 'unknown' };
const RANK = { win: 0, 'cursed-win': 1, 'maybe-win': 2, draw: 3, unknown: 4, 'maybe-loss': 5, 'blessed-loss': 6, loss: 7 };
const cache = new Map();

async function probe(fen) {
  const key = fen.split(' ').slice(0, 4).join(' ');
  if (cache.has(key)) return cache.get(key);
  let lastErr;
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch('https://tablebase.lichess.ovh/standard?fen=' + encodeURIComponent(fen));
      if (r.status === 429) { await new Promise(res => setTimeout(res, 1200 * (a + 1))); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      // категории ходов — с точки зрения того, кто ходит сейчас
      d.my = Object.fromEntries(d.moves.map(m => [m.uci, FLIP[m.category] || 'unknown']));
      cache.set(key, d);
      return d;
    } catch (e) { lastErr = e; await new Promise(res => setTimeout(res, 600)); }
  }
  throw lastErr || new Error('нет связи');
}

const GOAL_T = { mate: 'Поставь мат', win: 'Выиграй', draw: 'Удержи ничью' };

export function mountPlayout(root, p, { onDone, sessionInfo = '', ruleTitle = '' } = {}) {
  const color = p.color;
  const opp = color === 'w' ? 'b' : 'w';
  root.innerHTML = `
  <div class="trainer">
    <div class="board-col">
      <div class="board-wrap"><div class="cgb"></div></div>
      <div class="board-meta"><span><span class="turn-dot ${color}"></span>Ты играешь ${color === 'w' ? 'белыми' : 'чёрными'}</span><span class="mv"></span></div>
    </div>
    <div class="panel"><div class="card">
      <div class="row between mb"><div class="row"><span class="badge good">Эндшпиль против базы</span>${ruleTitle ? `<span class="badge">${esc(ruleTitle)}</span>` : ''}</div><span class="timer">${esc(sessionInfo)}</span></div>
      <h2>${esc(p.title)}</h2>
      <p><b>${GOAL_T[p.goal]}</b>${p.goal === 'draw' ? ` — продержись ${p.maxMoves} ходов` : ` — не больше чем за ${p.maxMoves} ходов`}. Соперник защищается идеально: каждый его ход взят из эндшпильной базы.</p>
      <details class="mb"><summary>Подсказка</summary><p class="small mt">${richText(p.hint)}</p></details>
      <div class="status comment">Загружаю базу…</div>
      <div class="row mt actions"></div>
    </div></div>
  </div>`;
  const board = new Board(root.querySelector('.cgb'), { fen: p.fen, orientation: color });
  const status = root.querySelector('.status');
  const actions = root.querySelector('.actions');
  const mvEl = root.querySelector('.mv');
  let myMoves = 0; let failures = 0; let dead = false; let busy = false;

  const need = p.goal === 'draw' ? 'draw' : 'win';
  const okCat = c => need === 'win' ? (c === 'win' || c === 'cursed-win' || c === 'maybe-win') : RANK[c] <= RANK.draw;

  function setStatus(html, cls = '') { status.className = 'status comment ' + (cls ? 'verdict ' + cls : ''); status.innerHTML = html; }

  async function start() {
    board.setPosition(p.fen); myMoves = 0;
    actions.innerHTML = '';
    mvEl.textContent = '';
    try { await probe(p.fen); } catch (e) { setStatus('Не удалось связаться с эндшпильной базой lichess. Проверь интернет и попробуй ещё раз.', 'bad'); actions.innerHTML = '<button class="btn" data-a="retry">Ещё раз</button>'; actions.querySelector('[data-a=retry]').onclick = start; return; }
    setStatus('Твой ход.');
    yourTurn();
  }

  function yourTurn() {
    if (dead) return;
    const ch = board.chess;
    if (ch.isGameOver()) return finish();
    board.allowMoves(color, mv => onMine(mv));
  }

  async function onMine(mv) {
    if (busy) return; busy = true;
    const uci = mv.from + mv.to + (mv.promotion || '');
    myMoves++;
    mvEl.textContent = `Ход ${myMoves} из ${p.maxMoves}`;
    let d;
    try { d = await probe(prevFen); } catch (e) { setStatus('Нет связи с базой.', 'bad'); busy = false; return; }
    const cat = d.my[uci];
    if (!okCat(cat)) {
      failures++;
      const best = Object.entries(d.my).filter(([, c]) => RANK[c] === Math.min(...Object.values(d.my).map(x => RANK[x]))).map(([u]) => u);
      const goodSans = best.slice(0, 4).map(u => fig(sanOf(prevFen, u))).join(', ');
      setStatus(`<b>${esc(fig(mv.san))}</b> — ${need === 'win' ? 'выигрыш упущен' : 'эта позиция уже проиграна'}. Правильно было: <b>${esc(goodSans)}</b>.`, 'bad');
      board.arrows(best.slice(0, 3).map(u => ({ from: u.slice(0, 2), to: u.slice(2, 4), brush: 'green' })));
      actions.innerHTML = '<button class="btn" data-a="undo">Вернуть ход и попробовать снова</button><button class="btn ghost" data-a="restart">Сначала</button><button class="btn ghost" data-a="give">Завершить</button>';
      actions.querySelector('[data-a=undo]').onclick = () => { board.setPosition(prevFen, prevLast); myMoves--; mvEl.textContent = `Ход ${myMoves} из ${p.maxMoves}`; actions.innerHTML = ''; setStatus('Твой ход.'); busy = false; yourTurn(); };
      actions.querySelector('[data-a=restart]').onclick = () => { busy = false; start(); };
      actions.querySelector('[data-a=give]').onclick = () => done(0);
      busy = false;
      return;
    }
    // успех по условиям
    const ch = board.chess;
    if (ch.isCheckmate()) { busy = false; return finish(); }
    if (p.goal === 'win' && mv.promotion && okCat(cat)) { busy = false; return win('Пешка превратилась, выигрыш сохранён.'); }
    if (p.goal === 'draw' && myMoves >= p.maxMoves) { busy = false; return win(`Ты продержался ${p.maxMoves} ходов — ничья в руках.`); }
    if (p.goal !== 'draw' && myMoves >= p.maxMoves) { busy = false; return lose(`Выигрыш сохранён, но ${p.maxMoves} ходов не хватило — техника должна быть быстрее.`); }
    if (ch.isGameOver()) { busy = false; return finish(); }
    // ход соперника
    setStatus('Соперник думает…');
    let d2;
    try { d2 = await probe(ch.fen()); } catch (e) { setStatus('Нет связи с базой.', 'bad'); busy = false; return; }
    if (dead) return;
    const entries = Object.entries(d2.my);
    const bestRank = Math.min(...entries.map(([, c]) => RANK[c]));
    let cands = d2.moves.filter(m => RANK[d2.my[m.uci]] === bestRank);
    // при выигрыше соперник тянет время (максимальный dtz), при ничьей — выбираем случайный из лучших
    if (bestRank >= RANK['blessed-loss']) cands.sort((a, b) => Math.abs(b.dtm ?? b.dtz ?? 0) - Math.abs(a.dtm ?? a.dtz ?? 0));
    const pick = bestRank === RANK.draw ? cands[Math.floor(Math.random() * cands.length)] : cands[0];
    await new Promise(r => setTimeout(r, 350));
    if (dead) return;
    board.play(pick.uci);
    prevFen = board.fen(); prevLast = pick.uci;
    busy = false;
    if (board.chess.isGameOver()) return finish();
    setStatus(`Соперник: <b>${esc(fig(pick.san))}</b>. Твой ход.`);
    yourTurn();
  }
  let prevFen = p.fen; let prevLast = null;
  // запоминаем позицию перед своим ходом
  const origAllow = board.allowMoves.bind(board);
  board.allowMoves = (c, cb) => { prevFen = board.fen(); origAllow(c, cb); };

  function finish() {
    const ch = board.chess;
    if (ch.isCheckmate()) return ch.turn() === opp ? win('Мат!') : lose('Мат тебе.');
    if (ch.isDraw() || ch.isStalemate()) return p.goal === 'draw' ? win('Ничья!') : lose(ch.isStalemate() ? 'Пат! Следи за свободными полями короля соперника.' : 'Ничья — выигрыш упущен.');
  }
  function win(msg) {
    board.lock();
    setStatus(`<b>${esc(msg)}</b> ${failures ? `Ошибок по ходу: ${failures}.` : 'Без единой ошибки!'}`, 'good');
    actions.innerHTML = '<button class="btn" data-a="again">Ещё раз</button><button class="btn primary" data-a="done">Дальше →</button>';
    actions.querySelector('[data-a=again]').onclick = () => { failures = 0; start(); };
    actions.querySelector('[data-a=done]').onclick = () => done(failures === 0 ? 3 : failures === 1 ? 1 : 0);
  }
  function lose(msg) {
    board.lock();
    setStatus(esc(msg), 'bad');
    actions.innerHTML = '<button class="btn" data-a="again">Ещё раз</button><button class="btn ghost" data-a="done">Дальше →</button>';
    actions.querySelector('[data-a=again]').onclick = () => { failures++; start(); };
    actions.querySelector('[data-a=done]').onclick = () => done(0);
  }
  function done(g) { dead = true; board.destroy(); onDone && onDone(g); }

  start();
  return { destroy: () => { dead = true; board.destroy(); } };
}
