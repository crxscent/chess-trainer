// Stockfish (wasm, однопоточный) в Web Worker. Ленивая инициализация, очередь запросов.
let worker = null;
let ready = null;
let chain = Promise.resolve();
let handler = null;

function wasmOk() {
  try { return typeof WebAssembly === 'object' && WebAssembly.validate(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00)); }
  catch (e) { return false; }
}

function boot() {
  if (ready) return ready;
  ready = new Promise((resolve, reject) => {
    if (!wasmOk()) { reject(new Error('Браузер не поддерживает WebAssembly')); return; }
    try { worker = new Worker('vendor/stockfish.wasm.js'); }
    catch (e) { reject(e); return; }
    const t = setTimeout(() => reject(new Error('Движок не запустился')), 20000);
    worker.onmessage = e => {
      const line = typeof e.data === 'string' ? e.data : '';
      if (line === 'uciok') { worker.postMessage('setoption name Hash value 16'); worker.postMessage('isready'); }
      else if (line === 'readyok' && t) { clearTimeout(t); worker.onmessage = ev => handler && handler(String(ev.data)); resolve(); }
    };
    worker.onerror = err => { clearTimeout(t); reject(err); };
    worker.postMessage('uci');
  });
  return ready;
}

export function engineAvailable() { return wasmOk(); }

// Возвращает массив линий [{move, cp, mate, pv[], depth}] с оценкой с точки зрения стороны на ходу.
export function analyse(fen, { depth = 12, multipv = 1, movetime = null, moves = null } = {}) {
  const job = async () => {
    await boot();
    return new Promise(resolve => {
      const lines = new Map();
      handler = line => {
        if (line.startsWith('info') && line.includes(' pv ')) {
          const g = k => { const m = line.match(new RegExp(' ' + k + ' (\\S+)')); return m ? m[1] : null; };
          const mp = +(g('multipv') || 1);
          const d = +(g('depth') || 0);
          const sc = line.match(/score (cp|mate) (-?\d+)/);
          const pv = line.split(' pv ')[1].trim().split(/\s+/);
          if (!sc) return;
          const o = { depth: d, pv, move: pv[0] };
          if (sc[1] === 'cp') o.cp = +sc[2]; else { o.mate = +sc[2]; o.cp = o.mate > 0 ? 10000 - o.mate * 10 : -10000 - o.mate * 10; }
          if (line.includes('lowerbound') || line.includes('upperbound')) { if (lines.has(mp)) return; }
          lines.set(mp, o);
        } else if (line.startsWith('bestmove')) {
          handler = null;
          const arr = [...lines.entries()].sort((a, b) => a[0] - b[0]).map(x => x[1]);
          if (!arr.length) { const bm = line.split(' ')[1]; if (bm && bm !== '(none)') arr.push({ move: bm, cp: 0, pv: [bm], depth: 0 }); }
          resolve(arr);
        }
      };
      worker.postMessage('ucinewgame');
      worker.postMessage(`setoption name MultiPV value ${multipv}`);
      worker.postMessage(`position fen ${fen}`);
      const lim = movetime ? `movetime ${movetime}` : `depth ${depth}`;
      worker.postMessage(`go ${lim}${moves ? ' searchmoves ' + moves.join(' ') : ''}`);
    });
  };
  const p = chain.then(job, job);
  chain = p.catch(() => { });
  return p;
}

export function stop() { if (worker) worker.postMessage('stop'); }

// Оценка с точки зрения белых
export function whiteCp(fen, cp) { return fen.split(' ')[1] === 'w' ? cp : -cp; }

export function wp(cp) {
  const c = Math.max(-1500, Math.min(1500, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}

export function fmtCp(cp) {
  if (cp == null) return '—';
  if (Math.abs(cp) >= 9000) { const m = Math.round((10000 - Math.abs(cp)) / 10); return (cp > 0 ? '#' : '#-') + Math.max(1, m); }
  const v = (cp / 100);
  return (v > 0 ? '+' : '') + v.toFixed(1);
}
