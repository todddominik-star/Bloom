import time, json
from playwright.sync_api import sync_playwright
def boot(pg, state=None):
    pg.goto('http://localhost:8766/dist/index.html'); time.sleep(1)
    pg.evaluate("localStorage.clear()")
    if state: pg.evaluate("localStorage.setItem('bloom-game-v3', %s)" % json.dumps(json.dumps(state)))
    pg.reload(); time.sleep(2); pg.click('#go'); pg.evaluate('__bloom.step(5)')
with sync_playwright() as p:
    b=p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    pg=b.new_page(viewport={'width':360,'height':780}, device_scale_factor=2); pg.set_default_timeout(240000)
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    boot(pg)
    r=pg.evaluate("""(()=>{const B=__bloom; const rf=B.refiners[0]; const u=rf.upSite||B.sites.find(s=>s.x===rf.x&&Math.abs(s.z-(rf.z+2.6))<0.01);
      for (const m of ['stone','redCrystal','wood']) B.give(m,30);
      const before=JSON.stringify(B.bag); B.player.x=rf.x; B.player.z=rf.z+2.6; B.step(60);
      return [rf.repaired, JSON.stringify(rf.upPaid), before===JSON.stringify(B.bag)]})()""")
    print('1 unrepaired kiln upgrade: repaired/upPaid/bag unchanged', r)
    pg.evaluate("__bloom.player.x=__bloom.P.rocket.x+0.75; __bloom.player.z=__bloom.P.rocket.z+2.9; __bloom.step(5)"); time.sleep(0.2)
    print('2 hold <50%:', pg.evaluate("document.getElementById('hold').innerText.replace(/\\n/g,' | ')"))
    print('  Ember outputs', pg.evaluate("__bloom.refiners.map(r=>r.output).join(',')"))
    # landmark gen 3
    boot(pg, {'planet':4,'seed':4711,'gen':3,'crew':[],'tools':{'pick':2,'axe':2,'bag':3,'suit':2},'skills':{},'relics':{'pick':0,'axe':0,'suit':0,'bag':0}})
    print('3 landmark', pg.evaluate("[__bloom.P.name, __bloom.P.materials.join(','), __bloom.refiners.map(r=>r.name+':'+r.output).join(' | '), JSON.stringify(__bloom.P.monument)]"))
    print('  lock', pg.evaluate("__bloom.rocket.site.locked()"))
    pg.evaluate("const m=__bloom.P.monument; __bloom.player.x=m.x+1; __bloom.player.z=m.z+6; __bloom.step(5)"); time.sleep(0.3); pg.screenshot(path='shots/v16_monument0.png')
    pg.evaluate("for (const [m,n] of Object.entries(__bloom.P.monument.cost)) __bloom.give(m,n); const m=__bloom.P.monument; __bloom.player.x=m.x+2.6; __bloom.player.z=m.z+1.6; __bloom.step(30*15)"); time.sleep(0.5)
    pg.evaluate("const m=__bloom.P.monument; __bloom.player.x=m.x+1; __bloom.player.z=m.z+7; __bloom.step(5)"); time.sleep(0.3); pg.screenshot(path='shots/v16_monument1.png')
    rf=pg.evaluate("(()=>{const r=__bloom.refiners[3]; r.repaired=true; __bloom.refreshRefiner(r); __bloom.player.x=r.x; __bloom.player.z=r.z+4.5; __bloom.step(5); return r.name})()"); time.sleep(0.3)
    pg.screenshot(path='shots/v16_mill.png')
    pg.evaluate("__bloom.openMap()"); time.sleep(0.4); pg.screenshot(path='shots/v16_map.png')
    print('errors', errs[:4]); b.close()
