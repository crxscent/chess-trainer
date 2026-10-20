// Анализ особенностей позиции: пешечная структура, линии, форпосты, активность фигур.
// Работает по FEN без движка — для тренировки «оценка позиции».
const FILES = 'abcdefgh';
const NAME = { p: 'пешка', n: 'конь', b: 'слон', r: 'ладья', q: 'ферзь', k: 'король' };
const ACC = { n: 'коня', b: 'слона', r: 'ладью', q: 'ферзя' };
const SIDE = { w: 'белых', b: 'чёрных' };
const sq = (f, r) => FILES[f] + (r + 1);
const other = c => (c === 'w' ? 'b' : 'w');

function parse(fen) {
  const rows = fen.split(' ')[0].split('/');
  const B = {}; // 'e4' -> {c:'w', t:'p'}
  rows.forEach((row, i) => {
    let f = 0; const r = 7 - i;
    for (const ch of row) {
      if (/\d/.test(ch)) { f += +ch; continue; }
      B[sq(f, r)] = { c: ch === ch.toUpperCase() ? 'w' : 'b', t: ch.toLowerCase() };
      f++;
    }
  });
  return B;
}

const at = (B, f, r) => (f < 0 || f > 7 || r < 0 || r > 7 ? undefined : B[sq(f, r)]);
const fr = s => [FILES.indexOf(s[0]), +s[1] - 1];

function attacks(B, s) {
  const p = B[s]; const [f, r] = fr(s); const out = [];
  const ray = (df, dr) => { let x = f + df, y = r + dr; while (x >= 0 && x < 8 && y >= 0 && y < 8) { out.push(sq(x, y)); if (B[sq(x, y)]) break; x += df; y += dr; } };
  const step = (df, dr) => { const x = f + df, y = r + dr; if (x >= 0 && x < 8 && y >= 0 && y < 8) out.push(sq(x, y)); };
  if (p.t === 'p') { const d = p.c === 'w' ? 1 : -1; step(-1, d); step(1, d); }
  if (p.t === 'n') [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]].forEach(([a, b]) => step(a, b));
  if (p.t === 'b' || p.t === 'q') [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([a, b]) => ray(a, b));
  if (p.t === 'r' || p.t === 'q') [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, b]) => ray(a, b));
  if (p.t === 'k') [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([a, b]) => step(a, b));
  return out;
}

export function analyze(fen) {
  const B = parse(fen);
  const pawns = { w: [], b: [] };
  for (const [s, p] of Object.entries(B)) if (p.t === 'p') pawns[p.c].push(s);
  const fileHas = (c, f) => pawns[c].some(s => FILES.indexOf(s[0]) === f);
  const pawnAtt = { w: new Set(), b: new Set() };
  for (const c of ['w', 'b']) pawns[c].forEach(s => attacks(B, s).forEach(a => pawnAtt[c].add(a)));
  // может ли пешка цвета c когда-нибудь атаковать поле (f,r)
  const canPawnAttack = (c, f, r) => pawns[c].some(s => { const [pf, pr] = fr(s); return Math.abs(pf - f) === 1 && (c === 'w' ? pr < r : pr > r); });
  const res = { w: {}, b: {}, open: [] };
  for (let f = 0; f < 8; f++) if (!fileHas('w', f) && !fileHas('b', f)) res.open.push(FILES[f]);
  for (const c of ['w', 'b']) {
    const o = other(c); const R = res[c]; const dir = c === 'w' ? 1 : -1;
    R.isolated = pawns[c].filter(s => { const f = FILES.indexOf(s[0]); return !fileHas(c, f - 1) && !fileHas(c, f + 1); });
    R.doubled = [...new Set(pawns[c].map(s => s[0]))].filter(fl => pawns[c].filter(s => s[0] === fl).length > 1);
    R.passed = pawns[c].filter(s => { const [f, r] = fr(s); return !pawns[o].some(t => { const [tf, tr] = fr(t); return Math.abs(tf - f) <= 1 && (c === 'w' ? tr > r : tr < r); }); });
    R.backward = pawns[c].filter(s => {
      const [f, r] = fr(s); if (R.isolated.includes(s)) return false;
      const support = pawns[c].some(t => { const [tf, tr] = fr(t); return Math.abs(tf - f) === 1 && (c === 'w' ? tr <= r : tr >= r); });
      const front = sq(f, r + dir);
      return !support && pawnAtt[o].has(front) && !at(B, f, r + dir);
    });
    R.semiOpen = FILES.split('').filter((fl, f) => !fileHas(c, f) && fileHas(o, f));
    // форпосты для c: поля на половине соперника (4–6-я горизонталь), защищённые своей пешкой, где их не прогнать пешкой
    R.outposts = [];
    for (let f = 1; f < 7; f++) for (let r = 0; r < 8; r++) {
      const rel = c === 'w' ? r : 7 - r; if (rel < 3 || rel > 5) continue;
      const s = sq(f, r); if (B[s] && B[s].t === 'p') continue;
      if (pawnAtt[c].has(s) && !canPawnAttack(o, f, r)) R.outposts.push(s);
    }
    // дыры у короля
    const k = Object.keys(B).find(s => B[s].t === 'k' && B[s].c === c);
    R.king = k;
    R.kingHoles = [];
    if (k) { const [kf, kr] = fr(k); for (let df = -1; df <= 1; df++) for (const dr of [dir, 2 * dir]) { const f = kf + df, r = kr + dr; if (f < 0 || f > 7 || r < 0 || r > 7) continue; if (!canPawnAttack(c, f, r) && !(at(B, f, r) && at(B, f, r).t === 'p' && at(B, f, r).c === c)) R.kingHoles.push(sq(f, r)); } }
    R.bishops = Object.values(B).filter(p => p.c === c && p.t === 'b').length;
    R.material = Object.values(B).filter(p => p.c === c).reduce((a, p) => a + ({ p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 })[p.t], 0);
    const wing = (from, to) => pawns[c].filter(s => { const f = FILES.indexOf(s[0]); return f >= from && f <= to; }).length;
    R.qside = wing(0, 2); R.kside = wing(5, 7);
    R.pieces = Object.entries(B).filter(([, p]) => p.c === c && 'nbrq'.includes(p.t)).map(([s, p]) => {
      const mob = attacks(B, s).filter(a => !(B[a] && B[a].c === c) && !pawnAtt[o].has(a)).length;
      const norm = { n: 8, b: 13, r: 14, q: 27 }[p.t];
      return { sq: s, t: p.t, mob, k: mob / norm };
    }).sort((a, b) => a.k - b.k);
  }
  return res;
}

// Утверждения об особенностях позиции (истинные) — с точки зрения игрока color
export function featureFacts(fen, color) {
  const A = analyze(fen); const me = color, op = other(color); const F = [];
  const who = c => (c === me ? 'У тебя' : 'У соперника');
  for (const c of [op, me]) {
    const R = A[c];
    R.isolated.forEach(s => F.push({ key: `iso-${c}-${s}`, text: `${who(c)} изолированная пешка ${s}`, sq: [s], kind: 'weak', c }));
    R.backward.forEach(s => F.push({ key: `back-${c}-${s}`, text: `${who(c)} отсталая пешка ${s}`, sq: [s], kind: 'weak', c }));
    R.doubled.forEach(fl => F.push({ key: `dbl-${c}-${fl}`, text: `${who(c)} сдвоенные пешки на линии ${fl}`, sq: [], kind: 'weak', c }));
    R.passed.forEach(s => F.push({ key: `pass-${c}-${s}`, text: `${who(c)} проходная пешка ${s}`, sq: [s], kind: 'strong', c }));
    R.outposts.filter(s => true).slice(0, 3).forEach(s => F.push({ key: `out-${c}-${s}`, text: `${c === me ? 'Форпост для твоих фигур' : 'Форпост для фигур соперника'}: ${s}`, sq: [s], kind: 'square', c }));
    if (R.kingHoles.length >= 2) F.push({ key: `kh-${c}`, text: `${who(c)} ослаблено прикрытие короля (${R.kingHoles.slice(0, 3).join(', ')})`, sq: R.kingHoles.slice(0, 3), kind: 'king', c });
    if (R.bishops === 2 && A[other(c)].bishops < 2) F.push({ key: `bp-${c}`, text: `${who(c)} два слона`, sq: [], kind: 'piece', c });
    R.semiOpen.forEach(fl => F.push({ key: `semi-${c}-${fl}`, text: `${c === me ? 'Твоя' : 'У соперника'} полуоткрытая линия ${fl}`, sq: [], kind: 'line', c }));
    if (R.qside > A[other(c)].qside && R.qside - A[other(c)].qside >= 1 && A[other(c)].qside >= 0) F.push({ key: `maj-q-${c}`, text: `${who(c)} пешечное большинство на ферзевом фланге (${R.qside}:${A[other(c)].qside})`, sq: [], kind: 'structure', c });
    if (R.kside > A[other(c)].kside) F.push({ key: `maj-k-${c}`, text: `${who(c)} пешечное большинство на королевском фланге (${R.kside}:${A[other(c)].kside})`, sq: [], kind: 'structure', c });
    const worst = R.pieces[0];
    if (worst && worst.k < 0.3) F.push({ key: `pas-${c}-${worst.sq}`, text: `${c === me ? 'Твой' : 'У соперника'} пассивный ${NAME[worst.t]} ${worst.sq} (${worst.mob} безопасных ходов)`, sq: [worst.sq], kind: 'activity', c });
  }
  A.open.forEach(fl => F.push({ key: `open-${fl}`, text: `Открытая линия ${fl}`, sq: [], kind: 'line' }));
  const dm = A[me].material - A[op].material;
  if (dm) F.push({ key: 'mat', text: dm > 0 ? `У тебя материальный перевес (+${dm})` : `У соперника материальный перевес (+${-dm})`, sq: [], kind: 'material' });
  return F;
}

// Ложные утверждения для теста: меняем сторону или поле у истинных
export function factQuiz(fen, color, n = 6) {
  const truth = featureFacts(fen, color);
  const keys = new Set(truth.map(t => t.key));
  const fakes = [];
  const A = analyze(fen);
  const me = color, op = other(color);
  const tryAdd = (key, text) => { if (!keys.has(key) && !fakes.some(f => f.key === key)) fakes.push({ key, text, fake: true }); };
  for (const t of truth) {
    const m = t.key.split('-');
    if (m[0] === 'iso' || m[0] === 'back' || m[0] === 'pass') {
      const c2 = other(m[1]);
      const pawnsOf = Object.entries(parse(fen)).filter(([, p]) => p.t === 'p' && p.c === c2).map(([s]) => s);
      const s2 = pawnsOf.find(s => !keys.has(`${m[0]}-${c2}-${s}`));
      if (s2) tryAdd(`${m[0]}-${c2}-${s2}`, t.text.replace(/^У (тебя|соперника)/, c2 === me ? 'У тебя' : 'У соперника').replace(m[2], s2));
    }
    if (m[0] === 'open') { const fl = FILES.split('').find(x => !A.open.includes(x) && x !== m[1]); if (fl) tryAdd(`open-${fl}`, `Открытая линия ${fl}`); }
    if (m[0] === 'bp') tryAdd(`bp-${other(m[1])}`, t.text.replace(/^У (тебя|соперника)/, m[1] === me ? 'У соперника' : 'У тебя'));
  }
  // общие ложные кандидаты
  ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].forEach(fl => { if (!A.open.includes(fl)) tryAdd(`open-${fl}`, `Открытая линия ${fl}`); });
  const pick = (arr, k) => arr.slice().sort(() => Math.random() - 0.5).slice(0, k);
  const nTrue = Math.min(truth.length, Math.ceil(n / 2) + 1);
  const items = pick(truth, nTrue).map(t => ({ ...t, fake: false })).concat(pick(fakes, n - nTrue));
  return { items: items.sort(() => Math.random() - 0.5), truth };
}

// Что изменилось в структуре после хода/линии — для шагов «не помогает ли сопернику» и «после размена»
export function featureDiff(fenA, fenB, color) {
  const a = new Map(featureFacts(fenA, color).map(f => [f.key, f]));
  const b = new Map(featureFacts(fenB, color).map(f => [f.key, f]));
  const added = [...b.values()].filter(f => !a.has(f.key) && f.key !== 'mat' && !f.key.startsWith('pas-'));
  const gone = [...a.values()].filter(f => !b.has(f.key) && f.key !== 'mat' && !f.key.startsWith('pas-'));
  return { added, gone };
}
