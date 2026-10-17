"""Эндшпили до 7 фигур из своих партий: где твой ход по эндшпильной базе ухудшил результат.
python endgame_mine.py out.json games1.pgn games2.pgn ..."""
import chess, chess.pgn, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from tablebase import tb
ME = 'fem_t_o'
FLIP = {'win': 'loss', 'loss': 'win', 'cursed-win': 'blessed-loss', 'blessed-loss': 'cursed-win', 'maybe-win': 'maybe-loss', 'maybe-loss': 'maybe-win', 'draw': 'draw', 'unknown': 'unknown'}
CLS = lambda c: 'win' if c in ('win', 'maybe-win') else ('loss' if c in ('loss', 'maybe-loss') else 'draw')
out = []; seen = set(); n = 0
for path in sys.argv[2:]:
    f = open(path)
    while True:
        g = chess.pgn.read_game(f)
        if g is None: break
        gid = g.headers.get('Site', '').rsplit('/', 1)[-1]
        if gid in seen: continue
        seen.add(gid); n += 1
        if g.headers.get('Variant', 'Standard') != 'Standard': continue
        col = chess.WHITE if g.headers.get('White', '').lower() == ME else chess.BLACK
        b = g.board(); prev = None; ply = 0
        for mv in g.mainline_moves():
            if b.turn == col and len(b.piece_map()) <= 7 and not b.castling_rights:
                d = tb(b.fen())
                cats = {m['uci']: CLS(FLIP[m['category']]) for m in d['moves']}
                best = min(cats.values(), key=lambda c: ['win', 'draw', 'loss'].index(c))
                mine = cats.get(mv.uci())
                if mine and mine != best:
                    opp = g.headers['Black'] if col else g.headers['White']
                    out.append(dict(game=gid, fen=b.fen(), last=prev, played=mv.uci(), san=b.san(mv), best=best, got=mine,
                                    color='w' if col else 'b', n=b.fullmove_number, ply=ply + 1, opp=opp,
                                    date=g.headers.get('Date', '').replace('.', '-'), tc=g.headers.get('TimeControl', ''),
                                    good=[u for u, c in cats.items() if c == best]))
                    break  # первая ошибка в эндшпиле этой партии
            prev = mv.uci(); b.push(mv); ply += 1
json.dump(out, open(sys.argv[1], 'w'), ensure_ascii=False)
print('games', n, 'endgame mistakes', len(out))
for o in out: print(o['game'], o['n'], o['san'], o['best'], '->', o['got'], len(chess.Board(o['fen']).piece_map()), 'pieces')
