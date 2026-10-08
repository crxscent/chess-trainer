// Диагноз по 207 партиям (данные готовит tools/build_data.py)
import { esc, getJSON, richText } from '../ui.js';
import { CATS } from './exercise.js';

function hbars(rows, { fmt = v => v, cls = () => '', max = null } = {}) {
  const m = max ?? Math.max(1, ...rows.map(r => r.v));
  return `<div class="hbars">${rows.map(r => `<div class="hbar"><span>${esc(r.l)}</span><div class="track"><div class="fill ${cls(r)}" style="width:${Math.min(100, 100 * r.v / m)}%"></div></div><span class="num">${fmt(r.v, r)}</span></div>`).join('')}</div>`;
}

export async function renderDiagnosis(app, D) {
  const d = await getJSON('data/diagnosis.json');
  const pct = v => v.toFixed(1).replace('.', ',') + '%';
  const ru = t => String(t).replace(/(\d)\.(\d)/g, '$1,$2');
  app.innerHTML = `
  <div class="page-head"><div class="eyebrow">Анализ ${d.games} партий · ${esc(d.period)}</div><h1>Диагноз</h1>
  <p>Каждый твой ход проверен Stockfish. Ниже — не «сколько зевков», а <b>где и почему</b> ты теряешь партии.</p></div>
  <div class="grid g4">
    <div class="card stat"><div class="v">${d.score.win}–${d.score.loss}${d.score.draw ? '–' + d.score.draw : ''}</div><div class="l">победы – поражения${d.score.draw ? ' – ничьи' : ''}</div></div>
    <div class="card stat"><div class="v bad">${d.conversion.lost}</div><div class="l">проиграно из ${d.conversion.total} партий с выигранной позицией (85%+)</div></div>
    <div class="card stat"><div class="v warn">${pct(d.errBetter)}</div><div class="l">ходов-ошибок, когда позиция «просто лучше» (70–85%)</div></div>
    <div class="card stat"><div class="v">${d.medianFirstBad}</div><div class="l">медианный ход первой серьёзной ошибки в проигранных партиях</div></div>
  </div>
  <div class="card mt prose">
    <h2>Главное</h2>
    ${d.text.map(p => `<p>${richText(ru(p))}</p>`).join('')}
  </div>
  <div class="grid g2 mt">
    <div class="card"><h3>Доля ошибок по стадиям партии</h3>${hbars(d.phase.map(x => ({ l: x.l, v: x.v, n: x.n })), { fmt: (v, r) => pct(v), cls: r => r.v >= 8 ? 'bad' : '' })}<p class="small muted mt">Ошибка — ход, уменьшающий шансы на победу на 20%+.</p></div>
    <div class="card"><h3>Ошибки в зависимости от оценки позиции</h3>${hbars(d.byEval.map(x => ({ l: x.l, v: x.v })), { fmt: v => pct(v), cls: r => r.v >= 15 ? 'bad' : r.v >= 8 ? 'warn' : '' })}<p class="small muted mt">Самое опасное состояние для тебя — когда ты <b>чуть лучше</b>. Именно тогда хочется «сделать что-то активное».</p></div>
    <div class="card"><h3>Тихие ходы vs «активные»</h3>${hbars(d.moveKinds.map(x => ({ l: x.l, v: x.v })), { fmt: v => pct(v), cls: r => r.v >= 9 ? 'warn' : '' })}<p class="small muted mt">Тактику (шахи и взятия) ты считаешь нормально. Ошибки рождаются в тихих ходах — там, где нужен план и профилактика.</p></div>
    <div class="card"><h3>Пешечные ходы по вертикалям (после 10-го хода)</h3>${hbars(d.pawnFiles.map(x => ({ l: x.f + '-пешка (' + x.n + ')', v: x.v })), { fmt: v => pct(v), cls: r => r.v >= 15 ? 'bad' : '' })}<p class="small muted mt">Доля пешечных ходов, после которых оценка заметно ухудшилась (≥15%).</p></div>
    <div class="card"><h3>Типы твоих ошибок</h3>${hbars(d.cats.map(x => ({ l: CATS[x.c]?.t || x.c, v: x.n })), { fmt: v => v })}<p class="small muted mt">Из этих позиций собраны упражнения в разделе <a href="#/ex">«Мои ошибки»</a>.</p></div>
    <div class="card"><h3>Контроль времени</h3>${hbars(d.tc.map(x => ({ l: x.l, v: x.score })), { fmt: v => pct(v), max: 100 })}<p class="small muted mt">${esc(d.tcNote)}</p></div>
  </div>
  <div class="card mt"><h3>Дебюты в твоих партиях</h3>
    <table class="mvtable"><tbody>${d.openings.map(o => `<tr><td>${esc(o.l)}</td><td class="muted">${o.n} партий</td><td>${pct(o.score)}</td></tr>`).join('')}</tbody></table>
  </div>
  <div class="card mt"><h3>Партии, где выигрыш ушёл</h3><p class="small muted">Пик оценки → ход, после которого перевес исчез.</p>
    <div class="list">${d.collapses.map(c => `<a class="item" ${c.ex ? `href="#/ex/${encodeURIComponent(c.ex)}"` : `target="_blank" rel="noopener" href="https://lichess.org/${c.id}"`}><span class="badge bad">${esc(c.res)}</span><div class="grow"><div class="title">${esc(c.opp)} · ${esc(c.tc)}</div><div class="sub">${esc(c.desc)}</div></div><span>${c.ex ? 'задача →' : 'lichess ↗'}</span></a>`).join('')}</div>
  </div>`;
  return () => { };
}
