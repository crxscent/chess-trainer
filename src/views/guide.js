// Справочник: структуры, атакующие схемы, практика.
import { Board } from '../board.js';
import { esc, getJSON, richText } from '../ui.js';
import { lineViewer } from './exercise.js';

export async function renderGuide(app, id) {
  const G = await getJSON('data/guide.json');
  if (!id) {
    app.innerHTML = `
    <div class="page-head"><div class="eyebrow">Чтобы возвращаться</div><h1>Справочник</h1>
    <p>Короткие конспекты: пешечные структуры твоего репертуара (планы за обе стороны и типичные ошибки), атакующие схемы с условиями, когда они действительно работают, и практические темы — время, разбор партий, серия поражений, план на месяц.</p></div>
    ${G.groups.map(g => `<h2 class="mt2">${esc(g.t)}</h2><div class="list">${G.topics.filter(t => t.group === g.id).map(t => `
      <a class="item" href="#/guide/${t.id}"><div class="grow"><div class="title">${esc(t.title)}</div>${t.where ? `<div class="sub">${esc(t.where)}</div>` : ''}</div><span>→</span></a>`).join('')}</div>`).join('')}`;
    return () => { };
  }
  const t = G.topics.find(x => x.id === id);
  if (!t) { location.hash = '#/guide'; return () => { }; }
  const body = `
    <div class="row mb"><a class="btn small ghost" href="#/guide">← Справочник</a></div>
    <h1>${esc(t.title)}</h1>
    ${t.where ? `<p class="muted">Где встречается: ${esc(t.where)}</p>` : ''}
    ${t.sections.map(s => `<h3 class="mt">${esc(s.h)}</h3><ul>${s.p.map(p => `<li>${richText(p)}</li>`).join('')}</ul>`).join('')}
    ${t.links.length ? `<div class="row mt2">${t.links.map(l => `<a class="btn small" href="${esc(l.href)}">${esc(l.t)} →</a>`).join('')}</div>` : ''}`;
  if (!t.fen) {
    app.innerHTML = `<div class="card prose">${body}</div>`;
    return () => { };
  }
  app.innerHTML = `
  <div class="trainer">
    <div class="board-col"><div class="board-wrap"><div class="cgb"></div></div>
      ${t.line ? '<div class="row mt"><button class="btn small" id="showLine">▶ Показать на доске</button><button class="btn small ghost" id="reset">Исходная позиция</button></div><div id="lv"></div>' : ''}
    </div>
    <div class="panel"><div class="card prose">${body}</div></div>
  </div>`;
  const board = new Board(app.querySelector('.cgb'), { fen: t.fen, orientation: t.orient });
  const show = () => { board.setPosition(t.fen, t.last); board.arrows(t.arrows || []); };
  show();
  const sl = app.querySelector('#showLine');
  if (sl) {
    sl.onclick = () => lineViewer(app.querySelector('#lv'), board, t.fen, t.line, 'Типичная линия', t.last);
    app.querySelector('#reset').onclick = () => { app.querySelector('#lv').innerHTML = ''; show(); };
  }
  return () => board.destroy();
}

// Карточка за доской (печать)
export function renderCard(app) {
  app.innerHTML = `
  <div class="row mb noprint"><button class="btn primary" onclick="window.print()">Распечатать</button><span class="small muted">Положи рядом с доской или открой на телефоне перед партией.</span></div>
  <div class="card printcard">
    <h1>Перед каждым ходом</h1>
    <ol class="big">
      <li>Что изменилось после хода соперника? <b>Что он хочет?</b></li>
      <li><b>CCT:</b> какие шахи, взятия и угрозы будут у него после моего хода?</li>
      <li>Какая моя фигура стоит хуже всего — и можно ли улучшить её без пешечного хода?</li>
      <li>Если убрать тактику с доски, мой ход делает позицию лучше?</li>
    </ol>
    <div class="grid g2 mt">
      <div><h3>Пешечный ход?</h3><ul><li>Сначала 3 идеи без пешек.</li><li>Какое поле я ослабляю? Кто туда придёт?</li><li>Что этот ход создаёт на 5–10 ходов вперёд?</li></ul></div>
      <div><h3>Позиция лучше / выиграна</h3><ul><li>Какой самый <b>простой</b> путь?</li><li>Меняй фигуры, а не пешки.</li><li>Сначала убери контригру (форточка, слабости).</li><li>Не ускоряйся.</li></ul></div>
      <div><h3>Режимы</h3><ul><li>Улучшение → ограничение → накопление → атака.</li><li>Активный ход ≠ хороший ход.</li><li>Опережаешь в развитии — вскрывай.</li></ul></div>
      <div><h3>Время (10+5)</h3><ul><li>Дебют — 5–10 с на ход.</li><li>Обычный ход — 20–40 с.</li><li>Критический момент — 2–4 мин.</li><li>Два поражения подряд — перерыв.</li></ul></div>
    </div>
    <h3 class="mt">После партии</h3>
    <p>Первое ухудшение → мой план → идея соперника → 2–3 кандидата → почему ход хуже. Оценка по 5 пунктам: тактика · профилактика · улучшение фигур · пешечная структура · техника реализации. Только потом движок.</p>
  </div>`;
  return () => { };
}
