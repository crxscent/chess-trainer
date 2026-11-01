"""tournament_src.py + raw/tournament_an.json -> data/tournament.json. Оценки считает одноразовый прогон Stockfish depth 17."""
import chess, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from tournament_src import GAMES, LEADS, SHORT, CUT, THEMES, PLAN, M
ROOT = os.path.join(HERE, '..')
AN = {g['id']: g['rows'] for g in json.load(open(os.path.join(ROOT, 'raw', 'tournament_an.json')))}
BY = {g['id']: g for g in GAMES}


def replay(g, plies):
    b = chess.Board(); path = []
    for s in g['moves'].split()[:plies]:
        path.append(b.push_san(s).uci())
    return b, path


drills = []
for k, (gid, n, th, title, q, acc, expl, rule, partial) in enumerate(M):
    g = BY[gid]; me = 0 if g['color'] == 'w' else 1; ply = (n - 1) * 2 + me
    b, path = replay(g, ply)
    rows = AN[gid]
    r = rows[ply] if ply < len(rows) else None
    line = []
    if r:
        bb = b.copy()
        for s in re.sub(r'\d+\.+\s*', '', r['pv']).split():
            line.append(bb.push_san(s).uci())
    else:
        bb = b.copy(); line = [bb.push_san(acc[0]).uci()]
    accept = [b.parse_san(a).uci() for a in acc]
    if line[0] not in accept: line = []
    drills.append(dict(id=f'{gid}-{n}', game=gid, n=n, theme=th, kind='bad', title=title, q=q, type='move', fen=b.fen(), color='w' if b.turn else 'b',
                       last=path[-1], accept=accept, partial=[[b.parse_san(m).uci(), t] for m, t in partial], explain=expl, rule=rule, line=line,
                       path=' '.join(path), source=f'Тур {g["round"]} · ход {n}', played=r['san'] if r else 'конец бланка', before=r['cp'] if r else 10000, after=r['after'] if r else -1000))
games = []
for g in GAMES:
    n = len(g['moves'].split()); b, path = replay(g, n)
    me = g['color'] == 'w'; won = g['result'] == ('1-0' if me else '0-1')
    head, body = LEADS[g['id']]
    games.append(dict(id=g['id'], round=g['round'], date=g['date'], color=g['color'], result=g['result'], score=1 if won else 0, short=SHORT[g['id']],
                      lead=f'**{head}** {body}', cut=CUT.get(g['id']), path=' '.join(path), final=b.fen(), last=path[-1]))
out = dict(dates='30 октября – 1 ноября', score=sum(g['score'] for g in games),
           lead='Разобрал пять партий с бланков. Результат 2 из 5, причём обе победы пришли в двух последних турах. Главная новость хорошая: дебют и понимание позиции не проблема. Очки ушли в нескольких конкретных моментах, и почти все они решаются одной привычкой.',
           themes=THEMES, plan=PLAN, games=games, drills=drills)
json.dump(out, open(os.path.join(ROOT, 'data', 'tournament.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
from collections import Counter
print(len(drills), Counter(d['theme'] for d in drills), out['score'])
