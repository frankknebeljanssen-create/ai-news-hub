#!/usr/bin/env python3
"""Erzeugt das taegliche Update als E-Mail (HTML und Text) aus den Daten der App.

Aufruf:  python3 tools/make_digest.py [--date YYYY-MM-DD] [--alle] [--out ORDNER]
Ergebnis: <out>/digest-DATUM.html, digest-DATUM.txt und digest-DATUM.json (Betreff, Vorschautext).
Die Mail nutzt nur Tabellen und Inline-Stile (laeuft in Outlook, Gmail, Apple Mail), keine Skripte, keine Fremdschriften.
Inhalt: eigene Kurzfassungen mit Link zur Quelle, keine Volltexte.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import subprocess
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
LOCK = "\U0001F512"

DEEP, LIME, SKY, MINT, TEXT, MUTED = "#26595E", "#F5FC9C", "#C9DEE3", "#D1FAE3", "#1B2B2D", "#5B6B6D"
FONT = "Arial,Helvetica,sans-serif"

TAGE = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"]
MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"]
THEMEN = ["KI & Lernen", "Modelle und Produkte", "Forschung", "Business", "Politik und Regulierung", "Unternehmen DE", "Sicherheit und Ethik"]


def esc(s: str) -> str:
    return html.escape(s or "", quote=True)


def app_url() -> str:
    try:
        u = subprocess.run(["git", "remote", "get-url", "origin"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
        m = re.search(r"github\.com[:/]([^/]+)/([^/.]+)", u)
        if m:
            return f"https://{m.group(1).lower()}.github.io/{m.group(2)}/"
    except Exception:
        pass
    return ""


def first_sentence(t: str) -> str:
    m = re.match(r"(.+?[.!?])(\s+[A-ZÄÖÜ0-9„\"(]|$)", t.strip(), re.S)
    return (m.group(1) if m else t).strip()


def long_date(d: str) -> str:
    dt = datetime.fromisoformat(d)
    return f"{TAGE[dt.weekday()]}, {dt.day}. {MONATE[dt.month - 1]} {dt.year}"


def src(it: dict) -> str:
    return f"{LOCK} {it['source']}" if it.get("paywall") else it["source"]


# Alles inline (Outlook am Handy und im Programm ignoriert Klassen und <style> teilweise). Farben wie der Dunkelmodus der App.
PAGE = "#E3E6E5"            # heller, neutraler Grund
BG, SURF, SURF2, BORDER = "#102A2C", "#1B3A3D", "#22474B", "#2F5559"   # BG: Kontextkasten, SURF: Karten
TXT, SOFT, MUTE, MINT, LIME, DEEP2 = "#FFFFFF", "#DCE8E6", "#A9C0C1", "#9FE8C3", "#F5FC9C", "#163F43"
INK, INK_SOFT, INK_LINE = "#3C4B4D", "#5A6A6C", "#C3CAC9"   # Text auf hellem Grund
F = "font-family:Arial,Helvetica,sans-serif;"

# Balken: (Hintergrund, Titelfarbe, Untertitelfarbe), alle dunkel mit heller Schrift
BANDS = {"top": ("#163F43", TXT, SOFT), "aiti": ("#0D2523", LIME, MINT), "de": ("#254E5A", TXT, "#CFE3E8"),
         "kur": ("#8C4A12", TXT, "#F6D9B5"), "rest": ("#3A5256", TXT, SOFT)}
SPACER = '<tr><td height="{h}" style="height:{h}px;line-height:{h}px;font-size:0;">&nbsp;</td></tr>'


def spacer(h: int) -> str:
    return SPACER.format(h=h)


def band(kind: str, label: str, sub: str = "") -> str:
    bg, fg, sub_fg = BANDS[kind]
    sub_html = f'<div style="font-size:13px;font-weight:400;color:{sub_fg};margin-top:4px;">{esc(sub)}</div>' if sub else ""
    return (spacer(34) + f'<tr><td bgcolor="{bg}" style="background:{bg};border-radius:12px;padding:18px 20px;{F}">'
            f'<div style="font-size:22px;line-height:1.2;font-weight:800;color:{fg};">{esc(label)}</div>{sub_html}</td></tr>' + spacer(12))


KONTEXT_OFFEN = True  # Outlook (Mac, Handy, Windows) kann nicht einklappen: Standard ist immer sichtbar. False: einklappbar (details)


def ctx_html(it: dict) -> str:
    k = (it.get("kontext") or "").strip()
    if not k:
        return ""
    box = (f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;"><tr>'
           f'<td width="3" bgcolor="{MINT}" style="background:{MINT};width:3px;font-size:0;">&nbsp;</td>'
           f'<td bgcolor="{BG}" style="background:{BG};padding:11px 13px;{F}font-size:14px;line-height:1.55;color:{SOFT};">{esc(k)}</td></tr></table>')
    if KONTEXT_OFFEN:
        return (f'<div style="margin-top:22px;padding-top:14px;border-top:1px solid {BORDER};{F}font-size:14px;font-weight:700;color:{MINT};">Mehr Kontext</div>'
                + box.replace('margin-top:6px;', 'margin-top:8px;'))
    return (f'<details style="margin-top:12px;"><summary style="{F}font-size:15px;font-weight:700;color:{MINT};cursor:pointer;padding:6px 0;">Mehr Kontext</summary>{box}</details>')


def tile(it: dict, text: str, kind: str = "norm", num: int | None = None, hook: str = "") -> str:
    bg = SURF2 if kind == "top" else SURF
    left = f"border-left:4px solid {LIME};" if kind == "top" else ""
    hook_html = f'<div style="{F}font-size:14px;font-weight:700;color:#F0B45C;margin:6px 0 0 0;">{esc(hook)}</div>' if hook else ""
    badge = ""
    if num is not None:
        badge = (f'<td width="46" valign="top" style="width:46px;padding:0 14px 0 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
                 f'<td width="34" height="34" align="center" bgcolor="{LIME}" style="width:34px;height:34px;background:{LIME};border-radius:10px;{F}font-size:17px;font-weight:800;color:#0E1A1C;">{num}</td></tr></table></td>')
    return (f'<tr><td bgcolor="{bg}" style="background:{bg};border:1px solid {BORDER};{left}border-radius:12px;padding:18px 18px 16px 18px;{F}">'
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>{badge}<td valign="top" style="{F}">'
            f'<div style="font-size:12px;letter-spacing:.9px;text-transform:uppercase;font-weight:700;color:{MINT};">{esc(it["thema"])}</div>{hook_html}'
            f'<div style="margin-top:6px;"><a href="{esc(it["url"])}" style="color:{TXT};font-size:18px;line-height:1.3;font-weight:700;text-decoration:none;">{esc(it["headline"])}</a></div>'
            f'<div style="font-size:15px;line-height:1.55;color:{SOFT};margin-top:8px;">{esc(text)}</div>{ctx_html(it)}'
            f'<div style="font-size:13px;color:{MUTE};margin-top:12px;">{esc(src(it))} &middot; <a href="{esc(it["url"])}" style="color:{MINT};text-decoration:underline;">Zum Original</a></div>'
            f'</td></tr></table></td></tr>' + spacer(14))


ANSCHREIBEN = [
    "Hallo Team,",
    "ich habe eine App für kuratierte KI-News gebaut. Hier ein Auszug daraus, den ich euch gern täglich automatisiert zukommen lassen kann. Wer sich für die App interessiert, meldet sich bitte bei mir. \U0001F642",
    "Frank",
]


def compact_card(grp: list[dict]) -> str:
    cells = []
    for k, it in enumerate(grp):
        line = f"border-top:1px solid {BORDER};" if k else ""
        cells.append(f'<tr><td style="{line}padding:13px 4px 12px 4px;{F}"><a href="{esc(it["url"])}" style="color:#FFFFFF;font-size:16px;line-height:1.35;font-weight:700;text-decoration:none;">{esc(it["headline"])}</a>'
                     f'<div style="font-size:14px;line-height:1.5;color:{SOFT};margin-top:5px;">{esc(first_sentence(it["summary"]))}</div>'
                     f'<div style="font-size:12px;color:{MUTE};margin-top:6px;">{esc(src(it))} &middot; <a href="{esc(it["url"])}" style="color:{MINT};text-decoration:underline;">Zum Original</a></div></td></tr>')
    return (f'<tr><td bgcolor="{SURF}" style="background:{SURF};border:1px solid {BORDER};border-radius:12px;padding:6px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
            + "".join(cells) + '</table></td></tr>')


def build(date: str, alle: bool, kompakt: bool = False, app_link: bool = False, klein: bool = False, top_n: int = 10, anschreiben: bool = True) -> dict:
    index = json.loads((DATA / "index.json").read_text(encoding="utf-8"))
    day_path = DATA / date[:4] / date[5:7] / f"{date}.json"
    day = json.loads(day_path.read_text(encoding="utf-8")) if day_path.exists() else {"overview": [], "items": []}
    byid = {x["id"]: x for x in index["items"]}
    items = [x for x in index["items"] if x["date"] == date and not x.get("dup_of")]
    items.sort(key=lambda x: (-x["relevanz"], x["published"]))
    top = [(o["text"], byid[o["id"]]) for o in day.get("overview", []) if o["id"] in byid and not byid[o["id"]].get("dup_of")]
    dt0 = datetime.fromisoformat(date)
    top = top[:top_n]
    seen = {it["id"] for _, it in top}
    for it in items:  # auf top_n auffuellen, falls die Redaktion weniger gewaehlt hat (wichtigste zuerst, je Quelle hoechstens 2)
        if len(top) >= top_n:
            break
        if it["id"] in seen or sum(1 for _, x in top if x["source"] == it["source"]) >= 2:
            continue
        top.append((first_sentence(it["summary"]), it))
        seen.add(it["id"])
    if klein:
        top = top[:min(top_n, 5)]
    used = {it["id"] for _, it in top}
    n_src = len({x["source"] for x in items})

    rows = [band("top", "Das Wichtigste", "Die Top-Meldungen des Tages").replace(spacer(34), spacer(8), 1)]
    for k, (txt, it) in enumerate(top, 1):
        rows.append(tile(it, txt, "top", num=k))

    def section(kind, label, sub, lst, hook=False, limit=6, dedupe=False, tiles_max=999):
        lst = [x for x in lst if not dedupe or x["id"] not in used][:(1 if klein else 3 if kompakt else limit)]
        if not lst:
            return
        rows.append(band(kind, label, sub))
        for it in lst[:tiles_max]:
            rows.append(tile(it, first_sentence(it["summary"]), "kur" if hook else "norm", hook=it.get("kurios", "") if hook else ""))
        if len(lst) > tiles_max:  # Rest kompakt in einer gemeinsamen Karte, damit die Mail nicht ausufert
            rows.append(compact_card(lst[tiles_max:]))
        used.update(x["id"] for x in lst)

    # Reihenfolge wie in der App: Top, Für AITI, Aus Deutschland, Kurios & krass, dann die Themenblöcke
    section("aiti", "Für AITI", "Weiterbildung, KI-Kompetenz, Bildungsmarkt", [x for x in items if "AITI" in (x.get("tags") or [])], limit=999, tiles_max=5)
    section("de", "Aus Deutschland", "", [x for x in items if x["region"] == "de"], limit=6)
    kur = sorted([x for x in index["items"] if x.get("kurios") and not x.get("dup_of") and x["date"] == date], key=lambda x: -x["relevanz"])
    if len(kur) < 3:  # mindestens 3: fehlende aus den letzten 7 Tagen auffuellen
        since = (dt0 - timedelta(days=7)).strftime("%Y-%m-%d")
        more = sorted([x for x in index["items"] if x.get("kurios") and not x.get("dup_of") and since <= x["date"] < date], key=lambda x: (x["date"], x["relevanz"]), reverse=True)
        kur += more[:3 - len(kur)]
    section("kur", "Kurios & krass", "", kur, hook=True, limit=999)

    if not kompakt:
        # Themenblöcke aus der App, jeweils gekürzt (Schlagzeile, ein Satz, Quelle); mindestens 3 je Block, notfalls auch bereits gezeigte
        TH_FARBE = {"Modelle und Produkte": "#2B4FA8", "Business": "#1F6B4F", "Unternehmen DE": "#1D6275", "Sicherheit und Ethik": "#9A3B33",
                    "Forschung": "#5B3FA0", "Politik und Regulierung": "#8A5A12"}
        for th in ["Modelle und Produkte", "Business", "Unternehmen DE", "Sicherheit und Ethik", "Forschung", "Politik und Regulierung"]:
            allgrp = [x for x in items if x["thema"] == th]
            if not allgrp:
                continue
            fresh = [x for x in allgrp if x["id"] not in used]
            grp = fresh[:(999 if alle else 5)]
            if len(grp) < 3:
                grp += [x for x in allgrp if x not in grp][:3 - len(grp)]
            col = TH_FARBE[th]
            rows.append(spacer(34) + f'<tr><td bgcolor="{col}" style="background:{col};border-radius:12px;padding:16px 20px;{F}"><div style="font-size:20px;line-height:1.2;font-weight:800;color:#FFFFFF;">{esc(th)}</div>'
                        f'<div style="font-size:12px;color:#FFFFFF;opacity:.85;margin-top:3px;">{len(allgrp)} Meldungen heute</div></td></tr>' + spacer(10))
            rows.append(compact_card(grp))
            used.update(x["id"] for x in grp)

    url = app_url() if app_link else ""  # Link zur App nur auf Wunsch (das Team hat die App nicht)
    long_d = long_date(date)
    dt = datetime.fromisoformat(date)
    pre = (top[0][0] if top else "Die wichtigsten KI-Meldungen des Tages")[:140]
    subject = f"KI News, {TAGE[dt.weekday()][:2]}. {dt.day}.{dt.month}.: " + (top[0][1]["headline"] if top else "Das Update des Tages")
    btn = (f'<tr><td align="center" style="padding:10px 0 0 0;"><a href="{esc(url)}" style="display:inline-block;background:{LIME};color:#0E1A1C;{F}font-size:16px;font-weight:700;text-decoration:none;'
           f'padding:14px 30px;border-radius:999px;">Alle Meldungen in der App lesen</a></td></tr>') if url else ""
    intro_html = ""
    if anschreiben:
        paras = "".join(f'<p style="margin:0 0 12px 0;">{esc(t)}</p>' for t in ANSCHREIBEN[:-1])
        intro_html = (f'<tr><td bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:14px;padding:22px 22px 14px 22px;{F}font-size:16px;line-height:1.55;color:{INK};">'
                      f'{paras}<p style="margin:0 0 6px 0;font-weight:700;">{esc(ANSCHREIBEN[-1])}</p></td></tr>' + spacer(16))
    doc = f"""<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>{esc(subject)}</title></head>
<body style="margin:0;padding:0;background:{PAGE};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:{PAGE};">{esc(pre)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="{PAGE}" style="background:{PAGE};"><tr><td align="center" style="padding:16px 12px 24px 12px;">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;">
{intro_html}<tr><td bgcolor="{DEEP2}" style="background:{DEEP2};border-radius:14px;padding:26px 22px 22px 22px;{F}">
<div style="font-size:30px;line-height:1.1;font-weight:800;color:{TXT};">KI News</div>
<div style="font-size:17px;color:{LIME};margin-top:8px;font-weight:700;">{esc(long_d)}</div>
<div style="font-size:14px;line-height:1.45;color:#C9DEE3;margin-top:6px;">Auszug aus {len(items)} Meldungen von {n_src} Quellen, kuratiert und auf Deutsch zusammengefasst</div></td></tr>
{spacer(8)}
{chr(10).join(rows)}
{btn}
{spacer(30)}
<tr><td style="border-top:1px solid {INK_LINE};padding:20px 6px 8px 6px;{F}font-size:13px;line-height:1.6;color:{INK_SOFT};">
<b style="color:{INK};">Eigene Kurzfassungen mit Link zur Quelle, keine Volltexte.</b><br>{LOCK} = Quelle hinter einer Bezahlschranke.<br>Die Zusammenfassungen entstehen automatisch und können Fehler enthalten, bitte wichtige Angaben am Original prüfen.</td></tr>
</table></td></tr></table></body></html>"""

    txt = (ANSCHREIBEN[:-1] + [ANSCHREIBEN[-1], ""] if anschreiben else []) + [f"KI NEWS | {long_d}", f"{len(items)} Meldungen aus {n_src} Quellen", "", "DAS WICHTIGSTE"]
    for k, (t, it) in enumerate(top, 1):
        txt += [f"{k}. {it['headline']}", f"   {t}", f"   {it['source']}: {it['url']}", ""]
    for it in [x for x in items if x["id"] not in {y['id'] for _, y in top}][:12]:
        txt += [f"- {it['headline']} ({it['source']})", f"  {it['url']}"]
    if url:
        txt += ["", f"Alle Meldungen in der App: {url}"]
    return {"subject": subject, "preheader": pre, "html": doc, "text": "\n".join(txt), "count": len(items), "date": date}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date")
    ap.add_argument("--kompakt", action="store_true", help="nur Top-Meldungen und je 3 aus den Bloecken")
    ap.add_argument("--app-link", action="store_true", help="Knopf mit Link zur App anzeigen")
    ap.add_argument("--klein", action="store_true", help="nur 4 Top-Meldungen und je 1 pro Block (Test)")
    ap.add_argument("--kontext-einklappbar", action="store_true", help="Mehr Kontext einklappbar (nicht in Outlook)")
    ap.add_argument("--top", type=int, default=10, help="Anzahl Top-Meldungen (Standard 10)")
    ap.add_argument("--ohne-anschreiben", action="store_true", help="ohne das kurze Anschreiben oben")
    ap.add_argument("--alle", action="store_true", help="alle Meldungen mit Kurzfassung statt der Auswahl")
    ap.add_argument("--out", default=str(ROOT / "digest"))
    a = ap.parse_args()
    index = json.loads((DATA / "index.json").read_text(encoding="utf-8"))
    date = a.date or max(x["date"] for x in index["items"])
    global KONTEXT_OFFEN
    KONTEXT_OFFEN = not a.kontext_einklappbar
    res = build(date, a.alle, a.kompakt or a.klein, a.app_link, a.klein, a.top, not a.ohne_anschreiben)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / f"digest-{date}.html").write_text(res["html"], encoding="utf-8")
    (out / f"digest-{date}.txt").write_text(res["text"], encoding="utf-8")
    (out / f"digest-{date}.json").write_text(json.dumps({k: res[k] for k in ("subject", "preheader", "count", "date")}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{res['subject']} | {res['count']} Meldungen | {out}/digest-{date}.html")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
