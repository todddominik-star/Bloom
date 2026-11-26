import time, json
from playwright.sync_api import sync_playwright
def boot(pg, state=None):
    pg.goto('http://localhost:8766/dist/index.html'); time.sleep(1)
    pg.evaluate("localStorage.clear()")
    if state: pg.evaluate("localStorage.setItem('bloom-game-v3', %s)" % json.dumps(json.dumps(state)))
    pg.reload(); time.sleep(2); pg.click('#go'); pg.evaluate('__bloom.step(5)')
T=lambda pg: pg.evaluate("document.getElementById('toast').textContent")
with sync_playwright() as p:
    b=p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    pg=b.new_page(viewport={'width':360,'height':780}, device_scale_factor=2); pg.set_default_timeout(240000)
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    # find a dusk gen-3 planet with wood
    import subprocess
    seed=None
    for sd in range(100,400):
        r=subprocess.run(['node','--input-type=module','-e',f"import {{generatePlanet}} from './src/planetgen.js'; const P=generatePlanet({sd},2,3); console.log(P.lookName, P.materials.join(','), P.refiners.map(r=>r.output).join(','))"],capture_output=True,text=True).stdout
        if r.startswith('dusk') and 'wood' in r and 'polishedCrystal' in r: seed=sd; print('seed',sd,r.strip()); break
    st={'planet':2,'seed':seed,'gen':3,'crew':[],'tools':{'pick':2,'axe':2,'bag':3,'suit':2},'skills':{},'relics':{'pick':0,'axe':2,'suit':0,'bag':0}}
    boot(pg, st)
    print('1 wood', pg.evaluate("__bloom.MATERIALS ? 1 : 0"), pg.evaluate("[document.querySelector('#hud') ? 1:0]"))
    pg.evaluate("const n=__bloom.nodes.find(n=>n.mat==='wood'); __bloom.player.x=n.x; __bloom.player.z=n.z+3; __bloom.step(30*4)"); time.sleep(0.3); pg.screenshot(path='shots/v17_wood.png')
    # 3: no blueprint before MAX / 50%
    pg.evaluate("__bloom.player.x=__bloom.P.rocket.x+0.75; __bloom.player.z=__bloom.P.rocket.z+2.9; __bloom.step(10)")
    print('3 bp before', pg.evaluate("JSON.stringify(Object.keys(__bloom.bag).filter(k=>k.startsWith('bp')))"))
    # 2: reach 50%
    pg.evaluate("for (const g of __bloom.gens) { while (g.level < g.radii.length-1) g.site.complete(); } __bloom.step(60)"); time.sleep(1)
    print('2 50% toast:', T(pg)[:200])
    pg.evaluate("__bloom.step(10)")
    pg.evaluate("__bloom.player.x=__bloom.P.rocket.x+0.75; __bloom.player.z=__bloom.P.rocket.z+2.9; __bloom.step(10)")
    print('3 bp at 50% no MAX', pg.evaluate("JSON.stringify(Object.keys(__bloom.bag).filter(k=>k.startsWith('bp')))"))
    pg.evaluate("(()=>{const B=__bloom; const rf=B.refiners.find(r=>r.id==='kiln'); rf.repaired=true; rf.level=rf.upgrades.length; B.refreshRefiner(rf); B.player.x=B.P.rocket.x+0.75; B.player.z=B.P.rocket.z+2.9; B.step(10);})()")
    print('3 bp after kiln MAX', pg.evaluate("JSON.stringify(Object.keys(__bloom.bag).filter(k=>k.startsWith('bp')))"), T(pg)[:120])
    # 4: install and check hopper
    r=pg.evaluate("""(()=>{const B=__bloom; const rf=B.refiners.find(r=>r.id==='kiln'); B.player.x=rf.x; B.player.z=rf.z+2.6; B.step(30);
       const ins=Object.keys(rf.alt.inputs); B.give(ins[0],12); B.give(ins[1],30); B.player.x=rf.inX; B.player.z=rf.z; B.step(90);
       return [rf.bp, rf.mode, JSON.stringify(rf.alt.inputs), JSON.stringify(rf.loaded), B.ROCKET_NEED.airTank]})()""")
    print('4 hopper', r)
    # 5: relic assembly
    pg.evaluate("__bloom.grantRelic('axe')"); time.sleep(4.2)
    print('5 pending toast:', T(pg)[:120], pg.evaluate("[__bloom.bench.visible]") if pg.evaluate("!!__bloom.bench") else '')
    pg.evaluate("__bloom.player.x=__bloom.P.workbench.x; __bloom.player.z=__bloom.P.workbench.z+3.5; __bloom.step(5)"); time.sleep(0.3); pg.screenshot(path='shots/v17_asm0.png')
    pg.evaluate("__bloom.player.x=__bloom.P.workbench.x; __bloom.player.z=__bloom.P.workbench.z+0.7; __bloom.step(45)"); time.sleep(0.2); pg.screenshot(path='shots/v17_asm1.png')
    pg.evaluate("__bloom.step(60)"); time.sleep(0.2); pg.screenshot(path='shots/v17_asm2.png')
    pg.evaluate("__bloom.step(30)")
    print('5 assembled', pg.evaluate("JSON.stringify(__bloom.game.assembled)"), T(pg)[:100])
    print('6 upgrade here?', pg.evaluate("__bloom.relicUpKey()"))
    # 6: pretend it was assembled on an earlier planet
    pg.evaluate("__bloom.game.assembled.axe=1; __bloom.refreshBench(); __bloom.step(5)")
    k=pg.evaluate("__bloom.relicUpKey()"); cost=pg.evaluate("JSON.stringify(__bloom.relicUpCost('axe'))"); print('6 offer', k, cost)
    pg.evaluate("for (const [m,n] of Object.entries(__bloom.relicUpCost('axe'))) __bloom.give(m,n); __bloom.player.x=__bloom.P.workbench.x; __bloom.player.z=__bloom.P.workbench.z+0.7; __bloom.step(60)")
    print('6 after', pg.evaluate("[JSON.stringify(__bloom.game.relicLv), __bloom.game.relicUpOn, __bloom.relicUpKey()]"), T(pg)[:100])
    pg.evaluate("__bloom.openGalaxy(false)"); time.sleep(0.3); print('relics:', pg.evaluate("document.getElementById('relics').innerText.replace(/\\n/g,' | ')"))
    print('errors', errs[:4]); b.close()
