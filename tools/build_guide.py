"""guide_src.py -> data/guide.json (позиции считаются из ходов, линии проверяются движком)."""
import chess, chess.engine, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from guide_src import GROUPS, TOPICS
OUT = os.path.join(HERE, '..', 'data', 'guide.json')
eng = chess.engine.SimpleEngine.popen_uci('stockfish'); eng.configure({'Threads': 4, 'Hash': 256})
cp = lambda s, c: s.pov(c).score(mate_score=10000)
out = []
for t in TOPICS:
    r = dict(id=t['id'], group=t['group'], title=t['title'], where=t.get('where'), sections=[dict(h=h, p=p) for h, p in t['sections']],
             links=[dict(t=a, href=b) for a, b in t.get('links', [])])
    if 'moves' in t or 'fen' in t:
        b = chess.Board(t['fen']) if 'fen' in t else chess.Board()
        last = None
        if 'moves' in t:
            for m in t['moves'].split(): b.push_san(m)
            last = b.peek().uci()
        r.update(fen=b.fen(), last=last, orient=t.get('orient', 'w' if b.turn else 'b'))
        r['arrows'] = [({'sq': a, 'brush': br} if a == z else {'from': a, 'to': z, 'brush': br}) for a, z, br in t.get('arrows', [])]
        info = eng.analyse(b, chess.engine.Limit(depth=16))
        msg = f"{t['id']}: eval {cp(info['score'], b.turn)} best {b.san(info['pv'][0])}"
        if t.get('line'):
            bb = b.copy(); ucis = []
            for m in t['line'].split():
                mv = bb.parse_san(m); ucis.append(mv.uci()); bb.push(mv)
            r['line'] = ucis
            first = chess.Move.from_uci(ucis[0])
            r2 = eng.analyse(b, chess.engine.Limit(depth=16), root_moves=[first])
            msg += f" | line first {b.san(first)} = {cp(r2['score'], b.turn)} (end mate={bb.is_checkmate()})"
        print(msg)
    out.append(r)
eng.quit()
json.dump(dict(groups=[dict(id=a, t=b) for a, b in GROUPS], topics=out), open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
print('topics', len(out))
