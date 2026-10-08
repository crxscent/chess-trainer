"""Проверка дебютных PGN: легальность + оценка наших ходов движком.
Печатает ходы, которые теряют больше THR сантипешек относительно лучшего, и оценки в концах линий."""
import chess, chess.pgn, chess.engine, sys, os
THR=int(os.environ.get("THR","60")); DEPTH=int(os.environ.get("DEPTH","16"))
def cp(score, pov):
    s=score.pov(pov)
    return s.score(mate_score=10000)
def walk(node, path, out):
    if not node.variations: out.append(path); return
    for v in node.variations: walk(v, path+[v], out)
for fn in sys.argv[1:]:
    g=chess.pgn.read_game(open(fn))
    if g.errors: print("PGN ERRORS",fn,g.errors)
    side=chess.WHITE if g.headers.get("Side","w")=="w" else chess.BLACK
    eng=chess.engine.SimpleEngine.popen_uci("stockfish"); eng.configure({"Threads":2,"Hash":128})
    lines=[]; walk(g,[],lines)
    seen={}
    print("==",fn,"lines:",len(lines))
    for ln in lines:
        b=g.board()
        for n in ln:
            key=(b.fen(), n.move.uci())
            if b.turn==side and key not in seen:
                infos=eng.analyse(b,chess.engine.Limit(depth=DEPTH),multipv=3)
                best=cp(infos[0]["score"],side)
                mine=None
                for i in infos:
                    if i["pv"][0]==n.move: mine=cp(i["score"],side)
                if mine is None:
                    r=eng.analyse(b,chess.engine.Limit(depth=DEPTH),root_moves=[n.move]); mine=cp(r["score"],side)
                seen[key]=1
                if best-mine>THR:
                    tops=", ".join(f"{b.san(i['pv'][0])}({cp(i['score'],side)})" for i in infos)
                    print(f"  !! {b.fullmove_number}{'.' if b.turn else '...'}{b.san(n.move)} = {mine} vs best {best}: {tops}  | {' '.join(x.san() for x in ln[:ln.index(n)])}")
            b.push(n.move)
        info=eng.analyse(b,chess.engine.Limit(depth=DEPTH))
        print(f"  leaf {cp(info['score'],side):+5d}  {g.board().variation_san([x.move for x in ln])}")
    eng.quit()
