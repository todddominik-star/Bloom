import time
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    pg=b.new_page(viewport={'width':360,'height':780}, device_scale_factor=2); pg.set_default_timeout(240000)
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8766/dist/index.html'); time.sleep(1)
    pg.evaluate("localStorage.clear()"); pg.reload(); time.sleep(2); pg.click('#go'); pg.evaluate('__bloom.step(5)')
    # rescue both astronauts and send them far away; repair the rocket
    pg.evaluate("""(()=>{const B=__bloom; B.lost.forEach((a,i)=>{a.state='rescued'; a.dome.visible=false; a.x=B.P.rocket.x+(i?40:-35); a.z=B.P.rocket.z-30;}); B.rocket.site.complete(); B.rocket.done=true;
      B.player.x=B.P.rocket.x+0.75; B.player.z=B.P.rocket.z+2.9; B.step(10);})()""")
    time.sleep(0.3); print('hold open on circle', pg.evaluate("!document.getElementById('hold').classList.contains('gone')"))
    pg.screenshot(path='shots/h1_circle.png')
    pg.evaluate("__bloom.player.x=__bloom.P.rocket.x-2.5; __bloom.player.z=__bloom.P.rocket.z+3.2; __bloom.step(5)")
    print('hold open nearby', pg.evaluate("!document.getElementById('hold').classList.contains('gone')"))
    pg.evaluate("__bloom.startBoarding()")
    for k,secs in enumerate([1.5,1.5,2,2]):
        pg.evaluate(f"__bloom.step({int(secs*30)})"); time.sleep(0.2)
        print(k, pg.evaluate("JSON.stringify(__bloom.boarding && __bloom.boarding.walkers.map(w=>[w.who==='player'?'you':w.who.name, w.step, w.inside]))"), 'hatch', pg.evaluate("__bloom.rocket.model.userData.hatch.visible"))
        pg.screenshot(path=f'shots/h2_board{k}.png')
    pg.evaluate("__bloom.step(90)"); print('aboard', pg.evaluate("__bloom.aboard.length"), errs[:3])
    b.close()
