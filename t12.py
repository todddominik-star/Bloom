import time, json
from playwright.sync_api import sync_playwright
def tp(pg,x,z,n=60): pg.evaluate(f'__bloom.player.x={x}; __bloom.player.z={z}; __bloom.step({n})')
with sync_playwright() as p:
    b=p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    pg=b.new_page(viewport={'width':360,'height':780}, device_scale_factor=2); pg.set_default_timeout(240000)
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8766/index.html'); time.sleep(2)
    pg.evaluate('localStorage.clear()'); pg.reload(); time.sleep(2); pg.click('#go'); pg.evaluate('__bloom.step(10)')
    print('EMBER astronauts', pg.evaluate('__bloom.lost.length'), 'retired at start', pg.evaluate('[...__bloom.retired]'))
    # rescue both: they should gather wood and stone
    pg.evaluate("""__bloom.lost.forEach(a=>{a.state='following'; a.dome.visible=false; a.x=-27; a.z=55;}); __bloom.step(5)""")
    print('jobs', pg.evaluate("__bloom.lost.map(a=>a.name+':'+(a.job&&a.job.type)+':'+(a.job&&a.job.mat))"))
    # finish everything that needs wood: max all bubbles, bridges, machines, tools, shed, rocket
    pg.evaluate("""(()=>{const B=__bloom; B.gens.forEach(g=>{g.level=3;}); B.bridges.forEach(b=>b.repaired=true); B.extractors.forEach(e=>e.level=e.levels.length-1);
      B.refiners.forEach(r=>{r.repaired=true; r.level=r.upgrades.length;}); B.shed.level=2; Object.assign(B.tools,{pick:2,axe:2,bag:3,suit:3}); B.rocket.done=true; B.computeRetired(); B.step(30*8);})()""")
    print('retired after all done', pg.evaluate('[...__bloom.retired]'), 'jobs now', pg.evaluate("__bloom.lost.map(a=>a.name+':'+a.job.type+':'+(a.exploring))"))
    # gather check: stand by a tree, nothing picked up
    n=pg.evaluate("(()=>{const n=__bloom.nodes.find(n=>n.mat==='wood'); return [n.x,n.z]})()"); before=pg.evaluate('__bloom.bag.wood||0'); tp(pg,n[0]+1.2,n[1],90)
    print('wood picked while retired', pg.evaluate('__bloom.bag.wood||0')-before)
    # shed recycle
    pg.evaluate('__bloom.bag.wood=12; __bloom.shed.store.wood=30'); tp(pg,-32,48.4,5); time.sleep(0.5)
    pg.click('#shed button[data-m="wood"]'); print('after recycle', pg.evaluate('[__bloom.bag.wood, __bloom.shed.store.wood, document.getElementById("toast").textContent]'))
    # launch from Ember: both crew board, nobody stays
    tp(pg,-36,67.2,5); pg.evaluate('__bloom.startBoarding(); __bloom.step(30*14)')
    print('aboard', pg.evaluate('__bloom.aboard.map(a=>a.name)'), 'stayers', pg.evaluate('__bloom.stayers.length'))
    time.sleep(4); pg.screenshot(path='shots/g0_win.png')
    pg.click('#next'); time.sleep(3)
    print('NEXT planet', pg.evaluate('[__bloom.P.name, __bloom.P.index, __bloom.P.materials.join(","), __bloom.P.lookName]'), 'crew', pg.evaluate("__bloom.lost.map(a=>a.state+':'+(a.name||'?'))"))
    pg.screenshot(path='shots/g1_start_screen.png')
    pg.click('#go'); pg.evaluate('__bloom.step(30)'); time.sleep(1); pg.screenshot(path='shots/g1_start.png')
    print('bag cap', pg.evaluate('document.getElementById("cap").textContent'), 'tools carried', pg.evaluate('JSON.stringify(__bloom.tools)'), 'nodes', pg.evaluate('__bloom.nodes.length'), 'hut', pg.evaluate('!!__bloom.hut'))
    pg.evaluate('__bloom.step(30*30)')
    print('carried crew jobs', pg.evaluate("__bloom.lost.filter(a=>a.state==='rescued').map(a=>a.name+':'+a.job.type+':'+(a.job.mat||'')+':'+a.task)"))
    # look at the hut and rocket
    h=pg.evaluate('[__bloom.P.hut.x, __bloom.P.hut.z, __bloom.P.rocket.x, __bloom.P.rocket.z]'); tp(pg,h[2],h[3]+3.4,10); time.sleep(1); pg.screenshot(path='shots/g1_rocket_hut.png')
    # rescue the two new ones: they carry shield parts to the hut first, then work (one explores)
    pg.evaluate("""__bloom.lost.forEach(a=>{ if(a.state==='waiting'){a.state='following'; a.dome.visible=false; a.x=__bloom.P.start.x; a.z=__bloom.P.start.z;} }); __bloom.step(10)""")
    print('carrying parts', pg.evaluate("__bloom.lost.map(a=>a.name+':'+!!a.carryPart)"))
    pg.evaluate('__bloom.step(30*40)')
    print('parts at hut', pg.evaluate('__bloom.hut.parts'), '4 crew jobs', pg.evaluate("__bloom.lost.map(a=>a.name+':'+a.job.type+':'+(a.job.mat||''))"))
    # hut: repair to MAX, then the shield is put together
    pg.evaluate("""(()=>{const B=__bloom; for (const lv of B.P.hut.levels) for (const [m,n] of Object.entries(lv)) B.give(m,n);})()""")
    for k in range(3): tp(pg, h[0]+2.7, h[1]+2.0, 260)
    print('hut level', pg.evaluate('__bloom.hut.level'), 'shield ready', pg.evaluate('__bloom.hut.shield'))
    time.sleep(1); pg.screenshot(path='shots/g1_hut.png')
    tp(pg, h[0], h[1]+2.1, 30); print('heat shield in bag', pg.evaluate('__bloom.bag.heatShield||0'))
    pg.evaluate('for(let x=-100;x<=100;x+=8) for(let z=-100;z<=100;z+=8) __bloom.reveal(x,z,8)'); pg.evaluate('__bloom.openMap()'); time.sleep(1); pg.screenshot(path='shots/g1_map.png'); pg.evaluate('__bloom.closeMap()')
    pg.evaluate('__bloom.rocket.done=true'); tp(pg,h[2],h[3]+3.2,5); pg.evaluate('__bloom.startBoarding(); __bloom.step(30*9)'); time.sleep(1); pg.screenshot(path='shots/g1_board.png')
    pg.evaluate('__bloom.step(30*2)'); time.sleep(0.5); pg.screenshot(path='shots/g1_liftoff.png')
    pg.evaluate('__bloom.step(30*3)')
    print('aboard', pg.evaluate('__bloom.aboard.map(a=>a.name)'), 'stayers', pg.evaluate('__bloom.stayers.map(a=>a.name+":"+a.m.visible)'))
    print('errors', errs[:5]); b.close()
