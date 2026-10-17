"""endgames_src.py (+ эндшпили из своих партий) -> data/endgames.json.
Всё до 7 фигур проверяется эндшпильной базой lichess, остальное — Stockfish.
python build_endgames.py [eg_mine.json]"""
import chess, chess.engine, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from tablebase import tb
from endgames_src import TOPICS, DRILLS
OUT = os.path.join(HERE, '..', 'data', 'endgames.json')
FLIP = {'win': 'loss', 'loss': 'win', 'cursed-win': 'blessed-loss', 'blessed-loss': 'cursed-win', 'maybe-win': 'maybe-loss', 'maybe-loss': 'maybe-win', 'draw': 'draw', 'unknown': 'unknown'}
CLS = lambda c: 'win' if c in ('win', 'maybe-win', 'cursed-win') else ('loss' if c in ('loss', 'maybe-loss', 'blessed-loss') else 'draw')
ORDER = ['win', 'draw', 'loss']

def moves_cls(fen):
    d = tb(fen)
    return CLS(d['category']), {m['uci']: (CLS(FLIP[m['category']]), m) for m in d['moves']}

def best_line(fen, plies=14):
    """Лучшая игра по базе: выигрывающая сторона — кратчайший путь, защищающаяся — самый долгий."""
    b = chess.Board(fen); out = []
    for _ in range(plies):
        if b.is_game_over() or len(b.piece_map()) > 7: break
        cat, mv = moves_cls(b.fen())
        cands = [(u, m) for u, (c, m) in mv.items() if c == cat]
        key = lambda x: abs(x[1].get('dtm') or x[1].get('dtz') or 0)
        if cat == 'win': u = min(cands, key=key)[0]
        elif cat == 'loss': u = max(cands, key=key)[0]
        else:  # ничья: предпочитаем ходы, которые не сдают пешек и выглядят естественно — первый в списке базы
            u = cands[0][0]
        out.append(u); b.push(chess.Move.from_uci(u))
    return out

def check_line(fen, sans):
    b = chess.Board(fen); res, _ = moves_cls(fen); ucis = []
    hero = b.turn
    for s in sans.split():
        m = b.parse_san(s)
        if b.turn == hero and len(b.piece_map()) <= 7:
            cat, mv = moves_cls(b.fen())
            if mv[m.uci()][0] != cat: print('   !!! ход', s, 'ухудшает результат', cat, '->', mv[m.uci()][0])
        ucis.append(m.uci()); b.push(m)
    return ucis

topics = []
for t in TOPICS:
    b = chess.Board(t['fen']); r = dict(t)
    if t.get('line') == 'auto': r['line'] = best_line(t['fen'])
    elif t.get('line'): r['line'] = check_line(t['fen'], t['line'])
    r['orient'] = 'w' if b.turn else 'b'
    if t['id'] == 'philidor': r['orient'] = 'b'
    if t['id'] == 'minor': r['orient'] = 'b'
    print('TOPIC', t['id'], 'line', len(r.get('line') or []))
    topics.append(r)

eng = chess.engine.SimpleEngine.popen_uci('stockfish'); eng.configure({'Threads': 6, 'Hash': 512})
drills = []
for d in DRILLS:
    b = chess.Board(d['fen']); color = 'w' if b.turn else 'b'
    r = dict(d, color=color)
    if len(b.piece_map()) <= 7:
        cat, mv = moves_cls(d['fen'])
        good = [u for u, (c, _) in mv.items() if c == cat]
        need = 'draw' if d.get('goal') == 'draw' else 'win'
        if d['type'] == 'play':
            print(f"PLAY {d['id']}: {cat} (нужно {need}) {'OK' if cat == need else '!!! НЕ СОВПАДАЕТ'}")
        else:
            print(f"MOVE {d['id']}: {cat}; верные: {[b.san(chess.Move.from_uci(u)) for u in good]}")
            r['accept'] = good
            r['line'] = [good[0]] + best_line(b.fen() if False else (lambda bb: (bb.push(chess.Move.from_uci(good[0])), bb.fen())[1])(b.copy()), 10)
    else:
        infos = eng.analyse(b, chess.engine.Limit(depth=30), multipv=6)
        ev = {i['pv'][0].uci(): i['score'].pov(b.turn).score(mate_score=10000) for i in infos}
        best = max(ev.values())
        good = [u for u, v in ev.items() if v >= best - 50 and (best < 300 or v >= 300)]
        print(f"MOVE(SF) {d['id']}: best {best}; верные: {[b.san(chess.Move.from_uci(u)) for u in good]}  все: {[(b.san(chess.Move.from_uci(u)), v) for u, v in ev.items()]}")
        r['accept'] = good
        r['line'] = [m.uci() for m in infos[0]['pv'][:12]]
    if d['type'] == 'move':
        r.update(theme='endgame', type='move', partial=[], last=None, source='Эндшпиль')
    drills.append(r)
eng.quit()

# применение: эндшпили из своих партий
apply = []
mine_path = sys.argv[1] if len(sys.argv) > 1 else None
if mine_path and os.path.exists(mine_path):
    TXT = {('win', 'draw'): 'выигрыш превратился в ничью', ('win', 'loss'): 'выигрыш превратился в поражение', ('draw', 'loss'): 'ничья превратилась в поражение'}
    for m in json.load(open(mine_path)):
        b = chess.Board(m['fen'])
        opp_only_king = len([p for p in b.piece_map().values() if p.color != b.turn]) == 1
        goal = 'draw' if m['best'] == 'draw' else ('mate' if opp_only_king else 'win')
        apply.append(dict(id='eg-app-' + m['game'], topic='apply', type='play', title=f"Твоя партия: {m['opp']}, ход {m['n']}",
                          fen=m['fen'], last=m['last'], color=m['color'], goal=goal, maxMoves=20 if goal != 'draw' else 12,
                          game=m['game'], played=m['san'],
                          hint=f"В партии ты сыграл {m['san']} — и {TXT.get((m['best'], m['got']), 'результат ухудшился')}. Верных ходов в этой позиции: {len(m['good'])}. Сыграй её правильно против идеальной защиты."))
    print('APPLY', len(apply))
topics.append(dict(id='apply', title='Применение: эндшпили из твоих партий', group='apply', fen=None,
                   text=['Позиции до 7 фигур из твоих партий, где ход по эндшпильной базе ухудшил результат: выигрыш ушёл в ничью или ничья — в поражение.',
                         'Доиграй каждую правильно против идеальной защиты. Здесь проверяется не память, а применение: те же оппозиция, пат, активный король — но в твоих реальных позициях.'],
                   apply=''))
json.dump(dict(topics=topics, drills=drills + apply), open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
print('topics', len(topics), 'drills', len(drills), 'apply', len(apply))
