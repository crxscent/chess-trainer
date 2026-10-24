"""raw/an/games.jsonl (analyze_games.py) -> analysis.json + deep.jsonl для build_exercises.py"""
import json, math, os, sys, chess
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
def wp(cp): cp = max(-1500, min(1500, cp)); return 50 + 50 * (2 / (1 + math.exp(-0.00368208 * cp)) - 1)
G = []; deep = []
for k, line in enumerate(open(os.path.join(ROOT, 'raw', 'an', 'games.jsonl'))):
    g = json.loads(line); P = g['plies']; h = g['headers']
    col = h['White'].lower() == 'fem_t_o'
    G.append(dict(idx=k, headers=h, plies=P))
    ds = []
    for d in g['deep']:
        i = d['ply']; p = P[i]
        ev = {u: v[0] for u, v in d['moves'].items()}
        if p.get('played') not in ev: continue
        loss = wp(max(ev.values())) - wp(ev[p['played']])
        ds.append((loss, dict(gi=k, ply=i, fen=p['fen'], played=p['played'], col=col, moves=d['moves'],
                              threat=[d['threat'][0][1], [d['threat'][0][0]]] if d.get('threat') else None, tmulti=d.get('threat'))))
    for _, d in sorted(ds, key=lambda x: -x[0])[:5]: deep.append(d)
json.dump(G, open(os.path.join(ROOT, 'raw', 'analysis.json'), 'w'))
with open(os.path.join(ROOT, 'raw', 'deep.jsonl'), 'w') as f:
    for d in deep: f.write(json.dumps(d) + '\n')
print('games', len(G), 'candidates', len(deep))
