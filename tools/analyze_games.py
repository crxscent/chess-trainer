"""Анализ всех партий: оценка каждой позиции (depth 12), затем для «кандидатов» (ходы игрока с потерей ≥10% или позиции
атаки/защиты) — оценки всех ходов и угроза соперника. Пишет JSONL (можно прерывать и продолжать).
python analyze_games.py all.pgn out_dir"""
import chess, chess.pgn, chess.engine, json, os, sys, math, io
from multiprocessing import Pool
ME = 'fem_t_o'
def wp(cp): cp = max(-1500, min(1500, cp)); return 50 + 50 * (2 / (1 + math.exp(-0.00368208 * cp)) - 1)
def sc(s, pov): return s.pov(pov).score(mate_score=10000)

def work(pgn):
    g = chess.pgn.read_game(io.StringIO(pgn))
    h = dict(g.headers); col = chess.WHITE if h['White'].lower() == ME else chess.BLACK
    eng = chess.engine.SimpleEngine.popen_uci('stockfish'); eng.configure({'Threads': 1, 'Hash': 64})
    b = g.board(); plies = []
    for mv in list(g.mainline_moves()) + [None]:
        if b.is_game_over():
            r = b.result(); plies.append(dict(fen=b.fen(), ev=10000 if r == '1-0' else (-10000 if r == '0-1' else 0)))
        else:
            info = eng.analyse(b, chess.engine.Limit(depth=12, time=3))
            pv = info.get('pv', [])
            plies.append(dict(fen=b.fen(), ev=sc(info['score'], chess.WHITE), best=pv[0].uci() if pv else None, pv=[m.uci() for m in pv[:8]]))
        if mv is None: break
        plies[-1]['played'] = mv.uci(); plies[-1]['san'] = b.san(mv); b.push(mv)
    # кандидаты: ходы игрока
    deep = []
    for i, p in enumerate(plies[:-1]):
        bb = chess.Board(p['fen'])
        if bb.turn != col or bb.fullmove_number < 8: continue
        bef = p['ev'] if col else -p['ev']; aft = plies[i + 1]['ev'] if col else -plies[i + 1]['ev']
        loss = wp(bef) - wp(aft)
        if not (15 <= wp(bef) <= 99.5): continue
        kz = king_pressure(bb, col)
        if loss >= 10:
            n = bb.legal_moves.count()
            infos = eng.analyse(bb, chess.engine.Limit(depth=12, time=8), multipv=min(n, 50))
            moves = {x['pv'][0].uci(): [sc(x['score'], col), [m.uci() for m in x['pv'][:10]]] for x in infos if 'pv' in x}
            if p['played'] not in moves:
                r = eng.analyse(bb, chess.engine.Limit(depth=12, time=3), root_moves=[chess.Move.from_uci(p['played'])])
                moves[p['played']] = [sc(r['score'], col), [m.uci() for m in r['pv'][:10]]]
            threat = None
            if not bb.is_check():
                nb = chess.Board(bb.fen()); nb.turn = not nb.turn; nb.ep_square = None
                if nb.is_valid():
                    ti = eng.analyse(nb, chess.engine.Limit(depth=11, time=3), multipv=4)
                    threat = sorted([(x['pv'][0].uci(), sc(x['score'], col)) for x in ti if 'pv' in x], key=lambda t: t[1])
            deep.append(dict(ply=i, moves=moves, threat=threat, kz=kz))
    eng.quit()
    return dict(headers=h, plies=plies, deep=deep)

def king_pressure(b, col):
    """Сколько фигур нападает на зону короля: на моего (att_on_me) и соперника (att_on_opp)."""
    out = {}
    for name, side in (('att_on_me', col), ('att_on_opp', not col)):
        k = b.king(side); zone = chess.SquareSet(chess.BB_KING_ATTACKS[k]) | chess.SquareSet(chess.BB_SQUARES[k])
        atk = set()
        for s in zone:
            for a in b.attackers(not side, s):
                if b.piece_type_at(a) not in (chess.PAWN, chess.KING): atk.add(a)
        out[name] = len(atk)
    return out

if __name__ == '__main__':
    src, outd = sys.argv[1], sys.argv[2]; os.makedirs(outd, exist_ok=True)
    txt = open(src).read(); chunks = ['[Event' + c for c in txt.split('[Event')[1:]]
    outp = os.path.join(outd, 'games.jsonl')
    done = set()
    if os.path.exists(outp):
        for l in open(outp): done.add(json.loads(l)['headers'].get('GameId'))
    todo = [c for c in chunks if not any(f'[GameId "{d}"]' in c for d in done)]
    print('todo', len(todo), 'done', len(done), flush=True)
    with Pool(7) as pool, open(outp, 'a') as f:
        for k, r in enumerate(pool.imap_unordered(work, todo)):
            f.write(json.dumps(r) + '\n'); f.flush()
            if k % 25 == 0: print(k, flush=True)
