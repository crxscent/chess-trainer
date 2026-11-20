"""Добавить тему «Пешечные прорывы» в data/endgames.json (без пересборки всего раздела). Ходы проверяются Stockfish."""
import chess, chess.engine, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from breaks_src import TOPIC, DRILLS
P = os.path.join(HERE, '..', 'data', 'endgames.json')
E = json.load(open(P))
E['topics'] = [t for t in E['topics'] if t['id'] != TOPIC['id']]
i = next(k for k, t in enumerate(E['topics']) if t['id'] == 'minor')
E['topics'].insert(i, TOPIC)
E['drills'] = [d for d in E['drills'] if d.get('topic') != TOPIC['id']]
eng = chess.engine.SimpleEngine.popen_uci('stockfish'); eng.configure({'Threads': 6, 'Hash': 1024})
out = []
try:
  for d in DRILLS:
      b = chess.Board(d['fen'])
      acc = [a if len(a) in (4, 5) and a[1].isdigit() and a[3].isdigit() else b.parse_san(a).uci() for a in d['accept']]
      infos = eng.analyse(b, chess.engine.Limit(depth=30, time=20), multipv=4)
      sc = lambda x: x['score'].pov(b.turn).score(mate_score=10000)
      best = sc(infos[0]); top = infos[0]['pv'][0].uci()
      print(d['id'], 'best', b.san(infos[0]['pv'][0]), best, '| accept', acc, [(b.san(x['pv'][0]), sc(x)) for x in infos])
      assert top in acc, d['id']
      others = [x['pv'][0].uci() for x in infos[1:] if sc(x) >= 300 and best >= 300 and x['pv'][0].uci() not in acc]
      r = dict(d, noHistory='Позиция из партии, разобранной в видео. Ходов до неё в видео нет.', topic=TOPIC['id'], type='move', theme='endgame', color='w' if b.turn else 'b', last=None, accept=acc,
               partial=[[u, 'Тоже выигрывает, но медленнее. Найди прорыв.'] for u in others], line=d.get('seq') or [m.uci() for m in infos[0]['pv'][:10]])
      out.append(r)
finally:
    eng.quit()
E['drills'] += out
json.dump(E, open(P, 'w'), ensure_ascii=False, separators=(',', ':'))
print('breaks', len(out))
