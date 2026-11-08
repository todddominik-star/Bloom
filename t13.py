import time, json
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    pg=b.new_page(viewport={'width':360,'height':780}, device_scale_factor=2); pg.set_default_timeout(240000)
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8766/index.html'); time.sleep(1)
    # a planet-2 journey, like Todd's
    pg.evaluate("""localStorage.clear(); localStorage.setItem('bloom-game-v3', JSON.stringify({planet:1, seed:4242, crew:[{name:'Ava',color:'#7ed957'},{name:'Kai',color:'#7ed957'}], tools:{pick:2,axe:2,bag:3,suit:2}, skills:{}}))""")
    pg.reload(); time.sleep(2); pg.click('#go'); pg.evaluate('__bloom.step(5)')
    # stand in the middle of the river, mid-way between points, and save
    pt=pg.evaluate("(()=>{const P=__bloom.P; const pts=P.river.points.filter(([x,z])=>Math.hypot(x,z)<P.radius-20); const [a,b2]=[pts[1],pts[2]]; return [(a[0]+b2[0])/2,(a[1]+b2[1])/2];})()")
    pg.evaluate(f"__bloom.player.x={pt[0]}; __bloom.player.z={pt[1]}; __bloom.save()")
    print('in river, can stand?', pg.evaluate(f"__bloom.canStand ? __bloom.canStand({pt[0]},{pt[1]}) : 'n/a'"))
    pg.reload(); time.sleep(2); pg.click('#go'); pg.evaluate('__bloom.step(5)')
    pos=pg.evaluate('[__bloom.player.x, __bloom.player.z]')
    print('after reload moved from', [round(v,1) for v in pt], 'to', [round(v,1) for v in pos], 'dist', round(((pos[0]-pt[0])**2+(pos[1]-pt[1])**2)**.5,1))
    # float home toward a bubble whose edge is over the river: max a bubble near the river, stand outside with no air
    r=pg.evaluate("""(()=>{const B=__bloom, P=B.P; let best=null,bd=1e9; for(const g of B.gens){const d=Math.abs(Math.hypot(g.x-P.river.points[2][0], g.z-P.river.points[2][1])); if(d<bd){bd=d;best=g;}}
       best.level=3; B.step(120); const [rx,rz]=[P.river.points[2][0], P.river.points[2][1]]; const dx=rx-best.x, dz=rz-best.z, L=Math.hypot(dx,dz);
       B.player.x = best.x + dx/L*(best.radii[3]+6); B.player.z = best.z + dz/L*(best.radii[3]+6); B.player.air=0.01; B.step(30*12);
       return [B.player.floating, B.canStand(B.player.x,B.player.z), +B.player.x.toFixed(1), +B.player.z.toFixed(1)]})()""")
    print('float home: still floating?', r[0], 'landed somewhere standable?', r[1])
    # crew stop at 30 on a raw shelf
    pg.evaluate("__bloom.shed.level=0; __bloom.step(30*120)")
    print('shed after 2 min of crew', pg.evaluate('JSON.stringify(__bloom.shed.store)'))
    pg.evaluate("__bloom.step(30*240)")
    print('shed after 6 min of crew', pg.evaluate('JSON.stringify(__bloom.shed.store)'))
    # travel to the next planet: overlay, reload, straight into the game
    pg.evaluate("__bloom.rocket.done=true; document.getElementById('win').classList.remove('gone')")
    pg.click('#next'); time.sleep(0.6); pg.screenshot(path='shots/h1_travel.png')
    time.sleep(3.5)
    print('arrived', pg.evaluate("[__bloom.P.name, document.getElementById('start').classList.contains('gone'), document.getElementById('toast').textContent]"))
    pg.screenshot(path='shots/h2_arrived.png')
    print('errors', errs[:5]); b.close()
