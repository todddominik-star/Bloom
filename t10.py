import time
from playwright.sync_api import sync_playwright
def tp(pg,x,z,n=60): pg.evaluate(f'__bloom.player.x={x}; __bloom.player.z={z}; __bloom.step({n})')
with sync_playwright() as p:
    b=p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
    pg=b.new_page(viewport={'width':360,'height':780}, device_scale_factor=2); pg.set_default_timeout(180000)
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8766/index.html'); time.sleep(2)
    pg.evaluate('localStorage.clear()'); pg.reload(); time.sleep(2); pg.click('#go'); pg.evaluate('__bloom.step(20)')
    print('explored at start', pg.evaluate('__bloom.explored'))
    # shed: repair, store 60 wood -> capped at 50; refined not allowed at level 1
    pg.evaluate('__bloom.give("wood",16); __bloom.give("stone",10)'); tp(pg, -32+2.8, 46+1.2, 150)
    pg.evaluate('__bloom.give("wood",60); __bloom.give("polishedCrystal",2)'); tp(pg, -32, 46+3.0, 10); time.sleep(0.5)
    pg.click('#shed button[data-m="wood"]'); pg.evaluate('__bloom.step(3)')
    print('shed wood', pg.evaluate('__bloom.shed.store.wood'), 'bag wood left', pg.evaluate('__bloom.bag.wood'))
    pg.click('#shed button[data-m="polishedCrystal"]'); pg.evaluate('__bloom.step(3)')
    print('polished stored at LVL1?', pg.evaluate('__bloom.shed.store.polishedCrystal||0'))
    time.sleep(1); pg.screenshot(path='shots/f1_shed.png')
    # crew: rescue Ava (wood) - shed already full of wood -> she should go exploring
    a=pg.evaluate('[__bloom.lost[0].x, __bloom.lost[0].z]'); tp(pg, a[0]-1, a[1], 5)
    pg.evaluate('const a=__bloom.lost[0]; a.x=-26; a.z=50;'); tp(pg, -27, 50, 30)
    pg.evaluate('__bloom.step(30*20)')
    print('Ava', pg.evaluate('[__bloom.lost[0].state, __bloom.lost[0].exploring, __bloom.lost[0].task, __bloom.lost[0].el.textContent]'))
    pg.evaluate('__bloom.shed.store.wood = 10'); pg.evaluate('__bloom.step(30*40)')
    print('Ava after room', pg.evaluate('[__bloom.lost[0].exploring, __bloom.lost[0].el.textContent]'), 'shed wood', pg.evaluate('__bloom.shed.store.wood'))
    # refinery upgrade sign
    pg.evaluate('const r=__bloom.refiners[0]; r.repaired=true; __bloom.give("stone",20); __bloom.give("redCrystal",14)')
    r=pg.evaluate('[__bloom.refiners[0].x, __bloom.refiners[0].z]'); tp(pg, r[0], r[1]+3.0, 200)
    print('kiln level', pg.evaluate('__bloom.refiners[0].level'))
    time.sleep(1); pg.screenshot(path='shots/f2_kiln.png')
    # crystal bridge
    br=pg.evaluate('__bloom.bridges[1].def.at'); pg.evaluate('__bloom.bridges[1].repaired=false'); tp(pg, br[0]+3, br[1]+8, 30); time.sleep(1); pg.screenshot(path='shots/f3_bridge_broken.png')
    pg.evaluate('__bloom.bridges[1].repaired=true; __bloom.bridges[1].broken.visible=false; __bloom.bridges[1].whole.visible=true; __bloom.step(2)'); time.sleep(1); pg.screenshot(path='shots/f4_bridge.png')
    # walk around a bit to discover, then open the map
    for (x,z) in [(-50,40),(-60,10),(-20,-20),(10,40),(30,60)]: tp(pg,x,z,20)
    pg.evaluate('__bloom.lost[2].state="rescued"'); 
    print('explored', pg.evaluate('__bloom.explored'))
    pg.evaluate('__bloom.openMap()'); time.sleep(1); pg.screenshot(path='shots/f5_map.png')
    pos=pg.evaluate('[__bloom.player.x]'); pg.evaluate('__bloom.closeMap()')
    # boarding: rocket done, rescue more crew, start boarding
    pg.evaluate('__bloom.rocket.done=true; __bloom.lost.forEach((a,i)=>{ if(i<4 && a.state!=="rescued"){a.state="rescued"; a.dome.visible=false; a.x=-36+i*20; a.z=30;} })')
    tp(pg, -36, 64+3.2, 10)
    pg.evaluate('__bloom.startBoarding()')
    for k,tsec in enumerate([1.5,4,7.5]):
        pg.evaluate(f'__bloom.step({int(30*(tsec-(0 if k==0 else [1.5,4,7.5][k-1])))})'); time.sleep(1); pg.screenshot(path=f'shots/f6_board{k}.png')
    print('inside', pg.evaluate('__bloom.lost.filter(a=>a.state==="rescued").map(a=>a.m.visible)'), 'player visible', pg.evaluate('__bloom.player.model.visible'))
    pg.evaluate('__bloom.step(30*3)'); print('launching', pg.evaluate('__bloom.rocket.launching>0'))
    print(errs[:5]); b.close()
