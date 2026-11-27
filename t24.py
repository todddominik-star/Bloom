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
    st={'planet':1,'seed':555,'gen':3,'crew':[],'tools':{'pick':2,'axe':2,'bag':3,'suit':2},'skills':{},'relics':{'pick':1,'axe':3,'suit':0,'bag':0},'assembled':{'axe':0},'relicLv':{},'mission':{'seed':555,'name':'x','type':'help','tool':'pick','critter':'Pip'}}
    boot(pg, st)
    print('badges init', pg.evaluate("__bloom.game.badges"))
    pg.evaluate("__bloom.openGalaxy(true)"); time.sleep(0.5)
    print('chips', pg.evaluate("[...document.querySelectorAll('[data-reward]')].map(b=>b.dataset.reward+' '+b.innerText.replace(/\\n/g,' ')).join(' | ')"))
    pg.screenshot(path='shots/v18_galaxy.png')
    pg.click('[data-reward="0:upgrade"]'); time.sleep(0.2)
    pg.click('[data-fly="0"]'); time.sleep(3); pg.wait_for_function('window.__bloom && __bloom.P'); time.sleep(4); pg.evaluate('__bloom.step(5)')
    print('arrived mission', pg.evaluate("JSON.stringify({r:__bloom.MISSION.reward,u:__bloom.MISSION.upKey,t:__bloom.MISSION.type})"))
    print('upgrade before done', pg.evaluate("__bloom.relicUpKey()"))
    pg.evaluate("__bloom.completeMission()"); time.sleep(0.3)
    print('done toast', T(pg)[:140], '| key', pg.evaluate("__bloom.relicUpKey()"), pg.evaluate("__bloom.bench.visible"))
    pg.evaluate("for (const [m,n] of Object.entries(__bloom.relicUpCost('axe'))) __bloom.give(m,n); __bloom.player.x=__bloom.P.workbench.x; __bloom.player.z=__bloom.P.workbench.z+0.7; __bloom.step(60)")
    print('after upgrade', pg.evaluate("[JSON.stringify(__bloom.game.relicLv), __bloom.relicUpKey()]"))
    # piece completes the pick set -> auto assembly
    pg.evaluate("__bloom.game.relics.pick=2; __bloom.grantRelic('pick')"); pg.evaluate("__bloom.step(30*4)"); time.sleep(0.2); pg.screenshot(path='shots/v18_asm.png')
    pg.evaluate("__bloom.step(30*4)")
    print('assembled', pg.evaluate("JSON.stringify(__bloom.game.assembled)"), T(pg)[:90])
    # stellar bonus
    pg.evaluate("__bloom.game.badges=25; __bloom.openGalaxy(false)"); time.sleep(0.3)
    print('bonus', pg.evaluate("[...document.querySelectorAll('[data-bonus]')].map(b=>b.dataset.bonus).join(',')"), '|', pg.evaluate("document.getElementById('relics').innerText.replace(/\\n/g,' | ')")[-160:])
    pg.screenshot(path='shots/v18_bonus.png')
    pg.click('[data-bonus^="piece:suit"]'); time.sleep(0.3)
    print('after bonus', pg.evaluate("[JSON.stringify(__bloom.game.relics), __bloom.game.bonusUsed, document.querySelectorAll('[data-bonus]').length]"))
    # landmark badge
    boot(pg, {'planet':4,'seed':4711,'gen':3,'crew':[],'tools':{'pick':2,'axe':2,'bag':3,'suit':2},'skills':{},'relics':{},'badges':4})
    pg.evaluate("for (const g of __bloom.gens) { while (g.level < g.radii.length-1) g.site.complete(); } __bloom.step(60)"); time.sleep(0.5)
    print('landmark 100%', T(pg)[:140], pg.evaluate("__bloom.game.badges"))
    pg.evaluate("__bloom.dam.site.complete(); __bloom.step(5)")
    pg.evaluate("for (const [m,n] of Object.entries(__bloom.P.monument.cost)) __bloom.give(m,n); const m=__bloom.P.monument; __bloom.player.x=m.x+2.6; __bloom.player.z=m.z+1.6; __bloom.step(30*15)"); time.sleep(4.6)
    print('landmark badge', pg.evaluate("__bloom.game.badges"), T(pg)[:140], '| relics', pg.evaluate("JSON.stringify(__bloom.game.relics)"))
    print('errors', errs[:4]); b.close()
