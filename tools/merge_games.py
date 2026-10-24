"""Склеить выгрузки lichess в один PGN без повторов. python merge_games.py out.pgn in1.pgn ..."""
import chess.pgn, sys
seen = set(); out = open(sys.argv[1], 'w'); n = 0
for p in sys.argv[2:]:
    f = open(p)
    while True:
        g = chess.pgn.read_game(f)
        if g is None: break
        gid = g.headers.get('GameId') or g.headers.get('Site', '').rsplit('/', 1)[-1]
        if not gid or gid in seen or g.headers.get('Variant', 'Standard') != 'Standard': continue
        if not list(g.mainline_moves()): continue
        seen.add(gid); n += 1
        print(g, file=out, end='\n\n')
print('games', n)
