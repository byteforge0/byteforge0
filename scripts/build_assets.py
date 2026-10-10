"""Builds the animated section assets: titles, now-cards, tech stack, footer."""
import math

G, C, R = "#39d98a", "#58e6ff", "#ff4d5e"
FONT_SANS = "'Segoe UI',Helvetica,Arial,sans-serif"
FONT_MONO = "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace"


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def save(name, svg):
    with open(f"assets/{name}", "w", encoding="utf-8") as f:
        f.write(svg)
    print(name, len(svg) // 1024 or 1, "KB")


# ------------------------------------------------------------------ section titles
def title(num, text, fname):
    W, H = 1200, 72
    tw = len(text) * 25 + 10
    x0 = 74
    lx = x0 + tw + 20
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-label="{esc(text)}">
<defs>
  <linearGradient id="ln" x1="0" x2="1"><stop offset="0" stop-color="{G}"/><stop offset="1" stop-color="{C}" stop-opacity="0"/></linearGradient>
  <linearGradient id="gl" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <linearGradient id="tx" x1="0" x2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#9fe8c8"/></linearGradient>
  <clipPath id="cl"><rect x="{lx}" y="34" width="{W-lx-26}" height="4"/></clipPath>
</defs>
<rect x=".5" y=".5" width="{W-1}" height="{H-1}" rx="14" fill="#0d1117" stroke="#30363d"/>
<text x="26" y="45" font-family="{FONT_MONO}" font-size="17" fill="{G}" opacity=".9">{num}</text>
<text x="{x0}" y="47" font-family="{FONT_SANS}" font-size="32" font-weight="800" letter-spacing="3" fill="url(#tx)">{esc(text)}</text>
<rect x="{lx}" y="35" width="{W-lx-26}" height="2" rx="1" fill="url(#ln)"/>
<g clip-path="url(#cl)"><rect x="{lx-120}" y="33" width="120" height="6" fill="url(#gl)">
  <animate attributeName="x" values="{lx-120};{W-26}" dur="3.2s" repeatCount="indefinite"/></rect></g>
<rect x="{W-22}" y="28" width="8" height="16" fill="{G}"><animate attributeName="opacity" values="1;0;1" dur="1s" repeatCount="indefinite"/></rect>
</svg>'''
    save(fname, svg)


# ------------------------------------------------------------------ now cards
def now():
    W = 1200
    cw, ch, gap = 594, 142, 12
    cards = [
        ("WORKING ON", "Cybersecurity labs", "Kali Linux  |  practicing ethical hacking", G),
        ("LEARNING", "Network security & pentesting", "Basics  |  phishing awareness analysis", C),
        ("LOOKING FOR HELP", "Advanced penetration testing", "Methods and Red-Team fundamentals", R),
        ("COLLABORATING ON", "Security research & CTFs", "Plus defensive security projects", "#b392f0"),
    ]
    H = 2 * ch + gap + gap + 62 + gap + 62
    P = 2 * (cw + ch)
    parts = []
    for i, (lab, head, sub, col) in enumerate(cards):
        x = (i % 2) * (cw + gap + 0)
        y = (i // 2) * (ch + gap)
        d = i * 0.7
        parts.append(f'''<g transform="translate({x} {y})">
  <rect width="{cw}" height="{ch}" rx="14" fill="#0d1117" stroke="#30363d"/>
  <rect width="{cw}" height="{ch}" rx="14" fill="url(#sh{i})"/>
  <rect x="0" y="26" width="4" height="{ch-52}" rx="2" fill="{col}"/>
  <rect width="{cw}" height="{ch}" rx="14" fill="none" stroke="{col}" stroke-width="2" stroke-linecap="round" stroke-dasharray="150 {P}" opacity=".9">
    <animate attributeName="stroke-dashoffset" values="0;-{P}" dur="7s" begin="-{d*2:.1f}s" repeatCount="indefinite"/></rect>
  <circle cx="34" cy="36" r="5" fill="{col}"><animate attributeName="opacity" values="1;.25;1" dur="2s" begin="{d:.1f}s" repeatCount="indefinite"/></circle>
  <text x="50" y="41" font-family="{FONT_MONO}" font-size="13" letter-spacing="3" fill="{col}">{lab}</text>
  <text x="30" y="84" font-family="{FONT_SANS}" font-size="26" font-weight="700" fill="#f0f6fc">{esc(head)}</text>
  <text x="30" y="114" font-family="{FONT_MONO}" font-size="15" fill="#8b949e">{esc(sub)}</text>
</g>''')
    defs = "".join(
        f'<linearGradient id="sh{i}" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="{c[3]}" stop-opacity=".10"/><stop offset=".6" stop-color="{c[3]}" stop-opacity="0"/></linearGradient>'
        for i, c in enumerate(cards))
    sy = 2 * ch + 2 * gap
    fun = f'''<g transform="translate(0 {sy})">
  <rect width="{W}" height="62" rx="14" fill="#0d1117" stroke="#30363d"/>
  <text x="30" y="38" font-family="{FONT_MONO}" font-size="13" letter-spacing="3" fill="{G}">FUN FACT</text>
  <text x="150" y="38" font-family="{FONT_MONO}" font-size="17" fill="#c9d1d9">I enjoy breaking things in labs just to understand how to secure them better.</text>
  <rect x="{150+77*10.2:.0f}" y="21" width="9" height="22" fill="{G}"><animate attributeName="opacity" values="1;0;1" dur="1s" repeatCount="indefinite"/></rect>
</g>'''
    ay = sy + 62 + gap
    chips, cx = [], 190
    for j, t in enumerate(["Kali Linux tools", "Cybersecurity fundamentals", "Online safety practices"]):
        w = len(t) * 8.6 + 34
        chips.append(f'''<g transform="translate({cx:.0f} 14)"><rect width="{w:.0f}" height="34" rx="17" fill="#161b22" stroke="{C}" stroke-opacity=".5"/>
  <text x="{w/2:.0f}" y="22" text-anchor="middle" font-family="{FONT_SANS}" font-size="14" fill="#e6edf3">{t}</text>
  <animateTransform attributeName="transform" type="translate" additive="sum" values="0 0;0 -3;0 0" dur="{3+j*.6:.1f}s" repeatCount="indefinite"/></g>''')
        cx += w + 14
    ask = f'''<g transform="translate(0 {ay})"><rect width="{W}" height="62" rx="14" fill="#0d1117" stroke="#30363d"/>
  <text x="30" y="38" font-family="{FONT_MONO}" font-size="13" letter-spacing="3" fill="{C}">ASK ME ABOUT</text>{"".join(chips)}</g>'''
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-label="What I am working on, learning and looking for">
<defs>{defs}</defs>
{"".join(parts)}
{fun}
{ask}
</svg>'''
    save("now.svg", svg)


# ------------------------------------------------------------------ tech stack
def stack():
    W = 1200
    cats = [
        ("SECURITY", G, [("Kali Linux", "#367BF0"), ("Ethical Hacking", G), ("Pentesting", R), ("Network Security", C),
                          ("CTFs", "#b392f0"), ("Phishing Analysis", "#ffa657"), ("Red Team", R), ("Blue Team", "#58a6ff")]),
        ("LANGUAGES", C, [("C", "#659ad2"), ("C++", "#659ad2"), ("C#", "#68a063"), ("Java", "#ED8B00"), ("Python", "#4b8bbe"),
                           ("JavaScript", "#F7DF1E"), ("PHP", "#8892bf"), ("Lua", "#6a6cc9"), ("Swift", "#F54A2A"), ("HTML5", "#E34F26")]),
        ("WEB & DATA", "#ffa657", [("Apache", "#D42029"), ("Nginx", "#009639"), ("MySQL", "#5d9cc4"), ("Oracle", "#F80000"), ("Yarn", "#2C8EBB")]),
        ("CREATIVE", "#b392f0", [("Photoshop", "#31A8FF"), ("Premiere Pro", "#9999FF"), ("Lightroom", "#4fb8ff"), ("Blender", "#F5792A"),
                                  ("Figma", "#F24E1E"), ("Canva", "#00C4CC"), ("Creative Cloud", "#DA1F26")]),
        ("GAME & XR", R, [("Unity", "#d0d7de"), ("Unreal Engine", "#9aa4b2"), ("Meta", "#0467DF")]),
    ]
    LABW, PADX, RH = 190, 24, 48
    maxx = W - 24
    y = 22
    out, n = [], 0
    for name, col, items in cats:
        rows, x = [[]], LABW + PADX
        for t, c in items:
            w = len(t) * 8.8 + 42
            if x + w > maxx:
                rows.append([]); x = LABW + PADX
            rows[-1].append((t, c, x, w)); x += w + 10
        bh = len(rows) * RH + 8
        out.append(f'<g transform="translate(0 {y})"><rect x="0" y="0" width="{W}" height="{bh}" rx="14" fill="#0d1117" stroke="#30363d"/>'
                   f'<rect x="0" y="16" width="4" height="{bh-32}" rx="2" fill="{col}"/>'
                   f'<text x="26" y="{bh/2+5:.0f}" font-family="{FONT_MONO}" font-size="14" letter-spacing="3" fill="{col}">{esc(name)}</text>')
        for ri, row in enumerate(rows):
            for t, c, x, w in row:
                n += 1
                out.append(f'<g transform="translate({x:.0f} {ri*RH+10})"><g>'
                           f'<rect width="{w:.0f}" height="34" rx="17" fill="#161b22" stroke="{c}" stroke-opacity=".55"/>'
                           f'<circle cx="18" cy="17" r="4.5" fill="{c}"/>'
                           f'<text x="30" y="22" font-family="{FONT_SANS}" font-size="14" fill="#e6edf3">{esc(t)}</text>'
                           f'<animateTransform attributeName="transform" type="translate" values="0 0;0 -3;0 0" dur="{3+(n%5)*.5:.1f}s" begin="-{(n%7)*.4:.1f}s" repeatCount="indefinite"/></g></g>')
        out.append("</g>")
        y += bh + 12
    H = y - 12 + 22
    save("stack.svg", f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H-22}" role="img" aria-label="Tech stack">{"".join(out)}</svg>')


# ------------------------------------------------------------------ footer wave
def footer():
    W, H = 1200, 220

    def wave(y, amp, ph):
        pts = lambda p: " ".join(
            f"{'M' if i == 0 else 'L'} {x} {y + amp*math.sin(x/1200*2*math.pi*2 + p):.1f}" for i, x in enumerate(range(0, W + 1, 25)))
        return pts(ph) + f" L {W} {H} L 0 {H} Z"

    def anim(y, amp, dur, op, col):
        vals = ";".join(wave(y, amp, k * math.pi / 2) for k in range(4)) + ";" + wave(y, amp, 0)
        return f'<path d="{wave(y, amp, 0)}" fill="{col}" opacity="{op}"><animate attributeName="d" dur="{dur}s" repeatCount="indefinite" values="{vals}"/></path>'

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-label="Stay curious. Hack ethically.">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d1117"/><stop offset="1" stop-color="#0a1f1b"/></linearGradient>
  <linearGradient id="t" x1="0" x2="1"><stop offset="0" stop-color="{G}"/><stop offset=".5" stop-color="{C}"/><stop offset="1" stop-color="{G}"/>
    <animate attributeName="x1" values="-1;0" dur="6s" repeatCount="indefinite"/><animate attributeName="x2" values="0;1" dur="6s" repeatCount="indefinite"/></linearGradient>
  <clipPath id="f"><rect width="{W}" height="{H}" rx="18"/></clipPath>
</defs>
<g clip-path="url(#f)">
<rect width="{W}" height="{H}" fill="url(#bg)"/>
{anim(150, 14, 9, .22, G)}{anim(168, 10, 7, .28, C)}{anim(186, 8, 11, .5, "#0f3d33")}
<text x="600" y="78" text-anchor="middle" font-family="{FONT_SANS}" font-size="38" font-weight="800" letter-spacing="6" fill="url(#t)">STAY CURIOUS. HACK ETHICALLY.</text>
<text x="600" y="112" text-anchor="middle" font-family="{FONT_MONO}" font-size="15" letter-spacing="3" fill="#6e7681">break it  /  understand it  /  secure it</text>
</g>
<rect x=".5" y=".5" width="{W-1}" height="{H-1}" rx="18" fill="none" stroke="#30363d"/>
</svg>'''
    save("footer.svg", svg)


if __name__ == "__main__":
    title("01", "ABOUT & NOW", "title-now.svg")
    title("02", "TECH STACK", "title-stack.svg")
    title("03", "CONTRIBUTION SNAKE", "title-snake.svg")
    title("04", "GITHUB STATS", "title-stats.svg")
    title("05", "CONNECT", "title-connect.svg")
    now()
    stack()
    footer()
