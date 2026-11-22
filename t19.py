import time, json
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    pg=b.new_page(viewport={'width':360,'height':780}, device_scale_factor=2); pg.set_default_timeout(240000)
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8766/dist/index.html'); time.sleep(1); pg.evaluate("localStorage.clear()")
    found=set()
    for seed in [991, 1234, 4321, 777, 31337]:
        st={'planet':2,'seed':seed,'gen':2,'crew':[],'tools':{'pick':2,'axe':2,'bag':2,'suit':2},'skills':{},'relics':{'pick':0,'axe':0,'suit':0,'bag':0}}
        pg.evaluate("localStorage.clear(); localStorage.setItem('bloom-game-v3', %s)" % json.dumps(json.dumps(st)))
        pg.reload(); time.sleep(2); pg.click('#go'); pg.evaluate('__bloom.step(5)')
        mats=pg.evaluate("__bloom.P.materials"); print(seed, mats)
        for m in mats:
            if m in ('sand','ash','carbon','uranium','obsidian','greenCrystal','purpleCrystal') and m not in found:
                ok=pg.evaluate("(m)=>{const n=__bloom.nodes.find(n=>n.mat===m); if(!n) return false; __bloom.player.x=n.x; __bloom.player.z=n.z+3; __bloom.step(4); return true}", m)
                if ok: time.sleep(0.3); pg.screenshot(path=f'shots/m_{m}.png'); found.add(m)
    print('shots', found, errs[:3]); b.close()
