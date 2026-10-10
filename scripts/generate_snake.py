#!/usr/bin/env python3
"""Animated contribution snake that eats apples.

Usage:
  python scripts/generate_snake.py --user byteforge --out assets/snake.svg      # live data (needs GITHUB_TOKEN)
  python scripts/generate_snake.py --json scripts/contributions_snapshot.json --out assets/snake.svg
"""
import argparse, json, math, os, urllib.request

PITCH, CELL = 15, 11
LEVEL_FILL = ["#161b22", "#033a16", "#196c2e", "#2ea043", "#56d364"]
SPEED = 320.0          # px / s
SEGMENTS = 12
GAP = 11.0             # px between segments along the path
PAUSE = 2.5            # s of rest before the loop restarts
R = PITCH / 2

def fetch(user, token):
    q = """query($u:String!){user(login:$u){contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{weekday contributionLevel}}}}}}"""
    req = urllib.request.Request("https://api.github.com/graphql",
        data=json.dumps({"query": q, "variables": {"u": user}}).encode(),
        headers={"Authorization": f"bearer {token}", "Content-Type": "application/json"})
    cal = json.load(urllib.request.urlopen(req))["data"]["user"]["contributionsCollection"]["contributionCalendar"]
    weeks = cal["weeks"]
    lv = {"NONE": 0, "FIRST_QUARTILE": 1, "SECOND_QUARTILE": 2, "THIRD_QUARTILE": 3, "FOURTH_QUARTILE": 4}
    cols = []
    for w in weeks:
        col = [0] * 7
        for d in w["contributionDays"]:
            col[d["weekday"]] = lv[d["contributionLevel"]]
        cols.append(col)
    return cols, cal["totalContributions"]

def build(cols, total=None):
    n = len(cols)
    ox, oy = 44, 62                       # grid origin (cell centre of col 0,row 0)
    W, H = ox + n * PITCH + 30, oy + 7 * PITCH + 44
    col_len, arc = 6 * PITCH, math.pi * R
    run = 36.0                            # off-grid run-in / run-out
    cx = lambda c: ox + c * PITCH
    cy = lambda r: oy + r * PITCH

    # serpentine path with semicircle turns
    d = [f"M {cx(0)-run:.1f} {cy(0):.1f} L {cx(0):.1f} {cy(0):.1f}"]
    for c in range(n):
        down = c % 2 == 0
        d.append(f"L {cx(c):.1f} {cy(6 if down else 0):.1f}")
        if c < n - 1:
            d.append(f"A {R} {R} 0 0 {0 if down else 1} {cx(c+1):.1f} {cy(6 if down else 0):.1f}")
    last_down = (n - 1) % 2 == 0
    d.append(f"L {cx(n-1)+run:.1f} {cy(6 if last_down else 0):.1f}")
    path = " ".join(d)
    plen = run + n * col_len + (n - 1) * arc + run

    def dist(c, r):
        down = c % 2 == 0
        return run + c * (col_len + arc) + (r * PITCH if down else (6 - r) * PITCH)

    move_t = plen / SPEED
    lag = GAP / SPEED
    D = move_t + SEGMENTS * lag + PAUSE
    sid = lambda t: f"{t / D:.5f}"

    out = []
    # cells + apples
    cells, apples = [], []
    for c, col in enumerate(cols):
        for r, v in enumerate(col):
            x, y = cx(c) - CELL / 2, cy(r) - CELL / 2
            if v == 0:
                cells.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{CELL}" height="{CELL}" rx="2.5" fill="{LEVEL_FILL[0]}"/>')
                continue
            te = dist(c, r) / SPEED
            a, b = max(te - 0.02, 0), te + 0.14
            cells.append(
                f'<rect x="{x:.1f}" y="{y:.1f}" width="{CELL}" height="{CELL}" rx="2.5" fill="{LEVEL_FILL[0]}">'
                f'<animate attributeName="fill" values="{LEVEL_FILL[0]};{LEVEL_FILL[0]};{LEVEL_FILL[v]};{LEVEL_FILL[v]};{LEVEL_FILL[0]}" '
                f'keyTimes="0;{sid(a)};{sid(b)};{sid(D-0.4)};1" dur="{D:.2f}s" repeatCount="indefinite"/></rect>')
            # apple: red body, tiny leaf; bigger apple for busier days
            s = 0.62 + 0.09 * v
            apples.append(
                f'<g transform="translate({cx(c):.1f} {cy(r):.1f}) scale({s:.2f})">'
                f'<g><circle r="4.6" cy="0.6" fill="#ff4d5e"/><circle r="1.5" cx="-1.7" cy="-0.8" fill="#ffd0d5" opacity=".7"/>'
                f'<path d="M0 -3.6 q0.4 -2.2 2 -2.9" stroke="#8b5a2b" stroke-width=".9" fill="none" stroke-linecap="round"/>'
                f'<ellipse cx="2.4" cy="-4.9" rx="2" ry="1" transform="rotate(-25 2.4 -4.9)" fill="#3fb950"/>'
                f'<animateTransform attributeName="transform" type="scale" values="1;1;1.6;0;0;1" '
                f'keyTimes="0;{sid(max(te-0.05,0))};{sid(te)};{sid(te+0.12)};{sid(D-0.4)};1" dur="{D:.2f}s" repeatCount="indefinite"/>'
                f'</g></g>')
    # snake body (tail -> head so the head is painted last)
    segs = []
    for k in reversed(range(SEGMENTS)):
        t0, t1 = k * lag, k * lag + move_t
        frac = k / (SEGMENTS - 1)
        size = 12.4 - 5.2 * frac ** 1.4
        # head is brightest, tail fades to deep green
        r_, g_, b_ = (int(60 + (20 - 60) * frac), int(235 + (120 - 235) * frac), int(150 + (110 - 150) * frac))
        col = f"rgb({r_},{g_},{b_})"
        kt = f"0;{sid(t0)};{sid(t1)};1"
        motion = (f'<animateMotion dur="{D:.2f}s" repeatCount="indefinite" path="{path}" '
                  f'keyPoints="0;0;1;1" keyTimes="{kt}" calcMode="linear"' + (' rotate="auto"' if k == 0 else '') + '/>')
        if k == 0:
            body = (f'<rect x="-7.4" y="-6.2" width="14.4" height="12.4" rx="5.5" fill="{col}"/>'
                    f'<circle cx="2.8" cy="-3" r="2.1" fill="#fff"/><circle cx="2.8" cy="3" r="2.1" fill="#fff"/>'
                    f'<circle cx="3.4" cy="-3" r="1" fill="#0d1117"/><circle cx="3.4" cy="3" r="1" fill="#0d1117"/>'
                    f'<path d="M7 0 h5 m-2.2 0 l2.6 -2 m-2.6 2 l2.6 2" stroke="#ff4d5e" stroke-width="1.1" fill="none" stroke-linecap="round">'
                    f'<animate attributeName="opacity" values="1;0;1" dur="0.5s" repeatCount="indefinite"/></path>')
        else:
            body = f'<rect x="{-size/2:.1f}" y="{-size/2:.1f}" width="{size:.1f}" height="{size:.1f}" rx="{size*0.42:.1f}" fill="{col}"/>'
        segs.append(f'<g>{body}{motion}</g>')

    total_txt = f"{total} contributions in the last year" if total else "contribution snake"
    lg = "".join(
        f'<rect x="{W-24-36-(5-i)*16}" y="{H-24}" width="{CELL}" height="{CELL}" rx="2.5" fill="{LEVEL_FILL[i]}"/>' for i in range(5))
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-label="Contribution snake eating apples">
<defs>
  <style>.t{{font-family:'Segoe UI',Helvetica,Arial,sans-serif;fill:#c9d1d9;font-size:14px;font-weight:600}}.s{{font-family:Consolas,monospace;fill:#6e7681;font-size:11px}}</style>
  <clipPath id="g"><rect x="0" y="0" width="{W}" height="{H}" rx="14"/></clipPath>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0d1117"/><stop offset="1" stop-color="#0a1614"/></linearGradient>
</defs>
<g clip-path="url(#g)">
<rect width="{W}" height="{H}" fill="url(#bg)"/>
<text class="t" x="24" y="30">{total_txt}</text>
<text class="s" x="{W-24}" y="30" text-anchor="end">snake.exe  /  apples = commits</text>
{''.join(cells)}
{''.join(apples)}
{''.join(segs)}
<text class="s" x="{W-24-36-5*16-6}" y="{H-15}" text-anchor="end">less</text>{lg}<text class="s" x="{W-24}" y="{H-15}" text-anchor="end">more</text>
</g>
<rect x=".5" y=".5" width="{W-1}" height="{H-1}" rx="14" fill="none" stroke="#30363d"/>
</svg>'''
    return svg

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--user"); ap.add_argument("--json"); ap.add_argument("--out", required=True)
    a = ap.parse_args()
    total = None
    if a.json:
        cols = json.load(open(a.json)); total = 255   # snapshot from the screenshot
    else:
        cols, total = fetch(a.user, os.environ["GITHUB_TOKEN"])
    svg = build(cols, total)
    open(a.out, "w", encoding="utf-8").write(svg)
    print("wrote", a.out, len(svg) // 1024, "KB")
