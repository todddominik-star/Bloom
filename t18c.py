import time, json
from playwright.sync_api import sync_playwright
def boot(pg, state=None, save=None):
    pg.goto('http://localhost:8766/dist/index.html'); time.sleep(1)
    pg.evaluate("localStorage.clear()")
    if state: pg.evaluate("localStorage.setItem('bloom-game-v3', %s)" % json.dumps(json.dumps(state)))
    if save: pg.evaluate("localStorage.setItem('bloom-save-v3-p%d', %s)" % (state['planet'], json.dumps(json.dumps(save))))
    pg.reload(); time.sleep(2); pg.click('#go'); pg.evaluate('__bloom.step(5)')
with sync_playwright() as p:
    b=p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    pg=b.new_page(viewport={'width':360,'height':780}, device_scale_factor=2); pg.set_default_timeout(240000)
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    # C: an older save in progress on planet 1 (gen 1), three parts found before the new rules
    m2={'seed':555,'name':'Y','look':'teal','type':'relic','tool':'axe'}
    st={'planet':1,'seed':555,'crew':[],'tools':{'pick':1,'axe':1,'bag':1,'suit':1},'skills':{},'mission':m2,'relics':{'pick':0,'axe':0,'suit':0,'bag':0}}
    boot(pg, st)
    mats1=pg.evaluate("JSON.stringify(__bloom.P.materials)"); gl=pg.evaluate("__bloom.gens.length")
    pg.evaluate("__bloom.ms.partsGot=[1,2,3]; __bloom.ms.seen=true; __bloom.refiners[0].repaired=true; __bloom.save()")
    pg.goto('http://localhost:8766/t18.py'); time.sleep(0.5)
    pg.evaluate("(()=>{const d=JSON.parse(localStorage.getItem('bloom-save-v3-p1')); delete d.mission.delivered; d.refiners[0].out=5; delete d.refiners[0].outs; localStorage.setItem('bloom-save-v3-p1', JSON.stringify(d));})()")
    pg.goto('http://localhost:8766/dist/index.html'); time.sleep(2)
    print('C pre-go', pg.evaluate("[JSON.stringify(__bloom.refiners[0].outs), __bloom.ms.delivered, __bloom.player.x, JSON.parse(localStorage.getItem('bloom-save-v3-p1')).x]"))
    pg.click('#go'); pg.evaluate('__bloom.step(5)')
    print('C same planet', mats1 == pg.evaluate("JSON.stringify(__bloom.P.materials)"), gl == pg.evaluate("__bloom.gens.length"), mats1, '| delivered', pg.evaluate("__bloom.ms.delivered"), '| outs', pg.evaluate("JSON.stringify(__bloom.refiners[0].outs)"))
    print('errors', errs[:5]); b.close()
