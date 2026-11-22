import time, json
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    pg=b.new_page(viewport={'width':360,'height':780}, device_scale_factor=2); pg.set_default_timeout(240000)
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8766/dist/index.html'); time.sleep(1)
    m={'seed':991,'name':'X','look':'dusk','type':'relic','tool':'pick'}
    st={'planet':1,'seed':991,'gen':2,'crew':[],'tools':{'pick':2,'axe':2,'bag':2,'suit':2},'skills':{},'mission':m,'relics':{'pick':0,'axe':0,'suit':0,'bag':0}}
    pg.evaluate("localStorage.clear(); localStorage.setItem('bloom-game-v3', %s)" % json.dumps(json.dumps(st)))
    pg.reload(); time.sleep(2); pg.click('#go'); pg.evaluate('__bloom.step(5)')
    pg.evaluate("__bloom.player.x=__bloom.P.rocket.x-1.5; __bloom.player.z=__bloom.P.rocket.z+3.6; __bloom.step(10)")
    print('bp before 50%', pg.evaluate("JSON.stringify(__bloom.bag)"))
    pg.evaluate("__bloom.hut.site.complete(); __bloom.hut.site.complete(); __bloom.hut.site.complete(); __bloom.step(5)"); time.sleep(1.5)
    hs=lambda: pg.evaluate("__bloom.hut.site.el.innerText.replace(/\\n/g,' | ')")
    print('hut maxed:', hs())
    pg.evaluate("__bloom.hut.parts=2; __bloom.hut.shield=true; __bloom.player.x=__bloom.P.hut.x; __bloom.player.z=__bloom.P.hut.z+2.1; __bloom.step(30)")
    print('shield taken:', hs())
    pg.evaluate("for (const g of __bloom.gens) { while (g.level < g.radii.length-1) g.site.complete(); }"); time.sleep(4); pg.evaluate("__bloom.step(60)")
    pg.evaluate("__bloom.player.x=__bloom.P.hut.x-1.3; __bloom.player.z=__bloom.P.hut.z+2.9; __bloom.step(30*6)"); time.sleep(0.5)
    print('scanner picked up:', hs(), pg.evaluate("__bloom.ms.ready"))
    pg.evaluate("__bloom.player.x=__bloom.P.rocket.x-1.5; __bloom.player.z=__bloom.P.rocket.z+3.6; __bloom.step(10)")
    print('bp after 50%', pg.evaluate("[__bloom.bag.bpFuel, __bloom.bag.bpAir, __bloom.bag.bpFood]"))
    pg.evaluate("__bloom.player.x=__bloom.P.hut.x+2.7; __bloom.player.z=__bloom.P.hut.z+5; __bloom.step(5)"); time.sleep(0.3); pg.screenshot(path='shots/hut_home.png')
    print('errors', errs[:3]); b.close()
