import time
from playwright.sync_api import sync_playwright
def tp(pg,x,z,n=60): pg.evaluate(f'__bloom.player.x={x}; __bloom.player.z={z}; __bloom.step({n})')
with sync_playwright() as p:
    b=p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    pg=b.new_page(viewport={'width':360,'height':780}); pg.set_default_timeout(180000)
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8766/index.html'); time.sleep(2)
    pg.evaluate('localStorage.clear()'); pg.reload(); time.sleep(2); pg.click('#go'); pg.evaluate('__bloom.step(20)')
    pg.evaluate('__bloom.give("wood",16); __bloom.give("stone",10)'); tp(pg, -32+2.8, 46+1.2, 150)
    pg.evaluate('__bloom.shed.store.wood=50; __bloom.bag.wood=10'); tp(pg, -32, 49, 10); time.sleep(0.5)
    st=lambda: pg.evaluate('[__bloom.bag.wood, __bloom.shed.store.wood, document.getElementById("toast").textContent]')
    pg.click('#shed button[data-m="wood"]'); print('tap1 (full shelf, 10 in bag)', st())
    pg.click('#shed button[data-m="wood"]'); print('tap2', st())
    pg.click('#shed button[data-m="wood"]'); print('tap3', st())
    pg.click('#shed button[data-m="wood"]'); print('tap4', st())
    print(errs); b.close()
