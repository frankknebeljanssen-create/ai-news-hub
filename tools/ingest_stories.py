#!/usr/bin/env python3
"""Nimmt Beitraege aus Newsletter-Mails als Meldungen auf (Kuratierung wie in der Pipeline).

Eingabe (stdin, JSON): {"newsletter": "rundown|neuron|importai", "date": "YYYY-MM-DD", "issue_url": "optional: Web-Ausgabe aus der Mail",
                        "stories": [{"slug": "kurz-id", "title": "Titel", "snippet": "Inhalt in Stichworten, max. 900 Zeichen"}]}
Der Mail-Inhalt wird nur zur Kuratierung gelesen, gespeichert werden eigene Kurzfassungen mit Link zur Newsletter-Seite.
Aufruf: python3 tools/ingest_stories.py [--no-git] < stories.json
"""
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import pipeline as p  # noqa: E402

NEWSLETTER = {
    "rundown": ("The Rundown AI", "rundown", "https://www.therundown.ai/"),
    "neuron": ("The Neuron", "neuron", "https://www.theneuron.ai/"),
    "importai": ("Import AI", "import-ai", "https://importai.substack.com/"),
}


def main() -> int:
    data = json.load(sys.stdin)
    name, sid, base = NEWSLETTER[data["newsletter"]]
    issue = data.get("issue_url")
    if issue and issue.startswith("https://"):
        base = issue.split("?")[0]
    date = data["date"]
    pub = datetime.fromisoformat(f"{date}T07:30:00").replace(tzinfo=p.now().tzinfo)
    cands = []
    for s in data["stories"][:20]:
        url = f"{base}{'&' if '?' in base else '?'}story={s['slug']}" if issue else f"{base}?newsletter={date}&story={s['slug']}"
        cands.append({"id": p.art_id(url), "url": url, "title": s["title"], "snippet": s["snippet"][:900], "published": pub,
                      "source": name, "source_id": sid, "priority": True})
    index = p.read_json(p.INDEX, {"items": []})
    items = index["items"]
    have = {x["id"] for x in items}
    cands = [c for c in cands if c["id"] not in have]
    if not cands:
        print("nichts Neues")
        return 0
    res = {}
    for i in range(0, len(cands), p.BATCH_SIZE):
        res.update(p.summarize(cands[i:i + p.BATCH_SIZE]))
    new = []
    for a in cands:
        r = res.get(a["id"])
        if not r or r.get("ki_bezug") is False or r.get("werbung") is True or not p.valid(r):
            print("verworfen:", a["title"])
            continue
        it = {
            "id": a["id"], "date": date, "published": pub.isoformat(timespec="minutes"),
            "headline": p.no_dashes(r["headline"]), "summary": p.no_dashes(r["summary"]),
            "thema": r["thema"], "region": r["region"], "relevanz": r["relevanz"],
            "tags": p.with_aiti([str(t).lower() for t in r.get("tags", [])][:5], r["thema"] == "KI & Lernen" or r.get("aiti") is True),
            "source": name, "source_id": sid, "added": p.now().isoformat(timespec="seconds"),
            **({"kurios": p.no_dashes(r["kurios"])[:120]} if isinstance(r.get("kurios"), str) and r["kurios"].strip() else {}),
            **({"praxis": True} if r.get("praxis") is True else {}),
            **({"paywall": True} if p.paywall_item({"source": name, "title": a["title"], "url": a["url"]}) else {}),
            "quelle_titel": p.no_dashes(a["title"]), "url": a["url"],
        }
        items.append(it)
        new.append(it)
        print("neu:", it["thema"], "|", it["headline"])
    if not new:
        return 0
    items.sort(key=lambda x: x["published"], reverse=True)
    try:
        since = (datetime.fromisoformat(date) - timedelta(days=1)).strftime("%Y-%m-%d")
        print("Gruppen:", p.cluster_items([x for x in items if x["date"] >= since]))
    except Exception as exc:
        print("Zusammenfuehren fehlgeschlagen:", exc)
    index["count"] = len(items)
    index["updated"] = p.now().isoformat(timespec="seconds")
    p.write_json(p.INDEX, index)
    p.sync_day_files(items, {date})
    if "--no-git" not in sys.argv:
        p.publish(f"Newsletter {name} {date}")
    print("fertig:", len(new))
    return 0


if __name__ == "__main__":
    sys.exit(main())
