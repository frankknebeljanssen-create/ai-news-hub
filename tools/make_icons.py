#!/usr/bin/env python3
"""Erzeugt die App-Symbole (icons/*.png und icons/icon.svg) ohne Fremdbibliotheken.

Motiv: tiefblauer Verlauf, weisse Briefing-Karte mit Schlagzeile und Textzeilen, goldener KI-Funke an der Ecke.
Alle Koordinaten liegen im Einheitsquadrat (0 bis 1, y nach unten), damit sich jede Groesse aus einer Beschreibung rendern laesst.
"""
import math
import struct
import zlib
from pathlib import Path

C0 = (22, 33, 96)      # Verlauf oben links
C1 = (47, 107, 255)    # Verlauf unten rechts
CARD = (246, 248, 255)
HEAD = (47, 107, 255)
LINE = (176, 190, 235)
GOLD = (255, 205, 60)
CORE = (255, 246, 205)
SHADOW = (8, 14, 50)

# Karte: Mittelpunkt, halbe Breite und Hoehe, Eckenradius
CX, CY, HW, HH, R = 0.46, 0.57, 0.215, 0.27, 0.05
# Zeilen in der Karte: (y, relative Laenge, Dicke, Farbe)
LEFT, WIDTH = 0.29, 0.34
LINES = [
    (0.385, 0.80, 0.044, HEAD),
    (0.475, 1.00, 0.024, LINE),
    (0.540, 0.88, 0.024, LINE),
    (0.605, 0.96, 0.024, LINE),
    (0.670, 0.58, 0.024, LINE),
]
# Funken: Mittelpunkt, Radius
STARS = [(0.705, 0.30, 0.150), (0.815, 0.49, 0.055)]


def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def sd_round_box(px, py, cx, cy, hw, hh, r):
    qx, qy = abs(px - cx) - hw + r, abs(py - cy) - hh + r
    return math.hypot(max(qx, 0.0), max(qy, 0.0)) + min(max(qx, qy), 0.0) - r


def in_capsule(px, py, x0, x1, y, half):
    t = max(0.0, min(1.0, (px - x0) / (x1 - x0)))
    return math.hypot(px - (x0 + t * (x1 - x0)), py - y) <= half


def in_star(px, py, cx, cy, r):
    return (abs(px - cx) / r) ** 0.78 + (abs(py - cy) / r) ** 0.78 <= 1.0


def mix(a, b, t):
    return tuple(a[i] * (1 - t) + b[i] * t for i in range(3))


def shade(x, y):
    # Hintergrund: Verlauf mit weichem Lichtfleck oben links
    t = min(1.0, max(0.0, x * 0.35 + y * 0.65))
    col = mix(C0, C1, t)
    glow = max(0.0, 1.0 - math.hypot(x - 0.25, y - 0.18) / 0.75)
    col = mix(col, (120, 160, 255), glow * glow * 0.35)

    # Schatten der Karte
    ds = sd_round_box(x, y, CX + 0.012, CY + 0.03, HW, HH, R)
    col = mix(col, SHADOW, 0.38 * (1.0 - smooth(-0.01, 0.065, ds)))

    # Karte und Zeilen
    if sd_round_box(x, y, CX, CY, HW, HH, R) <= 0:
        col = CARD
        for ly, rel, th, lc in LINES:
            if in_capsule(x, y, LEFT, LEFT + WIDTH * rel, ly, th / 2):
                col = lc
                break

    # Leuchten und Funken
    for sx, sy, sr in STARS:
        d = math.hypot(x - sx, y - sy)
        col = mix(col, (255, 215, 110), max(0.0, 1.0 - d / (sr * 1.9)) ** 2 * 0.40)
    for sx, sy, sr in STARS:
        if in_star(x, y, sx, sy, sr):
            col = GOLD
            if in_star(x, y, sx, sy, sr * 0.42):
                col = CORE
    return col


def render(size, ss):
    rows = []
    offs = [(k + 0.5) / ss for k in range(ss)]
    for j in range(size):
        row = bytearray([0])
        for i in range(size):
            r = g = b = 0.0
            for oy in offs:
                for ox in offs:
                    c = shade((i + ox) / size, (j + oy) / size)
                    r += c[0]; g += c[1]; b += c[2]
            n = ss * ss
            row += bytes((round(r / n), round(g / n), round(b / n)))
        rows.append(bytes(row))
    return rows


def write_png(path, size, ss):
    raw = b"".join(render(size, ss))

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    Path(path).write_bytes(png)


SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#162160"/><stop offset="1" stop-color="#2f6bff"/>
    </linearGradient>
    <radialGradient id="hl" cx="0.25" cy="0.18" r="0.75">
      <stop offset="0" stop-color="#78a0ff" stop-opacity="0.45"/><stop offset="1" stop-color="#78a0ff" stop-opacity="0"/>
    </radialGradient>
    <filter id="sh" x="-20%" y="-20%" width="150%" height="150%"><feDropShadow dx="1.2" dy="3" stdDeviation="2.6" flood-color="#080e32" flood-opacity="0.45"/></filter>
  </defs>
  <rect width="100" height="100" fill="url(#bg)"/>
  <rect width="100" height="100" fill="url(#hl)"/>
  <rect x="24.5" y="30" width="43" height="54" rx="5" fill="#f6f8ff" filter="url(#sh)"/>
  <rect x="29" y="36.3" width="27.2" height="4.4" rx="2.2" fill="#2f6bff"/>
  <rect x="29" y="46.3" width="34" height="2.4" rx="1.2" fill="#b0beeb"/>
  <rect x="29" y="52.8" width="29.9" height="2.4" rx="1.2" fill="#b0beeb"/>
  <rect x="29" y="59.3" width="32.6" height="2.4" rx="1.2" fill="#b0beeb"/>
  <rect x="29" y="65.8" width="19.7" height="2.4" rx="1.2" fill="#b0beeb"/>
  <path d="M70.5 15 Q72 28 85.5 30 Q72 32 70.5 45 Q69 32 55.5 30 Q69 28 70.5 15Z" fill="#ffcd3c"/>
  <path d="M70.5 24 Q71 28.4 75.4 30 Q71 31.6 70.5 36 Q70 31.6 65.6 30 Q70 28.4 70.5 24Z" fill="#fff6cd"/>
  <path d="M81.5 43.5 Q82 47.3 86 49 Q82 50.7 81.5 54.5 Q81 50.7 77 49 Q81 47.3 81.5 43.5Z" fill="#ffcd3c"/>
</svg>
"""

if __name__ == "__main__":
    out = Path(__file__).resolve().parent.parent / "icons"
    out.mkdir(exist_ok=True)
    (out / "icon.svg").write_text(SVG, encoding="utf-8")
    print("geschrieben: icon.svg")
    for name, size, ss in (("apple-touch-icon.png", 180, 4), ("icon-192.png", 192, 4), ("icon-512.png", 512, 3)):
        write_png(out / name, size, ss)
        print("geschrieben:", name)
