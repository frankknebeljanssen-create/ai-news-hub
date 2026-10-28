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
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
LOCK = "\U0001F512"

DEEP, LIME, SKY, MINT, TEXT, MUTED = "#26595E", "#F5FC9C", "#C9DEE3", "#D1FAE3", "#1B2B2D", "#5B6B6D"
FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

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


def block_title(label: str, sub: str = "") -> str:
    sub_html = ""
    if sub:
        sub_html = f'<div style="font-size:12px;color:{MUTED};margin-top:2px;">{esc(sub)}</div>'
    return (f'<tr><td style="padding:26px 24px 8px 24px;font-family:{FONT};">'
            f'<div style="font-size:12px;letter-spacing:1.2px;text-transform:uppercase;font-weight:700;color:{DEEP};">{esc(label)}</div>'
            + sub_html +
            f'<div style="height:3px;width:42px;background:{DEEP};margin-top:8px;font-size:0;line-height:0;">&nbsp;</div></td></tr>')


def story_row(it: dict, text: str, num: int | None = None, hook: str = "", tag: str = "") -> str:
    badge = ""
    if num is not None:
        badge = (f'<td width="34" valign="top" style="padding:2px 0 0 0;"><div style="width:26px;height:26px;line-height:26px;text-align:center;'
                 f'border-radius:8px;background:{MINT};color:{DEEP};font-weight:700;font-size:13px;font-family:{FONT};">{num}</div></td>')
    hook_html = f'<div style="font-size:13px;font-weight:700;color:#B5532A;margin:0 0 3px 0;">{esc(hook)}</div>' if hook else ""
    tag_html = f'<span style="font-size:11px;letter-spacing:.8px;text-transform:uppercase;font-weight:700;color:{MUTED};">{esc(tag)}</span><br>' if tag else ""
    return (f'<tr><td style="padding:10px 24px;font-family:{FONT};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>{badge}'
            f'<td valign="top" style="font-family:{FONT};">{tag_html}{hook_html}'
            f'<a href="{esc(it["url"])}" style="color:{TEXT};font-size:16px;line-height:1.35;font-weight:700;text-decoration:none;">{esc(it["headline"])}</a>'
            f'<div style="font-size:14px;line-height:1.5;color:#33474A;margin-top:4px;">{esc(text)}</div>'
            f'<div style="font-size:12px;color:{MUTED};margin-top:5px;">{esc(src(it))} &middot; '
            f'<a href="{esc(it["url"])}" style="color:{DEEP};text-decoration:underline;">Zum Original</a></div></td></tr></table></td></tr>')


def divider() -> str:
    return '<tr><td style="padding:0 24px;"><div style="height:1px;background:#E3E8E6;font-size:0;line-height:0;">&nbsp;</div></td></tr>'


def build(date: str, alle: bool) -> dict:
    index = json.loads((DATA / "index.json").read_text(encoding="utf-8"))
    day_path = DATA / date[:4] / date[5:7] / f"{date}.json"
    day = json.loads(day_path.read_text(encoding="utf-8")) if day_path.exists() else {"overview": [], "items": []}
    byid = {x["id"]: x for x in index["items"]}
    items = [x for x in index["items"] if x["date"] == date and not x.get("dup_of")]
    items.sort(key=lambda x: (-x["relevanz"], x["published"]), reverse=False)
    items.sort(key=lambda x: (-x["relevanz"], x["published"]))
    top = [(o["text"], byid[o["id"]]) for o in day.get("overview", []) if o["id"] in byid and not byid[o["id"]].get("dup_of")]
    used = {it["id"] for _, it in top}
    n_src = len({x["source"] for x in items})

    rows = []
    rows.append(block_title("Das Wichtigste", "Die Top-Meldungen des Tages"))
    for k, (txt, it) in enumerate(top, 1):
        rows.append(story_row(it, txt, num=k, tag=it["thema"]))
        if k < len(top):
            rows.append(divider())

    def section(label, sub, lst, hook=False, limit=6):
        lst = [x for x in lst if x["id"] not in used][:limit]
        if not lst:
            return
        rows.append(block_title(label, sub))
        for k, it in enumerate(lst):
            rows.append(story_row(it, first_sentence(it["summary"]), hook=it.get("kurios", "") if hook else "", tag=it["thema"]))
            if k < len(lst) - 1:
                rows.append(divider())
        used.update(x["id"] for x in lst)

    week = [x for x in index["items"] if not x.get("dup_of") and x["date"] <= date]
    section("Für AITI", "Weiterbildung, KI-Kompetenz, Bildungsmarkt", [x for x in items if "AITI" in (x.get("tags") or [])])
    section("Aus Deutschland", "", [x for x in items if x["region"] == "de"])
    kur = sorted([x for x in week if x.get("kurios") and x["date"] >= date], key=lambda x: -x["relevanz"])
    section("Kurios & krass", "", kur, hook=True, limit=3)

    # alle weiteren Meldungen nach Themen
    rest = [x for x in items if x["id"] not in used]
    if rest:
        rows.append(block_title("Alle weiteren Meldungen", f"{len(rest)} weitere von {n_src} Quellen" if alle else "nach Themen, die wichtigsten zuerst"))
        for th in THEMEN:
            grp = [x for x in rest if x["thema"] == th]
            if not alle:
                grp = grp[:4]
            if not grp:
                continue
            rows.append(f'<tr><td style="padding:14px 24px 2px 24px;font-family:{FONT};font-size:13px;font-weight:700;color:{DEEP};">{esc(th)}</td></tr>')
            for it in grp:
                rows.append(f'<tr><td style="padding:5px 24px;font-family:{FONT};font-size:14px;line-height:1.45;">'
                            f'<a href="{esc(it["url"])}" style="color:{TEXT};text-decoration:none;font-weight:600;">{esc(it["headline"])}</a> '
                            f'<span style="color:{MUTED};font-size:12px;">{esc(src(it))}</span>'
                            + (f'<div style="color:#33474A;font-size:13px;margin-top:1px;">{esc(first_sentence(it["summary"]))}</div>' if alle else "")
                            + '</td></tr>')

    url = app_url()
    long_d = long_date(date)
    pre = (top[0][0] if top else "Die wichtigsten KI-Meldungen des Tages")[:140]
    subject = f"KI News, {TAGE[datetime.fromisoformat(date).weekday()][:2]}. {datetime.fromisoformat(date).day}.{datetime.fromisoformat(date).month}.: " + (top[0][1]["headline"] if top else "Das Update des Tages")
    app_btn = (f'<tr><td align="center" style="padding:26px 24px 8px 24px;"><a href="{esc(url)}" style="display:inline-block;background:{DEEP};color:#FFFFFF;'
               f'font-family:{FONT};font-size:15px;font-weight:700;text-decoration:none;padding:12px 26px;border-radius:999px;">Alle Meldungen in der App lesen</a></td></tr>') if url else ""
    body = "\n".join(rows)
    doc = f"""<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>{esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#EEF2EF;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#EEF2EF;">{esc(pre)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EEF2EF;"><tr><td align="center" style="padding:18px 8px;">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;background:#FFFFFF;border-radius:14px;overflow:hidden;">
<tr><td style="background:{DEEP};padding:26px 24px 22px 24px;font-family:{FONT};">
<div style="font-size:26px;font-weight:800;color:#FFFFFF;letter-spacing:.3px;">KI News</div>
<div style="font-size:15px;color:{LIME};margin-top:6px;font-weight:600;">{esc(long_d)}</div>
<div style="font-size:13px;color:{SKY};margin-top:4px;">{len(items)} Meldungen aus {n_src} Quellen, kuratiert und auf Deutsch zusammengefasst</div></td></tr>
{body}
{app_btn}
<tr><td style="padding:22px 24px 26px 24px;font-family:{FONT};font-size:12px;line-height:1.5;color:{MUTED};">
Eigene Kurzfassungen mit Link zur Quelle, keine Volltexte. {LOCK} = Quelle hinter einer Bezahlschranke. Die Zusammenfassungen entstehen automatisch und können Fehler enthalten, bitte wichtige Angaben am Original prüfen.</td></tr>
</table></td></tr></table></body></html>"""

    txt = [f"KI NEWS | {long_d}", f"{len(items)} Meldungen aus {n_src} Quellen", "", "DAS WICHTIGSTE"]
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
    ap.add_argument("--alle", action="store_true", help="alle Meldungen mit Kurzfassung statt der Auswahl")
    ap.add_argument("--out", default=str(ROOT / "digest"))
    a = ap.parse_args()
    index = json.loads((DATA / "index.json").read_text(encoding="utf-8"))
    date = a.date or max(x["date"] for x in index["items"])
    res = build(date, a.alle)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / f"digest-{date}.html").write_text(res["html"], encoding="utf-8")
    (out / f"digest-{date}.txt").write_text(res["text"], encoding="utf-8")
    (out / f"digest-{date}.json").write_text(json.dumps({k: res[k] for k in ("subject", "preheader", "count", "date")}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{res['subject']} | {res['count']} Meldungen | {out}/digest-{date}.html")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
