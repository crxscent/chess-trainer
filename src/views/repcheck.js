// Проверка репертуара по своим партиям с lichess: где ты отклонился и где соперник вышел из книги.
import { Chess, uciToMove, sanOf, lineSan } from '../board.js';
import { analyse, engineAvailable, fmtCp } from '../engine.js';
import { esc, toast } from '../ui.js';
import { settings, save } from '../store.js';

const key = fen => fen.split(' ').slice(0, 4).join(' ');

function buildBook(D) {
  const book = new Map(); const known = new Set();
  for (const c of D.op.courses) for (const l of c.lines) {
    const ch = new Chess(); known.add(key(ch.fen()));
    for (const m of l.moves) {
      const k = key(ch.fen());
      if (ch.turn() === c.side) {
        if (!book.has(k)) book.set(k, new Map());
        if (!book.get(k).has(m.uci)) book.get(k).set(m.uci, l.id);
      }
      ch.move(uciToMove(m.uci)); known.add(key(ch.fen()));
    }
  }
  return { book, known };
}

export async function fetchGames(user, { max = 30, since = null } = {}) {
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(user)}?max=${max}&moves=true&opening=true&clocks=false&evals=false${since ? '&since=' + since : ''}`;
  const r = await fetch(url, { headers: { Accept: 'application/x-ndjson' } });
  if (!r.ok) throw new Error('lichess: HTTP ' + r.status);
  const txt = await r.text();
  return txt.trim().split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(g => g.moves && g.variant === 'standard');
}

export function renderRepCheck(app, D) {
  const { book, known } = buildBook(D);
  app.innerHTML = `
  <div class="page-head"><div class="eyebrow">Дебюты в живых партиях</div><h1>Проверка репертуара</h1>
  <p>Берём твои последние партии с lichess и сравниваем с репертуаром тренажёра: где <b>ты</b> отклонился от выученной линии и где <b>соперник</b> сыграл ход, которого нет в курсе. Для новинок соперника движок подскажет ответ.</p></div>
  <div class="card"><div class="row"><input type="text" id="u" value="${esc(settings().lichess)}" style="max-width:220px"><select id="n" style="max-width:160px"><option value="20">20 партий</option><option value="40" selected>40 партий</option><option value="80">80 партий</option></select><button class="btn primary" id="go">Проверить</button></div></div>
  <div id="out" class="mt"></div>`;
  app.querySelector('#go').onclick = run;
  let alive = true;

  async function run() {
    const user = app.querySelector('#u').value.trim(); if (!user) return;
    settings().lichess = user; save();
    const out = app.querySelector('#out'); out.innerHTML = '<p class="muted">Загружаю партии…</p>';
    let games;
    try { games = await fetchGames(user, { max: +app.querySelector('#n').value }); }
    catch (e) { out.innerHTML = `<p class="muted">Не удалось загрузить: ${esc(e.message)}</p>`; return; }
    const mineMap = new Map(); const novel = new Map(); let inBookPlies = 0; let noRep = 0;
    for (const g of games) {
      const white = (g.players.white.user?.name || '').toLowerCase() === user.toLowerCase();
      const col = white ? 'w' : 'b';
      const ch = new Chess(); let started = false;
      for (const san of g.moves.split(' ')) {
        const fen = ch.fen(); const k = key(fen);
        let mv; try { mv = ch.move(san); } catch (e) { break; }
        if (!mv) break;
        const uci = mv.from + mv.to + (mv.promotion || '');
        if (mv.color === col) {
          const b = book.get(k);
          if (!b) { if (!started) noRep++; break; }
          started = true;
          if (!b.has(uci)) {
            const mk = k + '|' + uci;
            if (!mineMap.has(mk)) mineMap.set(mk, { g, col, fen, san: mv.san, ply: ch.history().length, book: [...b.entries()], count: 0 });
            mineMap.get(mk).count++;
            break;
          }
          inBookPlies++;
        } else {
          if (!known.has(key(ch.fen()))) {
            const nk = k + '|' + uci;
            if (!novel.has(nk)) novel.set(nk, { fen, uci, san: mv.san, ply: ch.history().length, count: 0, games: [] });
            const n = novel.get(nk); n.count++; n.games.push(g.id);
            break;
          }
          started = true;
        }
      }
    }
    const novels = [...novel.values()].sort((a, b) => b.count - a.count);
    const mine = [...mineMap.values()].sort((a, b) => b.count - a.count || a.ply - b.ply);
    const devTotal = mine.reduce((a, m) => a + m.count, 0);
    const label = (ply, san) => `${Math.ceil(ply / 2)}${ply % 2 ? '.' : '...'}${san}`;
    out.innerHTML = `
      <div class="grid g3"><div class="card stat"><div class="v">${games.length}</div><div class="l">партий проверено</div></div>
      <div class="card stat"><div class="v ${devTotal ? 'warn' : 'good'}">${devTotal}</div><div class="l">раз ты отклонился от репертуара</div></div>
      <div class="card stat"><div class="v">${novels.length}</div><div class="l">новинок соперников (нет в курсе)</div></div></div>
      ${noRep ? `<p class="small muted mt">В ${noRep} партиях позиции вообще не было в курсах (например, другой первый ход). Это нормально — курсы покрывают выбранный репертуар.</p>` : ''}
      <h2 class="mt2">Где отклонился ты</h2>
      <div class="list">${mine.map(m => `<div class="item"><div class="grow"><div class="title">Ты: <b>${esc(label(m.ply, m.san))}</b>${m.count > 1 ? ` <span class="badge warn">${m.count}×</span>` : ''} · по репертуару: ${m.book.map(([u, lid]) => `<a href="#/line/${encodeURIComponent(lid)}"><b>${esc(sanOf(m.fen, u))}</b></a>`).join(' или ')}</div>
        <div class="sub">${esc(m.g.opening?.name || '')} · <a target="_blank" rel="noopener" href="https://lichess.org/${m.g.id}${m.col === 'b' ? '/black' : ''}#${m.ply}">партия ↗</a></div></div></div>`).join('') || '<p class="muted">Ни одного отклонения — отлично!</p>'}</div>
      <h2 class="mt2">Новинки соперников</h2>
      <p class="small muted">Ходы, которых нет в курсах. Частые — стоит выучить ответ.</p>
      <div class="list" id="nov">${novels.slice(0, 15).map((n, i) => `<div class="item"><div class="grow"><div class="title">${esc(label(n.ply, n.san))} <span class="badge">${n.count}×</span></div><div class="sub" id="nv${i}">${engineAvailable() ? 'движок думает…' : ''}</div></div><a class="btn small ghost" target="_blank" rel="noopener" href="https://lichess.org/${n.games[0]}#${n.ply}">партия ↗</a></div>`).join('') || '<p class="muted">Соперники играли строго по курсам.</p>'}</div>`;
    if (!engineAvailable()) return;
    for (let i = 0; i < Math.min(15, novels.length); i++) {
      if (!alive) return;
      const n = novels[i]; const c = new Chess(n.fen); c.move(uciToMove(n.uci));
      try {
        const r = await analyse(c.fen(), { depth: 13 });
        const el = app.querySelector('#nv' + i);
        if (el && r[0]) el.innerHTML = `Движок отвечает: <b>${esc(lineSan(c.fen(), r[0].pv, 4))}</b> (${fmtCp(r[0].cp)} для тебя)`;
      } catch (e) { }
    }
    toast('Проверка репертуара готова');
  }
  return () => { alive = false; };
}
