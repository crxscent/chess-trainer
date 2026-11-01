// Как возникла позиция: партия от первого хода до задачи, с подписями и листанием.
import { Chess, uciToMove, fig } from '../board.js';
import { esc } from '../ui.js';
import { settings } from '../store.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
let GAMES = {}; let NOTES = {}; let fresh = true;

export function setStoryData(games, notes) { GAMES = games; NOTES = notes; }
export function setStoryFresh(v) { fresh = v; }

function historyOf(d) {
  if (d.gameRef) {
    const g = GAMES[d.gameRef.id]; if (!g) return null;
    const m = g.m.split(' ');
    return { start: START, ucis: m.slice(0, d.gameRef.ply), rest: m.slice(d.gameRef.ply), title: `Партия: ${g.w} – ${g.b}` };
  }
  if (d.path) return { start: d.start || START, ucis: d.path.split(' '), rest: [], title: d.start ? 'Позиция из урока: ходы от расстановки тренера' : 'Как возникла позиция' };
  return null;
}

export function mountStory(el, board, d, { fen, last, onEnd } = {}) {
  const h = historyOf(d);
  const plain = { begin: ready => ready(), end() { board.setPosition(fen, last); if (onEnd) onEnd(); }, atEnd: () => true, sync() { }, reveal() { }, close() { el.innerHTML = ''; }, destroy() { } };
  if (!h) { el.innerHTML = '<div class="small muted story-none">Учебная позиция: партии до неё нет.</div>'; return plain; }
  const c = new Chess(h.start); const fens = [h.start]; const sans = []; const ucis = [];
  const push = u => { let m; try { m = c.move(uciToMove(u)); } catch (e) { return false; } if (!m) return false; fens.push(c.fen()); sans.push(m); ucis.push(u); return true; };
  for (const u of h.ucis) if (!push(u)) { el.innerHTML = ''; return plain; }
  const base = ucis.length;
  let i = base; let ready = null; let timer = null; let revealed = false;
  const startNo = +h.start.split(' ')[5] || 1; const startW = h.start.split(' ')[1] === 'w';
  const delay = () => Math.max(220, Math.min(700, 18000 / Math.max(1, base)));
  const stop = () => { if (timer) { clearTimeout(timer); timer = null; } };

  function note() {
    if (i === base && !revealed) return ready ? '' : 'Позиция задачи.';
    if (i > base) return i === base + 1 ? 'Так в партии пошло дальше.' : '';
    return h.start === START && i ? NOTES[ucis.slice(0, i).join(' ')] || '' : '';
  }
  function render() {
    let out = []; let no = startNo; let w = startW;
    sans.forEach((m, k) => {
      if (w) out.push(`<span class="n">${no}.</span>`); else if (k === 0) out.push(`<span class="n">${no}...</span>`);
      out.push(`<span class="m ${k + 1 === i ? 'cur' : k + 1 > i ? 'future' : ''}${k + 1 === base ? ' goal' : ''}" data-k="${k + 1}">${esc(fig(m.san))}</span>`);
      if (!w) no++; w = !w;
    });
    el.innerHTML = `<div class="comment story"><div class="small muted mb">${esc(h.title)}</div><div class="moves">${out.join('')}</div>
      <div class="story-note">${esc(note())}</div>
      <div class="ctrl"><button class="btn small" data-v="0" title="К началу">⏮</button><button class="btn small" data-v="-1" title="Назад (←)">◀</button><button class="btn small" data-v="p" title="Проиграть">${timer ? '⏸' : '▷'}</button><button class="btn small" data-v="1" title="Вперёд (→)">▶</button><button class="btn small" data-v="9">${ready ? 'К задаче ⏭' : '⏭'}</button></div></div>`;
    const mv = el.querySelector('.moves'); const cur = mv.querySelector('.cur');
    if (cur) mv.scrollTop = Math.max(0, cur.offsetTop - mv.offsetTop - 24);
    el.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
      const v = b.dataset.v;
      if (v === 'p') { if (timer) { stop(); render(); } else run(); return; }
      stop(); go(v === '0' ? 0 : v === '9' ? (i < base ? base : ucis.length) : i + +v);
    });
    el.querySelectorAll('.m[data-k]').forEach(s => s.onclick = () => { stop(); go(+s.dataset.k); });
  }
  function go(n) {
    i = Math.max(0, Math.min(ucis.length, n));
    if (i === base) board.setPosition(fen, last); else board.setPosition(fens[i], i ? ucis[i - 1] : undefined);
    if (i === base) { const r = ready; ready = null; render(); if (r) r(); else if (onEnd) onEnd(); return; }
    render();
  }
  function run() {
    if (i >= base && !revealed) i = 0;
    if (i >= ucis.length) i = 0;
    const tick = () => {
      if (i >= (revealed ? ucis.length : base)) { timer = null; render(); return; }
      timer = setTimeout(tick, delay()); go(i + 1);
      if (i >= (revealed ? ucis.length : base)) { stop(); render(); }
    };
    board.setPosition(fens[i], i ? ucis[i - 1] : undefined);
    timer = setTimeout(tick, 450); render();
  }
  const key = e => {
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.key === 'ArrowLeft') { stop(); go(i - 1); e.preventDefault(); }
    if (e.key === 'ArrowRight') { stop(); go(i + 1); e.preventDefault(); }
  };
  document.addEventListener('keydown', key);
  const off = () => { stop(); document.removeEventListener('keydown', key); };
  return {
    begin(cb) {
      const mode = settings().story || 'new';
      if (mode === 'always' || (mode === 'new' && fresh)) { ready = cb; i = 0; run(); } else { render(); cb(); }
    },
    end() { stop(); go(base); },
    atEnd: () => i === base,
    sync() { stop(); i = base; render(); },
    // после ответа: своя партия продолжается дальше
    reveal() { revealed = true; h.rest.forEach(push); render(); },
    close() { off(); el.innerHTML = ''; },
    destroy: off,
  };
}
