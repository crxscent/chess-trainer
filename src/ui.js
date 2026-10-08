// Мелкие помощники для интерфейса
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function html(el, s) { el.innerHTML = s; return el; }

let toastT = null;
export function toast(msg, ms = 2200) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms);
}

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
export const pl = (n, one, few, many) => `${n} ${plural(n, one, few, many)}`;

export function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
export function fmtWhen(ts) {
  const diff = ts - Date.now();
  if (diff <= 0) return 'сейчас';
  const h = diff / 3600e3;
  if (h < 1) return 'меньше чем через час';
  if (h < 24) return `через ${Math.round(h)} ч`;
  const d = Math.round(h / 24);
  return `через ${pl(d, 'день', 'дня', 'дней')}`;
}
export function fmtMin(sec) { const m = Math.round(sec / 60); return m < 1 ? '<1 мин' : `${m} мин`; }

// Текст с разметкой ходов: {{uci|san}} -> кликабельный чип; **жирный**
export function richText(s, { fig } = {}) {
  return esc(s)
    .replace(/\{\{([a-h][1-8][a-h][1-8][qrbn]?)\|([^}]+)\}\}/g, (_, u, san) => `<span class="san" data-uci="${u}">${fig ? fig(san) : san}</span>`)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
}

export function bindSanChips(root, board) {
  root.addEventListener('mouseover', e => {
    const s = e.target.closest('.san[data-uci]'); if (!s) return;
    board.arrowUci(s.dataset.uci, s.dataset.brush || 'blue');
  });
  root.addEventListener('click', e => {
    const s = e.target.closest('.san[data-uci]'); if (!s) return;
    board.arrowUci(s.dataset.uci, s.dataset.brush || 'blue');
  });
}

export function confirmDlg(msg) { return window.confirm(msg); }

export function download(name, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

const cache = {};
export async function getJSON(path) {
  if (!cache[path]) cache[path] = fetch(path, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(path + ': ' + r.status); return r.json(); });
  return cache[path];
}

export function timerStart() { const t0 = Date.now(); return () => (Date.now() - t0) / 1000; }
