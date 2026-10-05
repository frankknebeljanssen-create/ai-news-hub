# ai-news-hub

Taegliche KI-News auf Deutsch. Eine Pipeline holt Feeds, kuratiert pro Artikel eine eigene
Headline und einen Kurztext (mit `claude -p`, Abo, keine API-Kosten) und speichert JSON unter `data/`.
Veroeffentlicht werden nur eigene Kurztexte, der Originaltitel und der Link zur Quelle.

## Aufbau
- `sources.yaml` Quellen (rss/web, Region, Keyword-Filter). Neue Quelle = neuer Eintrag.
- `pipeline.py` Abruf, Dedup, Kuratierung, Speichern, Commit und Push.
- `data/YYYY/MM/YYYY-MM-DD.json` Tagesdatei, `data/index.json` Index fuer Suche und Archiv.

## Lauf
```
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python pipeline.py            # ein Lauf pro Tag
.venv/bin/python pipeline.py --force --no-git --limit 10   # Test
```
Voraussetzung: `claude auth login` mit dem Abo. Die Pipeline entfernt `ANTHROPIC_API_KEY`
aus der Umgebung des `claude`-Aufrufs, damit nie ueber einen Key abgerechnet wird.
Log: `~/Library/Logs/ai-news-hub.log`.
