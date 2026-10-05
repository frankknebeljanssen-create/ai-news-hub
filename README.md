# KI-News Hub

Tägliches KI-Nachrichtenarchiv auf Deutsch. Eine Python-Pipeline sammelt Meldungen aus internationalen und deutschen Quellen, erstellt zu jeder Meldung eine eigene Kurzfassung mit Claude Code im Headless-Modus und speichert das Ergebnis als JSON. Eine statische Web-App ohne Build-Schritt macht die Daten durchsuchbar und wird über GitHub Pages ausgeliefert.

**Live:** https://frankknebeljanssen-create.github.io/ai-news-hub/

## Inhalt

- [Funktionen](#funktionen)
- [Inhaltliches Konzept](#inhaltliches-konzept)
- [Architektur](#architektur)
- [Pipeline](#pipeline)
- [Datenmodell](#datenmodell)
- [Quellen](#quellen)
- [Web-App](#web-app)
- [Automatisierung](#automatisierung)
- [Installation und Betrieb](#installation-und-betrieb)
- [Projektstruktur](#projektstruktur)
- [Datenschutz, Urheberrecht und KI-Hinweis](#datenschutz-urheberrecht-und-ki-hinweis)
- [Bekannte Grenzen](#bekannte-grenzen)
- [Lizenz](#lizenz)

## Funktionen

**Web-App**

- Tagesansicht mit Top-Stories (je ein Satz), Meldungen nach Themen und Sprungleiste
- Zusatzboxen "Bereich B: Deutschland" und "Kurios & krass"
- Archiv mit Gruppierung nach Tagen, Wochen, Monaten oder Kategorien, Sortierung nach Datum oder Relevanz sowie Filtern für Thema, Quelle, Bereich und Zeitraum
- Volltextsuche im Browser (Fuse.js), auch ohne Suchbegriff nach Quelle filterbar
- Glossar mit 309 Begriffen, Suche, Alphabet-Sprungleiste und Verweisen auf passende Meldungen
- Merkliste mit Export und Import als JSON-Datei
- Hell-, Dunkel- und Systemdarstellung, einstellbare Schriftgröße, Einstellungsseite
- Responsives Layout, mobil zuerst (Tab-Leiste am Handy, Navigation oben am Desktop)
- Stand-Anzeige ("aktualisiert heute 07:12")

**Pipeline**

- Abruf von RSS-Feeds und Übersichtsseiten, Entfernen von Dubletten, Auswahl nur neuer Artikel
- Kuratierung über `claude -p` mit dem Claude-Abonnement, ohne API-Kosten
- Tagesüberblick mit 5 bis 8 Top-Stories
- Speicherung als JSON, automatischer Git-Commit und Push
- Automatischer Start über macOS launchd, Nachholen verpasster Tage

## Inhaltliches Konzept

Die Meldungen sind in zwei Bereiche und sieben Themen gegliedert.

| Bereich | Inhalt |
|---|---|
| A, International | aktuelle News, wichtige Updates, neueste Entwicklungen, Fälle und Stories, Politik und Regulierung |
| B, Deutschland | neue KI-Weiterbildungen und Kurse, Entwicklungen deutscher Unternehmen, relevante Politik |

Themen: Modelle und Produkte, Forschung, Business, Politik und Regulierung, Weiterbildung DE, Unternehmen DE, Sicherheit und Ethik.

Zusätzlich markiert die Kuratierung einzelne Meldungen als **Praxistipp/Tool** (Anleitungen, Workflows, Tool-Empfehlungen) und als **kurios** (außergewöhnliche Fälle und Fakten). Beide Merkmale kommen zum Thema hinzu und sind im Archiv filterbar.

## Architektur

```
 sources.yaml ──► pipeline.py ──► data/*.json ──► git push ──► GitHub Pages ──► Browser
                    │                                              (statisch)    (Vanilla JS,
                    ├─ Feeds und Seiten abrufen                                    Fuse.js,
                    ├─ filtern, deduplizieren                                      localStorage)
                    ├─ claude -p (Abo, Headless)
                    └─ validieren und speichern

 launchd (07:00, Anmeldung, stündlich) ──► run.sh ──► pipeline.py
```

Es gibt keinen Server und keine Datenbank. Die Pipeline läuft lokal auf einem Mac, das Ergebnis wird als statische Dateien im Repository veröffentlicht. Die Web-App lädt ausschließlich JSON aus `data/` und `content/`.

## Pipeline

`pipeline.py` führt pro Lauf diese Schritte aus:

1. **Abruf.** Für jede aktive Quelle aus `sources.yaml`: RSS über `feedparser`, Web-Quellen über die Link-Liste einer Übersichtsseite und die Meta-Angaben der Artikelseiten (Titel und Beschreibung). Ein Fehler bei einer Quelle wird protokolliert und überspringt nur diese Quelle.
2. **Auswahl.**
   - Zeitfenster: 3 bis 10 Tage, abhängig vom letzten erfolgreichen Lauf. Verpasste Tage werden so nachgeholt.
   - Optionaler Keyword-Filter je Quelle für allgemeine Feeds. Kurze Kürzel wie "KI" werden exakt, andere Begriffe am Wortanfang geprüft.
   - Dubletten: normalisierte URL (ohne Tracking-Parameter) und Titelähnlichkeit (`difflib`, Schwelle 0,88) gegen Bestand und aktuellen Lauf.
   - Limit je Quelle (Standard 6), Prioritätsquellen zuerst, höchstens 100 Artikel pro Lauf.
3. **Kuratierung.** Die Artikel werden in Batches zu je 10 an `claude -p --output-format json --no-session-persistence --tools ""` übergeben. Pro Artikel liefert das Modell als JSON: `headline`, `summary` (2 bis 3 Sätze in eigenen Worten), `thema`, `region`, `relevanz` (1 bis 5), `tags` sowie optional `kurios`, `praxis` und `ki_bezug`. Die Antwort wird validiert. Artikel ohne KI-Bezug werden 30 Tage lang gemerkt und verworfen. Unvollständige oder ungültige Antworten werden beim nächsten Lauf erneut versucht.
4. **Tagesüberblick.** Für jeden betroffenen Tag wählt ein weiterer Aufruf 5 bis 8 Top-Stories aus und formuliert je einen Satz. Wenn Meldungen aus Deutschland vorhanden sind, werden mindestens zwei berücksichtigt.
5. **Speichern.** Tagesdateien, Index und Status werden atomar geschrieben (temporäre Datei, dann Ersetzen).
6. **Git.** Commit "Daten JJJJ-MM-TT", `git pull --rebase --autostash`, `git push`.

**Abrechnung.** Der Aufruf von `claude` erfolgt mit einer bereinigten Umgebung. Die Variablen `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL` sowie alle `CLAUDE_CODE_*`-Variablen werden entfernt, sodass ausschließlich die Anmeldung des Abonnements verwendet wird.

**Betriebssicherheit.**

- Ein Lauf pro Tag: `state.json` merkt sich den letzten erfolgreichen Tag. Ein weiterer Start am selben Tag beendet sich sofort.
- Lockfile (`fcntl`) verhindert parallele Läufe.
- Log in `~/Library/Logs/ai-news-hub.log` (rotierend, 3 x 1 MB).
- Bei fehlgeschlagener Kuratierung oder Push-Fehlern erscheint höchstens einmal pro Tag eine macOS-Mitteilung.
- Nur bei vollständigem Erfolg wird der Tag als erledigt markiert, sonst wiederholt der stündliche Start den Lauf.

**Kommandozeile.**

```
pipeline.py [--force] [--no-git] [--only ID] [--limit N] [--backfill {kurios,praxis}]
```

| Option | Wirkung |
|---|---|
| `--force` | läuft auch, wenn für heute schon ein Lauf existiert |
| `--no-git` | kein Commit und kein Push |
| `--only ID` | nur die Quelle mit dieser ID |
| `--limit N` | höchstens N Artikel in diesem Lauf |
| `--backfill kurios` oder `praxis` | bestehende Artikel nachträglich auf das Merkmal prüfen |

## Datenmodell

```
data/
  index.json                 alle Meldungen (für Suche und Archiv)
  state.json                 Laufstatus, Quellenstatus, verworfene URLs
  JJJJ/MM/JJJJ-MM-TT.json    Tagesdatei: Überblick und Meldungen des Tages
content/
  glossar.json               Glossar
```

**Meldung** (in `index.json` und in den Tagesdateien):

| Feld | Bedeutung |
|---|---|
| `id` | stabile Kennung (Hash der normalisierten URL) |
| `date`, `published` | Veröffentlichungstag und -zeitpunkt (Europe/Berlin) |
| `headline` | eigene Schlagzeile |
| `summary` | eigene Kurzfassung, 2 bis 3 Sätze |
| `thema` | eines der sieben Themen |
| `region` | `de` oder `intl` (Bereich B oder A) |
| `relevanz` | 1 bis 5 |
| `tags` | bis zu fünf Schlagworte |
| `kurios` | optional, ein Satz zur Begründung |
| `praxis` | optional, `true` bei Praxistipps und Tools |
| `source`, `source_id` | Anzeigename und ID der Quelle |
| `quelle_titel`, `url` | Originaltitel und Link zur Quelle |

**Tagesdatei:** `date`, `generated_at`, `overview` (Liste aus `id` und `text`), `items`.

## Quellen

Alle Quellen stehen in `sources.yaml`. Eine neue Quelle ist ein neuer Eintrag.

```yaml
- id: heise-ki
  name: heise KI
  type: rss                  # rss oder web
  region: de                 # de oder intl
  url: "https://www.heise.de/thema/Kuenstliche-Intelligenz.xml"
  keywords: [KI, "Künstliche Intelligenz"]   # optional, Filter für allgemeine Feeds
  max_items: 4               # optional, Limit pro Lauf
  priority: true             # optional, wird zuerst kuratiert
  enabled: false             # optional, Quelle behalten, aber nicht abrufen
  note: Freitext
```

Für `type: web` gibt `link_pattern` (regulärer Ausdruck) an, welche Links der Übersichtsseite Artikel sind. Mit `google_news: true` wird ein Sammel-Feed (Google-News-RSS-Suche) behandelt: Quelle und Titel stammen aus dem Eintrag, es gibt keinen Teaser.

Der Bestand umfasst 69 Einträge (64 aktiv), davon 19 international und 50 für Deutschland, darunter 6 thematische Suchfeeds.

**Quellen ohne eigenen Feed**

| Quelle | Lösung |
|---|---|
| Anthropic | kein offizieller Feed, Community-Feed (GitHub, Olshansk/rss-feeds) |
| Meta AI | Engineering-Blog (ML) als Ersatz |
| The Batch, Fraunhofer Academy | Web-Quelle über Link-Liste |
| Euractiv, BMWE, Kursnet, VentureBeat | deaktiviert (Bot-Schutz, keine Links im HTML, Suchanwendung, Rate-Limit) |

Bezahlte Newsletter sind bewusst nicht Teil des Repositories.

## Web-App

Single-Page-App aus `index.html`, `css/style.css` und `js/app.js`, ohne Framework und ohne Build-Schritt.

- **Routing** über den URL-Hash: `#/` (neuester Tag), `#/tag/JJJJ-MM-TT`, `#/archiv`, `#/suche`, `#/glossar`, `#/merkliste`, `#/einstellungen`. Filter und Suchbegriffe stehen in der URL und sind teilbar.
- **Suche** mit Fuse.js 7.0.0 (lokal eingebunden) über Schlagzeile, Tags, Kurzfassung, Quelle und Originaltitel.
- **Lokaler Speicher** (`localStorage`): `theme`, `fs` (Schriftgröße), `favs` (Merkliste), `settings`. Es werden keine Daten an einen Server gesendet.
- **Darstellung:** Farbschema folgt dem System oder wird festgelegt, Schriftgröße in acht Stufen (Standard 15 px, mobil 14 px). Formularfelder haben 16 px, damit iOS-Safari nicht hineinzoomt.
- **Barrierefreiheit:** semantische Elemente, ARIA-Beschriftungen, sichtbarer Fokus, Rücksicht auf `prefers-reduced-motion`.
- **Laden:** Karten im Archiv werden erst beim Aufklappen einer Gruppe erzeugt, die Tagesansicht lädt nur die Datei des gewählten Tages.
- **Cache:** JS und CSS werden mit Versionsnummer eingebunden (`?v=N`). Bei Änderungen an der App wird sie erhöht.

## Automatisierung

Der launchd-Job `com.frank.ai-news-hub` startet `run.sh`:

- täglich um 07:00 (Systemzeitzone Europe/Berlin)
- beim Anmelden (`RunAtLoad`)
- stündlich (`StartInterval` 3600)

Das Skript prüft zuerst, ob für heute schon ein Lauf existiert, und beendet sich dann sofort. Ist der Mac zur Startzeit aus oder im Ruhezustand, holt der nächste Start (Anmeldung oder stündlicher Takt) alles nach. Die Datei `run.sh` setzt einen minimalen `PATH`, so wie launchd ihn auch vorgibt.

```
launchd/install.sh              # installieren oder aktualisieren
launchd/install.sh --uninstall  # entfernen
```

Die Vorlage `launchd/com.frank.ai-news-hub.plist.template` enthält Platzhalter für Repository- und Home-Pfad, `install.sh` setzt sie ein und lädt den Job mit `launchctl bootstrap`.

## Installation und Betrieb

**Voraussetzungen**

- macOS (für launchd), Python 3.9 oder neuer, Git
- [Claude Code](https://claude.com/claude-code) mit Anmeldung über ein Abonnement: `claude auth login`
- Optional `gh` für das Anlegen des Repositories

**Einrichtung**

```bash
git clone https://github.com/frankknebeljanssen-create/ai-news-hub.git
cd ai-news-hub
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

**Testlauf ohne Veröffentlichung**

```bash
.venv/bin/python pipeline.py --force --no-git --limit 10
```

**Regulärer Lauf und Automatik**

```bash
./run.sh                    # ein Lauf, committet und pusht
launchd/install.sh          # Automatik einrichten
```

**GitHub Pages:** Branch `main`, Ordner `/` (Wurzel). Die Datei `.nojekyll` verhindert die Jekyll-Verarbeitung.

**Lokale Vorschau**

```bash
python3 -m http.server 8000   # danach http://localhost:8000
```

**Impressum:** Anbieterangaben stehen in `impressum.json` (`name`, `anschrift`, `email`, `telefon`) und werden in den Einstellungen angezeigt.

## Projektstruktur

```
.
├── index.html                   Einstiegsseite der Web-App
├── css/style.css                Gestaltung, Hell- und Dunkelmodus
├── js/
│   ├── app.js                   Router, Ansichten, Suche, Merkliste, Einstellungen
│   └── vendor/fuse.min.js       Fuse.js 7.0.0 (Apache License 2.0)
├── content/glossar.json         Glossar (309 Begriffe)
├── data/                        Ausgabe der Pipeline (siehe Datenmodell)
├── pipeline.py                  Abruf, Auswahl, Kuratierung, Speicherung, Git
├── sources.yaml                 Quellenliste
├── run.sh                       Startskript für launchd
├── launchd/                     Plist-Vorlage und Installationsskript
├── impressum.json               Anbieterangaben
├── requirements.txt             feedparser, pyyaml
└── .nojekyll
```

## Datenschutz, Urheberrecht und KI-Hinweis

- **Urheberrecht.** Gespeichert und veröffentlicht werden nur eigene Kurzfassungen, der Originaltitel und der Link zur Quelle. Es gibt keine Volltexte und keine Zitate. Die Kuratierung erhält Titel und Teaser der Quelle als Eingabe.
- **Datenschutz.** Die Web-App setzt keine Cookies, nutzt kein Tracking und lädt keine Ressourcen von Dritten. Einstellungen und Merkliste bleiben im Browser. Beim Aufruf der Seite verarbeitet GitHub Pages technisch bedingt die IP-Adresse.
- **KI-Hinweis.** Schlagzeilen, Kurzfassungen, Themenzuordnung, Markierungen und Tagesüberblick werden automatisch mit KI (Claude von Anthropic) erstellt und können Fehler enthalten. Maßgeblich ist stets der verlinkte Originalartikel.
- **Geheimnisse.** Das Repository enthält keine Zugangsdaten. Die Anmeldung bei Claude liegt im Schlüsselbund des ausführenden Nutzers.

## Bekannte Grenzen

- Die Pipeline setzt einen angemeldeten Mac voraus. Läuft er nicht, entstehen bis zum nächsten Start keine neuen Daten.
- Bei Ablauf der Claude-Anmeldung schlägt die Kuratierung fehl. Die Mitteilung weist darauf hin, die Lösung ist `claude auth login`.
- Die Zuordnung zu Thema, Region und Relevanz ist eine Einschätzung des Modells. Meldungen zum selben Ereignis aus mehreren Quellen werden in den Themenblöcken nicht zusammengeführt, in den Zusatzboxen nur grob entfernt.
- Bei Quellen ohne Teaser (Suchfeeds) beruht die Kurzfassung allein auf dem Titel.
- Kursdatenbanken wie Kursnet haben keinen Feed und sind nicht angebunden.

## Lizenz

Für den Quelltext ist noch keine Lizenz festgelegt. Die enthaltene Bibliothek Fuse.js steht unter der Apache License 2.0.
