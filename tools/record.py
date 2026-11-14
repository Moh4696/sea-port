"""Frame-exact silent clip of the Sea Port (run with /usr/bin/python3; dev server up on :8985).

Each frame is rendered at an exact scene time through window.__port.renderAt, so the result is
smooth 60 fps regardless of how fast the machine captures.

    /usr/bin/python3 tools/record.py --preview        # one still per cut -> video/preview-*.jpg
    /usr/bin/python3 tools/record.py                  # full clip -> video/port-of-halvard.mp4
"""
import argparse, glob, os, pathlib, subprocess, sys, time
from playwright.sync_api import sync_playwright

# (shot number, seconds on screen, scene time at the cut, progress range through the camera move)
EDIT = [
    (1, 5.5, 0.0, (0.0, 1.0)),     # harbour approach: tug crossing in front of the ship
    (2, 4.0, 40.0, (0.0, 0.9)),    # quayside, eye level
    (3, 5.5, 35.5, (0.0, 1.0)),    # crane deck: a box travelling inshore on the trolley
    (7, 4.5, 19.5, (0.1, 0.9)),    # under the booms: box landing on a truck
    (4, 5.5, 60.0, (0.1, 1.0)),    # over the terminal
    (6, 3.5, 70.0, (0.0, 1.0)),    # substation
    (5, 6.0, 80.0, (0.0, 1.0)),    # open water
]

ap = argparse.ArgumentParser()
ap.add_argument("--preview", action="store_true")
ap.add_argument("--fps", type=int, default=60)
ap.add_argument("--sun", type=float, default=30)
ap.add_argument("--size", default="1920x1080")
ap.add_argument("--out", default="port-of-halvard.mp4")
ap.add_argument("--port", type=int, default=8985)
a = ap.parse_args()
W, H = map(int, a.size.split("x"))
root = pathlib.Path(__file__).resolve().parent.parent
vid = root / "video"
vid.mkdir(exist_ok=True)
shell = sorted(glob.glob(os.path.expanduser("~/Library/Caches/ms-playwright/chromium_headless_shell-*/*/*headless*shell*")))[-1]

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=shell, args=["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"])
    pg = b.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    url = f"http://localhost:{a.port}/?capture&hud=0&sun={a.sun}&pr=1"
    for attempt in range(3):
        pg.goto(url)
        try:
            pg.wait_for_function("window.__port && window.__port.ready", timeout=40000)
            break
        except Exception:
            if attempt == 2:
                raise
    pg.wait_for_timeout(1500)                      # let the loading veil finish fading

    def shot(n, t, k, path=None):
        pg.evaluate(f"window.__port.renderAt({t:.5f}, {n - 1}, {k:.5f})")
        return pg.screenshot(path=path, type="jpeg", quality=95)

    if a.preview:
        for i, (n, dur, t0, (k0, k1)) in enumerate(EDIT):
            for j, f in enumerate((0.15, 0.85)):
                shot(n, t0 + dur * f, k0 + (k1 - k0) * f, str(vid / f"preview-{i + 1}{'ab'[j]}.jpg"))
        print("previews written", errs[:3])
        b.close()
        sys.exit(0)

    ff = subprocess.Popen(
        ["ffmpeg", "-loglevel", "error", "-y", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", str(a.fps), "-i", "-",
         "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", str(vid / a.out)],
        stdin=subprocess.PIPE)
    total = sum(round(d * a.fps) for _, d, _, _ in EDIT)
    done, t_start = 0, time.time()
    for n, dur, t0, (k0, k1) in EDIT:
        frames = round(dur * a.fps)
        for f in range(frames):
            u = f / frames
            ff.stdin.write(shot(n, t0 + f / a.fps, k0 + (k1 - k0) * u))
            done += 1
            if done % 120 == 0:
                el = time.time() - t_start
                print(f"{done}/{total} frames, {done / el:.1f} fps, ~{(total - done) / (done / el):.0f}s left", flush=True)
    ff.stdin.close()
    rc = ff.wait()
    print("ffmpeg exit", rc, "errors", errs[:3], flush=True)
    b.close()
    sys.exit(rc)
