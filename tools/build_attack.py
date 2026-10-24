"""Раздел «Атака и защита» -> data/attack.json.
Задачи: (1) из твоих партий (raw/an/games.jsonl от analyze_games.py), (2) из самоигры Stockfish в структурах репертуара.
python build_attack.py [--selfplay N]"""
import chess, chess.engine, json, math, os, random, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from attack_src import TOPICS, PLAY
from build_exercises import describe, chip, line_san, fmt
ROOT = os.path.join(HERE, '..'); OUT = os.path.join(ROOT, 'data', 'attack.json')
ME = 'fem_t_o'
def wp(cp): cp = max(-1500, min(1500, cp)); return 50 + 50 * (2 / (1 + math.exp(-0.00368208 * cp)) - 1)
VAL = {1: 1, 2: 3, 3: 3, 4: 5, 5: 9, 6: 0}

def closed_center(b):
    for f in (3, 4):
        for r in range(1, 7):
            w = b.piece_at(chess.square(f, r)); bl = b.piece_at(chess.square(f, r + 1))
            if w and bl and w.piece_type == chess.PAWN and bl.piece_type == chess.PAWN and w.color and not bl.color:
                return True
    return False

def open_center(b):
    return any(not any(b.piece_at(chess.square(f, r)) and b.piece_type_at(chess.square(f, r)) == chess.PAWN for r in range(8)) for f in (3, 4))

def flank_push_to_king(b, m):
    p = b.piece_at(m.from_square)
    if not p or p.piece_type != chess.PAWN or b.is_capture(m): return False
    ek = b.king(not b.turn); kf = chess.square_file(ek); f = chess.square_file(m.from_square)
    return (kf >= 5 and f >= 5) or (kf <= 2 and f <= 2)

def toward_king(b, m):
    ek = b.king(not b.turn)
    return chess.square_distance(m.to_square, ek) <= 2 or b.gives_check(m)

def sacrifice(b, m):
    p = b.piece_at(m.from_square); cap = b.piece_at(m.to_square)
    gain = VAL[cap.piece_type] if cap else 0
    bb = b.copy(); bb.push(m)
    return bb.is_attacked_by(bb.turn, m.to_square) and VAL[p.piece_type] > gain + 1

def king_zone_attackers(b, side):
    k = b.king(side); zone = chess.SquareSet(chess.BB_KING_ATTACKS[k]) | chess.SquareSet(chess.BB_SQUARES[k])
    s = set()
    for z in zone:
        for a in b.attackers(not side, z):
            if b.piece_type_at(a) not in (chess.PAWN, chess.KING): s.add(a)
    return len(s)

def shield(b, side):
    k = b.king(side); kf, kr = chess.square_file(k), chess.square_rank(k); d = 1 if side else -1
    return sum(1 for f in (kf - 1, kf, kf + 1) if 0 <= f <= 7 for r in (kr + d, kr + 2 * d) if 0 <= r <= 7
               and b.piece_at(chess.square(f, r)) == chess.Piece(chess.PAWN, side))

def classify(b, best, before, threat_drop, second_gap, threat_moves=None):
    """Тема позиции для стороны на ходу по лучшему ходу."""
    me = b.turn
    m = chess.Move.from_uci(best)
    if closed_center(b) and flank_push_to_king(b, m): return 'storm'
    tfrom = chess.Move.from_uci(threat_moves[0][0]).from_square if threat_moves else None
    if threat_drop >= 120 and before <= 200:
        if b.is_capture(m) and tfrom is not None and m.to_square == tfrom: return 'initiative'
        mk = b.king(me)
        tto = chess.Move.from_uci(threat_moves[0][0]).to_square if threat_moves else None
        if king_zone_attackers(b, me) >= 2 or (tto is not None and chess.square_distance(tto, mk) <= 2):
            return 'defense'
    if before >= 50 and (king_zone_attackers(b, not me) >= 2 or shield(b, not me) <= 1) and (toward_king(b, m) or sacrifice(b, m)):
        return 'attack'
    return None

RULES = dict(
    attack='Атака: какая фигура ещё не участвует? Вскрой линию, удали защитника, и только потом жертвуй — посчитав ответы.',
    storm='Штурм пешками — только при закрытом центре и с поддержкой фигур. Цель — вскрыть линию к королю.',
    defense='Защита начинается с вопроса «что он хочет?». Меняй атакующие фигуры, защищайся фигурами, а не пешками.',
    initiative='Слом инициативы: размен самой активной фигуры, темп с угрозой или возврат материала. Не жадничай под давлением.',
    stormwrong='Штурм при открытом центре ослабляет только тебя: соперник отвечает ударом в центре.',
)

def text_for(b, best, ev, pvs, cat, played=None, reply=None):
    bm = chess.Move.from_uci(best); T = []
    if played:
        pm = chess.Move.from_uci(played)
        T.append(f'В партии ты сыграл {chip(b, pm)}: {fmt(ev[best])} → {fmt(ev.get(played, 0))}.')
        if reply:
            ba = b.copy(); ba.push(pm)
            rm = chess.Move.from_uci(reply)
            if rm in ba.legal_moves: T.append(f'Соперник мог ответить {chip(ba, rm)} ({describe(ba, rm)}).')
    T.append(f'\n\nСильнее всего {chip(b, bm)} ({fmt(ev[best])}) — {describe(b, bm)}' + (f'. Например: {line_san(b, [chess.Move.from_uci(u) for u in pvs.get(best, [])], 7)}.' if pvs.get(best) else '.'))
    srt = sorted(ev.items(), key=lambda x: -x[1])
    if len(srt) > 1:
        T.append(f'Следующий по силе ход {chip(b, chess.Move.from_uci(srt[1][0]))} — уже {fmt(srt[1][1])}.')
    return ' '.join(T).replace(' \n\n', '\n\n')

def from_games(path):
    out = []; seen = set()
    for line in open(path):
        g = json.loads(line); h = g['headers']; P = g['plies']
        col = chess.WHITE if h['White'].lower() == ME else chess.BLACK
        gid = h.get('GameId') or h['Site'].rsplit('/', 1)[-1]
        for d in g['deep']:
            i = d['ply']; p = P[i]; b = chess.Board(p['fen'])
            ev = {u: v[0] for u, v in d['moves'].items()}; pvs = {u: v[1] for u, v in d['moves'].items()}
            if not ev or p.get('played') not in ev: continue
            best = max(ev, key=ev.get); before = ev[best]; played = p['played']
            loss = wp(before) - wp(ev[played])
            srt = sorted(ev.values(), reverse=True); gap = srt[0] - srt[1] if len(srt) > 1 else 0
            th = d.get('threat'); tdrop = (before - th[0][1]) if th else 0
            cat = None
            pm = chess.Move.from_uci(played)
            if loss >= 12 and open_center(b) and not closed_center(b) and flank_push_to_king(b, pm) and b.piece_type_at(chess.Move.from_uci(best).from_square) != chess.PAWN:
                cat = 'stormwrong'
            elif loss >= 10:
                cat = classify(b, best, before, tdrop, gap, th)
            if not cat: continue
            key = ' '.join(p['fen'].split()[:4])
            if key in seen: continue
            seen.add(key)
            reply = P[i + 1].get('best') if i + 1 < len(P) else None
            opp = h['Black'] if col else h['White']
            out.append(dict(id=f'atk:{gid}:{i}', cat=cat, src='game', fen=p['fen'], color='w' if col else 'b',
                            last=P[i - 1].get('played') if i else None, prevFen=P[i - 1]['fen'] if i else None,
                            game=dict(id=gid, opp=opp, tc=h.get('TimeControl', ''), date=h.get('Date', ''), ply=i + 1, n=b.fullmove_number),
                            played=played, evals=ev, pvs={u: pvs[u] for u in sorted(ev, key=ev.get, reverse=True)[:4] + [played]},
                            best=best, before=before, weight=round(loss, 1),
                            threat=dict(drop=tdrop, moves=th, pv=[]) if th else None,
                            after=dict(reply=reply, pv=P[i + 1].get('pv', [])) if reply else None,
                            text=text_for(b, best, ev, pvs, cat, played, reply), rule=RULES[cat]))
    return out

def selfplay(n_per_line, plies=24):
    """Самоигра из концов дебютных линий; ищем позиции с чётким лучшим ходом по теме."""
    op = json.load(open(os.path.join(ROOT, 'data', 'openings.json')))
    starts = []
    for c in op['courses']:
        if c['id'] not in ('ruy', 'dragon', 'alapin', 'french', 'goring', 'qg'): continue
        for l in c['lines']:
            b = chess.Board()
            for m in l['moves']: b.push_uci(m['uci'])
            starts.append((c['id'], c['title'], l['name'], b.fen()))
    random.seed(7)
    eng = chess.engine.SimpleEngine.popen_uci('stockfish'); eng.configure({'Threads': int(os.environ.get('SP_THREADS', '2')), 'Hash': 256})
    found = []; seen = set()
    for cid, ctitle, lname, fen in starts:
        for rep in range(n_per_line):
            b = chess.Board(fen)
            for ply in range(plies):
                if b.is_game_over(): break
                infos = eng.analyse(b, chess.engine.Limit(depth=13), multipv=4)
                sc = [(x['pv'][0], x['score'].pov(b.turn).score(mate_score=10000)) for x in infos if 'pv' in x]
                if ply >= 4 and len(sc) >= 2:
                    best, bev = sc[0]; gap = bev - sc[1][1]
                    if gap >= 70 and -250 <= bev <= 400:
                        tdrop = 0; tmv = None
                        if not b.is_check():
                            nb = chess.Board(b.fen()); nb.turn = not nb.turn; nb.ep_square = None
                            if nb.is_valid():
                                t = eng.analyse(nb, chess.engine.Limit(depth=12))
                                tdrop = bev - t['score'].pov(b.turn).score(mate_score=10000)
                                tmv = [(t['pv'][0].uci(), bev - tdrop)] if t.get('pv') else None
                        cat = classify(b, best.uci(), bev, tdrop, gap, tmv)
                        key = ' '.join(b.fen().split()[:4])
                        if cat and key not in seen:
                            seen.add(key)
                            n = b.legal_moves.count()
                            allm = eng.analyse(b, chess.engine.Limit(depth=13), multipv=min(n, 50))
                            ev = {x['pv'][0].uci(): x['score'].pov(b.turn).score(mate_score=10000) for x in allm if 'pv' in x}
                            pvs = {x['pv'][0].uci(): [m.uci() for m in x['pv'][:10]] for x in allm[:4] if 'pv' in x}
                            bb = max(ev, key=ev.get)
                            found.append(dict(id=f'atk:sp:{len(found)}:{key.split()[0][-12:]}', cat=cat, src='structure', course=cid,
                                              source=f'{ctitle}: {lname}', fen=b.fen(), color='w' if b.turn else 'b', last=b.peek().uci() if b.move_stack else None,
                                              evals=ev, pvs=pvs, best=bb, before=ev[bb], weight=gap / 10,
                                              threat=None, text=text_for(b, bb, ev, pvs, cat), rule=RULES[cat]))
                            print(len(found), cat, ctitle, lname, b.fen(), flush=True)
                # случайный ход среди почти лучших — разнообразие
                good = [m for m, v in sc if v >= sc[0][1] - 25]
                b.push(random.choice(good))
    eng.quit()
    return found

if __name__ == '__main__':
    n = int(sys.argv[sys.argv.index('--selfplay') + 1]) if '--selfplay' in sys.argv else 0
    games = os.path.join(ROOT, 'raw', 'an', 'games.jsonl')
    drills = from_games(games) if os.path.exists(games) else []
    print('из партий:', len(drills), {c: sum(1 for d in drills if d['cat'] == c) for c in RULES})
    sp_path = os.path.join(ROOT, 'raw', 'selfplay.json')
    if n:
        sp = selfplay(n); json.dump(sp, open(sp_path, 'w'))
    sp = json.load(open(sp_path)) if os.path.exists(sp_path) else []
    print('из структур:', len(sp), {c: sum(1 for d in sp if d['cat'] == c) for c in RULES})
    topics = []
    for t in TOPICS:
        b = chess.Board()
        for m in t['moves'].split(): b.push_san(m)
        topics.append(dict(t, fen=b.fen(), last=b.peek().uci()))
    play = []
    for p in PLAY:
        b = chess.Board()
        for m in p['moves'].split(): b.push_san(m)
        assert (b.turn == chess.WHITE) == (p['side'] == 'w'), p['id']
        play.append(dict(p, fen=b.fen(), last=b.peek().uci()))
    json.dump(dict(topics=topics, play=play, drills=drills + sp), open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
    print('attack.json:', len(drills + sp), 'задач')
