"""重截热辩卡 2x/4x 切图，保证与 topics-full 纹理里的第 1 张轮播内容一致。"""
import asyncio, json, os
from playwright.async_api import async_playwright
B = "http://127.0.0.1:5173"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "textures")
L = json.load(open(os.path.join(OUT, "..", "..", "src", "layout.json"), encoding="utf-8"))
want = next(e["text"] for e in L["topics"]["els"] if e["cls"] == "slide-title" and e["x"] == 480)
print("want title:", want)
async def grab(b, scale, name):
    ctx = await b.new_context(viewport={"width":1920,"height":1080}, device_scale_factor=scale, reduced_motion="reduce", locale="zh-CN")
    pg = await ctx.new_page(); await pg.goto(B+"/topics"); await pg.wait_for_selector(".carousel-slide", timeout=30000)
    await pg.evaluate("document.fonts.ready"); await pg.wait_for_timeout(1500)
    titles = await pg.eval_on_selector_all(".carousel-slide .slide-title", "els => els.map(e => e.innerText.trim())")
    idx = titles.index(want) if want in titles else -1
    print(name, "titles:", titles[:4], "idx", idx)
    if idx < 0: raise SystemExit("wanted slide not present")
    await pg.locator(f'.carousel-dot').nth(idx).click(); await pg.mouse.move(5, 1070); await pg.wait_for_timeout(900)
    await pg.evaluate("(i)=>{const r=document.querySelectorAll('.carousel-slide')[i].querySelector('.hot-rank'); if(r){r.textContent='1'; r.classList.add('top');}}", idx)
    await pg.wait_for_timeout(200)
    slide = pg.locator(".carousel-slide").nth(idx)
    bb = await slide.bounding_box(); print(name, "bbox", bb)
    await pg.screenshot(path=f"{OUT}/{name}.png", clip={"x":460, "y":115, "width":694, "height":313})
    await ctx.close()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--disable-gpu","--use-angle=swiftshader"])
        await grab(b, 2, "hot-card"); await grab(b, 4, "hot-card-4x")
        await b.close()
asyncio.run(main())
