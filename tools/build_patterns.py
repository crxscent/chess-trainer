"""patterns_src.py -> data/patterns.json. Задачи lichess (raw/patterns_puz.json: позиция, решение, ходы партии до неё),
позиции из дебютов (build_items + Stockfish), позиции из своих партий (data/games.json), ссылки на задачи «Эндшпиля»."""
import chess, chess.engine, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from build_lessons import build_items
from patterns_src import INTRO, GROUPS, P, PUZ, L, OWN, FEN, EG
ROOT = os.path.join(HERE, '..')
WHO = {True: 'белых', False: 'чёрных'}


def path_of(moves):
    b = chess.Board(); return ' '.join(b.push_san(s).uci() for s in moves.split())


eng = chess.engine.SimpleEngine.popen_uci('stockfish'); eng.configure({'Threads': 4, 'Hash': 512})
drills = []; items = {p[0]: [] for p in P}
# 1) задачи lichess
puz = json.load(open(os.path.join(ROOT, 'raw', 'patterns_puz.json')))
for pid, (pat, title, expl) in PUZ.items():
    x = puz[pid]; b = chess.Board(x['fen']); mv = x['moves'].split(); b.push_uci(mv[0])
    drills.append(dict(id='pz-' + pid, title=title, theme='pattern', type='move', fen=b.fen(), color='w' if b.turn else 'b', last=mv[0],
                       q=f'Ход {WHO[b.turn]}. Найди выигрыш.', accept=[mv[1]], seq=mv[1:], partial=[], explain=expl, line=mv[1:],
                       path=' '.join(x['path'] + [mv[0]]), source=f'lichess, {x["opening"] or "партия"} · {x["white"]} – {x["black"]}'))
    items[pat].append('pt:pz-' + pid)
# 2) позиции из дебютов и составленные позиции
for rec, d in zip(build_items(L + FEN, eng), L + FEN):
    if d.get('moves'): rec['path'] = path_of(d['moves'])
    if d.get('seq'):
        b = chess.Board(rec['fen']); s = []
        for m in d['seq'].split(): s.append(b.push_san(m).uci())
        rec['seq'] = s; rec['line'] = s; rec['accept'] = [s[0]]
    rec['source'] = d.get('source', rec['source'])
    drills.append(rec); items[d['pat']].append('pt:' + d['id'])
# 3) свои партии
G = json.load(open(os.path.join(ROOT, 'data', 'games.json')))
for d in OWN:
    g = G[d['game']]; b = chess.Board(); m = g['m'].split()
    for u in m[:d['ply']]: b.push_uci(u)
    infos = eng.analyse(b, chess.engine.Limit(depth=20), multipv=4)
    sc = lambda i: i['score'].pov(b.turn).score(mate_score=10000)
    best = sc(infos[0]); acc = [i['pv'][0] for i in infos if sc(i) >= best - 30]
    want = b.parse_san(d['accept'])
    print('own', d['id'], b.san(infos[0]['pv'][0]), best, [b.san(a) for a in acc], 'played', b.san(chess.Move.from_uci(m[d['ply']])))
    assert want in acc, d['id']
    drills.append(dict(id=d['id'], title=d['title'], theme='pattern', type='move', fen=b.fen(), color='w' if b.turn else 'b', last=m[d['ply'] - 1],
                       q=d['q'], accept=[a.uci() for a in acc], partial=[], explain=d['explain'], line=[x.uci() for x in infos[0]['pv'][:8]],
                       gameRef=dict(id=d['game'], ply=d['ply']), source=f'Твоя партия: {g["w"]} – {g["b"]}'))
    items[d['pat']].append('pt:' + d['id'])
eng.quit()
for pat, ids in EG.items(): items[pat] += ['eg:' + i for i in ids]
pats = [dict(id=i, group=g, title=t, lead=l, sections=s, items=items[i]) for i, g, t, l, s in P]
json.dump(dict(intro=INTRO, groups=GROUPS, patterns=pats, drills=drills), open(os.path.join(ROOT, 'data', 'patterns.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print('patterns', len(pats), 'drills', len(drills), {p['id']: len(p['items']) for p in pats})
