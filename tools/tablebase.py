"""Запрос к tablebase.lichess.ovh с кэшем."""
import json, os, time, urllib.request, urllib.parse
CACHE=os.path.join(os.path.dirname(os.path.abspath(__file__)),'.tbcache.json')
_c=json.load(open(CACHE)) if os.path.exists(CACHE) else {}
def tb(fen):
    k=' '.join(fen.split()[:4])
    if k in _c: return _c[k]
    url='https://tablebase.lichess.ovh/standard?fen='+urllib.parse.quote(fen.replace(' ','_'),safe='_/')
    for a in range(5):
        try:
            with urllib.request.urlopen(url,timeout=20) as r: d=json.load(r); break
        except Exception as e:
            time.sleep(1.5*(a+1))
    else: raise RuntimeError('tb fail '+fen)
    _c[k]=d; json.dump(_c,open(CACHE,'w')); time.sleep(0.25)
    return d
