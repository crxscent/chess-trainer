// Разбор своей партии: сначала без движка (свои мысли), потом проверка движком.
import { Board, Chess, fig, sanOf, flipTurn, uciToMove } from '../board.js';
import { analyse, wp, fmtCp, engineAvailable } from '../engine.js';
import { esc, toast, $, pl } from '../ui.js';
import { S, settings, save, todayLog } from '../store.js';
import { MISTAKE_TAGS } from './exercise.js';
import { fetchGames } from './repcheck.js';

const CRIT = ['Тактика', 'Профилактика', 'Улучшение фигур', 'Пешечная структура', 'Техника реализации'];

export async function renderReview(app, D) {
  let board = null;
  const destroyBoard = () => { if (board) { board.destroy(); board = null; } };
  let G = null; // {headers, color, sans[], ucis[], fens[], id, opp, result}
  let notes = { firstBad: null, plan: '', oppWant: '', cands: '', why: '', tags: [], ratings: {} };
  let evals = null; // white-POV cp per ply position
  let ply = 0;
  let aborted = false;

  pick();

  // ---------- 1. выбор партии ----------
  function pick() {
    destroyBoard();
    app.innerHTML = `
    <div class="page-head"><div class="eyebrow">Разбор партии</div><h1>Сначала думаешь ты, потом движок</h1>
    <p>Для каждой проигранной партии найди: <b>первый момент, когда позиция ухудшилась</b>, какой был твой план, что хотел соперник, 2–3 кандидата и почему выбранный ход хуже. Не анализируй только последний зевок — он часто следствие более раннего решения.</p></div>
    <div class="card mb">
      <div class="row between"><div><h3 style="margin:0">Новые партии → новые упражнения</h3>
        <p class="small muted" style="margin:4px 0 0">Движок в браузере проверит твои партии ${S().lastImport ? 'с ' + new Date(S().lastImport).toLocaleDateString('ru-RU') : 'за последнее время'} и добавит твои ошибки в «Мои ошибки». Займёт несколько минут — можно не закрывать вкладку и заниматься другим.</p></div>
        <div class="row"><select id="impN" style="width:auto"><option value="5">5 партий</option><option value="10" selected>10 партий</option><option value="20">20 партий</option></select><button class="btn primary" id="imp">Обновить</button></div></div>
      <div id="impSt" class="small mt"></div>
    </div>
    <div class="grid g2">
      <div class="card">
        <h3>Мои партии с lichess</h3>
        <div class="row"><input type="text" id="lu" value="${esc(settings().lichess)}" style="max-width:220px"><button class="btn primary" id="load">Загрузить последние</button></div>
        <label class="chk mt" style="margin-top:10px"><input type="checkbox" id="onlyLoss" checked> только поражения</label>
        <div id="glist" class="list mt"></div>
      </div>
      <div class="card">
        <h3>Или вставь PGN</h3>
        <textarea id="pgn" placeholder="[Event ...]\n1. e4 e5 2. Nf3 ..." style="min-height:180px"></textarea>
        <div class="row mt"><select id="pcol" style="max-width:200px"><option value="auto">Цвет: определить по нику</option><option value="w">Я играл белыми</option><option value="b">Я играл чёрными</option></select><button class="btn" id="usePgn">Разобрать</button></div>
      </div>
    </div>`;
    $('#load').onclick = loadLichess;
    $('#imp').onclick = autoImport;
    $('#usePgn').onclick = () => {
      try {
        const c = new Chess(); c.loadPgn($('#pgn').value.trim());
        const h = c.header();
        const me = settings().lichess.toLowerCase();
        let col = $('#pcol').value;
        if (col === 'auto') col = (h.Black || '').toLowerCase() === me ? 'b' : 'w';
        const moves = c.history();
        const id = ((h.Site || '').match(/lichess\.org\/(\w{8})/) || [])[1] || null;
        start({ sans: moves, color: col, id, opp: col === 'w' ? h.Black : h.White, result: h.Result, date: h.Date, tc: h.TimeControl });
      } catch (e) { toast('Не удалось прочитать PGN'); }
    };
  }

  async function autoImport() {
    const st = $('#impSt'); const btn = $('#imp'); btn.disabled = true;
    const user = settings().lichess; const n = +$('#impN').value;
    if (!engineAvailable()) { st.textContent = 'Движок недоступен в этом браузере.'; return; }
    st.textContent = 'Загружаю партии…';
    let games;
    try { games = await fetchGames(user, { max: n, since: S().lastImport ? S().lastImport + 1 : null }); }
    catch (e) { st.textContent = 'Не удалось загрузить: ' + e.message; btn.disabled = false; return; }
    const done = new Set((S().customEx || []).map(e => e.id.split(':')[1]));
    games = games.filter(g => !done.has(g.id) && g.moves.split(' ').length >= 20);
    if (!games.length) { st.textContent = 'Новых партий нет — всё уже разобрано.'; btn.disabled = false; return; }
    let added = 0; let newest = S().lastImport || 0;
    for (let k = 0; k < games.length; k++) {
      if (aborted) return;
      const g = games[k];
      const white = (g.players.white.user?.name || '').toLowerCase() === user.toLowerCase();
      const opp = white ? g.players.black : g.players.white;
      const GG = gameFromSans(g.moves.split(' '), { color: white ? 'w' : 'b', id: g.id, opp: (opp.user?.name || 'аноним') + (opp.rating ? ` (${opp.rating})` : ''),
        date: new Date(g.createdAt).toLocaleDateString('ru-RU'), tc: g.clock ? `${g.clock.initial / 60}+${g.clock.increment}` : g.speed });
      const ev = await analyseGame(GG, { depth: 9, stopped: () => aborted, onProgress: (i, t) => { st.textContent = `Партия ${k + 1} из ${games.length} (${GG.opp}): позиция ${i}/${t}…`; } });
      if (!ev) return;
      const ms = mistakesOf(GG, ev, 15).filter(m => wp(m.before) >= 25 && m.i >= 8).sort((a, b) => b.drop - a.drop).slice(0, 3);
      st.textContent = `Партия ${k + 1} из ${games.length}: готовлю ${ms.length} упражн.…`;
      added += await makeExercisesFor(GG, ms);
      newest = Math.max(newest, g.createdAt);
      S().lastImport = newest; save(true);
    }
    st.innerHTML = `<span style="color:var(--good)">Готово: добавлено упражнений — ${added}.</span> <a href="#/ex" onclick="setTimeout(()=>location.reload(),50)">Открыть «Мои ошибки» →</a>`;
    toast(`Добавлено упражнений: ${added}`);
    btn.disabled = false;
  }

  async function loadLichess() {
    const u = $('#lu').value.trim(); if (!u) return;
    settings().lichess = u; save();
    const gl = $('#glist'); gl.innerHTML = '<p class="muted">Загружаю…</p>';
    try {
      const r = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(u)}?max=40&moves=true&opening=true&clocks=false&evals=false`, { headers: { Accept: 'application/x-ndjson' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const txt = await r.text();
      const games = txt.trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
      const only = $('#onlyLoss').checked;
      const items = games.map(g => {
        const white = (g.players.white.user?.name || '').toLowerCase() === u.toLowerCase();
        const col = white ? 'w' : 'b';
        const res = !g.winner ? 'draw' : (g.winner === (white ? 'white' : 'black') ? 'win' : 'loss');
        const opp = white ? g.players.black : g.players.white;
        const reviewed = (S().journal || []).some(j => j.gameId === g.id);
        return { g, col, res, opp: (opp.user?.name || 'аноним') + (opp.rating ? ` (${opp.rating})` : ''), reviewed };
      }).filter(x => x.g.moves && (!only || x.res === 'loss'));
      if (!items.length) { gl.innerHTML = '<p class="muted">Подходящих партий не нашлось.</p>'; return; }
      gl.innerHTML = items.map((x, i) => `<button class="item opt" data-i="${i}" style="width:100%">
        <span class="badge ${x.res === 'win' ? 'good' : x.res === 'loss' ? 'bad' : ''}">${{ win: 'победа', loss: 'поражение', draw: 'ничья' }[x.res]}</span>
        <div class="grow"><div class="title">${esc(x.opp)}</div><div class="sub">${new Date(x.g.createdAt).toLocaleDateString('ru-RU')} · ${esc(x.g.speed)} · ${esc(x.g.opening?.name || '')}</div></div>
        ${x.reviewed ? '<span class="badge good">разобрана</span>' : ''}</button>`).join('');
      gl.querySelectorAll('[data-i]').forEach(b => b.onclick = () => {
        const x = items[+b.dataset.i];
        start({ sans: x.g.moves.split(' '), color: x.col, id: x.g.id, opp: x.opp, result: x.res, date: new Date(x.g.createdAt).toLocaleDateString('ru-RU'), tc: x.g.clock ? `${x.g.clock.initial / 60}+${x.g.clock.increment}` : x.g.speed });
      });
    } catch (e) {
      gl.innerHTML = `<p class="muted">Не удалось загрузить: ${esc(e.message)}. Можно вставить PGN вручную.</p>`;
    }
  }

  function start(g) {
    const c = new Chess(); const fens = [c.fen()]; const ucis = []; const sans = [];
    for (const s of g.sans) { let m; try { m = c.move(s); } catch (e) { break; } if (!m) break; ucis.push(m.from + m.to + (m.promotion || '')); sans.push(m.san); fens.push(c.fen()); }
    G = Object.assign(g, { fens, ucis, sans });
    notes = { firstBad: null, plan: '', oppWant: '', cands: '', why: '', tags: [], ratings: {} };
    evals = null; ply = 0;
    think();
  }

  // ---------- 2. без движка ----------
  function think() {
    destroyBoard();
    app.innerHTML = `
    <div class="trainer">
      <div class="board-col">
        <div class="board-wrap"><div class="cgb"></div></div>
        <div class="ctrl"><button class="btn small" data-v="0">⏮</button><button class="btn small" data-v="-1">◀</button><button class="btn small" data-v="1">▶</button><button class="btn small" data-v="9">⏭</button></div>
        <div class="card mt"><div class="moves" id="mv"></div></div>
      </div>
      <div class="panel"><div class="card">
        <div class="row between"><span class="badge info">Шаг 1 · без движка</span><span class="small muted">${esc(G.opp || '')} · ${esc(G.date || '')}</span></div>
        <h2 class="mt">Восстанови ход мыслей</h2>
        <p class="small muted">Листай партию стрелками (← →). Найди <b>первый</b> момент, где позиция стала хуже, — не последний зевок.</p>
        <div class="row"><button class="btn" id="markBad">Отметить текущую позицию как первое ухудшение</button></div>
        <div id="badInfo" class="small mt"></div>
        <label class="f">Какой у меня был план в этот момент?</label><textarea id="nPlan"></textarea>
        <label class="f">Что хотел соперник?</label><textarea id="nOpp"></textarea>
        <label class="f">Какие были 2–3 кандидата?</label><input type="text" id="nCands" placeholder="например: Nd2, Re1, h3">
        <label class="f">Почему выбранный ход оказался хуже?</label><textarea id="nWhy"></textarea>
        <label class="f">Типичные ошибки в этой партии</label>
        <div class="checks">${MISTAKE_TAGS.map(t => `<label class="chk"><input type="checkbox" value="${esc(t)}">${esc(t)}</label>`).join('')}</div>
        <label class="f">Оценка себя по 5 пунктам</label>
        <div class="rating" id="rate">${CRIT.map(c => `<div class="small">${c}</div><div class="dots" data-c="${c}">${[1, 2, 3, 4, 5].map(n => `<button data-n="${n}">${n}</button>`).join('')}</div>`).join('')}</div>
        <div class="row mt2"><button class="btn primary" id="toEngine">${engineAvailable() ? 'Проверить движком →' : 'Сохранить (движок недоступен)'}</button><button class="btn ghost" id="back">← Другая партия</button></div>
      </div></div>
    </div>`;
    board = new Board($('.cgb', app), { orientation: G.color });
    const show = () => {
      board.setPosition(G.fens[ply], ply ? G.ucis[ply - 1] : null);
      renderMoves($('#mv'), G, ply, k => { ply = k; show(); }, evals);
    };
    app.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { const v = +b.dataset.v; ply = v === 0 ? 0 : v === 9 ? G.sans.length : Math.max(0, Math.min(G.sans.length, ply + v)); show(); });
    const key = e => { if (e.target.closest('input,textarea')) return; if (e.key === 'ArrowRight') { ply = Math.min(G.sans.length, ply + 1); show(); } if (e.key === 'ArrowLeft') { ply = Math.max(0, ply - 1); show(); } };
    document.addEventListener('keydown', key);
    keyCleanup = () => document.removeEventListener('keydown', key);
    const fill = () => {
      $('#nPlan').value = notes.plan; $('#nOpp').value = notes.oppWant; $('#nCands').value = notes.cands; $('#nWhy').value = notes.why;
      app.querySelectorAll('.checks input').forEach(i => { i.checked = notes.tags.includes(i.value); i.parentElement.classList.toggle('on', i.checked); });
      app.querySelectorAll('#rate .dots').forEach(d => d.querySelectorAll('button').forEach(x => x.classList.toggle('on', +x.dataset.n <= (notes.ratings[d.dataset.c] || 0))));
      $('#badInfo').innerHTML = notes.firstBad != null ? `Отмечено: после хода <b>${moveLabel(G, notes.firstBad)}</b>` : '';
    };
    const collect = () => {
      notes.plan = $('#nPlan').value; notes.oppWant = $('#nOpp').value; notes.cands = $('#nCands').value; notes.why = $('#nWhy').value;
      notes.tags = [...app.querySelectorAll('.checks input:checked')].map(i => i.value);
    };
    app.querySelectorAll('.checks input').forEach(i => i.onchange = () => i.parentElement.classList.toggle('on', i.checked));
    $('#rate').onclick = e => { const b = e.target.closest('button'); if (!b) return; const d = b.parentElement; notes.ratings[d.dataset.c] = +b.dataset.n; fill(); };
    $('#markBad').onclick = () => { notes.firstBad = ply; fill(); };
    $('#back').onclick = () => { keyCleanup(); pick(); };
    $('#toEngine').onclick = () => { collect(); keyCleanup(); if (engineAvailable()) check(); else { saveEntry(null); toast('Сохранено в дневник'); location.hash = '#/journal'; } };
    fill(); show();
  }
  let keyCleanup = () => { };

  // ---------- 3. проверка движком ----------
  async function check() {
    destroyBoard();
    app.innerHTML = `<div class="card" style="max-width:640px;margin:0 auto"><h2>Движок проверяет партию…</h2><div class="bar mt"><i class="a" id="pb" style="width:0%"></i></div><p class="small muted mt" id="pt">0 / ${G.fens.length}</p><button class="btn small ghost" id="ab">Прервать</button></div>`;
    $('#ab').onclick = () => { aborted = true; };
    aborted = false;
    const ev = await analyseGame(G, { depth: 10, stopped: () => aborted, onProgress: (k, n) => { const pb = $('#pb'); if (!pb) return; pb.style.width = (100 * k / n) + '%'; $('#pt').textContent = `${k} / ${n}`; } });
    if (!ev) { pick(); return; }
    evals = ev;
    results();
  }

  const myMistakes = () => mistakesOf(G, evals);

  function results() {
    const ms = myMistakes();
    const firstEng = ms.find(m => wp(m.before) >= 35);
    app.innerHTML = `
    <div class="trainer">
      <div class="board-col">
        <div class="board-wrap"><div class="cgb"></div></div>
        <div class="ctrl"><button class="btn small" data-v="-1">◀</button><button class="btn small" data-v="1">▶</button></div>
        <div class="card mt"><div class="moves" id="mv"></div></div>
      </div>
      <div class="panel"><div class="card">
        <span class="badge good">Шаг 2 · проверка движком</span>
        <h2 class="mt">Что показал движок</h2>
        <svg class="evalgraph" id="eg" viewBox="0 0 400 120" preserveAspectRatio="none"></svg>
        <div class="verdict ${firstEng && notes.firstBad != null && Math.abs(firstEng.ply - notes.firstBad) <= 2 ? 'good' : 'warn'} mt">
          ${firstEng ? `Первое серьёзное ухудшение по движку: <b>${moveLabel(G, firstEng.ply)}</b> (${fmtCp(firstEng.before)} → ${fmtCp(firstEng.after)}).` : 'Серьёзных ошибок движок не нашёл.'}
          ${notes.firstBad != null ? `<br>Ты отметил: <b>${moveLabel(G, notes.firstBad)}</b>.` : '<br>Ты не отметил момент ухудшения.'}
          ${firstEng && notes.firstBad != null && notes.firstBad > firstEng.ply + 2 ? '<br>Позиция испортилась <b>раньше</b>, чем тебе казалось — типичная ловушка «анализа только последнего зевка».' : ''}
        </div>
        <h3 class="mt">Твои ошибки (${ms.length})</h3>
        <div class="list">${ms.map(m => `<button class="item opt" data-p="${m.ply}" style="width:100%"><span class="badge ${m.drop >= 30 ? 'bad' : m.drop >= 20 ? 'warn' : ''}">${m.drop >= 30 ? 'зевок' : m.drop >= 20 ? 'ошибка' : 'неточность'}</span><div class="grow"><div class="title">${esc(moveLabel(G, m.ply))}</div><div class="sub">${fmtCp(m.before)} → ${fmtCp(m.after)}</div></div></button>`).join('') || '<p class="muted small">Нет.</p>'}</div>
        <div class="comment mt" id="best"></div>
        <div class="row mt2">
          <button class="btn primary" id="saveJ">Сохранить в дневник</button>
          ${ms.length ? `<button class="btn" id="mkEx">Сделать упражнения из ошибок (${Math.min(ms.length, 6)})</button>` : ''}
        </div>
      </div></div>
    </div>`;
    board = new Board($('.cgb', app), { orientation: G.color });
    const show = async () => {
      board.setPosition(G.fens[ply], ply ? G.ucis[ply - 1] : null);
      renderMoves($('#mv'), G, ply, k => { ply = k; show(); }, evals);
      drawGraph($('#eg'), evals, G.color, ply, k => { ply = k; show(); });
      const m = ms.find(x => x.ply === ply);
      const bestEl = $('#best');
      if (m) {
        const r = await analyse(G.fens[m.i], { depth: 12 });
        if (r[0] && $('#best')) { board.setPosition(G.fens[ply], G.ucis[ply - 1]); board.arrows([{ from: r[0].move.slice(0, 2), to: r[0].move.slice(2, 4), brush: 'green' }]); bestEl.innerHTML = `Вместо <b>${esc(fig(G.sans[m.i]))}</b> движок предлагает <b>${esc(fig(sanOf(G.fens[m.i], r[0].move)))}</b> (зелёная стрелка).`; }
      } else if (bestEl) bestEl.innerHTML = '<span class="muted small">Кликни ошибку в списке или точку на графике.</span>';
    };
    app.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { ply = Math.max(0, Math.min(G.sans.length, ply + +b.dataset.v)); show(); });
    app.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { ply = +b.dataset.p; show(); });
    $('#saveJ').onclick = () => { saveEntry(ms, firstEng); toast('Разбор сохранён в дневник'); location.hash = '#/journal'; };
    const mk = $('#mkEx');
    if (mk) mk.onclick = async () => {
      mk.disabled = true; mk.textContent = 'Готовлю упражнения…';
      const n = await makeExercises(ms.slice().sort((a, b) => b.drop - a.drop).slice(0, 6));
      saveEntry(ms, firstEng);
      toast(`Добавлено упражнений: ${n}. Они появятся в «Моих ошибках».`);
      location.hash = '#/ex'; location.reload();
    };
    ply = firstEng ? firstEng.ply : 0; show();
  }

  function saveEntry(ms, firstEng) {
    const s = S(); s.journal = s.journal || [];
    s.journal = s.journal.filter(j => !(G.id && j.gameId === G.id));
    s.journal.unshift({
      ts: Date.now(), full: true, gameId: G.id, opp: G.opp, color: G.color, result: G.result, date: G.date, tc: G.tc,
      firstBad: notes.firstBad, firstBadLabel: notes.firstBad != null ? moveLabel(G, notes.firstBad) : null,
      engineFirstBad: firstEng ? firstEng.ply : null, engineFirstBadLabel: firstEng ? moveLabel(G, firstEng.ply) : null,
      plan: notes.plan, oppWant: notes.oppWant, cands: notes.cands, why: notes.why, tags: notes.tags, ratings: notes.ratings,
      mistakes: (ms || []).map(m => ({ ply: m.ply, label: moveLabel(G, m.ply), drop: Math.round(m.drop) })),
    });
    save(true);
  }

  const makeExercises = list => makeExercisesFor(G, list);

  return () => { aborted = true; keyCleanup(); destroyBoard(); };
}

export async function makeExercisesFor(G, list) {
  let n = 0; const s = S(); s.customEx = s.customEx || [];
  for (const m of list) {
    const fen = G.fens[m.i]; const played = G.ucis[m.i];
    const id = `u:${G.id || 'pgn' + Date.now()}:${m.i}`;
    if (s.customEx.some(e => e.id === id)) continue;
    const c = new Chess(fen); const legal = c.moves().length;
    const r = await analyse(fen, { depth: 10, multipv: Math.min(legal, 40) });
    const sgn = 1; // оценки уже с точки зрения стороны на ходу (это мы)
    const evals = {}; const pvs = {};
    r.forEach(x => { evals[x.move] = sgn * x.cp; });
    r.slice(0, 3).forEach(x => { pvs[x.move] = x.pv.slice(0, 10); });
    if (evals[played] == null) { const q = await analyse(fen, { depth: 10, moves: [played] }); if (q[0]) evals[played] = q[0].cp; }
    let threat = null;
    if (!c.inCheck()) {
      const nf = flipTurn(fen);
      try { new Chess(nf); const t = await analyse(nf, { depth: 9, multipv: 3 }); if (t.length) { const base = Math.max(...Object.values(evals)); const mv = t.map(x => [x.move, -x.cp]).sort((a, b) => a[1] - b[1]); threat = { drop: base - mv[0][1], moves: mv, pv: t[0].pv.slice(0, 6) }; } } catch (e) { }
    }
    const after = await analyse(G.fens[m.i + 1], { depth: 10 });
    const mvObj = new Chess(fen).move(uciToMove(played));
    const before = Math.max(...Object.values(evals));
    let cat = 'plan';
    const replyCap = after[0] && new Chess(G.fens[m.i + 1]).move(uciToMove(after[0].move))?.captured;
    if (wp(m.before) >= 80) cat = 'convert';
    else if (threat && threat.drop >= 120 && after[0] && threat.moves.some(t => t[0] === after[0].move)) cat = 'threat';
    else if (mvObj.piece === 'p' && !mvObj.captured) cat = 'pawn';
    else if (mvObj.san.includes('+') || mvObj.captured) cat = 'active';
    else if (replyCap) cat = 'cct';
    const best = Object.entries(evals).sort((a, b) => b[1] - a[1])[0][0];
    const text = `В партии ты сыграл {{${played}|${mvObj.san}}}: оценка ${fmtCp(m.before)} → ${fmtCp(m.after)}. ` +
      (after[0] ? `Сильнейший ответ соперника — {{${after[0].move}|${sanOf(G.fens[m.i + 1], after[0].move)}}}. ` : '') +
      `Лучше было {{${best}|${sanOf(fen, best)}}} (${fmtCp(evals[best])}).` +
      (threat && threat.drop >= 120 ? ` Перед ходом у соперника была угроза {{${threat.moves[0][0]}|${sanOf(flipTurn(fen), threat.moves[0][0])}}}.` : '');
    s.customEx.push({
      id, cat, tags: ['custom'], fen, color: G.color, last: m.i ? G.ucis[m.i - 1] : null, prevFen: m.i ? G.fens[m.i - 1] : null,
      game: G.id ? { id: G.id, opp: G.opp, tc: G.tc || '', date: G.date || '', ply: m.i + 1, n: Math.floor(m.i / 2) + 1 } : null,
      played, evals, pvs, threat, after: after[0] ? { reply: after[0].move, pv: after[0].pv.slice(0, 8) } : null, text, before, weight: m.drop,
    });
    n++;
  }
  todayLog(); save(true);
  return n;
}

const RULE_BY_CAT = {
  threat: 'Перед ходом: «Если я сделаю нейтральный ход — что сделает соперник?» Сначала профилактика, потом свои идеи.',
  cct: 'CCT перед каждым ходом: какие шахи, взятия и угрозы будут у соперника после моего хода?',
  pawn: 'Правило «3 хода без пешек»: прежде чем двинуть пешку, найди три идеи без пешечных ходов.',
  active: 'Ход не становится хорошим только потому, что создаёт угрозу, выглядит агрессивно или заставляет соперника отвечать.',
  convert: 'Когда перевес большой — спроси: «какой самый ПРОСТОЙ способ выиграть?»',
  plan: 'Если убрать тактику с доски — твой ход всё ещё делает позицию лучше?',
};

// Партия из списка SAN -> позиции
export function gameFromSans(sans, meta) {
  const c = new Chess(); const fens = [c.fen()]; const ucis = []; const out = [];
  for (const s of sans) { let m; try { m = c.move(s); } catch (e) { break; } if (!m) break; ucis.push(m.from + m.to + (m.promotion || '')); out.push(m.san); fens.push(c.fen()); }
  return Object.assign({}, meta, { fens, ucis, sans: out });
}

// Оценки всех позиций партии (с точки зрения белых)
export async function analyseGame(G, { depth = 10, onProgress = null, stopped = () => false } = {}) {
  const ev = [];
  for (let i = 0; i < G.fens.length; i++) {
    if (stopped()) return null;
    const c = new Chess(G.fens[i]);
    if (c.isCheckmate()) ev.push(c.turn() === 'w' ? -10000 : 10000);
    else if (c.isDraw() || c.isStalemate()) ev.push(0);
    else { const r = await analyse(G.fens[i], { depth }); const cp = r[0] ? r[0].cp : 0; ev.push(c.turn() === 'w' ? cp : -cp); }
    onProgress && onProgress(i + 1, G.fens.length);
  }
  return ev;
}

export function mistakesOf(G, evals, minDrop = 12) {
  const out = [];
  for (let i = 0; i < G.sans.length; i++) {
    if ((i % 2 === 0 ? 'w' : 'b') !== G.color) continue;
    const s = G.color === 'w' ? 1 : -1;
    const b = s * evals[i], a = s * evals[i + 1];
    const drop = wp(b) - wp(a);
    if (drop >= minDrop) out.push({ ply: i + 1, i, drop, before: b, after: a });
  }
  return out;
}

function moveLabel(G, p) {
  if (!p) return 'начальная позиция';
  const i = p - 1; const no = Math.floor(i / 2) + 1;
  return `${no}${i % 2 === 0 ? '.' : '...'}${fig(G.sans[i])}`;
}

function renderMoves(el, G, ply, go, evals) {
  const out = [];
  G.sans.forEach((s, i) => {
    if (i % 2 === 0) out.push(`<span class="n">${i / 2 + 1}.</span>`);
    let mark = '';
    if (evals && ((i % 2 === 0) === (G.color === 'w'))) {
      const sg = G.color === 'w' ? 1 : -1; const d = wp(sg * evals[i]) - wp(sg * evals[i + 1]);
      mark = d >= 30 ? ' style="color:var(--bad);font-weight:700"' : d >= 20 ? ' style="color:var(--warn);font-weight:700"' : d >= 12 ? ' style="color:var(--warn)"' : '';
    }
    out.push(`<span class="m ${i + 1 === ply ? 'cur' : ''}" data-k="${i + 1}"${mark}>${esc(fig(s))}</span>`);
  });
  el.innerHTML = out.join(' ');
  el.querySelectorAll('[data-k]').forEach(s => s.onclick = () => go(+s.dataset.k));
  const cur = el.querySelector('.cur'); if (cur) cur.scrollIntoView({ block: 'nearest' });
}

function drawGraph(svg, evals, color, ply, go) {
  if (!svg) return;
  const n = evals.length; const W = 400, H = 120;
  const sg = color === 'w' ? 1 : -1;
  const pts = evals.map((e, i) => [i / Math.max(1, n - 1) * W, H - wp(sg * e) / 100 * H]);
  const path = 'M0,' + H + ' ' + pts.map(p => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + ` L${W},${H} Z`;
  const x = ply / Math.max(1, n - 1) * W;
  svg.innerHTML = `<line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="var(--line)" stroke-dasharray="4 4"/>
    <path d="${path}" fill="color-mix(in srgb, var(--accent) 35%, transparent)" stroke="var(--accent)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
    <line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="var(--info)" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
  svg.onclick = e => { const r = svg.getBoundingClientRect(); const k = Math.round((e.clientX - r.left) / r.width * (n - 1)); go(Math.max(0, Math.min(n - 1, k))); };
}
