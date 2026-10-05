#!/usr/bin/env python3
"""Erzeugt die App-Symbole (icons/*.png und icons/icon.svg) ohne Fremdbibliotheken.

Motiv (AITI-Farben): DeepAi-Flaeche, VerdaNova-Briefing-Karte mit Schlagzeile und Textzeilen,
darueber rechts das AITI-Zeichen (Bildzeichen aus zwei Parallelogrammen mit Punkt) in LimeByte und MintTech.
Alle Koordinaten liegen in einem Raster von 0 bis 100 (y nach unten), jede Groesse wird daraus gerendert.
"""
import struct
import zlib
from pathlib import Path

DEEPAI = (38, 89, 94)       # #26595E
LIMEBYTE = (245, 252, 156)  # #F5FC9C
MINTTECH = (209, 250, 227)  # #D1FAE3
SKYMIND = (201, 222, 227)   # #C9DEE3
VERDANOVA = (242, 240, 232) # #F2F0E8

# AITI-Zeichen im Originalraster (Pixel des Logos): Umriss des "A" und Kreis
MARK_POLY = [(37.2, 3), (71.8, 3), (106.8, 90.5), (71.2, 90.5), (54.8, 48.5), (53.3, 48.5), (36.4, 90.5), (1.2, 90.5), (18.6, 45.8), (53.5, 45.8)]
MARK_DOT = (118.5, 19.7, 19.6)
MARK_X, MARK_Y, MARK_S = 44.0, 11.0, 0.33   # Lage und Massstab im Icon

CARD = (16.0, 46.0, 44.0, 42.0, 4.5)        # x, y, Breite, Hoehe, Eckenradius
HEAD = (21.0, 52.0, 26.0, 4.2)              # Schlagzeile: x, y, Breite, Dicke
LINES = [(21.0, 61.0, 33.0, 2.3), (21.0, 67.0, 29.0, 2.3), (21.0, 73.0, 31.0, 2.3), (21.0, 79.0, 19.0, 2.3)]


def to_icon(px, py):
    return (MARK_X + MARK_S * px, MARK_Y + MARK_S * py)


POLY = [to_icon(x, y) for x, y in MARK_POLY]
DOT = (*to_icon(MARK_DOT[0], MARK_DOT[1]), MARK_DOT[2] * MARK_S)


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


def in_round_rect(x, y, rx, ry, w, h, r):
    qx = abs(x - (rx + w / 2)) - (w / 2 - r)
    qy = abs(y - (ry + h / 2)) - (h / 2 - r)
    if qx <= 0 or qy <= 0:
        return qx <= r and qy <= r and (qx <= 0 or qy <= 0) or (qx <= 0 and qy <= r) or (qy <= 0 and qx <= r)
    return qx * qx + qy * qy <= r * r


def in_capsule(x, y, bx, by, w, th):
    half = th / 2
    x0, x1 = bx + half, bx + w - half
    cx = max(x0, min(x1, x))
    return (x - cx) ** 2 + (y - by - half) ** 2 <= half * half


def shade(u, v):
    x, y = u * 100.0, v * 100.0
    col = DEEPAI
    if in_round_rect(x, y, *CARD):
        col = VERDANOVA
        if in_capsule(x, y, *HEAD):
            col = DEEPAI
        else:
            for ln in LINES:
                if in_capsule(x, y, *ln):
                    col = SKYMIND
                    break
    if in_poly(x, y, POLY):
        col = LIMEBYTE
    cx, cy, r = DOT
    if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
        col = MINTTECH
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


def svg():
    pts = " ".join(f"{MARK_X + MARK_S * x:.2f},{MARK_Y + MARK_S * y:.2f}" for x, y in MARK_POLY)
    cx, cy, r = DOT
    cx, cy, r = round(cx, 2), round(cy, 2), round(r, 2)
    cx_, cy_, w, h, rr = CARD
    lines = "\n".join(f'  <rect x="{x}" y="{y}" width="{w_}" height="{t}" rx="{t / 2}" fill="#C9DEE3"/>' for x, y, w_, t in LINES)
    hx, hy, hw, ht = HEAD
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#26595E"/>
  <rect x="{cx_}" y="{cy_}" width="{w}" height="{h}" rx="{rr}" fill="#F2F0E8"/>
  <rect x="{hx}" y="{hy}" width="{hw}" height="{ht}" rx="{ht / 2}" fill="#26595E"/>
{lines}
  <polygon points="{pts}" fill="#F5FC9C"/>
  <circle cx="{cx}" cy="{cy}" r="{r}" fill="#D1FAE3"/>
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
