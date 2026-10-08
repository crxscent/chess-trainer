"""top.py 'e4 e5 Nf3 ...' [depth] -> топ-4 хода с оценкой (с точки зрения стороны на ходу) и PV."""
import chess, chess.engine, sys
moves=sys.argv[1].split(); depth=int(sys.argv[2]) if len(sys.argv)>2 else 18
b=chess.Board()
for m in moves: b.push_san(m)
eng=chess.engine.SimpleEngine.popen_uci("stockfish"); eng.configure({"Threads":4,"Hash":256})
for i in eng.analyse(b,chess.engine.Limit(depth=depth),multipv=4):
    print(f"{i['score'].pov(b.turn).score(mate_score=10000):+5d}  {b.variation_san(i['pv'][:10])}")
eng.quit()
