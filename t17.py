import time, json
from playwright.sync_api import sync_playwright
def boot(pg, state=None, clear=True):
    pg.goto('http://localhost:8766/dist/index.html'); time.sleep(1)
    if clear: pg.evaluate("localStorage.clear()")
    if state: pg.evaluate("localStorage.setItem('bloom-game-v3', %s)" % json.dumps(json.dumps(state)))
    pg.reload(); time.sleep(2); pg.click('#go'); pg.evaluate('__bloom.step(5)')
with sync_playwright() as p:
    b=p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    pg=b.new_page(viewport={'width':360,'height':780}, device_scale_factor=2); pg.set_default_timeout(240000)
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    boot(pg)
    pg.evaluate("__bloom.player.x=__bloom.P.rocket.x-1.5; __bloom.player.z=__bloom.P.rocket.z+3.6; __bloom.step(10)"); time.sleep(0.3)
    print('A bag', pg.evaluate("JSON.stringify(__bloom.bag)"), '| toast:', pg.evaluate("document.getElementById('toast').textContent")[:160])
    print('A rocket cost', pg.evaluate("JSON.stringify(__bloom.rocket.site.cost())"))
    pg.screenshot(path='shots/r1_rocket.png')
    # max the smelter, install fuel blueprint
    pg.evaluate("""(()=>{const B=__bloom; const rf=B.refiners.find(r=>r.id==='smelter'); rf.repaired=true; rf.level=rf.upgrades.length; B.refreshRefiner(rf); B.player.x=rf.x; B.player.z=rf.z+2.6; B.step(20);})()""")
    print('A smelter bp', pg.evaluate("[__bloom.refiners.find(r=>r.id==='smelter').bp, __bloom.bag.bpFuel||0]"))
    pg.evaluate("""(()=>{const B=__bloom; const rf=B.refiners.find(r=>r.id==='smelter'); B.player.x=rf.x; B.player.z=rf.z+5; B.step(5);})()"""); time.sleep(0.3)
    pg.screenshot(path='shots/r2_discs.png')
    # load alt inputs and run, then switch to original and run, then pick up both
    pg.evaluate("""(()=>{const B=__bloom; const rf=B.refiners.find(r=>r.id==='smelter'); B.give('goldBar',4); B.give(B.P.roles.C,8); B.player.x=rf.inX; B.player.z=rf.z; B.step(60);
       B.player.x=rf.x; B.player.z=rf.z+5; B.step(30*30); B.give('gold',6); B.give('wood',3);
       B.player.x=rf.x-1.7; B.player.z=rf.z+2.7; B.step(5); B.player.x=rf.inX; B.player.z=rf.z; B.step(60); B.player.x=rf.x; B.player.z=rf.z+5; B.step(30*25);})()""")
    print('A outs', pg.evaluate("JSON.stringify(__bloom.refiners.find(r=>r.id==='smelter').outs)"), 'mode', pg.evaluate("__bloom.refiners.find(r=>r.id==='smelter').mode"))
    pg.evaluate("""(()=>{const B=__bloom; const rf=B.refiners.find(r=>r.id==='smelter'); B.player.x=rf.x; B.player.z=rf.z+3.5; B.step(3)})()"""); time.sleep(0.3)
    pg.screenshot(path='shots/r3_tray.png')
    pg.evaluate("""(()=>{const B=__bloom; const rf=B.refiners.find(r=>r.id==='smelter'); B.player.x=rf.outX; B.player.z=rf.z; B.step(30*4)})()""")
    print('A bag after pickup', pg.evaluate("JSON.stringify(__bloom.bag)"))
    # offers early, hold wants
    print('A offers', pg.evaluate("JSON.stringify(__bloom.offers().map(o=>[o.type,o.name,o.tool,o.mat,o.amount,o.landmark]))"))
    pg.evaluate("__bloom.player.x=__bloom.P.rocket.x+0.75; __bloom.player.z=__bloom.P.rocket.z+2.9; __bloom.step(5)"); time.sleep(0.3)
    print('A hold html', pg.evaluate("document.getElementById('hold').innerText.replace(/\\n/g,' | ')"))
    pg.screenshot(path='shots/r4_hold.png')
    print('errors', errs[:5]); b.close()
