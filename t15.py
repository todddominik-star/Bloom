import time, json, sys
from playwright.sync_api import sync_playwright
kind=sys.argv[1] if len(sys.argv)>1 else 'relic'
with sync_playwright() as p:
    b=p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    pg=b.new_page(viewport={'width':360,'height':780}, device_scale_factor=2); pg.set_default_timeout(240000)
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8766/dist/index.html'); time.sleep(1)
    m={'seed':777,'name':'Pella','look':'sand','type':kind,'tool':'pick','critter':'Moss'}
    pg.evaluate("localStorage.clear(); localStorage.setItem('bloom-game-v3', JSON.stringify({planet:1, seed:777, crew:[], tools:{pick:1,axe:1,bag:1,suit:1}, skills:{}, mission:%s, relics:{pick:2,axe:0,suit:0,bag:0}}))" % json.dumps(m))
    pg.reload(); time.sleep(2); pg.click('#go'); pg.evaluate('__bloom.step(5)')
    print('mission', pg.evaluate("[__bloom.MISSION.type, __bloom.gens.length, __bloom.rockObjs.length, __bloom.critters.length]"))
    # repair hut
    pg.evaluate("const s=__bloom.hut.site; s.complete(); __bloom.step(10)"); time.sleep(1.5)
    print('after hut', pg.evaluate("JSON.stringify(__bloom.ms)"), pg.evaluate("document.getElementById('toast').textContent"))
    pg.evaluate("__bloom.player.x=__bloom.P.hut.x+1; __bloom.player.z=__bloom.P.hut.z+6; __bloom.step(30)"); time.sleep(0.3); pg.screenshot(path='shots/k1_scanner.png')
    # max all generators via site.complete
    pg.evaluate("for (const g of __bloom.gens) { while (g.level < g.radii.length-1) g.site.complete(); }"); time.sleep(5.5)
    print('parts', pg.evaluate("JSON.stringify(__bloom.ms)"), pg.evaluate("document.getElementById('toast').textContent"))
    # scan a wrong rock first, then the right one
    r=pg.evaluate("(()=>{const B=__bloom; const w=B.rockObjs.find(r=>r!==B.targetRock); B.player.x=w.x; B.player.z=w.z+4; B.step(3); return document.getElementById('toast').textContent})()")
    print('wrong rock:', r)
    pg.evaluate("const t=__bloom.targetRock; __bloom.player.x=t.x; __bloom.player.z=t.z+3.4; __bloom.step(3)"); time.sleep(0.2)
    print('found', pg.evaluate("__bloom.ms.found"), pg.evaluate("document.getElementById('toast').textContent"))
    pg.evaluate("__bloom.step(20)"); time.sleep(0.3); pg.screenshot(path='shots/k2_crack.png')
    pg.evaluate("__bloom.step(30*5)"); time.sleep(3.5); pg.evaluate("__bloom.step(30*3)")
    print('after', pg.evaluate("JSON.stringify(__bloom.ms)"), pg.evaluate("JSON.stringify(__bloom.game.relics)"), pg.evaluate("document.getElementById('toast').textContent"))
    time.sleep(4); print('toast2', pg.evaluate("document.getElementById('toast').textContent"), 'bagcap/air', pg.evaluate("document.getElementById('cap').textContent"))
    pg.screenshot(path='shots/k3_open.png')
    # reload keeps it
    pg.evaluate("__bloom.save()"); pg.reload(); time.sleep(2); pg.click('#go'); pg.evaluate('__bloom.step(5)')
    print('reload', pg.evaluate("[__bloom.ms.done, __bloom.targetRock.model.visible, __bloom.critters.length, JSON.stringify(__bloom.game.relics)]"))
    pg.evaluate("__bloom.openMap()"); time.sleep(0.3); print('map mission', pg.evaluate("document.getElementById('mapmission').textContent"))
    print('errors', errs[:5]); b.close()
