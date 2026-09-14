"""知辨宣传片素材采集：整页 2x 纹理 + 元素 bbox/文字清单 + 关键元素 4x 切图 + AI 质询真实回应。"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright
B = "http://127.0.0.1:5173"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "textures")
DUMP = """(maxY) => { const out=[]; for (const e of document.querySelectorAll('[class], textarea, input, button, h1, h2, h3, p, blockquote')) {
  const r=e.getBoundingClientRect(); const y=r.y+scrollY; if (r.width<24||r.height<10||y>maxY) continue;
  const cs=getComputedStyle(e); if (cs.visibility==='hidden'||cs.display==='none') continue;
  out.push({tag:e.tagName.toLowerCase(), cls:(typeof e.className==='string'?e.className:''), x:Math.round(r.x+scrollX), y:Math.round(y), w:Math.round(r.width), h:Math.round(r.height), text:(e.innerText||e.value||'').split(String.fromCharCode(10)).join(' ').slice(0,60)}); }
  return out; }"""
layout = {}
LAYOUT_PATH = os.path.join(OUT, '..', '..', 'src', 'layout.json')
def save():
    json.dump(layout, open(LAYOUT_PATH, 'w', encoding='utf-8'), ensure_ascii=False)
async def settle(pg, ms=800):
    await pg.evaluate("document.fonts.ready"); await pg.wait_for_timeout(ms)
async def shot(pg, name, maxY):
    h = await pg.evaluate("document.documentElement.scrollHeight"); H = min(h, maxY)
    await pg.screenshot(path=f"{OUT}/{name}-full.png", full_page=True, clip={"x":0,"y":0,"width":1920,"height":H})
    els = await pg.evaluate(DUMP, H)
    layout[name] = {"pageH": H, "els": els}; save(); print(name, "pageH", H, "els", len(els), flush=True)
async def cut(pg, sel, name, scale_note=""):
    el = pg.locator(sel).first
    await el.screenshot(path=f"{OUT}/{name}.png"); bb = await el.bounding_box()
    sy = await pg.evaluate("scrollY"); layout.setdefault("cuts", {})[name] = {"x":round(bb["x"]),"y":round(bb["y"]+sy),"w":round(bb["width"]),"h":round(bb["height"])}
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--disable-gpu","--use-angle=swiftshader"])
        ctx = await b.new_context(viewport={"width":1920,"height":1080}, device_scale_factor=2, reduced_motion="reduce", locale="zh-CN")
        pg = await ctx.new_page()
        # 1) topics
        await pg.goto(B+"/topics"); await pg.wait_for_selector(".carousel-slide", timeout=30000); await settle(pg, 2500)
        await shot(pg, "topics", 2200)
        await cut(pg, ".carousel-slide", "hot-card")
        await cut(pg, ".feed-item", "feed1")
        # hi-res 4x hero card
        ctx4 = await b.new_context(viewport={"width":1920,"height":1080}, device_scale_factor=4, reduced_motion="reduce", locale="zh-CN")
        p4 = await ctx4.new_page(); await p4.goto(B+"/topics"); await p4.wait_for_selector(".carousel-slide"); await settle(p4, 2500)
        await p4.locator(".carousel-slide").first.screenshot(path=f"{OUT}/hot-card-4x.png"); await ctx4.close()
        # 2) library
        await pg.goto(B+"/library"); await pg.wait_for_selector(".feed-item", timeout=30000); await settle(pg, 1500)
        await shot(pg, "library", 1300)
        # 3) debate career (wait for AI summaries)
        await pg.goto(B+"/debate?id=career"); await pg.wait_for_selector(".answer-actions", timeout=90000)
        for _ in range(40):
            pend = await pg.evaluate("document.querySelectorAll('.ai-summary .spinner, .ai-summary .skeleton, .pending').length")
            if pend == 0: break
            await pg.wait_for_timeout(1500)
        await settle(pg, 1500)
        await shot(pg, "debate", 2400)
        # 4) critic dialog with real response
        await pg.evaluate("scrollTo(0,0)"); await pg.locator('[data-action="critic"][data-side="0"]').first.click()
        await pg.wait_for_selector("#critic-question"); await settle(pg, 600)
        await pg.screenshot(path=f"{OUT}/critic-empty.png")
        await pg.fill("#critic-question", "如果家里急需用钱，你还坚持先成长吗？")
        await pg.locator('.critic-form button[type="submit"]').click()
        ok = False
        for _ in range(60):
            done = await pg.evaluate("(()=>{const r=document.querySelector('[data-critique-result]'); return r && !r.querySelector('.critic-idle, .spinner, .skeleton, .pending') && r.innerText.trim().length>20})()")
            if done: ok = True; break
            await pg.wait_for_timeout(1500)
        await settle(pg, 1200); print("critique ok", ok, flush=True)
        # expand dialog body scroll to top, capture viewport
        await pg.screenshot(path=f"{OUT}/critic-result.png")
        layout["critic"] = {"els": await pg.evaluate("""() => [...document.querySelectorAll('#overlay, #overlay *')].map(e=>{const r=e.getBoundingClientRect(); return {tag:e.tagName.toLowerCase(), cls:(typeof e.className==='string'?e.className:''), x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height), text:(e.innerText||e.value||'').split(String.fromCharCode(10)).join(' ').slice(0,80)}}).filter(o=>o.w>20&&o.h>8)""")}
        save(); await pg.keyboard.press("Escape"); await pg.wait_for_timeout(400)
        # 5) search
        await pg.goto(B+"/search?q=" + "要不要考研"); await pg.wait_for_selector(".arrange-cta", timeout=120000); await settle(pg, 1500)
        await shot(pg, "search", 1600)
        await pg.evaluate("""()=>{const i=document.querySelector('.header-search input'); if(i){i.value='';} document.querySelectorAll('.search-results, .arrange-cta, .search-head, .search-summary, .feed-list, .search-item').forEach(e=>e.style.visibility='hidden')}""")
        await settle(pg, 300)
        await pg.screenshot(path=f"{OUT}/search-empty.png", full_page=True, clip={"x":0,"y":0,"width":1920,"height":layout['search']['pageH']})
        json.dump(layout, open(os.path.join(OUT, "..", "..", "src", "layout.json"), "w", encoding="utf-8"), ensure_ascii=False)
        await b.close()
asyncio.run(main())
