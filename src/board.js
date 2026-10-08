// Обёртка над chessground + chess.js
import { Chessground } from 'chessground';
import { Chess } from 'chess.js';

export { Chess };

export function destsOf(chess) {
  const m = new Map();
  for (const mv of chess.moves({ verbose: true })) {
    if (!m.has(mv.from)) m.set(mv.from, []);
    m.get(mv.from).push(mv.to);
  }
  return m;
}

export const colorName = c => (c === 'w' || c === 'white') ? 'white' : 'black';
export const turnOf = fen => fen.split(' ')[1];

// Перевернуть очередь хода (для вопроса «что хочет соперник?»)
export function flipTurn(fen) {
  const p = fen.split(' ');
  p[1] = p[1] === 'w' ? 'b' : 'w';
  p[3] = '-';
  return p.join(' ');
}

export function uciToMove(uci) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined };
}

export function sanOf(fen, uci) {
  try { const c = new Chess(fen); const m = c.move(uciToMove(uci)); return m ? m.san : uci; }
  catch (e) { return uci; }
}

// Последовательность UCI -> SAN-строка с номерами ходов
export function lineSan(fen, ucis, max = 12) {
  const c = new Chess(fen); const out = [];
  let first = true;
  for (const u of ucis.slice(0, max)) {
    let m; try { m = c.move(uciToMove(u)); } catch (e) { break; }
    if (!m) break;
    const n = c.moveNumber();
    if (m.color === 'w') out.push(`${n}.${m.san}`);
    else out.push(first ? `${n - 1}...${m.san}` : m.san);
    first = false;
  }
  return out.join(' ');
}

// Нотация: латинские буквы, как на lichess по умолчанию (фигурки в системных шрифтах слишком мелкие)
export function fig(san) { return san; }

const BRUSHES = {
  green: { key: 'g', color: '#15781B', opacity: 1, lineWidth: 10 },
  red: { key: 'r', color: '#882020', opacity: 1, lineWidth: 10 },
  blue: { key: 'b', color: '#003088', opacity: 1, lineWidth: 10 },
  yellow: { key: 'y', color: '#e68f00', opacity: 1, lineWidth: 10 },
  paleBlue: { key: 'pb', color: '#003088', opacity: 0.4, lineWidth: 15 },
  paleGreen: { key: 'pg', color: '#15781B', opacity: 0.4, lineWidth: 15 },
  paleRed: { key: 'pr', color: '#882020', opacity: 0.4, lineWidth: 15 },
  paleGrey: { key: 'pgr', color: '#4a4a4a', opacity: 0.35, lineWidth: 15 },
};

export class Board {
  constructor(el, { fen = 'start', orientation = 'white', coordinates = true } = {}) {
    this.el = el;
    this.chess = new Chess(fen === 'start' ? undefined : fen);
    this.onMove = null;
    this.onSelect = null;
    this.cg = Chessground(el, {
      fen: this.chess.fen(),
      orientation: colorName(orientation),
      coordinates,
      animation: { enabled: true, duration: 180 },
      highlight: { lastMove: true, check: true },
      movable: { free: false, color: undefined, dests: new Map(), showDests: true, events: { after: (o, d) => this._after(o, d) } },
      premovable: { enabled: false },
      draggable: { enabled: true, showGhost: true },
      selectable: { enabled: true },
      events: { select: key => this.onSelect && this.onSelect(key) },
      drawable: { enabled: true, visible: true, brushes: BRUSHES, defaultSnapToValidMove: false },
      disableContextMenu: true,
    });
    this._ro = new ResizeObserver(() => this.cg.redrawAll());
    this._ro.observe(el);
  }
  destroy() { try { this._ro.disconnect(); this.cg.destroy(); } catch (e) { } }

  fen() { return this.chess.fen(); }
  turn() { return this.chess.turn(); }

  setOrientation(c) { this.cg.set({ orientation: colorName(c) }); }

  // Поставить позицию. lastMove — [from,to] или uci.
  setPosition(fen, lastMove) {
    this.chess = new Chess(fen);
    const lm = typeof lastMove === 'string' ? [lastMove.slice(0, 2), lastMove.slice(2, 4)] : lastMove;
    this.cg.set({
      fen, lastMove: lm || undefined, turnColor: colorName(this.chess.turn()),
      check: this.chess.inCheck() ? colorName(this.chess.turn()) : false,
      movable: { color: undefined, dests: new Map() },
    });
    this.cg.setAutoShapes([]);
    this.cg.setShapes([]);
    this.highlight({});
  }

  // Разрешить ходы за сторону color ('w'/'b'). cb(move) — объект хода chess.js
  allowMoves(color, cb) {
    this.onMove = cb;
    const c = this.chess.turn() === color ? color : null;
    this.cg.set({
      turnColor: colorName(this.chess.turn()),
      movable: { color: c ? colorName(c) : undefined, dests: c ? destsOf(this.chess) : new Map() },
    });
  }
  lock() { this.onMove = null; this.cg.set({ movable: { color: undefined, dests: new Map() } }); this.cg.selectSquare(null); }

  _after(orig, dest) {
    let mv = null;
    const piece = this.chess.get(orig);
    const promo = piece && piece.type === 'p' && (dest[1] === '8' || dest[1] === '1') ? 'q' : undefined;
    try { mv = this.chess.move({ from: orig, to: dest, promotion: promo }); } catch (e) { mv = null; }
    if (!mv) { this.cg.set({ fen: this.chess.fen() }); return; }
    this.sync(mv);
    const cb = this.onMove; this.lock();
    if (cb) cb(mv);
  }

  sync(mv) {
    this.cg.set({
      fen: this.chess.fen(),
      lastMove: mv ? [mv.from, mv.to] : undefined,
      turnColor: colorName(this.chess.turn()),
      check: this.chess.inCheck() ? colorName(this.chess.turn()) : false,
    });
  }

  // Сыграть ход программно (uci или san)
  play(m) {
    let mv = null;
    try { mv = typeof m === 'string' && /^[a-h][1-8][a-h][1-8]/.test(m) ? this.chess.move(uciToMove(m)) : this.chess.move(m); } catch (e) { mv = null; }
    if (!mv) return null;
    this.sync(mv); // chessground сам анимирует разницу позиций
    return mv;
  }

  arrows(list) {
    // list: [{from,to,brush}] или [{sq,brush}] для кружков
    this.cg.setAutoShapes(list.map(a => a.sq ? { orig: a.sq, brush: a.brush || 'green' } : { orig: a.from, dest: a.to, brush: a.brush || 'green' }));
  }
  arrowUci(uci, brush = 'green') { this.arrows([{ from: uci.slice(0, 2), to: uci.slice(2, 4), brush }]); }
  clearArrows() { this.cg.setAutoShapes([]); }

  highlight(map) {
    // map: { e4: 'mark-bad', ... }
    const m = new Map(Object.entries(map || {}));
    this.cg.set({ highlight: { custom: m } });
  }
}
