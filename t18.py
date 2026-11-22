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
    # B: a landmark world (planet 4, gen 2) with a relic mission
    m={'seed':991,'name':'X','look':'dusk','type':'relic','tool':'pick'}
    boot(pg, {'planet':4,'seed':991,'gen':2,'crew':[],'tools':{'pick':2,'axe':2,'bag':2,'suit':2},'skills':{},'mission':m,'relics':{'pick':0,'axe':0,'suit':0,'bag':0}})
    print('B planet', pg.evaluate("[__bloom.P.name, __bloom.P.radius, __bloom.gens.length, JSON.stringify(__bloom.P.materials), !!__bloom.dam]"))
    print('B rocket lock', pg.evaluate("__bloom.rocket.site.locked && __bloom.rocket.site.locked()"))
    pg.evaluate("const d=__bloom.dam; __bloom.player.x=d.x; __bloom.player.z=d.z+4; __bloom.step(5)"); time.sleep(0.3); pg.screenshot(path='shots/l1_dam.png')
    pg.evaluate("for (const [m,n] of Object.entries(__bloom.P.dam.cost)) __bloom.give(m,n); const d=__bloom.dam; __bloom.player.x=d.x; __bloom.player.z=d.z; __bloom.step(30*12)")
    time.sleep(4); pg.evaluate("__bloom.step(10)")
    print('B dam cleared', pg.evaluate("__bloom.dam.cleared"), pg.evaluate("JSON.stringify(__bloom.game.relics)"))
    pg.evaluate("const d=__bloom.dam; __bloom.player.x=d.x; __bloom.player.z=d.z+5; __bloom.step(5)"); time.sleep(0.3); pg.screenshot(path='shots/l2_flow.png')
    # scanner: hut, parts to bag, deliver
    pg.evaluate("__bloom.hut.site.complete(); __bloom.step(10)"); time.sleep(1.5)
    pg.evaluate("for (const g of __bloom.gens) { while (g.level < g.radii.length-1) g.site.complete(); }"); time.sleep(4); pg.evaluate("__bloom.step(30*3)")
    print('B parts in bag', pg.evaluate("__bloom.bag.scanPart"), 'need', pg.evaluate("__bloom.ms.partsGot.length"))
    pg.evaluate("__bloom.player.x=__bloom.P.hut.x-1.3; __bloom.player.z=__bloom.P.hut.z+2.9; __bloom.step(30*6)"); time.sleep(0.5)
    print('B delivered', pg.evaluate("[__bloom.ms.delivered, __bloom.ms.ready, __bloom.bag.scanner, __bloom.bag.scanPart]"), pg.evaluate("document.getElementById('toast').textContent")[:120])
    pg.evaluate("const t=__bloom.targetRock; __bloom.player.x=t.x; __bloom.player.z=t.z+3.4; __bloom.step(3)")
    print('B found', pg.evaluate("__bloom.ms.found"))
    pg.evaluate("const t=__bloom.targetRock; __bloom.player.x=t.x; __bloom.player.z=t.z+7; __bloom.step(3)"); time.sleep(0.3); pg.screenshot(path='shots/l3_seam.png')
    pg.evaluate("__bloom.openMap()"); time.sleep(0.4); pg.screenshot(path='shots/l4_map.png'); pg.evaluate("__bloom.closeMap()")
    pg.evaluate("__bloom.openGalaxy(false)"); time.sleep(0.4); pg.screenshot(path='shots/l5_galaxy.png')
    print('B galhint', pg.evaluate("document.getElementById('galhint').textContent"))
    # C: an older save in progress on planet 1 (gen 1), three parts found before the new rules
    m2={'seed':555,'name':'Y','look':'teal','type':'relic','tool':'axe'}
    st={'planet':1,'seed':555,'crew':[],'tools':{'pick':1,'axe':1,'bag':1,'suit':1},'skills':{},'mission':m2,'relics':{'pick':0,'axe':0,'suit':0,'bag':0}}
    boot(pg, st)
    mats1=pg.evaluate("JSON.stringify(__bloom.P.materials)"); gl=pg.evaluate("__bloom.gens.length")
    pg.evaluate("__bloom.ms.partsGot=[1,2,3]; __bloom.ms.seen=true; __bloom.refiners[0].repaired=true; __bloom.save(); const d=JSON.parse(localStorage.getItem('bloom-save-v3-p1')); delete d.mission.delivered; d.refiners[0].out=5; delete d.refiners[0].outs; d.x=-9999; localStorage.setItem('bloom-save-v3-p1', JSON.stringify(d)); window.__keep = JSON.stringify(d); addEventListener('pagehide', () => localStorage.setItem('bloom-save-v3-p1', window.__keep));")
    print('C stored', pg.evaluate("(()=>{const d=JSON.parse(localStorage.getItem('bloom-save-v3-p1')); return [d.mission.partsGot, d.mission.delivered, d.refiners[0].out]})()"))
    pg.reload(); time.sleep(2); pg.click('#go'); pg.evaluate('__bloom.step(5)')
    print('C same planet', mats1 == pg.evaluate("JSON.stringify(__bloom.P.materials)"), gl == pg.evaluate("__bloom.gens.length"), mats1, '| delivered', pg.evaluate("__bloom.ms.delivered"), '| outs', pg.evaluate("JSON.stringify(__bloom.refiners[0].outs)"))
    print('errors', errs[:5]); b.close()
