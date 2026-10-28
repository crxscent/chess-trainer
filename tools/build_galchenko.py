"""Курс Матвея Гальченко («Крепыш» + «Громила») -> data/galchenko.json.

Источники:
  raw/galchenko/*.pgn          — студии lichess к урокам (позиции урока и домашние задания)
  tools/galchenko_notes/*.md   — конспекты уроков (из расшифровок видео)
  tools/galchenko_src.py       — авторские вопросы по идеям уроков (формат lessons_src)
Задачи из студий:
  * позиция урока  — найди ход, который показывал тренер (принимаем, если движок согласен);
  * домашнее задание без решения — найди сильнейший ход (решение — Stockfish, только однозначные позиции);
  * короткие партии «один зевнул, другой не наказал» — найди наказание.
"""
import chess, chess.engine, chess.pgn, glob, json, os, re, sys, hashlib
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
sys.path.insert(0, HERE)
OUT = os.path.join(ROOT, 'data', 'galchenko.json')
DEPTH = int(os.environ.get('DEPTH', '18'))
TIME = float(os.environ.get('TIME', '6'))

STUDY = {  # студия -> урок
    'kF37ZgLU': 'K1', 'gSIrd8aH': 'K2', 'qjcUfWju': 'K3', 'NTItzgZ1': 'K4', '6irGA3My': 'K5',
    'g_3fttrryR': 'G1', 'g_V5SEJOoH': 'G2', 'g_l6AcLXD9': 'G3', 'g_kEZOqCBS': 'G4', 'g_Gty2vYxY': 'G5',
    'g_J5ZVIBgB': 'G6', 'g_i3rnif1E': 'G7', 'g_Mnr1JReb': 'G8',
}
LESSONS = [
    ('K1', 'krepysh', 1, 'Дебюты', '1:05:00', 'debut'),
    ('K2', 'krepysh', 2, 'Эндшпиль', '51:39', 'endgame'),
    ('K3', 'krepysh', 3, 'Профилактика', '48:51', 'prophylaxis'),
    ('K4', 'krepysh', 4, 'Стратегия миттельшпиля — игра пешками', '44:25', 'break'),
    ('K5', 'krepysh', 5, 'Миттельшпиль — игра фигурами', '44:57', 'worstpiece'),
    ('G1', 'gromila', 1, 'Дебютные рекомендации за белых. Часть 1', '54:41', 'debut'),
    ('G2', 'gromila', 2, 'Дебютные рекомендации за белых. Часть 2', '21:36', 'debut'),
    ('G3', 'gromila', 3, 'Дебютные рекомендации за чёрных', '38:27', 'debut'),
    ('G4', 'gromila', 4, 'Понимание идей соперника', '46:36', 'prophylaxis'),
    ('G5', 'gromila', 5, 'Техники расчёта вариантов', '40:04', 'calc'),
    ('G6', 'gromila', 6, 'Как атаковать соперника', '1:15:27', 'attack'),
    ('G7', 'gromila', 7, 'Как добиваться своего (правило Шенкленда)', '33:29', 'plan'),
    ('G8', 'gromila', 8, 'Когда нужно думать', '43:24', 'calc'),
    ('T1', 'terminator', 1, 'Активность в ладейном эндшпиле', '44:39', 'endgame'),
    ('T2', 'terminator', 2, 'Размены фигур', '54:57', 'plan'),
    ('T3', 'terminator', 3, 'Напряжение: размены пешек', '40:20', 'structure'),
    ('T4', 'terminator', 4, 'Игра на ферзевом фланге', '29:41', 'plan'),
    ('T5', 'terminator', 5, 'Структура Карлсбад', '57:27', 'structure'),
    ('T6', 'terminator', 6, 'Сицилианские структуры (Найдорф)', '45:28', 'structure'),
    ('T7', 'terminator', 7, 'Французские структуры', '44:24', 'structure'),
    ('T8', 'terminator', 8, 'Закрытые позиции', '44:35', 'structure'),
    ('T9', 'terminator', 9, 'Реализация перевеса: упрощение', '48:49', 'convert'),
    ('T10', 'terminator', 10, 'Реализация перевеса: ограничение контригры', '58:58', 'convert'),
    ('T11', 'terminator', 11, 'Практика: разыгрывание позиций', '07:56', 'plan'),
]
COURSES = {'krepysh': 'Курс «Крепыш» (1000–1400)', 'gromila': 'Курс «Громила» (1400–1800)', 'terminator': 'Курс «Терминатор» (1800–2200)'}


def cp(s, pov): return s.pov(pov).score(mate_score=10000)


def san_line(b, moves, n=10):
    bb = b.copy(); out = []
    for i, m in enumerate(moves[:n]):
        if m not in bb.legal_moves: break
        num = bb.fullmove_number
        out.append((f'{num}.' if bb.turn else (f'{num}…' if i == 0 else '')) + bb.san(m)); bb.push(m)
    return ' '.join(out)


def clean(c):
    c = re.sub(r'\[%[^\]]*\]', '', c or '')
    return re.sub(r'\s+', ' ', c).strip()


def chapters():
    for f in sorted(glob.glob(os.path.join(ROOT, 'raw', 'galchenko', '*.pgn'))):
        sid = os.path.basename(f)[:-4]
        if sid not in STUDY: continue
        pg = open(f, encoding='utf-8'); k = 0
        while True:
            g = chess.pgn.read_game(pg)
            if g is None: break
            k += 1
            name = g.headers.get('ChapterName') or g.headers.get('Event', '').split(': ')[-1]
            yield STUDY[sid], sid, k, name.strip(), g


CACHE_P = os.path.join(ROOT, 'raw', 'galchenko', f'cache_d{DEPTH}.json')
CACHE = json.load(open(CACHE_P)) if os.path.exists(CACHE_P) else {}


def analyse(eng, b, multipv=4):
    n = b.legal_moves.count()
    if n == 0: return []
    key = f'{b.fen()}|{multipv}'
    if key not in CACHE:
        infos = eng.analyse(b, chess.engine.Limit(depth=DEPTH, time=TIME), multipv=min(n, multipv))
        CACHE[key] = [[i['pv'][0].uci(), cp(i['score'], b.turn), [m.uci() for m in i['pv']]] for i in infos if 'pv' in i]
    return [(chess.Move.from_uci(m), v, [chess.Move.from_uci(x) for x in pv]) for m, v, pv in CACHE[key]]


def eval_move(eng, b, m):
    key = f'{b.fen()}|m{m.uci()}'
    if key not in CACHE:
        r = eng.analyse(b, chess.engine.Limit(depth=DEPTH, time=TIME), root_moves=[m])
        CACHE[key] = [cp(r['score'], b.turn), [x.uci() for x in r.get('pv', [m])]]
    v, pv = CACHE[key]
    return v, [chess.Move.from_uci(x) for x in pv]


def quick_evals(eng, g):
    """Оценки (за белых) после каждого полухода партии, с кэшем."""
    b = g.board(); out = []
    for m in [None] + list(g.mainline_moves()):
        if m: b.push(m)
        key = f'{b.fen()}|q'
        if key not in CACHE:
            r = eng.analyse(b, chess.engine.Limit(depth=14, time=2)); CACHE[key] = cp(r['score'], chess.WHITE)
        out.append(CACHE[key])
    return out


def fmt_eval(v):
    if abs(v) >= 9000: return 'мат'
    return f'{v / 100:+.1f}'


def mk_id(*parts):
    return 'gk-' + hashlib.md5('|'.join(map(str, parts)).encode()).hexdigest()[:10]


def study_drills(eng):
    drills = []
    for lid, sid, k, name, g in chapters():
        b0 = g.board(); mv = list(g.mainline_moves())
        fen_start = 'FEN' in g.headers
        orient = g.headers.get('Orientation', 'white')
        task = clean(g.comment)
        is_ex = name.lower().startswith('упражнение')
        # 1) домашнее задание без решения: позиция, ход стороны — найди сильнейший
        if fen_start and not mv and b0.legal_moves.count():
            res = analyse(eng, b0)
            if not res: continue
            best, bv, bpv = res[0]
            second = res[1][1] if len(res) > 1 else -99999
            gap = bv - second
            ok = gap >= 70 or (bv >= 250 and second < 120) or (abs(bv) < 9000 and bv >= 9000)
            print(f'[{lid} ex{k}] {name[:40]} best {b0.san(best)} {bv} 2nd {second} {"OK" if ok else "skip (неоднозначно)"}')
            if not ok: continue
            acc = [m for m, v, _ in res if v >= bv - 30 and (bv < 9000 or v >= 9000)]
            drills.append(dict(id=mk_id(sid, k), lesson=lid, kind='hw', theme='hw', title=f'Домашнее задание {k}' + ('' if name.lower().startswith('упражнение') else f': {name}'),
                               fen=b0.fen(), color='w' if b0.turn else 'b', last=None, orient='white' if b0.turn else 'black',
                               q=task or ('Ход ' + ('белых' if b0.turn else 'чёрных') + '. Найди сильнейшее продолжение.'),
                               type='move', accept=[m.uci() for m in acc], partial=[],
                               explain=f'Сильнейшее: {san_line(b0, bpv, 8)} (оценка {fmt_eval(bv)}). Второй по силе ход заметно слабее ({fmt_eval(second)}).',
                               line=[m.uci() for m in bpv[:8]], source=f'Домашнее задание · {name}'))
            continue
        # 2) короткие партии с зевком (задание «один из игроков грубо зевнул…») и аналитические партии
        if not fen_start and is_ex and mv:
            drills += blunder_drills(eng, lid, sid, k, name, task, g)
            continue
        # 3) позиции урока (старт из FEN): ходы тренера на стороне, которая ходит первой
        if fen_start and mv:
            drills += lesson_line_drills(eng, lid, sid, k, name, g, orient)
    return drills


def lesson_line_drills(eng, lid, sid, k, name, g, orient):
    out = []; b = g.board(); node = g; side = b.turn; taken = 0
    my_side_white = orient == 'white'
    while node.variations and taken < 3:
        nxt = node.variations[0]; m = nxt.move
        if b.turn == side:
            res = analyse(eng, b, 5)
            if res:
                best, bv, bpv = res[0]
                ev = {x[0]: x[1] for x in res}
                if m in ev: tv = ev[m]; tpv = next(x[2] for x in res if x[0] == m)
                else: tv, tpv = eval_move(eng, b, m)
                others = [v for mm, v, _ in res if mm != m]
                gap = tv - (max(others) if others else -99999)
                first = node is g
                # берём стартовую позицию главы, если ход тренера не хуже лучшего на 50,
                # а продолжения — только когда ход тренера единственный (отрыв ≥ 80)
                acc = [m] + [mm for mm, v, _ in res if mm != m and v >= tv - 15 and v >= bv - 30]
                good = (tv >= bv - 50 and gap >= (40 if first else 80) and abs(bv) < 9000 or (tv >= 9000 and bv >= 9000)) and len(acc) <= 2
                print(f'[{lid} ch{k}] {name[:38]} ply{b.ply()} teacher {b.san(m)} {tv} best {b.san(best)} {bv} gap {gap} {"OK" if good else "-"}')
                if good:
                    who = 'белых' if b.turn else 'чёрных'
                    opp = (b.turn == chess.WHITE) != my_side_white
                    q = (f'Ход {who} (за соперника). Что он хочет сделать? Сыграй его идею.' if opp and first
                         else f'Ход {who}. Найди ход из урока.')
                    cm = clean(nxt.comment)
                    out.append(dict(id=mk_id(sid, k, b.ply()), lesson=lid, kind='lesson', theme='lesson', title=name,
                                    fen=b.fen(), color='w' if b.turn else 'b', last=b.peek().uci() if b.move_stack else None,
                                    orient=orient, q=q, type='move', accept=[x.uci() for x in acc], partial=[],
                                    explain=(cm + ' ' if cm else '') + f'В уроке: {san_line(b, [n.move for n in [nxt] + list(main_after(nxt))], 10)}. Движок: {fmt_eval(tv)}.',
                                    line=[x.uci() for x in tpv[:8]], source=f'Урок · {name}'))
                    taken += 1
        b.push(m); node = nxt
        if b.ply() > 60: break
    return out


def main_after(node):
    while node.variations:
        node = node.variations[0]; yield node


def blunder_drills(eng, lid, sid, k, name, task, g):
    mv = list(g.mainline_moves())
    if lid in ('K1', 'G1', 'G2', 'G3') and opening_of(g.board(), mv) is None:
        return []  # дебютные уроки: только испанская, сицилианская, французская, староиндийская
    evs = quick_evals(eng, g)
    out = []; b = g.board()
    for i, m in enumerate(mv):
        mover = b.turn; before = evs[i] if mover else -evs[i]; after = evs[i + 1] if mover else -evs[i + 1]
        b.push(m)
        if before - after >= 250 and after <= 150 and i + 1 < len(mv) + 1 and b.legal_moves.count():
            # позиция после зевка: найди наказание
            res = analyse(eng, b, 3)
            if not res: continue
            best, bv, bpv = res[0]
            played = mv[i + 1] if i + 1 < len(mv) else None
            pv_played = None
            if played is not None:
                pv_played = next((v for mm, v, _ in res if mm == played), None)
                if pv_played is None: pv_played, _ = eval_move(eng, b, played)
            if bv < 200 or (pv_played is not None and pv_played >= bv - 120): continue
            acc = [mm for mm, v, _ in res if v >= bv - 40 and (bv < 9000 or v >= 9000)]
            bb = g.board(); [bb.push(x) for x in mv[:i]]
            blunder_san = bb.san(m)
            out.append(dict(id=mk_id(sid, k, i), lesson=lid, kind='blunder', theme='blunder', title=f'Накажи зевок: {name}',
                            fen=b.fen(), color='w' if b.turn else 'b', last=m.uci(), orient='white' if b.turn else 'black',
                            q=f'Соперник только что сыграл {blunder_san}. Это грубая ошибка — как её наказать?',
                            context=task[:220] if task else None, type='move', accept=[x.uci() for x in acc], partial=[],
                            explain=f'Наказание: {san_line(b, bpv, 8)} ({fmt_eval(bv)}).' + (f' В партии было {b.san(played)} ({fmt_eval(pv_played)}) — шанс упущен.' if played is not None else ''),
                            line=[x.uci() for x in bpv[:8]], source=f'Партия из домашнего задания · ход {bb.fullmove_number}'))
            print(f'[{lid} game{k}] blunder {blunder_san} ply{i} {before}->{after}, punish {b.san(best)} {bv}, played {pv_played}')
            if len(out) >= 2: break
    return out


OPEN_T = {'ruy': 'испанской партии', 'sic': 'сицилианской защите', 'french': 'французской защите', 'kid': 'староиндийской защите'}


def opening_of(b0, moves):
    """Испанская / сицилианская / французская / староиндийская — по первым ходам."""
    sans = []; b = b0.copy()
    for m in moves[:12]:
        sans.append(b.san(m)); b.push(m)
    s = ' '.join(sans)
    if s.startswith('e4 e5 Nf3 Nc6 Bb5'): return 'ruy'
    if s.startswith('e4 c5'): return 'sic'
    if s.startswith('e4 e6'): return 'french'
    if s.startswith('d4 Nf6') and 'g6' in sans[:6] and ('d6' in sans or 'Bg7' in sans) and 'd5' not in sans[:6]: return 'kid'
    return None


def qeval(eng, b):
    key = f'{b.fen()}|q'
    if key not in CACHE:
        if b.is_game_over(): CACHE[key] = 0 if not b.is_checkmate() else (-10000 if b.turn else 10000)
        else:
            r = eng.analyse(b, chess.engine.Limit(depth=14, time=1.5)); CACHE[key] = cp(r['score'], chess.WHITE)
    return CACHE[key]


def trap_drills(eng):
    out = []; seen = set()
    for lid, sid, k, name, g in chapters():
        if 'FEN' in g.headers or not g.variations: continue
        main = list(g.mainline_moves())
        op = opening_of(g.board(), main)
        stack = [(g, g.board(), [])]
        while stack:
            node, b, path = stack.pop()
            if b.ply() >= 30: continue
            for v in node.variations:
                m = v.move
                if m not in b.legal_moves: continue
                bb = b.copy(); bb.push(m); p2 = path + [m]
                stack.append((v, bb, p2))
                o = opening_of(g.board(), p2) if len(p2) >= 2 else None
                if o is None: continue
                mover = b.turn
                e0 = qeval(eng, b); e1 = qeval(eng, bb)
                before = e0 if mover else -e0; after = e1 if mover else -e1
                if before - after < 200 or after > -200 or before < -150: continue
                if bb.fen() in seen or not bb.legal_moves.count(): continue
                res = analyse(eng, bb, 3)
                if not res: continue
                best, bv, bpv = res[0]
                if bv < 200 or best.to_square == m.to_square or before >= 9000: continue  # простое взятие назад — не ловушка
                seen.add(bb.fen())
                acc = [mm for mm, vv, _ in res if vv >= bv - 40 and (bv < 9000 or vv >= 9000)]
                nxt = v.variations[0].move if v.variations else None
                teach = ''
                if nxt is not None and nxt in bb.legal_moves:
                    teach = f' В уроке тренер показывает: {san_line(bb, [n.move for n in main_after(v)], 8)}.'
                    if nxt not in acc:
                        tv, _ = eval_move(eng, bb, nxt)
                        if tv >= bv - 60: acc.append(nxt)
                prev = g.board(); line = []
                for i, x in enumerate(p2):
                    line.append((f'{prev.fullmove_number}.' if prev.turn else '') + prev.san(x)); prev.push(x)
                who = 'белые' if mover else 'чёрные'
                out.append(dict(id=mk_id('trap', bb.fen()), lesson=lid, kind='trap', theme='trap', opening=o,
                                title=f'Ловушка в {OPEN_T[o]}',
                                fen=bb.fen(), color='w' if bb.turn else 'b', last=m.uci(), orient='white' if bb.turn else 'black',
                                q=f'{" ".join(line)} — {who} ошиблись. Как наказать?',
                                type='move', accept=[x.uci() for x in acc], partial=[],
                                explain=f'Наказание: {san_line(bb, bpv, 8)} ({fmt_eval(bv)}).' + teach,
                                line=[x.uci() for x in bpv[:8]], source=f'Дебютная ловушка · урок «{name}»'))
                print(f'[trap {o}] {" ".join(line)}  {before}->{after}  punish {bb.san(best)} {bv}')
    return out


def notes_html(lid):
    p = os.path.join(HERE, 'galchenko_notes', lid + '.md')
    if not os.path.exists(p): return None
    sections = []; cur = None; lead = []
    for line in open(p, encoding='utf-8').read().splitlines():
        if line.startswith('# '): continue
        if line.startswith('## '):
            cur = dict(h=line[3:].strip(), items=[]); sections.append(cur); continue
        m = re.match(r'^(- |\d+\. )(.*)', line)
        if m:
            (cur['items'] if cur else lead).append(m.group(2).strip()); continue
        if line.strip():
            if cur: cur['items'].append(line.strip())
            else: lead.append(line.strip())
    return dict(lead=lead, sections=sections)


def main():
    eng = chess.engine.SimpleEngine.popen_uci('stockfish'); eng.configure({'Threads': int(os.environ.get('THREADS', '3')), 'Hash': 256})
    drills = study_drills(eng) + trap_drills(eng)
    try:
        from galchenko_src import G
        from build_lessons import build_items
        for rec, d in zip(build_items(G, eng), [d for d in G if not d.get('skip')]):
            rec['lesson'] = d['lesson']; rec['kind'] = 'idea'
            drills.append(rec)
    except ImportError as e:
        print('нет авторских вопросов:', e)
    eng.quit()
    json.dump(CACHE, open(CACHE_P, 'w'))
    seen = set(); uniq = []
    for d in drills:
        if d['id'] in seen: continue
        seen.add(d['id']); uniq.append(d)
    lessons = []
    for lid, course, n, title, dur, theme in LESSONS:
        lessons.append(dict(id=lid, course=course, n=n, title=title, dur=dur, theme=theme, notes=notes_html(lid),
                            drills=[d['id'] for d in uniq if d['lesson'] == lid]))
    json.dump(dict(courses=COURSES, lessons=lessons, drills=uniq), open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
    print('lessons', len(lessons), 'drills', len(uniq), {l['id']: len(l['drills']) for l in lessons})


if __name__ == '__main__':
    main()
