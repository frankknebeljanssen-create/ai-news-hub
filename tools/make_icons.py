#!/usr/bin/env python3
"""Erzeugt die App-Symbole (icons/*.png) ohne Fremdbibliotheken: blaue Fläche mit weißem "KI"."""
import math
import struct
import zlib
from pathlib import Path

BG = (47, 107, 255)
FG = (255, 255, 255)
W = 0.075  # Strichstaerke relativ zur Kantenlaenge


def dist_seg(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


SEGMENTS = [  # K und I
    (0.27, 0.29, 0.27, 0.71),
    (0.37, 0.51, 0.51, 0.29),
    (0.37, 0.49, 0.52, 0.71),
    (0.66, 0.29, 0.66, 0.71),
]


def inside(x, y):
    return any(dist_seg(x, y, *s) <= W / 2 for s in SEGMENTS)


def render(size, ss=3):
    rows = []
    for j in range(size):
        row = bytearray([0])
        for i in range(size):
            hit = 0
            for sj in range(ss):
                for si in range(ss):
                    if inside((i + (si + 0.5) / ss) / size, (j + (sj + 0.5) / ss) / size):
                        hit += 1
            a = hit / (ss * ss)
            row += bytes(round(BG[k] * (1 - a) + FG[k] * a) for k in range(3))
        rows.append(bytes(row))
    return rows


def png(path, size):
    raw = b"".join(render(size))
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    Path(path).write_bytes(data)


if __name__ == "__main__":
    out = Path(__file__).resolve().parent.parent / "icons"
    out.mkdir(exist_ok=True)
    for name, size in (("apple-touch-icon.png", 180), ("icon-192.png", 192), ("icon-512.png", 512)):
        png(out / name, size)
        print("geschrieben:", name)
