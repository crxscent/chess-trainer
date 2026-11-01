"""Как возникла позиция: каждой задаче — ходы от начала партии (path, start), своим партиям — data/games.json.
Ищет позицию по FEN: свои партии, дебютные линии, *_src.py, студии lichess. Запускать после любой сборки data/*.json:
python tools/add_paths.py"""
import chess, chess.pgn, glob, io, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..'); DATA = os.path.join(ROOT, 'data')
sys.path.insert(0, HERE)
START = chess.STARTING_FEN


def key(b):
    return ' '.join(b.fen().split()[:3])


def load(n):
    return json.load(open(os.path.join(DATA, n)))


def dump(o, n):
    json.dump(o, open(os.path.join(DATA, n), 'w'), ensure_ascii=False, separators=(',', ':'))


class Index:
    """позиция -> (старт, ходы, комментарии). Партия от начальной расстановки важнее учебной, короткий путь важнее длинного."""
    def __init__(self): self.m = {}

    def add(self, start, moves, notes=None):
        b = chess.Board(start); path = []
        rank0 = 0 if start == START else 1
        for k, u in enumerate(moves):
            b.push(u); path.append(u)
            kk = key(b); cur = self.m.get(kk); r = (rank0, len(path))
            if cur is None or r < cur[0]:
                self.m[kk] = (r, start, list(path))

    def get(self, fen):
        return self.m.get(' '.join(fen.split()[:3]))


def own_games():
    """id -> партия: белые, чёрные, ходы UCI."""
    out = {}
    pg = open(os.path.join(ROOT, 'raw', 'all.pgn'), encoding='utf-8')
    while True:
        g = chess.pgn.read_game(pg)
        if g is None: break
        gid = (g.headers.get('GameId') or g.headers.get('Site', '').rsplit('/', 1)[-1])[:8]
        out[gid] = dict(w=g.headers.get('White', '?'), b=g.headers.get('Black', '?'), r=g.headers.get('Result', '*'), m=list(g.mainline_moves()))
    return out


def walk_study(idx):
    for f in sorted(glob.glob(os.path.join(ROOT, 'raw', 'galchenko', '*.pgn'))):
        pg = open(f, encoding='utf-8')
        while True:
            g = chess.pgn.read_game(pg)
            if g is None: break
            start = g.board().fen()
            stack = [(g, [])]
            while stack:
                n, p = stack.pop()
                for v in n.variations:
                    p2 = p + [v.move]
                    if not v.variations: idx.add(start, p2)
                    stack.append((v, p2))


def src_lines():
    import importlib
    for mod in ('traps_src', 'lessons_src', 'rules_src', 'endgames_src', 'attack_src', 'galchenko_src'):
        m = importlib.import_module(mod)
        for v in vars(m).values():
            if isinstance(v, (list, tuple)):
                for d in v:
                    if isinstance(d, dict) and isinstance(d.get('moves'), str): yield d['moves']
            elif isinstance(v, str) and len(v.split()) > 6 and v.split()[0] in ('e4', 'd4', 'c4', 'Nf3'): yield v


def san_ucis(line):
    b = chess.Board(); out = []
    for s in line.split(): out.append(b.push_san(s).uci())
    return out


def story_notes():
    """data/story.json: начало партии в UCI -> подпись. Свои подписи важнее подписей дебютных курсов."""
    from story_src import NOTES
    out = {}
    for c in load('openings.json')['courses']:
        for l in c['lines']:
            p = []
            for x in l['moves']:
                p.append(x['uci'])
                if x.get('c'): out.setdefault(' '.join(p), x['c'])
    for k, v in NOTES.items(): out[' '.join(san_ucis(k))] = v
    dump(out, 'story.json')


def trap_branches():
    """Ловушки идут по веткам дебюта, от первого хода к дальним: так видно, как одна линия растёт из другой."""
    from story_src import BRANCHES
    T = load('traps.json'); left = list(T['drills']); drills = []
    for g in T['groups']:
        pre = [(k, t, ' '.join(san_ucis(p))) for k, (t, L) in enumerate(BRANCHES[g['id']]) for p in L]
        for d in [x for x in left if x['group'] == g['id']]:
            hit = sorted(((len(p), k, t) for k, t, p in pre if (d['path'] + ' ').startswith(p + ' ')), reverse=True)
            if not hit: raise SystemExit('нет ветки: ' + d['id'])
            d['branch'] = hit[0][2]; d['_o'] = hit[0][1]
        L = sorted((x for x in left if x['group'] == g['id']), key=lambda d: (d['_o'], len(d['path'].split()), d['path']))
        for d in L: d.pop('_o')
        drills += L
        g['branches'] = list(dict.fromkeys(t for t, _ in BRANCHES[g['id']]))
    T['drills'] = drills; dump(T, 'traps.json')


def main():
    idx = Index(); games = own_games(); bad = 0
    for ln in src_lines():
        b = chess.Board(); mv = []
        try:
            for s in ln.split(): mv.append(b.push_san(s))
        except ValueError:
            pass
        if mv: idx.add(START, mv)
    for c in load('openings.json')['courses']:
        for l in c['lines']:
            idx.add(START, [chess.Move.from_uci(x['uci']) for x in l['moves']])
    walk_study(idx)
    used = {}; stat = {}

    def own(d):
        """Ход партии, откуда взята позиция: сверяем FEN, запас ±1 полуход."""
        g = games.get(d['game']['id'])
        if not g: return False
        want = ' '.join(d['fen'].split()[:3]); ply = d['game'].get('ply')
        b = chess.Board(); n = None
        for k, m in enumerate(g['m']):
            if key(b) == want and (n is None or abs(k - ply) < abs(n - ply)): n = k
            b.push(m)
        if key(b) == want: n = len(g['m'])
        if n is None: return False
        d['gameRef'] = dict(id=d['game']['id'], ply=n); used[d['game']['id']] = g
        return True

    def path(d):
        hit = idx.get(d['fen'])
        for k in ('path', 'start', 'gameRef'): d.pop(k, None)
        if hit:
            _, st, p = hit
            if st != START: d['start'] = st
            if p: d['path'] = ' '.join(m.uci() for m in p)
            return bool(p)
        if d['fen'].split()[0] == START.split()[0]: return True
        return False

    def run(name, L, f):
        s = stat.setdefault(name, dict(all=0, full=0, part=0, none=0))
        for d in L:
            s['all'] += 1
            if isinstance(d.get('game'), dict) and own(d): s['full'] += 1; continue
            ok = path(d)
            s['none' if not ok else 'part' if d.get('start') else 'full'] += 1
        dump(f[0], f[1])

    x = load('exercises.json'); run('exercises', x, (x, 'exercises.json'))
    for n, kk in (('attack.json', 'drills'), ('endgames.json', 'drills'), ('galchenko.json', 'drills'), ('rules.json', 'drills'), ('traps.json', 'drills')):
        o = load(n); run(n[:-5], o[kk], (o, n))
    x = load('lessons.json'); run('lessons', x, (x, 'lessons.json'))
    story_notes(); trap_branches()
    dump({k: dict(w=g['w'], b=g['b'], r=g['r'], m=' '.join(m.uci() for m in g['m'])) for k, g in used.items()}, 'games.json')
    print(json.dumps(stat, ensure_ascii=False, indent=0)); print('games', len(used), 'of', len(games), os.path.getsize(os.path.join(DATA, 'games.json')))


if __name__ == '__main__':
    main()
