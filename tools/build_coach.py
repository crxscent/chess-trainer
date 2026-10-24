"""Данные для страницы «Тренер»: партии до и после начала тренировок, испанская и сицилианская. -> data/coach.json"""
import json, math, os, collections, chess
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SPLIT = '2026.10.09'
def wp(cp): cp = max(-1500, min(1500, cp)); return 50 + 50 * (2 / (1 + math.exp(-0.00368208 * cp)) - 1)
games = [json.loads(l) for l in open(os.path.join(ROOT, 'raw', 'an', 'games.jsonl'))]
rows = []
for g in games:
    h = g['headers']; P = g['plies']; col = chess.WHITE if h['White'].lower() == 'fem_t_o' else chess.BLACK
    r = h['Result']; res = 1 if (r == '1-0') == (col == chess.WHITE) and r != '1/2-1/2' else (0.5 if r == '1/2-1/2' else 0)
    b = chess.Board(P[0]['fen']); sans = []
    for p in P[:8]:
        if 'played' not in p: break
        sans.append(b.san(chess.Move.from_uci(p['played']))); b.push(chess.Move.from_uci(p['played']))
    s = ' '.join(sans)
    if s.startswith('e4 e5 Nf3 Nc6 Bb5') and col: fam = 'Испанская (белыми)'
    elif s.startswith('e4 c5') and not col: fam = 'Сицилианская (чёрными)'
    elif s.startswith('e4 c5') and col: fam = 'Против сицилианской (белыми)'
    else: fam = None
    mv = 0; err = 0; better = 0; errb = 0; first = None; maxwp = 0
    for i, p in enumerate(P[:-1]):
        bb = chess.Board(p['fen'])
        if bb.turn != col or 'played' not in p: continue
        bef = p['ev'] if col else -p['ev']; aft = P[i + 1]['ev'] if col else -P[i + 1]['ev']
        l = wp(bef) - wp(aft); mv += 1; maxwp = max(maxwp, wp(bef))
        if l >= 20: err += 1
        if 70 <= wp(bef) < 85:
            better += 1; errb += l >= 20
        if first is None and l >= 15 and wp(bef) >= 40: first = bb.fullmove_number
    tc = h.get('TimeControl', '-'); base = int(tc.split('+')[0]) if '+' in tc else 0
    rows.append(dict(date=h.get('Date', ''), res=res, fam=fam, mv=mv, err=err, better=better, errb=errb, first=first,
                     won=maxwp >= 85, blitz3=base and base <= 180, line=s))
def agg(rr):
    n = len(rr) or 1; mv = sum(r['mv'] for r in rr) or 1; bt = sum(r['better'] for r in rr) or 1
    won = [r for r in rr if r['won']]
    return dict(games=len(rr), score=sum(r['res'] for r in rr) / n, err=100 * sum(r['err'] for r in rr) / mv, errBetter=100 * sum(r['errb'] for r in rr) / bt,
                blitz3=sum(1 for r in rr if r['blitz3']) / n, conv=dict(total=len(won), lostShare=sum(1 for r in won if r['res'] == 0) / (len(won) or 1)) if won else None)
base = [r for r in rows if r['date'] < SPLIT]; recent = [r for r in rows if r['date'] >= SPLIT]
ops = []
for fam in ['Испанская (белыми)', 'Сицилианская (чёрными)', 'Против сицилианской (белыми)']:
    rr = [r for r in rows if r['fam'] == fam]
    if not rr: continue
    fb = sorted(r['first'] for r in rr if r['first'] and r['res'] == 0)
    ops.append(dict(name=fam, games=len(rr), score=sum(r['res'] for r in rr) / len(rr), firstBad=fb[len(fb) // 2] if fb else None,
                    err=100 * sum(r['err'] for r in rr) / (sum(r['mv'] for r in rr) or 1)))
notes = []
sic = [r for r in rows if r['fam'] == 'Сицилианская (чёрными)']
if sic:
    c = collections.Counter(' '.join(r['line'].split()[:4]) for r in sic)
    top = ', '.join(f'1.{k.split()[0]} {k.split()[1]} 2.{k.split()[2]} {k.split()[3]}' + f' ({v})' for k, v in c.most_common(3) if len(k.split()) >= 4)
    notes.append(f'Сицилианская: чаще всего встречается {top}. Против 2.Nf3 Nc6 твой курс — ускоренный дракон; против остальных — антисицилианские линии того же курса.')
ws = [r for r in rows if r['fam'] == 'Против сицилианской (белыми)']
if ws:
    c = collections.Counter(r['line'].split()[2] if len(r['line'].split()) > 2 else '?' for r in ws)
    notes.append(f'Против сицилианской ты играл вторым ходом: ' + ', '.join(f'{k} — {v}' for k, v in c.most_common(4)) + '. Репертуар тренажёра — Алапин (2.c3): одна система вместо нескольких.')
ruy = [r for r in rows if r['fam'] == 'Испанская (белыми)']
if ruy:
    notes.append(f'Испанская: {len(ruy)} партий, первая серьёзная ошибка в проигранных — около {ops[0]["firstBad"]}-го хода. Это миддлшпиль после дебюта: тренируй «Сыграй структуру» в закрытой и открытой испанской.')
json.dump(dict(split='9 октября', base=agg(base), recent=agg(recent), openings=ops, notes=notes),
          open(os.path.join(ROOT, 'data', 'coach.json'), 'w'), ensure_ascii=False)
print(json.dumps(dict(base=agg(base), recent=agg(recent), openings=ops), ensure_ascii=False, indent=0)[:1500]); print(notes)
