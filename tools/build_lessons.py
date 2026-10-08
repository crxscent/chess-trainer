"""lessons_src.py -> data/lessons.json (+ проверка движком)."""
import chess, chess.engine, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lessons_src import L
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'data', 'lessons.json')
COURSE_T = dict(goring='Гамбит Гёринга', ruy='Испанская партия', alapin='Алапин', french='Французская защита', qg='Ферзевый гамбит', qgd='QGD')
DEPTH = int(os.environ.get('DEPTH', '16'))

def cp(s, pov): return s.pov(pov).score(mate_score=10000)

eng = chess.engine.SimpleEngine.popen_uci('stockfish'); eng.configure({'Threads': 2, 'Hash': 256})
out = []
for d in L:
    if d.get('skip'):
        continue
    if 'fen' in d:
        b = chess.Board(d['fen']); last = None; src = 'Учебная позиция'
    else:
        b = chess.Board(); mv = d['moves'].split()
        for m in mv: b.push_san(m)
        last = b.peek().uci()
        san = []; bb = chess.Board()
        for i, m in enumerate(mv):
            san.append((f'{i//2+1}.' if i % 2 == 0 else '') + m)
        src = COURSE_T.get(d.get('course'), '') + ': ' + ' '.join(san[-6:]) if len(san) > 6 else COURSE_T.get(d.get('course'), '')
    col = b.turn
    n = b.legal_moves.count()
    infos = eng.analyse(b, chess.engine.Limit(depth=DEPTH), multipv=min(n, 8))
    ev = {i['pv'][0]: cp(i['score'], col) for i in infos}
    pv = {i['pv'][0]: i['pv'] for i in infos}
    # ходы из вариантов ответа, не попавшие в топ-8, считаем отдельно
    need = set()
    for o in d.get('options', []):
        if o[1]: need.add(b.parse_san(o[1]))
    for m in d.get('accept', []) + [p for p, _ in d.get('partial', [])]:
        need.add(b.parse_san(m))
    for m in need - set(ev):
        r = eng.analyse(b, chess.engine.Limit(depth=DEPTH), root_moves=[m])
        ev[m] = cp(r['score'], col); pv[m] = r['pv']
    best = max(ev, key=ev.get)
    print(f"== {d['id']}  ({'w' if col else 'b'})  best {b.san(best)} {ev[best]}  top: " + ', '.join(f"{b.san(m)}({v})" for m, v in sorted(ev.items(), key=lambda x: -x[1])[:5]))
    rec = dict(id=d['id'], theme=d['theme'], course=d.get('course'), title=d['title'], fen=b.fen(), color='w' if col else 'b',
               last=last, q=d['q'], type=d.get('type', 'choice'), explain=d['explain'], source=src)
    line_from = None
    if rec['type'] == 'choice':
        opts = []
        for (t, m, ok, why) in d['options']:
            o = dict(t=t, ok=ok, why=why)
            if m:
                mm = b.parse_san(m)
                o['uci'] = mm.uci()
                flag = '' if (ok and ev[mm] >= ev[best] - 60) or (not ok and ev[mm] < ev[best] - 40) else '   <<< ПРОВЕРЬ'
                print(f"   {'✓' if ok else '✗'} {m}: {ev[mm]}{flag}")
                if ok and line_from is None: line_from = mm
            opts.append(o)
        rec['options'] = opts
    else:
        acc = [b.parse_san(m) for m in d['accept']]
        for m in acc:
            print(f"   ✓ {b.san(m)}: {ev[m]}{'' if ev[m] >= ev[best]-60 else '   <<< ПРОВЕРЬ'}")
        # дополнительно принимаем ходы, равноценные лучшему
        extra = [m for m in ev if m not in acc and ev[m] >= ev[best] - 25 and (ev[best] < 300 or ev[m] >= ev[best] - 25)]
        if extra: print('   + равноценные:', ', '.join(f'{b.san(m)}({ev[m]})' for m in extra))
        rec['partial'] = [[b.parse_san(p).uci(), t] for p, t in d.get('partial', [])]
        if d.get('anyGood'):
            rec['accept'] = [m.uci() for m in acc + extra]
        else:
            rec['accept'] = [m.uci() for m in acc]
            have = {x[0] for x in rec['partial']}
            rec['partial'] += [[m.uci(), 'Неплохой ход, но задача о другом — перечитай вопрос.'] for m in extra if m.uci() not in have]
        for p, t in d.get('partial', []):
            mm = b.parse_san(p); print(f"   ~ {p}: {ev[mm]}")
        line_from = acc[0]
    if 'arrows' in d:
        rec['arrows'] = [dict(**{'from': a, 'to': z, 'brush': br}) for a, z, br in d['arrows']]
    if line_from is not None:
        rec['line'] = [m.uci() for m in pv[line_from][:8]]
    out.append(rec)
eng.quit()
json.dump(out, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
print('lessons:', len(out))
