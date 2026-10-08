// Прогресс по модулям + настройки.
import { S, settings, save, summary, DAY, dayKey, streak, exportData, importData, resetAll } from '../store.js';
import { esc, pl, toast, download, fmtMin } from '../ui.js';
import { CATS } from './exercise.js';

function bar(s) {
  const t = Math.max(1, s.total);
  return `<div class="bar"><i class="g" style="width:${100 * s.mastered / t}%"></i><i class="o" style="width:${100 * s.review / t}%"></i><i class="w" style="width:${100 * (s.learning + s.due) / t}%"></i></div>`;
}
function rowS(title, s) {
  return `<div class="stack"><div class="row between small"><b>${esc(title)}</b><span class="muted">освоено ${s.mastered}/${s.total}${s.due ? ` · <span style="color:var(--warn)">повторить ${s.due}</span>` : ''}</span></div>${bar(s)}</div>`;
}

export function renderProgress(app, D) {
  const s = S();
  const days = s.days || {};
  const weeks = 18; const cells = [];
  const start = Date.now() - (weeks * 7 - 1) * DAY;
  let totalSec = 0, totalTasks = 0, activeDays = 0;
  Object.values(days).forEach(d => { totalSec += d.sec || 0; const n = (d.ex || 0) + (d.ls || 0) + (d.ol || 0); totalTasks += n; if (n) activeDays++; });
  for (let i = 0; i < weeks * 7; i++) {
    const k = dayKey(start + i * DAY); const d = days[k]; const n = d ? (d.ex + d.ls + d.ol) : 0;
    cells.push(`<i class="${n >= 20 ? 'l3' : n >= 8 ? 'l2' : n > 0 ? 'l1' : ''}" title="${k}: ${n}"></i>`);
  }
  const exAll = summary(D.ex.map(e => 'ex:' + e.id));
  const lsAll = summary(D.ls.map(l => 'ls:' + l.id));
  const olAll = summary(D.op.courses.flatMap(c => c.lines.map(l => 'ol:' + l.id)));
  const acc = Object.values(days).reduce((a, d) => ({ ok: a.ok + (d.ok || 0), bad: a.bad + (d.bad || 0) }), { ok: 0, bad: 0 });
  app.innerHTML = `
  <div class="page-head"><div class="eyebrow">Статистика</div><h1>Прогресс</h1>
  <p>Задача считается <b>освоенной</b>, когда интервал повторения дошёл до 3 недель — то есть ты несколько раз подряд решил её уверенно. Освоенные почти не показываются, поэтому одно и то же сто раз проходить не придётся.</p></div>
  <div class="grid g4">
    <div class="card stat"><div class="v">${streak()}</div><div class="l">дней подряд</div></div>
    <div class="card stat"><div class="v">${activeDays}</div><div class="l">дней с тренировкой</div></div>
    <div class="card stat"><div class="v">${totalTasks}</div><div class="l">заданий выполнено</div></div>
    <div class="card stat"><div class="v">${fmtMin(totalSec)}</div><div class="l">общее время</div></div>
  </div>
  <div class="card mt"><h3>Активность за ${weeks} недель</h3><div class="heat" style="grid-template-rows:repeat(7,14px);grid-auto-flow:column;grid-template-columns:none">${cells.join('')}</div>
  <p class="small muted mt">Точность: ${acc.ok + acc.bad ? Math.round(100 * acc.ok / (acc.ok + acc.bad)) : 0}% уверенных ответов.</p></div>
  <div class="grid g3 mt">
    <div class="card stack"><h3>Мои ошибки</h3>${rowS('Всего', exAll)}${Object.keys(CATS).filter(c => D.ex.some(e => e.cat === c)).map(c => rowS(CATS[c].t, summary(D.ex.filter(e => e.cat === c).map(e => 'ex:' + e.id)))).join('')}</div>
    <div class="card stack"><h3>Дебюты</h3>${rowS('Всего', olAll)}${D.op.courses.map(c => rowS(c.title, summary(c.lines.map(l => 'ol:' + l.id)))).join('')}</div>
    <div class="card stack"><h3>Школа плана</h3>${rowS('Всего', lsAll)}
      <p class="small muted">Легенда: <span style="color:var(--good)">■</span> освоено · <span style="color:var(--ok)">■</span> повторение · <span style="color:var(--warn)">■</span> изучается</p></div>
  </div>`;
  return () => { };
}

export function renderSettings(app, D, onReset) {
  const st = settings();
  app.innerHTML = `
  <div class="page-head"><div class="eyebrow">Настройки</div><h1>Настройки и прогресс</h1></div>
  <div class="grid g2">
    <div class="card">
      <h3>Тренировка</h3>
      <label class="f">Ник на lichess (для загрузки партий)</label><input type="text" id="s_l" value="${esc(st.lichess)}">
      <label class="f">Новых упражнений из партий в день</label><input type="number" id="s_ex" min="0" max="40" value="${st.newEx}">
      <label class="f">Новых задач «Школы плана» в день</label><input type="number" id="s_ls" min="0" max="20" value="${st.newLs}">
      <label class="f">Новых дебютных линий в день</label><input type="number" id="s_ol" min="0" max="20" value="${st.newOl}">
      <div class="checks mt">
        <label class="chk ${st.threatStep ? 'on' : ''}"><input type="checkbox" id="s_t" ${st.threatStep ? 'checked' : ''}>Шаг «Что хочет соперник?»</label>
        <label class="chk ${st.pieceStep ? 'on' : ''}"><input type="checkbox" id="s_p" ${st.pieceStep ? 'checked' : ''}>Шаг «Худшая фигура»</label>
      </div>
      <div class="row mt"><button class="btn primary" id="s_save">Сохранить</button></div>
    </div>
    <div class="card">
      <h3>Сохранение прогресса</h3>
      <p class="small muted">Прогресс хранится в этом браузере автоматически. Чтобы перенести его на другое устройство или подстраховаться — скачай файл и загрузи его там.</p>
      <div class="row"><button class="btn" id="exp">Скачать прогресс</button><label class="btn">Загрузить из файла<input type="file" id="imp" accept=".json,application/json" hidden></label></div>
      <hr>
      <p class="small muted">Сохранено: ${Object.keys(S().srs).length} карточек, ${(S().journal || []).length} разборов, ${(S().customEx || []).length} своих упражнений.</p>
      <button class="btn danger small" id="reset">Сбросить весь прогресс</button>
    </div>
  </div>`;
  app.querySelectorAll('.chk input').forEach(i => i.onchange = () => i.parentElement.classList.toggle('on', i.checked));
  app.querySelector('#s_save').onclick = () => {
    st.lichess = app.querySelector('#s_l').value.trim() || st.lichess;
    st.newEx = Math.max(0, +app.querySelector('#s_ex').value || 0);
    st.newLs = Math.max(0, +app.querySelector('#s_ls').value || 0);
    st.newOl = Math.max(0, +app.querySelector('#s_ol').value || 0);
    st.threatStep = app.querySelector('#s_t').checked; st.pieceStep = app.querySelector('#s_p').checked;
    save(true); toast('Сохранено');
  };
  app.querySelector('#exp').onclick = () => download(`chess-trainer-progress-${new Date().toISOString().slice(0, 10)}.json`, exportData());
  app.querySelector('#imp').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { importData(await f.text()); toast('Прогресс загружен'); onReset(); setTimeout(() => location.reload(), 600); }
    catch (err) { toast(err.message || 'Не удалось прочитать файл'); }
  };
  app.querySelector('#reset').onclick = () => {
    if (confirm('Точно сбросить весь прогресс? Это нельзя отменить. Сначала можно скачать файл прогресса.')) { resetAll(); onReset(); toast('Прогресс сброшен'); setTimeout(() => location.reload(), 600); }
  };
  return () => { };
}
