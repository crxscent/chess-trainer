"""rules_src.py -> data/rules.json. Позиции проверяются Stockfish; эндшпили (≤7 фигур) — базой lichess."""
import chess, chess.engine, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from rules_src import RULES, DRILLS, PLAYOUTS, AREAS
from build_lessons import build_items
from tablebase import tb
OUT = os.path.join(HERE, '..', 'data', 'rules.json')

BEST = {'win': 0, 'cursed-win': 1, 'maybe-win': 2, 'draw': 3, 'unknown': 4, 'maybe-loss': 5, 'blessed-loss': 6, 'loss': 7}
FLIP = {'win': 'loss', 'loss': 'win', 'cursed-win': 'blessed-loss', 'blessed-loss': 'cursed-win', 'maybe-win': 'maybe-loss', 'maybe-loss': 'maybe-win', 'draw': 'draw', 'unknown': 'unknown'}

def tb_moves(fen):
    """Категории ходов с точки зрения ходящего."""
    d = tb(fen)
    return d['category'], {m['uci']: FLIP[m['category']] for m in d['moves']}

eng = chess.engine.SimpleEngine.popen_uci('stockfish'); eng.configure({'Threads': 4, 'Hash': 256})
drills = build_items(DRILLS, eng, int(os.environ.get('DEPTH', '16')))
eng.quit()
# эндшпильные позиции — точная проверка базой
for d in drills:
    b = chess.Board(d['fen'])
    if len(b.piece_map()) > 7: continue
    cat, mv = tb_moves(d['fen'])
    bestc = min(mv.values(), key=lambda c: BEST[c])
    good = sorted(u for u, c in mv.items() if c == bestc)
    print(f"TB {d['id']}: {cat}; лучшие ({bestc}): {[b.san(chess.Move.from_uci(u)) for u in good]}")
    if d['type'] == 'move':
        bad = [u for u in d['accept'] if u not in good]
        if bad: print('   !!! принятые ходы не лучшие по базе:', bad)
        d['accept'] = good
        d['partial'] = [p for p in d.get('partial', []) if p[0] not in good]
for p in PLAYOUTS:
    cat, mv = tb_moves(p['fen'])
    need = 'draw' if p['goal'] == 'draw' else 'win'
    print(f"PLAYOUT {p['id']}: {cat} (нужно {need}) {'OK' if cat == need else '!!! НЕ СОВПАДАЕТ'}")
    b = chess.Board(p['fen']); p['color'] = 'w' if b.turn else 'b'
rules = []
for r in RULES:
    rr = dict(r)
    rr['drills'] = [d['id'] for d in drills if d.get('rule') == r['id']]
    rr['playouts'] = [p['id'] for p in PLAYOUTS if p['rule'] == r['id']]
    rr['links'] = r.get('links', {})
    rules.append(rr)
json.dump(dict(areas=[dict(id=a, t=t) for a, t in AREAS], rules=rules, drills=drills, playouts=PLAYOUTS),
          open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
print('rules', len(rules), 'drills', len(drills), 'playouts', len(PLAYOUTS))
