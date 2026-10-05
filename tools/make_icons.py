#!/usr/bin/env python3
"""Erzeugt die App-Symbole (icons/*.png und icons/icon.svg) ohne Fremdbibliotheken.

Motiv: heller LimeByte-Grund, DeepAi-Briefing-Karte (Schlagzeile in LimeByte, Zeilen in SkyMind),
blaue Funken an der Ecke und unten rechts klein das AITI-Zeichen (nur das "A", ohne Punkt) in DeepAi.
Alle Koordinaten liegen in einem Raster von 0 bis 100 (y nach unten), jede Groesse wird daraus gerendert.
"""
import math
import struct
import zlib
from pathlib import Path

DEEPAI = (38, 89, 94)        # #26595E
LIMEBYTE = (245, 252, 156)   # #F5FC9C
SKYMIND = (201, 222, 227)    # #C9DEE3
BLUE = (47, 107, 255)        # #2F6BFF, zweiter Akzent der App
WHITE = (255, 255, 255)
SHADOW = (23, 57, 61)

BG = LIMEBYTE
CARD = (24.5, 30.0, 43.0, 54.0, 5.0)                 # x, y, Breite, Hoehe, Eckenradius
HEAD = (29.0, 36.3, 27.2, 4.4)                       # Schlagzeile: x, y, Breite, Dicke
LINES = [(29.0, 46.3, 34.0, 2.4), (29.0, 52.8, 29.9, 2.4), (29.0, 59.3, 32.6, 2.4), (29.0, 65.8, 19.7, 2.4)]

# AITI-Zeichen (nur das "A") im Originalraster des Logos, klein unten rechts
MARK_POLY = [(37.2, 3), (71.8, 3), (106.8, 90.5), (71.2, 90.5), (54.8, 48.5), (53.3, 48.5), (36.4, 90.5), (1.2, 90.5), (18.6, 45.8), (53.5, 45.8)]
MARK_X, MARK_Y, MARK_S = 69.64, 73.4, 0.20

# Komposition (Karte, Zeilen, Funken) um den Mittelpunkt vergroessern, damit sie fast bis zum Rand reicht
SCALE, CX, CY = 1.22, 55.25, 50.0

# Funken als quadratische Kurven (Start, Steuerpunkt, Ende), gleiche Geometrie wie im SVG
BIG = [((70.5, 15), (72, 28), (85.5, 30)), ((85.5, 30), (72, 32), (70.5, 45)), ((70.5, 45), (69, 32), (55.5, 30)), ((55.5, 30), (69, 28), (70.5, 15))]
CORE = [((70.5, 24), (71, 28.4), (75.4, 30)), ((75.4, 30), (71, 31.6), (70.5, 36)), ((70.5, 36), (70, 31.6), (65.6, 30)), ((65.6, 30), (70, 28.4), (70.5, 24))]
SMALL = [((81.5, 43.5), (82, 47.3), (86, 49)), ((86, 49), (82, 50.7), (81.5, 54.5)), ((81.5, 54.5), (81, 50.7), (77, 49)), ((77, 49), (81, 47.3), (81.5, 43.5))]


def flatten(segs, n=14):
    pts = []
    for (x0, y0), (cx, cy), (x1, y1) in segs:
        for k in range(n):
            t = k / n
            pts.append(((1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1, (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1))
    return pts


MARK = [(MARK_X + MARK_S * x, MARK_Y + MARK_S * y) for x, y in MARK_POLY]
STAR_BIG, STAR_CORE, STAR_SMALL = flatten(BIG), flatten(CORE), flatten(SMALL)


def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def sd_round_box(px, py, x, y, w, h, r):
    qx, qy = abs(px - (x + w / 2)) - (w / 2 - r), abs(py - (y + h / 2)) - (h / 2 - r)
    return math.hypot(max(qx, 0.0), max(qy, 0.0)) + min(max(qx, qy), 0.0) - r


def in_poly(x, y, poly):
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def in_capsule(x, y, bx, by, w, th):
    half = th / 2
    cx = max(bx + half, min(bx + w - half, x))
    return (x - cx) ** 2 + (y - by - half) ** 2 <= half * half


def mix(a, b, t):
    return tuple(a[i] * (1 - t) + b[i] * t for i in range(3))


def shade(u, v):
    fx, fy = u * 100.0, v * 100.0           # Endraster (fuer das AITI-Zeichen)
    x, y = (fx - 50.0) / SCALE + CX, (fy - 50.0) / SCALE + CY   # Raum der Komposition
    col = BG
    # weicher Schatten der Karte
    cx_, cy_, cw, ch, cr = CARD
    ds = sd_round_box(x, y, cx_ + 0.8, cy_ + 2.2, cw, ch, cr)
    col = mix(col, SHADOW, 0.28 * (1.0 - smooth(-1.0, 4.0, ds)))
    # Karte, Schlagzeile, Zeilen
    if sd_round_box(x, y, *CARD) <= 0:
        col = DEEPAI
        if in_capsule(x, y, *HEAD):
            col = LIMEBYTE
        else:
            for ln in LINES:
                if in_capsule(x, y, *ln):
                    col = SKYMIND
                    break
    # Funken
    if in_poly(x, y, STAR_BIG):
        col = BLUE
        if in_poly(x, y, STAR_CORE):
            col = WHITE
    # AITI-Zeichen
    if in_poly(fx, fy, MARK):
        col = DEEPAI
    return col


def render(size, ss):
    rows = []
    offs = [(k + 0.5) / ss for k in range(ss)]
    n = ss * ss
    for j in range(size):
        row = bytearray([0])
        for i in range(size):
            r = g = b = 0
            for oy in offs:
                for ox in offs:
                    c = shade((i + ox) / size, (j + oy) / size)
                    r += c[0]; g += c[1]; b += c[2]
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


def path_d(segs):
    (x, y), *_ = segs[0]
    d = f"M{x} {y}"
    for _, (cx, cy), (ex, ey) in segs:
        d += f" Q{cx} {cy} {ex} {ey}"
    return d + "Z"


def svg():
    pts = " ".join(f"{MARK_X + MARK_S * x:.2f},{MARK_Y + MARK_S * y:.2f}" for x, y in MARK_POLY)
    cx_, cy_, w, h, rr = CARD
    lines = "\n".join(f'  <rect x="{x}" y="{y}" width="{w_}" height="{t}" rx="{t / 2}" fill="#C9DEE3"/>' for x, y, w_, t in LINES)
    hx, hy, hw, ht = HEAD
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <filter id="sh" x="-20%" y="-20%" width="150%" height="150%"><feDropShadow dx="0.8" dy="2.2" stdDeviation="1.8" flood-color="#17393D" flood-opacity="0.28"/></filter>
  </defs>
  <rect width="100" height="100" fill="#F5FC9C"/>
  <g transform="translate({50 - SCALE * CX:.2f} {50 - SCALE * CY:.2f}) scale({SCALE})">
  <rect x="{cx_}" y="{cy_}" width="{w}" height="{h}" rx="{rr}" fill="#26595E" filter="url(#sh)"/>
  <rect x="{hx}" y="{hy}" width="{hw}" height="{ht}" rx="{ht / 2}" fill="#F5FC9C"/>
{lines}
  <path d="{path_d(BIG)}" fill="#2F6BFF"/>
  <path d="{path_d(CORE)}" fill="#FFFFFF"/>
  </g>
  <polygon points="{pts}" fill="#26595E"/>
</svg>
"""


if __name__ == "__main__":
    out = Path(__file__).resolve().parent.parent / "icons"
    out.mkdir(exist_ok=True)
    (out / "icon.svg").write_text(svg(), encoding="utf-8")
    print("geschrieben: icon.svg")
    for name, size, ss in (("apple-touch-icon.png", 180, 4), ("icon-192.png", 192, 4), ("icon-512.png", 512, 3)):
        write_png(out / name, size, ss)
        print("geschrieben:", name)
