"""Builds assets/header.svg: animated terminal-style banner with a softly masked photo."""
import base64, io, random
from PIL import Image, ImageEnhance

W, H = 1200, 420
PHOTO_W = 600           # photo area on the right
SRC = "/mnt/user-data/uploads/1791599007694_pb.PNG"

# --- photo: crop face+shoulders, slight grade, JPEG (the soft edges are done by SVG masks) ---
im = Image.open(SRC).convert("RGB")
cw, ch = 1024, int(1024 * H / PHOTO_W)            # keep aspect of the photo slot
top = 150
im = im.crop((0, top, cw, top + ch)).resize((PHOTO_W * 2, H * 2), Image.LANCZOS)
im = ImageEnhance.Contrast(im).enhance(1.08)
im = ImageEnhance.Color(im).enhance(1.05)
buf = io.BytesIO(); im.save(buf, "JPEG", quality=84, optimize=True)
photo_b64 = base64.b64encode(buf.getvalue()).decode()

# --- terminal typing timeline ---
D = 18.0                      # loop length (s)
CH = 12.0                     # monospace char width at font-size 20
LINES = [
    ("yazen@byteforge:~$ whoami", 3.2),
    ("> Cybersecurity | Red Team + Blue Team", 5.2),
    ("> Fachinformatiker fuer Systemintegration", 7.6),
    ("> CTFs | Kali Linux | Pentest Labs", 10.0),
]
LINES[2] = ("> Fachinformatiker für Systemintegration", 7.6)
RATE = 0.04
Y0, DY, X0 = 232, 38, 64

def esc(s): return s.replace("&", "&amp;").replace("<", "&lt;")

clip_defs, text_el, cursor_x, cursor_y = [], [], [], []
events = []   # (time, x, y) for the cursor
for i, (txt, t0) in enumerate(LINES):
    n = len(txt)
    y = Y0 + i * DY
    vals, keys = ["0"], ["0"]
    for k in range(1, n + 1):
        t = t0 + k * RATE
        vals.append(f"{k*CH:.0f}"); keys.append(f"{t/D:.4f}")
        events.append((t, X0 + k * CH, y))
    vals += [vals[-1], "0"]; keys += ["0.97", "1"]
    keys[-2] = "0.97"
    clip_defs.append(
        f'<clipPath id="c{i}"><rect x="{X0}" y="{y-24}" height="32" width="0">'
        f'<animate attributeName="width" values="{";".join(vals)}" keyTimes="{";".join(keys)}" '
        f'calcMode="discrete" dur="{D}s" repeatCount="indefinite"/></rect></clipPath>')
    if i == 0:
        body = (f'<tspan fill="#3fb950">yazen@byteforge</tspan><tspan fill="#8b949e">:~$ </tspan>'
                f'<tspan fill="#e6edf3">whoami</tspan>')
    else:
        body = f'<tspan fill="#39d98a">&gt;</tspan><tspan fill="#e6edf3">{esc(txt[1:])}</tspan>'
    text_el.append(f'<text x="{X0}" y="{y}" class="mono" clip-path="url(#c{i})">{body}</text>')

events.sort()
kv = [f"{X0}"]; ky = [f"{Y0-18}"]; kt = ["0"]
for t, x, y in events:
    kv.append(f"{x:.0f}"); ky.append(f"{y-18}"); kt.append(f"{t/D:.4f}")
kv.append(kv[-1]); ky.append(ky[-1]); kt.append("0.97")
kv.append(f"{X0}"); ky.append(f"{Y0-18}"); kt.append("1")
cursor = (f'<rect width="10" height="22" fill="#39d98a" x="{X0}" y="{Y0-18}">'
          f'<animate attributeName="x" values="{";".join(kv)}" keyTimes="{";".join(kt)}" calcMode="discrete" dur="{D}s" repeatCount="indefinite"/>'
          f'<animate attributeName="y" values="{";".join(ky)}" keyTimes="{";".join(kt)}" calcMode="discrete" dur="{D}s" repeatCount="indefinite"/>'
          f'<animate attributeName="opacity" values="1;0;1" dur="1s" repeatCount="indefinite"/></rect>')

# --- falling binary rain (subtle) ---
random.seed(7)
rain = []
for c in range(0, 34):
    x = 18 + c * 36 + random.randint(-6, 6)
    dur = random.uniform(9, 17); begin = -random.uniform(0, dur)
    s = "".join(random.choice("01") for _ in range(14))
    chars = "".join(f'<tspan x="{x}" dy="16">{ch}</tspan>' for ch in s)
    rain.append(
        f'<text x="{x}" y="-240" class="rain" opacity="{random.uniform(.10,.24):.2f}">{chars}'
        f'<animateTransform attributeName="transform" type="translate" from="0 0" to="0 {H+260}" dur="{dur:.1f}s" begin="{begin:.1f}s" repeatCount="indefinite"/></text>')

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-label="Yazen - Cybersecurity">
<defs>
  <style>
    .mono{{font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:20px}}
    .rain{{font-family:Consolas,'Liberation Mono',monospace;font-size:14px;fill:#2ea043}}
    .title{{font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-weight:800;font-size:92px;letter-spacing:6px}}
    .tag{{font-family:Consolas,'Liberation Mono',monospace;font-size:15px;fill:#6e7681;letter-spacing:1px}}
  </style>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#0d1117"/><stop offset=".55" stop-color="#0b1a1a"/><stop offset="1" stop-color="#0d1117"/>
  </linearGradient>
  <linearGradient id="ttl" x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
    <stop offset="0" stop-color="#39d98a"/><stop offset=".5" stop-color="#58e6ff"/><stop offset="1" stop-color="#39d98a"/>
    <animate attributeName="x1" values="-1;0" dur="5s" repeatCount="indefinite"/>
    <animate attributeName="x2" values="0;1" dur="5s" repeatCount="indefinite"/>
  </linearGradient>
  <radialGradient id="glow" cx=".5" cy=".5" r=".5">
    <stop offset="0" stop-color="#e5384f" stop-opacity=".38"/><stop offset=".55" stop-color="#1f6f5c" stop-opacity=".18"/><stop offset="1" stop-color="#0d1117" stop-opacity="0"/>
  </radialGradient>
  <!-- soft edges of the photo: horizontal + vertical fade -->
  <linearGradient id="fadeH" x1="0" x2="1" y1="0" y2="0">
    <stop offset="0" stop-color="#000"/><stop offset=".08" stop-color="#222"/><stop offset=".42" stop-color="#fff"/><stop offset=".86" stop-color="#fff"/><stop offset="1" stop-color="#000"/>
  </linearGradient>
  <linearGradient id="fadeV" x1="0" x2="0" y1="0" y2="1">
    <stop offset="0" stop-color="#000"/><stop offset=".16" stop-color="#fff"/><stop offset=".78" stop-color="#fff"/><stop offset="1" stop-color="#000"/>
  </linearGradient>
  <mask id="mH"><rect x="{W-PHOTO_W}" y="0" width="{PHOTO_W}" height="{H}" fill="url(#fadeH)"/></mask>
  <mask id="mV"><rect x="0" y="0" width="{W}" height="{H}" fill="url(#fadeV)"/></mask>
  <linearGradient id="scan" x1="0" x2="0" y1="0" y2="1">
    <stop offset="0" stop-color="#39d98a" stop-opacity="0"/><stop offset=".5" stop-color="#7dffc4" stop-opacity=".28"/><stop offset="1" stop-color="#39d98a" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="line" x1="0" x2="1">
    <stop offset="0" stop-color="#39d98a" stop-opacity="0"/><stop offset=".5" stop-color="#39d98a"/><stop offset="1" stop-color="#58e6ff" stop-opacity="0"/>
  </linearGradient>
  <clipPath id="frame"><rect width="{W}" height="{H}" rx="18"/></clipPath>
  {''.join(clip_defs)}
</defs>

<g clip-path="url(#frame)">
  <rect width="{W}" height="{H}" fill="url(#bg)"/>
  <g>{''.join(rain)}</g>
  <!-- glow behind the photo -->
  <ellipse cx="{W-PHOTO_W//2-30}" cy="{H//2+10}" rx="330" ry="260" fill="url(#glow)">
    <animate attributeName="opacity" values=".65;1;.65" dur="6s" repeatCount="indefinite"/>
  </ellipse>
  <!-- photo, blended into the background -->
  <g mask="url(#mV)">
    <g mask="url(#mH)">
      <image x="{W-PHOTO_W}" y="0" width="{PHOTO_W}" height="{H}" preserveAspectRatio="xMidYMid slice" xlink:href="data:image/jpeg;base64,{photo_b64}"/>
      <rect x="{W-PHOTO_W}" y="-80" width="{PHOTO_W}" height="80" fill="url(#scan)">
        <animate attributeName="y" values="-80;{H}" dur="4.5s" repeatCount="indefinite"/>
      </rect>
    </g>
  </g>
  <!-- title + terminal -->
  <text x="{X0-4}" y="132" class="title" fill="url(#ttl)">YAZEN</text>
  <text x="{X0}" y="168" class="tag">// BREAK IT IN THE LAB. UNDERSTAND IT. SECURE IT.</text>
  {''.join(text_el)}
  {cursor}
  <rect x="0" y="{H-4}" width="{W}" height="4" fill="url(#line)">
    <animate attributeName="opacity" values=".35;1;.35" dur="3s" repeatCount="indefinite"/>
  </rect>
</g>
<rect x=".5" y=".5" width="{W-1}" height="{H-1}" rx="18" fill="none" stroke="#30363d"/>
</svg>
'''
open("assets/header.svg", "w", encoding="utf-8").write(svg)
print("header.svg", len(svg)//1024, "KB")
