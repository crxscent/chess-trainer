"""traps_src.py -> data/traps.json (+ проверка движком)."""
import chess, chess.engine, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_lessons import build_items
from traps_src import T, GROUPS, INTRO
HERE = os.path.dirname(os.path.abspath(__file__))

if __name__ == '__main__':
    # задачи староиндийской из курса Гальченко: штурм королевского фланга
    gk = {d['id']: d for d in json.load(open(os.path.join(HERE, '..', 'data', 'galchenko.json')))['drills']}
    eng = chess.engine.SimpleEngine.popen_uci('stockfish'); eng.configure({'Threads': 4, 'Hash': 512})
    out = []
    for rec, d in zip(build_items(T, eng), T):
        rec.update(group=d['group'], kind=d['kind'])
        if d.get('freq'): rec['freq'] = d['freq']
        out.append(rec)
    eng.quit()
    for i in ('gk6-kid-h3', 'gk6-kid-bxc7'):
        r = dict(gk[i]); r.update(id='tr-' + i, group='kid', kind='idea'); r.pop('lesson', None); out.append(r)
    json.dump(dict(intro=INTRO, groups=GROUPS, drills=out), open(os.path.join(HERE, '..', 'data', 'traps.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    print('traps:', len(out), {g['id']: sum(1 for d in out if d['group'] == g['id']) for g in GROUPS})
