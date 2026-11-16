import time, json
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    pg=b.new_page(viewport={'width':360,'height':780}, device_scale_factor=2); pg.set_default_timeout(240000)
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8766/index.html'); time.sleep(1)
    pg.evaluate("localStorage.clear()"); pg.reload(); time.sleep(2); pg.click('#go'); pg.evaluate('__bloom.step(5)')
    t0=time.time(); offs=pg.evaluate("__bloom.offers()"); print('offers took', round(time.time()-t0,2))
    for o in offs: print(' ', o['type'], o['name'], o.get('mat'), o.get('amount'), o.get('tool'))
    pg.evaluate("__bloom.openMap()"); time.sleep(0.3); pg.click('#galbtn'); time.sleep(0.5)
    pg.screenshot(path='shots/j1_galaxy.png')
    di=[i for i,o in enumerate(offs) if o['type']=='delivery'][0]
    pg.click(f'[data-course="{di}"]'); time.sleep(0.3); pg.screenshot(path='shots/j2_course.png')
    pg.click('#galclose')
    d=offs[di]
    # load the hold at the rocket
    pg.evaluate(f"__bloom.give('{d['mat']}', {d['amount']+5}); __bloom.player.x=__bloom.P.rocket.x+3; __bloom.player.z=__bloom.P.rocket.z+2; __bloom.step(3)")
    time.sleep(0.3); pg.screenshot(path='shots/j3_hold.png')
    pg.click(f'#hold [data-m="{d["mat"]}"]'); time.sleep(0.2)
    print('cargo', pg.evaluate("JSON.stringify(__bloom.game.cargo)"))
    pg.evaluate("__bloom.rocket.done=true; document.getElementById('next').textContent='x'; document.getElementById('win').classList.remove('gone')")
    pg.click('#next'); time.sleep(3); pg.wait_for_load_state(); pg.wait_for_function('window.__bloom && __bloom.P'); time.sleep(3)
    print('arrived', pg.evaluate("[__bloom.P.name, __bloom.MISSION && __bloom.MISSION.type, __bloom.critters.length, !!__bloom.depot, JSON.stringify(__bloom.game.cargo), __bloom.game.log.length]"))
    time.sleep(7); print('toast', pg.evaluate("document.getElementById('toast').textContent"))
    # deliver: walk to the hold, unload, walk to the depot
    pg.evaluate("__bloom.player.x=__bloom.P.rocket.x+3; __bloom.player.z=__bloom.P.rocket.z+2; __bloom.step(3)")
    pg.click(f'#hold [data-m="{d["mat"]}"]'); time.sleep(0.2)
    print('bag after unload', pg.evaluate(f"__bloom.bag['{d['mat']}']"))
    pg.evaluate("const s=__bloom.depot.site; __bloom.player.x=s.x; __bloom.player.z=s.z+0.5; __bloom.step(30*12)")
    print('ms', pg.evaluate("JSON.stringify(__bloom.ms)"), 'relics', pg.evaluate("JSON.stringify(__bloom.game.relics)"))
    pg.evaluate("__bloom.player.x=__bloom.depot.x+3; __bloom.player.z=__bloom.depot.z+4; __bloom.step(10)"); time.sleep(0.3)
    pg.screenshot(path='shots/j4_depot.png')
    print('errors', errs[:5]); b.close()
