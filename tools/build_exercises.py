"""Упражнения из собственных партий + диагноз.
python build_exercises.py analysis.json deep.jsonl
  analysis.json — оценки всех позиций (analyze), deep.jsonl — multipv по позициям ошибок (deep).
Пишет data/exercises.json и data/diagnosis.json"""
import chess, chess.engine, json, math, sys, os, collections, statistics

ME = 'Fem_T_o'
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'data')

def wp(cp):
    cp = max(-1500, min(1500, cp)); return 50 + 50 * (2 / (1 + math.exp(-0.00368208 * cp)) - 1)

def fmt(cp):
    if abs(cp) >= 9000:
        m = max(1, round((10000 - abs(cp)) / 10)); return ('#' if cp > 0 else '#-') + str(m)
    return ('+' if cp > 0 else '') + f'{cp / 100:.1f}'

VAL = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 0}
NOM = {chess.PAWN: 'пешка', chess.KNIGHT: 'конь', chess.BISHOP: 'слон', chess.ROOK: 'ладья', chess.QUEEN: 'ферзь', chess.KING: 'король'}
ACC = {chess.PAWN: 'пешку', chess.KNIGHT: 'коня', chess.BISHOP: 'слона', chess.ROOK: 'ладью', chess.QUEEN: 'ферзя', chess.KING: 'короля'}
NOMC = {k: v.capitalize() for k, v in NOM.items()}
DAT = {chess.PAWN: 'пешке', chess.KNIGHT: 'коню', chess.BISHOP: 'слону', chess.ROOK: 'ладье', chess.QUEEN: 'ферзю', chess.KING: 'королю'}

def chip(b, m):
    return '{{' + m.uci() + '|' + b.san(m) + '}}'

def line_san(b, pv, n=6):
    bb = b.copy(); out = []; first = True
    for m in pv[:n]:
        if m not in bb.legal_moves: break
        no = bb.fullmove_number
        s = bb.san(m)
        out.append(f'{no}.{s}' if bb.turn else (f'{no}...{s}' if first else s))
        first = False; bb.push(m)
    return ' '.join(out)

def material(b, color):
    return sum(VAL[p.piece_type] for p in b.piece_map().values() if p.color == color and p.piece_type != chess.KING)

def nonpawn(b, color):
    return sum(VAL[p.piece_type] for p in b.piece_map().values() if p.color == color and p.piece_type not in (chess.PAWN, chess.KING))

def describe(b, m):
    """Короткое описание хода по-русски."""
    p = b.piece_at(m.from_square)
    cap = b.piece_at(m.to_square) if not b.is_en_passant(m) else chess.Piece(chess.PAWN, not b.turn)
    bb = b.copy(); bb.push(m)
    parts = []
    if bb.is_checkmate():
        return 'мат'
    if cap:
        parts.append(f'берёт {ACC[cap.piece_type]} на {chess.square_name(m.to_square)}')
    if m.promotion:
        parts.append('превращение пешки')
    if bb.is_check():
        parts.append('с шахом')
    # двойной удар
    att = [sq for sq in bb.attacks(m.to_square) if bb.piece_at(sq) and bb.piece_at(sq).color != p.color and (VAL[bb.piece_at(sq).piece_type] >= 3 or bb.piece_at(sq).piece_type == chess.KING)]
    if len(att) >= 2 and not cap:
        parts.append('двойной удар по ' + ' и '.join(f'{DAT[bb.piece_at(s).piece_type]} {chess.square_name(s)}' for s in att[:2]))
    if not cap and len(att) < 2:
        # на что нападает ход (новые цели ценнее пешки или незащищённые)
        tg = []
        for sq in bb.attacks(m.to_square):
            q = bb.piece_at(sq)
            if q and q.color != p.color and q.piece_type != chess.KING and (VAL[q.piece_type] > VAL[p.piece_type] or not bb.is_attacked_by(q.color, sq)) and VAL[q.piece_type] >= 1:
                tg.append(f'{ACC[q.piece_type]} {chess.square_name(sq)}')
        if tg:
            parts.append('нападает на ' + ' и '.join(tg[:2]))
    if not parts:
        if b.is_castling(m):
            parts.append('рокировка: король в безопасность, ладья в игру')
        else:
            parts.append(f'{NOM[p.piece_type]} {chess.square_name(m.from_square)}→{chess.square_name(m.to_square)}')
    return ', '.join(parts)

def can_pawn_attack(b, color, sq):
    f, r = chess.square_file(sq), chess.square_rank(sq)
    for df in (-1, 1):
        ff = f + df
        if not 0 <= ff <= 7: continue
        for rr in range(8):
            s = chess.square(ff, rr)
            p = b.piece_at(s)
            if p and p.piece_type == chess.PAWN and p.color == color:
                if (color and rr < r) or (not color and rr > r):
                    return True
    return False

def holes(b, color):
    out = set()
    for sq in chess.SQUARES:
        r = chess.square_rank(sq); rel = r if color else 7 - r
        if 2 <= rel <= 5 and not can_pawn_attack(b, color, sq):
            out.add(sq)
    return out

def new_holes(b, m, color):
    bb = b.copy(); bb.push(m)
    hs = holes(bb, color) - holes(b, color)
    k = b.king(color)
    def key(sq):
        f = chess.square_file(sq); center = abs(f - 3.5)
        return (chess.square_distance(sq, k) if k is not None else 4) + center * 0.6
    return sorted(hs, key=key)[:3]

def piece_activity(b, color):
    res = []
    enemy_pawn_att = set()
    for sq, p in b.piece_map().items():
        if p.color != color and p.piece_type == chess.PAWN:
            enemy_pawn_att |= set(b.attacks(sq))
    bb = b.copy(); bb.turn = color
    for sq, p in b.piece_map().items():
        if p.color != color or p.piece_type in (chess.PAWN, chess.KING): continue
        mob = [m for m in bb.pseudo_legal_moves if m.from_square == sq and m.to_square not in enemy_pawn_att]
        norm = {chess.KNIGHT: 8, chess.BISHOP: 13, chess.ROOK: 14, chess.QUEEN: 27}[p.piece_type]
        score = len(mob) / norm
        why = [f'{len(mob)} {"безопасный ход" if len(mob) == 1 else "безопасных хода" if 2 <= len(mob) <= 4 else "безопасных ходов"}']
        home = (chess.square_rank(sq) == (0 if color else 7))
        if p.piece_type in (chess.KNIGHT, chess.BISHOP) and home:
            score -= 0.35; why.append('ещё не развит')
        if p.piece_type == chess.BISHOP:
            sc = chess.BB_LIGHT_SQUARES if (chess.BB_SQUARES[sq] & chess.BB_LIGHT_SQUARES) else chess.BB_DARK_SQUARES
            own = [s for s in chess.SquareSet(b.pieces(chess.PAWN, color) & sc) if 2 <= chess.square_file(s) <= 5]
            if len(own) >= 2:
                score -= 0.15 * len(own); why.append(f'свои пешки на полях его цвета ({len(own)})')
        if p.piece_type == chess.ROOK:
            f = chess.square_file(sq)
            if any(chess.square_file(s) == f for s in b.pieces(chess.PAWN, color)):
                score -= 0.15; why.append('закрытая вертикаль')
        res.append(dict(sq=chess.square_name(sq), p=chess.piece_symbol(p.piece_type), score=round(score, 3), why=', '.join(why)))
    return sorted(res, key=lambda x: x['score'])

def make_text(b, pm, bm, before, pe, reply, threat, ev, pvs, best):
    T = []
    T.append(f'В партии ты сыграл {chip(b, pm)}: оценка {fmt(before)} → {fmt(pe)}.')
    bafter = b.copy(); bafter.push(pm)
    tm = chess.Move.from_uci(threat['moves'][0][0]) if threat else None
    nb = None
    if threat:
        nb = b.copy(); nb.push(chess.Move.null())
    mate_t = threat and threat['moves'][0][1] <= -9000
    if reply and tm and reply == tm:
        T.append(f'Соперник мог ответить {chip(bafter, reply)} ({describe(bafter, reply)}) — и это была его угроза ещё до твоего хода. Ход её не учёл.')
    else:
        if reply:
            T.append(f'Соперник мог ответить {chip(bafter, reply)} ({describe(bafter, reply)}).')
        if tm:
            T.append(f'А ещё до твоего хода у соперника была идея {chip(nb, tm)} ({describe(nb, tm)}){" с матовой атакой" if mate_t else ""}.')
    T.append(f'\n\nСильнее {chip(b, bm)} ({fmt(before)}) — {describe(b, bm)}' + (f'. Например: {line_san(b, [chess.Move.from_uci(u) for u in pvs[best]], 6)}.' if pvs.get(best) else '.'))
    alts = [u for u in sorted(ev, key=ev.get, reverse=True)[1:4] if wp(before) - wp(ev[u]) <= 5]
    if alts:
        T.append('Тоже хорошо: ' + ', '.join(chip(b, chess.Move.from_uci(u)) for u in alts) + '.')
    return T


def retext(path):
    """Перегенерировать тексты в готовом exercises.json без движка."""
    ex = json.load(open(path))
    for e in ex:
        b = chess.Board(e['fen']); pm = chess.Move.from_uci(e['played']); bm = chess.Move.from_uci(e['best'])
        ev = e['evals']; pvs = e['pvs']; before = ev[e['best']]; pe = ev[e['played']]
        reply = chess.Move.from_uci(e['after']['reply']) if e.get('after') else None
        th = e.get('threat') if e.get('threat') and e['threat']['drop'] >= 150 else None
        T = make_text(b, pm, bm, before, pe, reply, th, ev, pvs, e['best'])
        if e['cat'] == 'pawn':
            hs = new_holes(b, pm, b.turn)
            if hs:
                T.append(f'\n\nПосле {b.san(pm)} навсегда ослабли пол{"е" if len(hs) == 1 else "я"} **{", ".join(chess.square_name(x) for x in hs)}** — их больше нельзя защитить пешкой.')
        elif e['cat'] == 'active':
            T.append(f'\n\n{b.san(pm)} — «активный» ход ({"шах" if b.gives_check(pm) else "взятие"}), но он не улучшает позицию.')
        e['text'] = ' '.join(T).replace(' \n\n', '\n\n')
    json.dump(ex, open(path, 'w'), ensure_ascii=False, separators=(',', ':'))
    print('retext', len(ex))


def main(apath, dpath):
    G = json.load(open(apath))
    deep = [json.loads(l) for l in open(dpath)]
    gidx = {g['idx']: g for g in G}
    eng = chess.engine.SimpleEngine.popen_uci('stockfish'); eng.configure({'Threads': 4, 'Hash': 256})

    # первая ошибка в каждой проигранной партии
    first_bad = {}
    for g in G:
        h = g['headers']; col = chess.WHITE if h['White'] == ME else chess.BLACK; P = g['plies']
        for i, p in enumerate(P[:-1]):
            b = chess.Board(p['fen'])
            if b.turn != col: continue
            bef = p['ev'] if col else -p['ev']; aft = P[i + 1]['ev'] if col else -P[i + 1]['ev']
            if wp(bef) >= 40 and wp(bef) - wp(aft) >= 15:
                first_bad[g['idx']] = i; break

    exercises = []
    seen_fen = set()
    for d in deep:
        g = gidx[d['gi']]; h = g['headers']; P = g['plies']; i = d['ply']
        col = chess.WHITE if d['col'] else chess.BLACK
        b = chess.Board(d['fen'])
        fenkey = ' '.join(d['fen'].split()[:4])
        if fenkey in seen_fen: continue
        ev = {u: v[0] for u, v in d['moves'].items()}
        pvs = {u: v[1] for u, v in d['moves'].items()}
        legal = {m.uci() for m in b.legal_moves}
        if not legal <= set(ev):  # должны быть оценены все ходы
            missing = legal - set(ev)
            if len(missing) > 3: continue
            for u in missing:
                r = eng.analyse(b, chess.engine.Limit(depth=12), root_moves=[chess.Move.from_uci(u)])
                ev[u] = r['score'].pov(col).score(mate_score=10000); pvs[u] = [m.uci() for m in r['pv'][:10]]
        best = max(ev, key=ev.get); before = ev[best]
        played = d['played']; pe = ev[played]
        wl = wp(before) - wp(pe)
        if wl < 10 or wp(before) < 22: continue
        # слишком много равноценных ходов — задача без ответа; слишком «единственный тактический» ход в проигранной — тоже
        good_alts = [u for u in ev if wp(before) - wp(ev[u]) <= 3]
        res_txt = h['Result']
        res = 'win' if (res_txt == '1-0' and col) or (res_txt == '0-1' and not col) else ('draw' if res_txt == '1/2-1/2' else 'loss')
        pm = chess.Move.from_uci(played); bm = chess.Move.from_uci(best)
        ppiece = b.piece_at(pm.from_square)
        after_best = P[i + 1].get('best'); after_pv = P[i + 1].get('pv', [])
        bafter = b.copy(); bafter.push(pm)
        reply = chess.Move.from_uci(after_best) if after_best else None
        if reply and reply not in bafter.legal_moves: reply = None
        # угроза (ход «с пропуском»)
        threat = None
        if d.get('threat') and not b.is_check():
            nb = b.copy(); nb.push(chess.Move.null())
            nb2 = chess.Board(nb.fen())
            infos = eng.analyse(nb2, chess.engine.Limit(depth=12), multipv=4)
            mv = sorted([(i2['pv'][0].uci(), i2['score'].pov(col).score(mate_score=10000)) for i2 in infos if 'pv' in i2], key=lambda x: x[1])
            if mv:
                threat = dict(drop=before - mv[0][1], moves=mv, pv=[m.uci() for m in infos[0]['pv'][:6]])
        # категория
        endgame = nonpawn(b, chess.WHITE) <= 13 and nonpawn(b, chess.BLACK) <= 13
        is_pawn = ppiece.piece_type == chess.PAWN and not b.is_capture(pm) and not pm.promotion
        is_active = b.gives_check(pm) or b.is_capture(pm)
        best_quiet = not b.is_capture(bm) and not b.gives_check(bm)
        best_piece = b.piece_at(bm.from_square).piece_type != chess.PAWN
        threat_real = threat and threat['drop'] >= 150
        ignored = threat_real and reply is not None and reply.uci() in [t[0] for t in threat['moves'][:2]]
        reply_tac = reply and (bafter.is_capture(reply) or bafter.gives_check(reply))
        if wp(before) >= 80: cat = 'convert'
        elif ignored: cat = 'threat'
        elif is_pawn and best_piece: cat = 'pawn'
        elif is_active and best_quiet: cat = 'active'
        elif reply_tac and wl >= 20: cat = 'cct'
        elif endgame: cat = 'endgame'
        elif best_quiet and abs(before) <= 250: cat = 'plan'
        else:
            continue  # чисто тактические позиции — их хватает на lichess
        if len(good_alts) > 6 and cat not in ('convert',): continue
        seen_fen.add(fenkey)
        tags = []
        if first_bad.get(g['idx']) == i and res == 'loss': tags.append('turning')
        if is_pawn: tags.append('pawn:' + chess.square_name(pm.to_square))
        T = make_text(b, pm, bm, before, pe, reply, threat if threat_real else None, ev, pvs, best)
        rule = None
        if cat == 'pawn':
            hs = new_holes(b, pm, col)
            if hs:
                T.append(f'\n\nПосле {b.san(pm)} навсегда ослабли пол{"е" if len(hs) == 1 else "я"} **{", ".join(chess.square_name(s) for s in hs)}** — их больше нельзя защитить пешкой.')
            rule = 'Правило «3 хода без пешек»: прежде чем двинуть пешку, найди три идеи без пешечных ходов — улучшение фигуры, профилактика, ладья на линию, король, давление на слабость.'
        elif cat == 'active':
            kind = 'шах' if b.gives_check(pm) else 'взятие'
            T.append(f'\n\n{b.san(pm)} — «активный» ход ({kind}), но он не улучшает позицию.')
            rule = 'Ход не становится хорошим только потому, что создаёт угрозу, выглядит агрессивно или заставляет соперника отвечать.'
        elif cat == 'convert':
            rule = 'Когда перевес большой — спроси: «какой самый ПРОСТОЙ способ выиграть?» Чем больше преимущество, тем меньше нужно осложнений.'
        elif cat == 'threat':
            rule = 'Перед ходом: «Если я сделаю нейтральный ход — что сделает соперник?» Сначала профилактика, потом свои идеи.'
        elif cat == 'cct':
            rule = 'CCT перед каждым ходом: какие шахи, взятия и угрозы будут у соперника после моего хода?'
        elif cat == 'plan':
            rule = 'Если убрать тактику с доски — твой ход всё ещё делает позицию лучше? Ищи худшую фигуру, а не лучший тактический ход.'
        elif cat == 'endgame':
            rule = 'В эндшпиле: активный король, ладья сзади проходной, не спеши с пешками — каждый пешечный ход необратим.'
        # худшая фигура
        worst = None
        act = piece_activity(b, col)
        if len(act) >= 3:
            plan_sq = None; plan_move = None; plan_text = None
            bb = b.copy()
            for k, u in enumerate(pvs.get(best, [])[:5]):
                mv = chess.Move.from_uci(u)
                if mv not in bb.legal_moves: break
                if k % 2 == 0:
                    pc = bb.piece_at(mv.from_square)
                    if pc and pc.piece_type not in (chess.PAWN, chess.KING) and not bb.is_capture(mv):
                        plan_sq = chess.square_name(mv.from_square)
                        plan_text = f'В лучшей линии движка {"сразу" if k == 0 else "вскоре"} улучшается {NOM[pc.piece_type]} {plan_sq}: ' + ('{{' + u + '|' + bb.san(mv) + '}}' if k == 0 else bb.san(mv)) + '.'
                        if k == 0: plan_move = u
                        break
                bb.push(mv)
            worst = dict(list=act[:2], plan=plan_sq, planMove=plan_move)
            if plan_text: worst['planText'] = plan_text
        prev_fen = P[i - 1]['fen'] if i > 0 else None
        last = P[i - 1]['played'] if i > 0 else None
        keep_pv = {u: pvs[u][:10] for u in sorted(ev, key=ev.get, reverse=True)[:4]}
        keep_pv[played] = pvs.get(played, [])[:10]
        site = h['Site'].rsplit('/', 1)[-1]
        opp = h['Black'] if col else h['White']
        oppelo = h['BlackElo'] if col else h['WhiteElo']
        exercises.append(dict(
            id=f'{site}:{i}', cat=cat, tags=tags, fen=d['fen'], color='w' if col else 'b', last=last, prevFen=prev_fen,
            game=dict(id=site, opp=f'{opp} ({oppelo})', tc=h['TimeControl'].replace('+0', '+0').replace('180+0', '3+0').replace('300+0', '5+0').replace('600+0', '10+0'),
                      date=h['Date'].replace('.', '-'), ply=i + 1, n=b.fullmove_number, res=res),
            played=played, evals=ev, pvs=keep_pv, best=best, threat=threat,
            after=dict(reply=reply.uci(), pv=[x for x in after_pv[:8]]) if reply else None,
            text=' '.join(T).replace(' \n\n', '\n\n'), rule=rule, worst=worst, weight=round(wl, 1), before=before))
    eng.quit()
    return G, exercises, first_bad

def diagnosis(G, exercises, first_bad):
    rows = []; games = []
    for g in G:
        h = g['headers']; col = chess.WHITE if h['White'] == ME else chess.BLACK; P = g['plies']
        r = h['Result']; res = 'win' if (r == '1-0' and col) or (r == '0-1' and not col) else ('draw' if r == '1/2-1/2' else 'loss')
        mx = 0; mxi = None; coll = None
        for i, p in enumerate(P[:-1]):
            b = chess.Board(p['fen'])
            if b.turn != col: continue
            bef = p['ev'] if col else -p['ev']; aft = P[i + 1]['ev'] if col else -P[i + 1]['ev']
            m = chess.Move.from_uci(p['played'])
            ph = 'opening' if b.fullmove_number <= 10 else ('endgame' if nonpawn(b, chess.WHITE) + nonpawn(b, chess.BLACK) <= 26 else 'middlegame')
            rows.append(dict(bef=bef, aft=aft, wl=wp(bef) - wp(aft), ph=ph, pawn=b.piece_at(m.from_square).piece_type == chess.PAWN,
                             cap=b.is_capture(m), chk=b.gives_check(m), file=chess.square_name(m.from_square)[0], tc=h['TimeControl']))
            if wp(bef) > mx: mx = wp(bef); mxi = i
            if coll is None and wp(bef) >= 80 and wp(bef) - wp(aft) >= 25 and res != 'win':
                coll = (i, b.fullmove_number, p['san'], bef, aft)
        games.append(dict(g=g, col=col, res=res, mx=mx, coll=coll, tc=h['TimeControl'], term=h.get('Termination')))
    err = lambda rr: 100 * sum(1 for r in rr if r['wl'] >= 20) / max(1, len(rr))
    out = {}
    dates = sorted(g['headers']['Date'] for g in G)
    f = lambda s: '.'.join(reversed(s.split('.')[1:]))
    out['games'] = len(G); out['period'] = f'{f(dates[0])}–{f(dates[-1])}.{dates[-1][:4]}'
    sc = collections.Counter(x['res'] for x in games); out['score'] = dict(win=sc['win'], loss=sc['loss'], draw=sc['draw'])
    won = [x for x in games if x['mx'] >= 85]
    out['conversion'] = dict(total=len(won), lost=sum(1 for x in won if x['res'] == 'loss'), drawn=sum(1 for x in won if x['res'] == 'draw'), won=sum(1 for x in won if x['res'] == 'win'))
    out['errBetter'] = err([r for r in rows if 70 <= wp(r['bef']) < 85])
    fb = []
    for x in games:
        if x['res'] == 'loss' and x['g']['idx'] in first_bad:
            fb.append(chess.Board(x['g']['plies'][first_bad[x['g']['idx']]]['fen']).fullmove_number)
    out['medianFirstBad'] = int(statistics.median(fb)) if fb else 0
    out['phase'] = [dict(l=n, v=err([r for r in rows if r['ph'] == k]), n=sum(1 for r in rows if r['ph'] == k)) for k, n in [('opening', 'Дебют (ходы 1–10)'), ('middlegame', 'Миддлшпиль'), ('endgame', 'Эндшпиль')]]
    out['byEval'] = [dict(l=n, v=err([r for r in rows if lo <= wp(r['bef']) < hi])) for n, lo, hi in [('Проигрываю (<30%)', 0, 30), ('Равно (30–70%)', 30, 70), ('Лучше (70–85%)', 70, 85), ('Выиграно (85%+)', 85, 101)]]
    mid = [r for r in rows if r['ph'] != 'opening']
    out['moveKinds'] = [dict(l='Шахи', v=err([r for r in mid if r['chk']])), dict(l='Взятия', v=err([r for r in mid if r['cap'] and not r['chk']])),
                        dict(l='Тихие фигурные ходы', v=err([r for r in mid if not r['cap'] and not r['chk'] and not r['pawn']])),
                        dict(l='Тихие пешечные ходы', v=err([r for r in mid if not r['cap'] and not r['chk'] and r['pawn']]))]
    pf = []
    for fl in 'abcdefgh':
        rr = [r for r in mid if r['pawn'] and not r['cap'] and r['file'] == fl]
        if rr: pf.append(dict(f=fl, n=len(rr), v=100 * sum(1 for r in rr if r['wl'] >= 15) / len(rr)))
    out['pawnFiles'] = pf
    out['cats'] = [dict(c=c, n=n) for c, n in collections.Counter(e['cat'] for e in exercises).most_common()]
    tcs = []
    for tc, nm in [('180+0', '3+0'), ('300+0', '5+0'), ('600+0', '10+0')]:
        gg = [x for x in games if x['tc'] == tc]
        if gg: tcs.append(dict(l=f'{nm} ({len(gg)} партий)', score=100 * (sum(1 for x in gg if x['res'] == 'win') + 0.5 * sum(1 for x in gg if x['res'] == 'draw')) / len(gg)))
    out['tc'] = tcs
    tf = collections.Counter((x['res'], x['term']) for x in games)
    out['tcNote'] = f"Ты выиграл по времени {tf[('win', 'Time forfeit')]} партий и проиграл по времени всего {tf[('loss', 'Time forfeit')]}: проблема не в скорости, а в качестве решений. Для роста лучше 10+5 / 15+10, а 3+0 — отдельный режим."
    # дебюты по первым ходам
    op = collections.defaultdict(list)
    for x in games:
        P = x['g']['plies']; bb = chess.Board(P[0]['fen']); sans = []
        for p in P[:4]:
            if 'played' not in p: break
            sans.append(bb.san(chess.Move.from_uci(p['played']))); bb.push(chess.Move.from_uci(p['played']))
        key = ('Белыми: ' if x['col'] else 'Чёрными: ') + ' '.join(sans[:4])
        op[key].append(x['res'])
    ops = sorted(op.items(), key=lambda kv: -len(kv[1]))[:10]
    out['openings'] = [dict(l=k, n=len(v), score=100 * (v.count('win') + 0.5 * v.count('draw')) / len(v)) for k, v in ops if len(v) >= 3]
    exid = {e['id'].split(':')[0] + ':' + e['id'].split(':')[1]: e['id'] for e in exercises}
    coll = []
    for x in games:
        if x['coll'] and x['mx'] >= 85:
            i, n, san, bef, aft = x['coll']; h = x['g']['headers']; site = h['Site'].rsplit('/', 1)[-1]
            opp = h['Black'] if x['col'] else h['White']
            coll.append(dict(id=site, ex=exid.get(f'{site}:{i}'), opp=opp, tc=h['TimeControl'].replace('180+0', '3+0').replace('300+0', '5+0').replace('600+0', '10+0'),
                             res={'loss': 'поражение', 'draw': 'ничья'}[x['res']], desc=f'{n}{"." if chess.Board(x["g"]["plies"][i]["fen"]).turn else "..."}{san}: {fmt(bef)} → {fmt(aft)}', w=bef - aft))
    out['collapses'] = sorted(coll, key=lambda c: (c['ex'] is None, -c['w']))[:14]
    return out

TEXT = [
    'Твой потолок высокий: ты регулярно получаешь выигранные позиции — в {total} партиях из {games} шансы на победу доходили до 85% и выше. Но **{lost} из них ты проиграл** и ещё {drawn} свёл вничью. Это главный резерв рейтинга: не новые дебюты и не тактика, а умение довести хорошую позицию до конца.',
    'Самая опасная для тебя ситуация — когда позиция **просто лучше** (шансы 70–85%). Здесь {errBetter:.0f}% ходов — ошибки: почти каждый четвёртый ход. В равных позициях ошибок {errEqual:.1f}%, в выигранных — {errWon:.1f}%. Типичная картина: перевес появился, хочется «добить», и ты делаешь активный ход вместо улучшающего.',
    'Ошибки сосредоточены в **миддлшпиле** ({mid:.1f}% ходов против {op:.1f}% в дебюте). Первая серьёзная ошибка в проигранных партиях обычно случается к {medianFirstBad}-му ходу — раньше, чем кажется. Последний зевок — часто только следствие.',
    'Шахи и взятия ты считаешь нормально (ошибки {chk:.1f}% и {cap:.1f}%). Хуже всего — **тихие ходы** ({quiet:.1f}%), где нужно понять план и идею соперника. Отсюда приоритеты: профилактика («что он хочет?»), контроль пешечных ходов, улучшение худшей фигуры.',
    'Скорость — не твоя проблема: по времени ты выиграл гораздо больше партий, чем проиграл. Поэтому для роста играй 10+5 и 15+10 и тренируй **качество решений**, а 3+0 оставь как отдельный режим.',
]

if __name__ == '__main__':
    if sys.argv[1] == '--retext':
        retext(os.path.join(DATA, 'exercises.json')); sys.exit()
    G, ex, fb = main(sys.argv[1], sys.argv[2])
    pri = dict(threat=0, pawn=1, convert=2, cct=3, active=4, plan=5, endgame=6)
    ex.sort(key=lambda e: (pri[e['cat']], -e['weight']))
    json.dump(ex, open(os.path.join(DATA, 'exercises.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    dg = diagnosis(G, ex, fb)
    ph = {p['l']: p['v'] for p in dg['phase']}
    be = {p['l']: p['v'] for p in dg['byEval']}
    mk = {p['l']: p['v'] for p in dg['moveKinds']}
    ctx = dict(total=dg['conversion']['total'], games=dg['games'], lost=dg['conversion']['lost'], drawn=dg['conversion']['drawn'],
               errBetter=dg['errBetter'], errEqual=be['Равно (30–70%)'], errWon=be['Выиграно (85%+)'], mid=ph['Миддлшпиль'], op=ph['Дебют (ходы 1–10)'],
               medianFirstBad=dg['medianFirstBad'], chk=mk['Шахи'], cap=mk['Взятия'], quiet=(mk['Тихие фигурные ходы'] + mk['Тихие пешечные ходы']) / 2)
    dg['text'] = [t.format(**ctx) for t in TEXT]
    json.dump(dg, open(os.path.join(DATA, 'diagnosis.json'), 'w'), ensure_ascii=False, indent=0)
    print('exercises', len(ex), collections.Counter(e['cat'] for e in ex))
    print('turning', sum(1 for e in ex if 'turning' in e['tags']))
    print(json.dumps({k: v for k, v in dg.items() if k not in ('collapses', 'text')}, ensure_ascii=False)[:1500])
    for t in dg['text']: print('-', t)
