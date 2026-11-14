"""Headless stills of the Sea Port shots (run with /usr/bin/python3; the dev server must be up on :8985).

    /usr/bin/python3 tools/shoot.py                # all shots -> captures/shot-N.jpg
    /usr/bin/python3 tools/shoot.py 1 5 --sun 12   # chosen shots, golden hour
"""
import argparse, glob, os, pathlib
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("shots", nargs="*", type=int, default=[1, 2, 3, 4, 5, 6, 7])
ap.add_argument("--sun", type=float, default=30)
ap.add_argument("--k", type=float, default=0.5)
ap.add_argument("--t", type=float, default=0)
ap.add_argument("--size", default="1920x1080")
ap.add_argument("--tag", default="")
ap.add_argument("--port", type=int, default=8985)
a = ap.parse_args()
W, H = map(int, a.size.split("x"))
out = pathlib.Path(__file__).resolve().parent.parent / "captures"
out.mkdir(exist_ok=True)
shell = sorted(glob.glob(os.path.expanduser("~/Library/Caches/ms-playwright/chromium_headless_shell-*/*/*headless*shell*")))[-1]

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=shell, args=["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"])
    pg = b.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
    errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    for n in a.shots:
        url = f"http://localhost:{a.port}/?shot={n}&hold&hud=0&k={a.k}&sun={a.sun}&t={a.t}&pr=1"
        for attempt in range(3):      # the first headless load occasionally stalls; a reload clears it
            pg.goto(url)
            try:
                pg.wait_for_function("window.__port && document.getElementById('loading').classList.contains('done')", timeout=40000)
                break
            except Exception:
                if attempt == 2:
                    print("load failed:", pg.evaluate("document.getElementById('loadmsg').textContent"), errs[:5])
                    raise
        pg.wait_for_timeout(1800)
        f = out / f"shot-{n}{a.tag}.jpg"
        pg.screenshot(path=str(f), type="jpeg", quality=92)
        fps = pg.evaluate("window.__port.fps")
        print(f"shot {n}: {f.name}  fps={fps:.0f}")
    if errs:
        print("console errors:", errs[:5])
    b.close()
