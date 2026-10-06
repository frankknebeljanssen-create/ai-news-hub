'use strict';

const APP_VERSION = '1.0.0';
const APP_DATE = '2026-10-05';

const THEMEN = [
  ['KI & Lernen', 'aiti'], ['Modelle und Produkte', 'modelle'], ['Forschung', 'forschung'], ['Business', 'business'],
  ['Politik und Regulierung', 'politik'], ['Unternehmen DE', 'unternehmen'], ['Sicherheit und Ethik', 'sicherheit'],
];
const THEMA_ALIAS = { 'Weiterbildung DE': 'KI & Lernen', 'AITI': 'KI & Lernen' };
const normThema = (t) => THEMA_ALIAS[t] || t;
const THEMA_SHORT = {
  'Modelle und Produkte': 'Technik', 'Forschung': 'Forschung', 'Business': 'Wirtschaft', 'Politik und Regulierung': 'Politik',
  'KI & Lernen': 'KI & Lernen', 'Unternehmen DE': 'Unternehmen DE', 'Sicherheit und Ethik': 'Sicherheit & Ethik',
};
const THEMA_VAR = Object.fromEntries(THEMEN.map(([n, k]) => [n, `var(--t-${k})`]));
const REGIONEN = [['', 'Alle'], ['intl', 'International'], ['de', 'Deutschland']];
const PAGE = 30;

const $app = document.getElementById('app');

/* Neu seit dem letzten Besuch: eine Sitzung endet nach 30 Minuten Pause, ihr Ende ist dann die neue Basis */
const VISIT = (() => {
  const now = Date.now();
  let base = 0, active = 0;
  try { base = Number(localStorage.getItem('visitBase')) || 0; active = Number(localStorage.getItem('visitActive')) || 0; } catch (e) { /* kein Speicher */ }
  if (!base) base = now;
  else if (now - active > 30 * 60 * 1000) base = active;
  try { localStorage.setItem('visitBase', String(base)); localStorage.setItem('visitActive', String(now)); } catch (e) { /* kein Speicher */ }
  return { base };
})();
const isNew = (i) => Date.parse(i.added || i.published) > VISIT.base;
function touchActive() { try { localStorage.setItem('visitActive', String(Date.now())); } catch (e) { /* kein Speicher */ } }
function paintNewCount() {
  const n = store.index ? store.index.items.filter(isNew).length : 0;
  document.querySelectorAll('[data-new-count]').forEach((el) => { el.textContent = n > 99 ? '99+' : n || ''; el.hidden = !n; });
}
function relTime(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'gerade eben';
  if (m < 60) return `vor ${m} Min`;
  const hrs = Math.round(m / 60);
  if (hrs < 24) return `vor ${hrs} Std`;
  const d = Math.round(hrs / 24);
  return `vor ${d} ${d === 1 ? 'Tag' : 'Tagen'}`;
}
const render = (...nodes) => $app.replaceChildren(...nodes.filter((n) => n != null && n !== false));
const store = { index: null, days: {}, fuse: null };

/* ---------- Helfer ---------- */

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const tzDay = (d) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(d); // YYYY-MM-DD
const todayStr = () => tzDay(new Date());
const dayShift = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const fmtLong = (s) => new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(s + 'T12:00:00Z'));
const fmtShort = (s) => new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(new Date(s + 'T12:00:00Z'));
const fmtTime = (d) => new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }).format(d);

function dayLabel(s) {
  const t = todayStr();
  if (s === t) return 'Heute, ' + fmtLong(s);
  if (s === dayShift(t, -1)) return 'Gestern, ' + fmtLong(s);
  return fmtLong(s);
}

function dayLabelShort(s) {
  const t = todayStr();
  const d = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(s + 'T12:00:00Z'));
  const wd = new Intl.DateTimeFormat('de-DE', { weekday: 'short', timeZone: 'UTC' }).format(new Date(s + 'T12:00:00Z'));
  return (s === t ? 'Heute' : s === dayShift(t, -1) ? 'Gestern' : wd) + ', ' + d;
}

function standText(iso) {
  const d = new Date(iso);
  const day = tzDay(d), t = todayStr();
  const when = day === t ? 'heute' : day === dayShift(t, -1) ? 'gestern' : 'am ' + fmtShort(day);
  return { text: `aktualisiert ${when} ${fmtTime(d)}`, old: day !== t };
}

const safeUrl = (u) => { try { const p = new URL(u); return /^https?:$/.test(p.protocol) ? p.href : '#'; } catch { return '#'; } };

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { parts: path.split('/').filter(Boolean), q: Object.fromEntries(new URLSearchParams(qs)) };
}

function go(path, q, replace) {
  store.linkNav = true;
  const qs = new URLSearchParams(Object.entries(q || {}).filter(([, v]) => v)).toString();
  const target = '#' + path + (qs ? '?' + qs : '');
  if (replace) history.replaceState(null, '', target);
  else location.hash = target;
}

async function getJSON(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

async function loadIndex() {
  if (!store.index) {
    store.index = await getJSON('data/index.json');
    // Nebenmeldungen (dup_of) stecken als "auch bei" in der Hauptmeldung und werden nicht einzeln gelistet
    store.allItems = store.index.items;
    store.allItems.forEach((i) => { i.thema = normThema(i.thema); });
    store.index.items = store.allItems.filter((i) => !i.dup_of);
    store.index.count = store.index.items.length;
    document.getElementById('gq').placeholder = `Suchen in ${store.index.count} Meldungen`;
    store.dates = [...new Set(store.index.items.map((i) => i.date))].sort().reverse();
    store.byId = new Map(store.allItems.map((i) => [i.id, i]));
    store.resolve = (id) => { const i = store.byId.get(id); return i && i.dup_of ? (store.byId.get(i.dup_of) || i) : i; };
    paintNewCount();
  }
  return store.index;
}

async function loadDay(date) {
  if (!(date in store.days)) {
    try { store.days[date] = await getJSON(`data/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}.json`); (store.days[date].items || []).forEach((i) => { i.thema = normThema(i.thema); }); }
    catch { store.days[date] = null; }
  }
  return store.days[date];
}

/* ---------- Merkliste (nur localStorage, keine Server-Daten) ---------- */

const FAV_KEY = 'favs';
const FAV_FIELDS = ['id', 'date', 'published', 'headline', 'summary', 'thema', 'region', 'relevanz', 'tags', 'source', 'source_id', 'quelle_titel', 'url', 'kurios', 'praxis', 'kontext', 'paywall'];
let favMem = null;

function favLoad() {
  if (!favMem) {
    try { favMem = JSON.parse(localStorage.getItem(FAV_KEY)) || {}; } catch (e) { favMem = {}; }
    Object.values(favMem).forEach((e) => { if (e && e.item) e.item.thema = normThema(e.item.thema); });
  }
  return favMem;
}
function favSave() {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(favMem)); } catch (e) { /* Speicher gesperrt, bleibt bis zum Neuladen im Speicher */ }
  paintFavCount();
}
const isFav = (id) => id in favLoad();
function toggleFav(item) {
  const f = favLoad();
  if (f[item.id]) delete f[item.id]; else f[item.id] = { savedAt: Date.now(), item };
  favSave();
}
/* Gelesen-Markierung (nur localStorage): markierte Karten werden auf eine Zeile eingeklappt oder ausgeblendet */
const SEEN_KEY = 'seen';
let seenMem = null;
function seenLoad() {
  if (!seenMem) {
    try { seenMem = JSON.parse(localStorage.getItem(SEEN_KEY)) || {}; } catch (e) { seenMem = {}; }
    const cut = Date.now() - 90 * 864e5;
    Object.keys(seenMem).forEach((k) => { if (!(seenMem[k] > cut)) delete seenMem[k]; });
  }
  return seenMem;
}
function seenSave() { try { localStorage.setItem(SEEN_KEY, JSON.stringify(seenMem)); } catch (e) { /* bleibt bis zum Neuladen im Speicher */ } }
const isSeen = (id) => id in seenLoad();
function toggleSeen(id) { const m = seenLoad(); if (m[id]) delete m[id]; else m[id] = Date.now(); seenSave(); }

function paintFavCount() {
  const n = Object.keys(favLoad()).length;
  document.querySelectorAll('[data-fav-count]').forEach((el) => { el.textContent = n || ''; el.hidden = !n; });
}
function cleanItem(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || typeof raw.headline !== 'string' || typeof raw.url !== 'string') return null;
  const it = {};
  FAV_FIELDS.forEach((k) => { if (raw[k] != null) it[k] = raw[k]; });
  it.tags = Array.isArray(it.tags) ? it.tags.map(String).slice(0, 5) : [];
  it.relevanz = Math.min(5, Math.max(1, parseInt(it.relevanz, 10) || 3));
  it.summary = String(it.summary || ''); it.quelle_titel = String(it.quelle_titel || it.headline);
  it.source = String(it.source || ''); it.thema = String(it.thema || ''); it.date = String(it.date || todayStr());
  it.published = String(it.published || it.date);
  return it;
}
function exportFavs() {
  const blob = new Blob([JSON.stringify({ version: 1, exported: new Date().toISOString(), items: Object.values(favLoad()) }, null, 1)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `merkliste-${todayStr()}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function importFavs(file) {
  try {
    const data = JSON.parse(await file.text());
    const f = favLoad(); let added = 0;
    (Array.isArray(data.items) ? data.items : []).forEach((e) => {
      const item = cleanItem(e && e.item);
      if (item && !f[item.id]) { f[item.id] = { savedAt: Number(e.savedAt) || Date.now(), item }; added++; }
    });
    favSave();
    return added;
  } catch (e) { return -1; }
}

function starBtn(item) {
  const b = h('button', { class: 'star', type: 'button' });
  const paint = () => {
    const on = isFav(item.id);
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', on ? 'Aus Merkliste entfernen' : 'Merken');
    b.title = on ? 'Aus Merkliste entfernen' : 'Merken';
    b.textContent = on ? '\u2605' : '\u2606';
  };
  b.addEventListener('click', () => { toggleFav(item); paint(); if (route.last === 'merkliste') route(); });
  paint();
  return b;
}

/* ---------- Einstellungen (nur localStorage) ---------- */

const SET_KEY = 'settings';
const SET_DEFAULT = { startBriefing: false, region: '', grouping: 'woche', showTop: true, showDE: true, showKurios: true, expandAll: false, showTags: true, hidden: [] };
let setMem = null;

function getSettings() {
  if (!setMem) {
    let raw = {};
    try { raw = JSON.parse(localStorage.getItem(SET_KEY)) || {}; } catch (e) { raw = {}; }
    setMem = { ...SET_DEFAULT, ...raw };
    if (!Array.isArray(setMem.hidden)) setMem.hidden = [];
    setMem.hidden = setMem.hidden.map(normThema);
  }
  return setMem;
}
function saveSettings(patch) {
  setMem = { ...getSettings(), ...patch };
  try { localStorage.setItem(SET_KEY, JSON.stringify(setMem)); } catch (e) { /* Speicher gesperrt */ }
  applySettings();
}
function applySettings() { document.body.classList.toggle('no-tags', !getSettings().showTags); document.body.classList.toggle('hide-seen', !!getSettings().hideSeen); }

/* ---------- Bausteine ---------- */



/* Meldungen zum selben Ereignis (aehnliche Schlagzeilen aus mehreren Quellen) in Boxen nur einmal zeigen */
function dedupeSimilar(list, max) {
  const words = (t) => new Set(t.toLowerCase().replace(/[^a-zäöüß0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 5));
  const out = [];
  for (const it of list) {
    const w = words(it.headline);
    const dup = out.some((o) => { const ow = o.w; const inter = [...w].filter((x) => ow.has(x)).length; return inter >= 2 && inter / Math.min(w.size, ow.size) >= 0.5; });
    if (!dup) out.push({ it, w });
    if (out.length >= max) break;
  }
  return out.map((o) => o.it);
}

function chipRow(options, current, onPick, label) {
  const themed = options.some(([v]) => v === PRAXIS || v in THEMA_VAR);
  if (themed) {
    const colorFor = (v) => (v === PRAXIS ? 'var(--t-business)' : THEMA_VAR[v] || 'var(--muted)');
    return h('div', { class: 'chips cats', role: 'group', 'aria-label': label },
      options.map(([val, text]) => h('button', {
        class: 'chip cat', type: 'button', style: `--c:${colorFor(val)}`, 'aria-pressed': String(val === current), onclick: () => onPick(val),
      }, text)));
  }
  // wenige Optionen: ruhiger segmentierter Schalter
  return h('div', { class: 'seg-wrap' },
    h('span', { class: 'seg-label' }, label),
    h('div', { class: 'seg', role: 'group', 'aria-label': label },
      options.map(([val, text]) => h('button', { class: 'seg-btn', type: 'button', 'aria-pressed': String(val === current), onclick: () => onPick(val) }, text))));
}

/* Inline "Mehr lesen": zeigt die Kurzfassung direkt unter dem Eintrag, ohne die Quelle zu oeffnen */
function seenPill(item) {
  const b = h('button', { class: 'seen-btn mini', type: 'button' });
  const paint = () => {
    const on = isSeen(item.id), box = b.closest('li, .b-one');
    if (box) box.classList.toggle('seen', on);
    b.textContent = on ? 'Einblenden' : '\u2713 Gelesen';
    b.title = on ? 'Wieder ausklappen' : 'Als gelesen markieren und einklappen';
    b.setAttribute('aria-label', b.title);
    b.setAttribute('aria-pressed', String(on));
  };
  b.addEventListener('click', () => { toggleSeen(item.id); paint(); });
  Promise.resolve().then(paint);
  return b;
}

function withMore(meta, item, opts = {}) {
  // opts.skipFirst: der erste Satz der Kurzfassung steht oben schon, im Aufklapptext nicht wiederholen
  const parts = splitSentences(item.summary);
  const rest = opts.skipFirst && parts.length > 1 ? parts.slice(1).join(' ') : (opts.skipFirst ? '' : item.summary);
  const hasAlso = !!(item.also && item.also.length);
  if (!rest && !hasAlso && !item.kontext) return [h('div', { class: 'row-meta' }, ...meta, h('a', { class: 'b-src', href: safeUrl(item.url), target: '_blank', rel: 'noopener noreferrer' }, 'Zum Original \u2197'), seenPill(item))];
  const open0 = getSettings().expandAll;
  const [kBtn, kP] = kontextBlock(item);
  const panel = h('div', { class: 'more-panel', hidden: !open0 },
    rest ? h('p', null, rest) : null,
    kBtn, kP,
    alsoLine(item),
    h('a', { class: 'b-src', href: safeUrl(item.url), target: '_blank', rel: 'noopener noreferrer' }, 'Zum Original \u2197'));
  const btn = h('button', { class: 'more-link', type: 'button', 'aria-expanded': String(!!open0) }, open0 ? 'Weniger' : 'Mehr lesen');
  btn.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    btn.textContent = open ? 'Weniger' : 'Mehr lesen';
  });
  return [h('div', { class: 'row-meta' }, ...meta, btn, seenPill(item)), panel];
}

/* Tagesauswahl: Antippen der Datums-Karte oeffnet die Liste der letzten 4 Wochen */
const weekdayName = (d) => new Intl.DateTimeFormat('de-DE', { weekday: 'long', timeZone: 'UTC' }).format(new Date(d + 'T12:00:00Z'));
const fmtWeekdayDate = (s) => new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(s + 'T12:00:00Z'));

function daySelect(date, text, pick) {
  const wrap = h('div', { class: 'daysel' });
  const pop = h('div', { class: 'daypop', role: 'listbox', 'aria-label': 'Tag wählen', hidden: true });
  const btn = h('button', { class: 'daybtn', type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false' }, text, h('span', { class: 'caret', 'aria-hidden': 'true' }, '▾'));
  const onDoc = (e) => { if (!wrap.contains(e.target)) close(); };
  const onKey = (e) => { if (e.key === 'Escape') { close(); btn.focus(); } };
  function close() {
    pop.hidden = true; btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onDoc, true); document.removeEventListener('keydown', onKey);
  }
  function build() {
    pop.replaceChildren();
    if (!store.dayCounts) {
      store.dayCounts = new Map();
      store.index.items.forEach((i) => store.dayCounts.set(i.date, (store.dayCounts.get(i.date) || 0) + 1));
    }
    const newest = store.dates[0], t = todayStr();
    let lastWeek = '';
    store.dates.filter((d) => d >= dayShift(newest, -27)).forEach((d) => {
      const w = isoWeek(d);
      if (w.key !== lastWeek) { lastWeek = w.key; pop.append(h('div', { class: 'daypop-week' }, `KW ${w.week} · ${fmtShort(w.start)} bis ${fmtShort(w.end)}`)); }
      const tag = d === t ? 'Heute' : d === dayShift(t, -1) ? 'Gestern' : '';
      pop.append(h('button', { class: 'daypop-item', type: 'button', role: 'option', 'aria-selected': String(d === date), onclick: () => { close(); pick(d); } },
        h('span', { class: 'dp-day' }, fmtWeekdayDate(d)), tag ? h('span', { class: 'dp-tag' }, tag) : null, h('span', { class: 'dp-n' }, store.dayCounts.get(d) || 0)));
    });
    pop.append(h('a', { class: 'daypop-more', href: '#/archiv?g=tag' }, 'Ältere Tage im Archiv ›'));
  }
  btn.addEventListener('click', () => {
    if (!pop.hidden) return close();
    build(); pop.hidden = false; btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', onDoc, true); document.addEventListener('keydown', onKey);
    // am Rand des Inhaltsbereichs ausrichten, damit nichts abgeschnitten wird
    pop.style.left = '0'; pop.style.right = 'auto';
    const lim = document.getElementById('app').getBoundingClientRect(), r = pop.getBoundingClientRect();
    if (r.right > lim.right - 4) { pop.style.left = 'auto'; pop.style.right = '0'; }
    const sel = pop.querySelector('[aria-selected="true"]');
    if (sel) pop.scrollTop = Math.max(0, sel.offsetTop - 60);
  });
  wrap.append(btn, pop);
  return wrap;
}

function sourceOptions() {
  const counts = new Map();
  store.index.items.forEach((i) => counts.set(i.source, (counts.get(i.source) || 0) + 1));
  return [['', 'Alle Quellen'], ...[...counts.keys()].sort((a, b) => a.localeCompare(b, 'de')).map((n) => [n, `${n} (${counts.get(n)})`])];
}

const regionCounts = (list) => ({ '': list.length, intl: list.filter((i) => i.region === 'intl').length, de: list.filter((i) => i.region === 'de').length });
const regionOptions = (list) => { const c = regionCounts(list); return REGIONEN.map(([v, t]) => [v, h('span', null, t, h('span', { class: 'seg-n' }, c[v]))]); };

function selectField(label, options, current, onPick) {
  return h('label', { class: 'field sel' }, h('span', { class: 'f-label' }, label),
    h('select', { onchange: (e) => onPick(e.target.value) }, options.map(([v, t]) => h('option', { value: v, selected: v === current }, t))));
}

function sourceSelect(current, onPick) {
  const counts = new Map();
  store.index.items.forEach((i) => counts.set(i.source, (counts.get(i.source) || 0) + 1));
  const names = [...counts.keys()].sort((a, b) => a.localeCompare(b, 'de'));
  return h('label', { class: 'src-pick' }, h('span', null, 'Quelle'),
    h('select', { onchange: (e) => onPick(e.target.value), 'aria-label': 'Quelle wählen' },
      h('option', { value: '', selected: !current }, 'Alle Quellen'),
      names.map((n) => h('option', { value: n, selected: n === current }, `${n} (${counts.get(n)})`))));
}

const LOCK = '\uD83D\uDD12';

function alsoLine(item) {
  if (!item.also || !item.also.length) return null;
  const dups = (store.allItems || []).filter((d) => d.dup_of === item.id);
  const byUrl = new Map(dups.map((d) => [d.url, d]));
  const sorted = item.also.slice().sort((a, b) => (a.paywall ? 1 : 0) - (b.paywall ? 1 : 0));
  const label = item.paywall && sorted.some((a) => !a.paywall) ? 'Frei lesbar bei' : 'Auch berichtet bei';
  // Jede zusammengefasste Meldung bleibt als eigene schmale Zeile sichtbar: Quelle, Schlagzeile, Link
  const rows = sorted.map((a) => {
    const d = byUrl.get(a.url);
    return h('a', { class: 'also-row', href: safeUrl(a.url), target: '_blank', rel: 'noopener noreferrer', title: a.paywall ? 'Bezahlquelle' : null },
      h('b', null, `${a.paywall ? LOCK + ' ' : ''}${a.source}`), d ? h('span', null, d.headline) : null, h('i', null, '\u2197'));
  });
  return h('div', { class: 'also' }, h('div', { class: 'also-label' }, label), ...rows);
}

/* Zweite Stufe: Hintergrundtext (kontext) aus frei zugaenglichen Quellen, per Klick auf "Mehr Kontext" */
function kontextBlock(item) {
  if (!item.kontext) return [null, null];
  const p = h('p', { class: 'kontext', hidden: true }, h('b', null, 'Hintergrund: '), item.kontext);
  const b = h('button', { class: 'more-link kontext-btn', type: 'button', 'aria-expanded': 'false' }, 'Mehr Kontext');
  b.addEventListener('click', () => { const open = p.hidden; p.hidden = !open; b.setAttribute('aria-expanded', String(open)); b.textContent = open ? 'Weniger Kontext' : 'Mehr Kontext'; });
  return [b, p];
}

function card(item, query) {
  const color = THEMA_VAR[item.thema] || 'var(--accent)';
  const mark = (txt) => (query ? highlight(txt, query) : txt);
  const more = h('button', { class: 'more-btn', type: 'button', hidden: true }, 'Mehr lesen');
  const [kB, kT] = kontextBlock(item);
  const el = h('article', { class: 'card', style: `--c:${color}` },
    h('div', { class: 'card-top' },
      h('span', { class: 'tag-thema' }, item.thema),
      isNew(item) ? h('span', { class: 'badge new' }, 'Neu') : null,
      item.praxis ? h('span', { class: 'badge praxis' }, 'Praxistipp') : null,
      item.region === 'de' ? h('span', { class: 'badge' }, 'DE') : null,
      h('button', { class: 'seen-btn', type: 'button', title: 'Als gelesen markieren und einklappen', 'aria-label': 'Als gelesen markieren' }, '\u2713 Gelesen'),
      starBtn(item)),
    h('h3', null, h('a', { href: safeUrl(item.url), target: '_blank', rel: 'noopener noreferrer' }, mark(item.headline))),
    h('p', { class: 'summary' }, mark(item.summary)),
    more,
    kB, kT,
    h('div', { class: 'card-foot' },
      h('span', { class: 'src-name', title: item.paywall ? 'Bezahlquelle' : null }, item.paywall ? LOCK + ' ' + item.source : item.source),
      h('span', null, fmtShort(item.date)),
      h('span', { class: 'rel', title: `Relevanz ${item.relevanz} von 5`, 'aria-label': `Relevanz ${item.relevanz} von 5` }, '\u25CF'.repeat(item.relevanz))),
    alsoLine(item),
    item.tags && item.tags.length ? h('div', { class: 'tags' }, item.tags.map((t) => h('span', { class: t === 'AITI' ? 'tag-aiti' : null }, '#' + t))) : null,
    h('a', { class: 'orig', href: safeUrl(item.url), target: '_blank', rel: 'noopener noreferrer', title: item.quelle_titel }, 'Zum Original \u2197'));
  if (getSettings().expandAll) { el.classList.add('open'); more.textContent = 'Weniger'; }
  more.addEventListener('click', () => { const on = el.classList.toggle('open'); more.textContent = on ? 'Weniger' : 'Mehr lesen'; });
  const seenBtn = el.querySelector('.seen-btn');
  const paintSeen = () => {
    const on = isSeen(item.id);
    el.classList.toggle('seen', on);
    seenBtn.textContent = on ? 'Einblenden' : '\u2713 Gelesen';
    seenBtn.title = on ? 'Wieder ausklappen' : 'Als gelesen markieren und einklappen';
    seenBtn.setAttribute('aria-label', on ? 'Wieder ausklappen' : 'Als gelesen markieren');
    seenBtn.setAttribute('aria-pressed', String(on));
  };
  seenBtn.addEventListener('click', () => { toggleSeen(item.id); paintSeen(); fitCards(el.parentNode); });
  paintSeen();
  return el;
}

/* Auf dem Handy sind Kurztexte gekuerzt: "Mehr lesen" nur zeigen, wenn wirklich etwas abgeschnitten ist */
function fitCards(root) {
  (root || document).querySelectorAll('.card').forEach((c) => {
    if (c.classList.contains('open')) return;
    const p = c.querySelector('.summary'), btn = c.querySelector('.more-btn');
    const clipped = p.scrollHeight > p.clientHeight + 1;
    btn.hidden = !clipped;
    c.classList.toggle('fits', !clipped);
  });
}

function highlight(text, query) {
  const words = query.split(/\s+/).filter((w) => w.length > 1).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return text;
  const re = new RegExp('(' + words.join('|') + ')', 'ig');
  const frag = document.createDocumentFragment();
  text.split(re).forEach((part, i) => frag.append(i % 2 ? h('mark', { class: 'hl' }, part) : part));
  return frag;
}

function stateBox(msg) { return h('p', { class: 'state' }, msg); }

/* ---------- Ansicht: Tag ---------- */

async function viewDay(dateArg, q) {
  const index = await loadIndex();
  if (!store.dates.length) return render(stateBox('Noch keine Nachrichten vorhanden.'));
  const date = dateArg && store.dates.includes(dateArg) ? dateArg : store.dates[0];
  const st = getSettings();
  const region = q.region !== undefined ? q.region : (store.regionSel !== undefined ? store.regionSel : st.region);
  const day = await loadDay(date);
  const dayAll = day ? day.items.filter((i) => !i.dup_of) : index.items.filter((i) => i.date === date);
  const items = dayAll.filter((i) => !region || i.region === region);
  const newN = dayAll.filter(isNew).length;
  const wk = isoWeek(date);
  const pos = store.dates.indexOf(date);
  const stand = standText(index.updated);

  const nav = h('div', { class: 'daynav' },
    h('button', { class: 'btn', type: 'button', 'aria-label': 'Älterer Tag', disabled: pos >= store.dates.length - 1, onclick: () => go('/tag/' + store.dates[pos + 1], { region }) }, '‹'),
    daySelect(date, [h('span', { class: 'lbl-long' }, dayLabel(date)), h('span', { class: 'lbl-short' }, dayLabelShort(date))], (d) => go(d === store.dates[0] ? '/' : '/tag/' + d, { region })),
    h('button', { class: 'btn', type: 'button', 'aria-label': 'Neuerer Tag', disabled: pos <= 0, onclick: () => go(pos === 1 ? '/' : '/tag/' + store.dates[pos - 1], { region }) }, '›'));

  const top = ((day && day.overview) || []).map((o) => ({ o, item: store.resolve(o.id) })).filter((x) => x.item && (!region || x.item.region === region))
    .filter((x, k, arr) => arr.findIndex((y) => y.item.id === x.item.id) === k);

  const kAll = index.items.filter((i) => i.kurios && (!region || i.region === region)).sort((a, b) => b.relevanz - a.relevanz || b.published.localeCompare(a.published));
  const kDay = kAll.filter((i) => i.date === date);
  const kWeek = kAll.filter((i) => i.date <= date && i.date >= dayShift(date, -6));
  const kScope = kDay.length >= 2 ? 'an diesem Tag' : 'in den letzten 7 Tagen';
  const kList = dedupeSimilar(kDay.length >= 2 ? kDay : kWeek, 4);

  const deAll = index.items.filter((i) => i.region === 'de').sort((a, b) => b.relevanz - a.relevanz || b.published.localeCompare(a.published));
  const deDay = deAll.filter((i) => i.date === date);
  const deWeek = deAll.filter((i) => i.date <= date && i.date >= dayShift(date, -6));
  const deScope = deDay.length >= 3 ? 'an diesem Tag' : 'in den letzten 7 Tagen';
  const deList = dedupeSimilar(deDay.length >= 3 ? deDay : deWeek, 6);

  const secItems = store.onlyNew && newN ? items.filter(isNew) : items;
  const sections = THEMEN.map(([name]) => [name, secItems.filter((i) => i.thema === name).sort((a, b) => b.relevanz - a.relevanz)]).filter(([n, l]) => l.length && !st.hidden.includes(n));

  render(
    h('div', { class: 'day-head' },
      h('div', { class: 'day-title' },
        h('h1', null, 'KI News'),
        h('p', { class: 'sub' }, h('span', { class: 'stand' + (stand.old ? ' old' : '') }, stand.text), ` \u00B7 ${items.length} Meldungen`,
          newN ? [' \u00B7 ', h('button', { class: 'newonly', type: 'button', 'aria-pressed': String(!!(store.onlyNew && newN)), title: 'Nur neue Meldungen zeigen', onclick: () => { store.onlyNew = !store.onlyNew; route(); } }, store.onlyNew ? `Nur Neues (${newN}) \u2715` : `${newN} neu`)] : null)),
      nav),
    h('div', { class: 'day-tools' },
      chipRow(regionOptions(dayAll), region, (v) => { store.regionSel = v; go(dateArg ? '/tag/' + date : '/', { region: v }, true); route(); }, 'Bereich'),
      h('div', { class: 'brief-pair' },
        h('a', { class: 'brief-btn', href: '#/briefing' + (pos === 0 ? '' : '?d=' + date) },
          h('span', null, h('strong', null, 'Der Tag in Kürze'), h('small', null, 'Short Briefing'))),
        h('a', { class: 'brief-btn week', href: '#/woche' + (pos === 0 ? '' : '?w=' + wk.key) },
          h('span', null, h('strong', null, 'Die Woche in Kürze'), h('small', null, wk.end < todayStr() ? `KW ${wk.week} komplett` : `KW ${wk.week} läuft`))))),
    aitiItems().length ? h('a', { class: 'brief-btn aiti', href: '#/aiti' },
      h('span', null, h('strong', null, 'Für AITI'), h('small', null, 'Weiterbildung, KI-Kompetenz, Bildungsmarkt')),
      h('span', { class: 'aiti-n' }, String(aitiItems().length))) : null,
    st.showTop && top.length ? h('section', { class: 'top-stories', 'aria-labelledby': 'ts' },
      h('h2', { id: 'ts' }, 'Top-Stories'),
      h('ol', null, top.map(({ o, item }) => h('li', { style: `--c:${THEMA_VAR[item.thema] || 'var(--accent)'}` }, h('div', null,
        h('span', { class: 'ts-label' }, THEMA_SHORT[item.thema] || item.thema),
        isNew(item) ? h('span', { class: 'ts-label new' }, 'Neu') : null,
        item.praxis ? h('span', { class: 'ts-label praxis' }, 'Praxistipp') : null,
        h('p', null, o.text),
        withMore([h('a', { class: 'src', href: safeUrl(item.url), target: '_blank', rel: 'noopener noreferrer' }, `${item.paywall ? LOCK + ' ' : ''}${item.source} ↗`)], item, { skipFirst: true })))))) : null,
    st.showDE && !region && deList.length ? h('section', { class: 'kurios de-box', 'aria-labelledby': 'deb' },
      h('div', { class: 'kurios-head' }, h('h2', { id: 'deb' }, 'Aus Deutschland'), h('span', { class: 'k-scope' }, deScope)),
      h('ul', null, deList.map((i) => h('li', { style: `--c:${THEMA_VAR[i.thema] || 'var(--accent)'}` },
        h('span', null, h('span', { class: 'ts-label' }, THEMA_SHORT[i.thema] || i.thema), i.praxis ? h('span', { class: 'ts-label praxis' }, 'Praxistipp') : null),
        h('a', { class: 'k-title', href: safeUrl(i.url), target: '_blank', rel: 'noopener noreferrer' }, i.headline),
        withMore([h('span', { class: 'k-meta' }, `${i.paywall ? LOCK + ' ' : ''}${i.source} \u00B7 ${fmtShort(i.date)}`)], i))))) : null,
    st.showKurios && kList.length ? h('section', { class: 'kurios', 'aria-labelledby': 'kur' },
      h('div', { class: 'kurios-head' }, h('h2', { id: 'kur' }, 'Kurios & krass'), h('span', { class: 'k-scope' }, kScope)),
      h('ul', null, kList.map((i) => h('li', null,
        h('span', { class: 'k-hook' }, i.kurios),
        h('a', { class: 'k-title', href: safeUrl(i.url), target: '_blank', rel: 'noopener noreferrer' }, i.headline),
        withMore([h('span', { class: 'k-meta' }, `${i.paywall ? LOCK + ' ' : ''}${i.source} · ${fmtShort(i.date)}`)], i))))) : null,
    sections.length > 1 ? h('nav', { class: 'jump', 'aria-label': 'Zu Thema springen' }, sections.map(([name, list]) => h('button', {
      class: 'chip jump-chip', type: 'button', style: `--c:${THEMA_VAR[name]}`,
      onclick: () => document.getElementById('sec-' + name.replace(/\W+/g, '-'))?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    }, `${THEMA_SHORT[name] || name} ${list.length}`))) : null,
    ...(sections.length ? sections.map(([name, list]) => h('section', { class: 'section', id: 'sec-' + name.replace(/\W+/g, '-'), style: `--c:${THEMA_VAR[name]}` },
      h('div', { class: 'section-head' }, h('span', { class: 'dot' }), h('h2', null, name), h('span', { class: 'count' }, list.length)),
      list.map((i) => card(i)))) : [h('p', { class: 'empty' }, 'Keine Meldungen für diese Auswahl.')]),
    null);
}

/* ---------- Ansicht: Archiv ---------- */

function isoWeek(s) {
  const d = new Date(s + 'T12:00:00Z');
  const mon = new Date(d); mon.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const thu = new Date(mon); thu.setUTCDate(mon.getUTCDate() + 3);
  const y = thu.getUTCFullYear();
  const jan4 = new Date(Date.UTC(y, 0, 4, 12));
  const w1 = new Date(jan4); w1.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
  const week = Math.round((mon - w1) / 604800000) + 1;
  const sun = new Date(mon); sun.setUTCDate(mon.getUTCDate() + 6);
  return { key: `${y}-W${String(week).padStart(2, '0')}`, week, start: mon.toISOString().slice(0, 10), end: sun.toISOString().slice(0, 10) };
}
const fmtMonth = (s) => new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(s + 'T12:00:00Z'));
const GROUPINGS = [['tag', 'Tage'], ['woche', 'Wochen'], ['monat', 'Monate'], ['kategorie', 'Kategorien']];
const SORTS = [['neu', 'Neueste'], ['rel', 'Wichtigste']];
const PRAXIS = '__praxis';

function groupKey(mode, item) {
  if (mode === 'kategorie') return { key: item.thema, label: item.thema, order: THEMEN.findIndex(([n]) => n === item.thema) };
  if (mode === 'tag') return { key: item.date, label: dayLabel(item.date) };
  if (mode === 'monat') return { key: item.date.slice(0, 7), label: fmtMonth(item.date) };
  const w = isoWeek(item.date);
  return { key: w.key, label: `KW ${w.week} · ${fmtShort(w.start)} bis ${fmtShort(w.end)}${w.end.slice(0, 4)}` };
}

async function viewArchive(q) {
  const index = await loadIndex();
  const g = GROUPINGS.some(([k]) => k === q.g) ? q.g : getSettings().grouping;
  const sort = q.s === 'rel' ? 'rel' : 'neu';
  const f = { thema: q.thema || '', region: q.region || '', von: q.von || '', bis: q.bis || '', quelle: q.quelle || '', g, s: sort };
  const matchOther = (i) => (!f.thema || (f.thema === PRAXIS ? i.praxis : i.thema === f.thema)) &&
    (!f.quelle || i.source === f.quelle) && (!f.von || i.date >= f.von) && (!f.bis || i.date <= f.bis);
  const rc = regionCounts(index.items.filter(matchOther));
  const filtered = index.items.filter((i) => matchOther(i) && (!f.region || i.region === f.region))
    .sort((a, b) => b.published.localeCompare(a.published));
  const set = (patch) => { go('/archiv', { ...f, ...patch }, true); route(); };

  const minD = store.dates[store.dates.length - 1], maxD = store.dates[0];
  const groups = new Map();
  filtered.forEach((i) => {
    const k = groupKey(g, i);
    if (!groups.has(k.key)) groups.set(k.key, { label: k.label, order: k.order, items: [] });
    groups.get(k.key).items.push(i);
  });
  let ordered = [...groups.values()];
  if (g === 'kategorie') ordered.sort((a, b) => a.order - b.order);
  if (sort === 'rel') ordered.forEach((grp) => grp.items.sort((a, b) => b.relevanz - a.relevanz || b.published.localeCompare(a.published)));

  // Gruppen sind einklappbar, Karten werden erst beim Aufklappen gebaut
  const list = h('div', { class: 'groups' });
  ordered.forEach((grp, n) => {
    const body = h('div', { class: 'group-body' });
    const fill = () => { if (!body.childElementCount) grp.items.forEach((i) => body.append(card(i))); };
    const det = h('details', { class: 'group', open: n === 0 }, h('summary', null, h('span', { class: 'g-title' }, grp.label), h('span', { class: 'count' }, grp.items.length)), body);
    if (n === 0) fill();
    det.addEventListener('toggle', () => { if (det.open) { fill(); fitCards(body); } });
    list.append(det);
  });
  const toggleAll = (open) => list.querySelectorAll('details').forEach((d) => { d.open = open; });
  const unit = { tag: 'Tagen', woche: 'Wochen', monat: 'Monaten', kategorie: 'Kategorien' }[g];
  const praxisN = index.items.filter((i) => i.praxis).length;
  const activeN = [f.thema, f.region, f.quelle, f.von, f.bis].filter(Boolean).length + (g !== getSettings().grouping ? 1 : 0) + (sort !== 'neu' ? 1 : 0);

  render(
    h('h1', null, 'Archiv'),
    h('p', { class: 'sub' }, `${filtered.length} von ${index.items.length} Meldungen in ${groups.size} ${unit}`),
    h('details', { class: 'filterbox', open: store.filterOpen ?? matchMedia('(min-width: 720px)').matches, ontoggle: (e) => { store.filterOpen = e.target.open; } },
      h('summary', null, 'Filter & Sortierung', activeN ? h('span', { class: 'count-badge' }, activeN) : null),
      h('div', { class: 'filter-grid' },
        selectField('Kategorie', [['', 'Alle Themen'], [PRAXIS, `Praxistipps & Tools (${praxisN})`], ...THEMEN.map(([n]) => [n, n])], f.thema, (v) => set({ thema: v })),
        selectField('Quelle', sourceOptions(), f.quelle, (v) => set({ quelle: v })),
        selectField('Bereich', REGIONEN.map(([v, t]) => [v, `${t} (${rc[v]})`]), f.region, (v) => set({ region: v })),
        selectField('Gruppierung', GROUPINGS, g, (v) => set({ g: v })),
        selectField('Sortierung', SORTS, sort, (v) => set({ s: v })),
        h('label', { class: 'field sel' }, h('span', { class: 'f-label' }, 'Von'), h('input', { type: 'date', value: f.von, min: minD, max: maxD, onchange: (e) => set({ von: e.target.value }) })),
        h('label', { class: 'field sel' }, h('span', { class: 'f-label' }, 'Bis'), h('input', { type: 'date', value: f.bis, min: minD, max: maxD, onchange: (e) => set({ bis: e.target.value }) })),
        (f.thema || f.region || f.von || f.bis || f.quelle) ? h('button', { class: 'btn reset-btn', type: 'button', onclick: () => { go('/archiv', { g, s: sort }, true); route(); } }, 'Zurücksetzen') : null)),
    groups.size > 1 ? h('div', { class: 'row actions' },
      h('button', { class: 'btn', type: 'button', onclick: () => toggleAll(true) }, 'Alle öffnen'),
      h('button', { class: 'btn', type: 'button', onclick: () => toggleAll(false) }, 'Alle schließen')) : null,
    filtered.length ? list : h('p', { class: 'empty' }, 'Keine Meldungen für diese Filter.'));
}

/* ---------- Ansicht: Suche ---------- */

async function viewSearch(q) {
  const index = await loadIndex();
  if (!store.fuse) {
    store.fuse = new Fuse(index.items, {
      keys: [{ name: 'headline', weight: 3 }, { name: 'tags', weight: 2 }, { name: 'summary', weight: 1.2 }, { name: 'source', weight: 1 }, { name: 'quelle_titel', weight: 1 }],
      threshold: 0.32, ignoreLocation: true, minMatchCharLength: 2, ignoreDiacritics: true,
    });
  }
  const query = (q.q || '').trim();
  const region = q.region || '';
  const quelle = q.quelle || '';
  const results = h('div');
  const status = h('p', { class: 'sub' });

  const showResults = (text) => {
    results.replaceChildren();
    const base = text.length >= 2 ? store.fuse.search(text).map((r) => r.item) : (quelle ? index.items.slice() : []);
    const hits = base.filter((i) => (!region || i.region === region) && (!quelle || i.source === quelle)).slice(0, 80);
    status.textContent = text.length < 2 && !quelle ? `Suche in ${index.items.length} Meldungen (Titel, Text, Tags, Quelle).` : `${hits.length} Treffer`;
    if ((text.length >= 2 || quelle) && !hits.length) results.append(h('p', { class: 'empty' }, 'Keine Treffer.'));
    hits.forEach((i) => results.append(card(i, text)));
    fitCards(results);
  };

  const input = h('input', { type: 'search', value: query, placeholder: 'Suchen, z. B. AI Act, OpenAI, Weiterbildung', 'aria-label': 'Suchbegriff', autocomplete: 'off', enterkeyhint: 'search' });
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { go('/suche', { q: input.value.trim(), region, quelle }, true); showResults(input.value.trim()); }, 160);
  });

  render(
    h('h1', null, 'Suche'),
    h('div', { class: 'filters' }, h('form', { class: 'searchbar', role: 'search', onsubmit: (e) => { e.preventDefault(); clearTimeout(timer); input.blur(); go('/suche', { q: input.value.trim(), region, quelle }, true); showResults(input.value.trim()); } }, input, h('button', { class: 'btn primary', type: 'submit', 'aria-label': 'Suchen' }, '\u{1F50D}\uFE0E')), chipRow(REGIONEN, region, (v) => { go('/suche', { q: input.value.trim(), region: v, quelle }, true); route(); }, 'Bereich'),
      h('div', { class: 'row' }, sourceSelect(quelle, (v) => { go('/suche', { q: input.value.trim(), region, quelle: v }, true); route(); }))),
    h('p', { class: 'sub gl-hint' }, 'Begriff unklar? ', h('a', { href: '#/glossar' }, 'Im Glossar nachschlagen')),
    status, results);
  showResults(query);
  if (!query) input.focus({ preventScroll: true });
}

/* ---------- Ansicht: Merkliste ---------- */

function viewFavs(q) {
  const entries = Object.values(favLoad()).sort((a, b) => b.savedAt - a.savedAt);
  const thema = q.thema || '';
  const list = entries.filter((e) => !thema || e.item.thema === thema);
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  const note = h('p', { class: 'sub', role: 'status' }, `${entries.length} gemerkt. Die Liste liegt nur in diesem Browser, per Export lässt sie sich sichern oder auf ein anderes Gerät übertragen.`);
  fileInput.addEventListener('change', async () => {
    if (!fileInput.files[0]) return;
    const n = await importFavs(fileInput.files[0]);
    if (n < 0) { note.textContent = 'Datei konnte nicht gelesen werden.'; return; }
    route.last = null; await route();
    const el = document.querySelector('[role=status]'); if (el) el.textContent = `${n} neue Einträge importiert.`;
  });
  const used = new Set(entries.map((e) => e.item.thema));

  render(
    h('h1', null, 'Merkliste'),
    note,
    h('div', { class: 'row actions' },
      h('button', { class: 'btn', type: 'button', disabled: !entries.length, onclick: exportFavs }, 'Exportieren'),
      h('button', { class: 'btn', type: 'button', onclick: () => fileInput.click() }, 'Importieren'),
      h('button', { class: 'btn', type: 'button', disabled: !entries.length, onclick: () => { if (confirm('Alle gemerkten Meldungen entfernen?')) { favMem = {}; favSave(); route(); } } }, 'Leeren'),
      fileInput),
    entries.length > 1 ? h('div', { class: 'filter-grid solo' }, selectField('Thema', [['', 'Alle Themen'], ...THEMEN.filter(([n]) => used.has(n)).map(([n]) => [n, n])], thema, (v) => { go('/merkliste', { thema: v }, true); route(); })) : null,
    ...(list.length ? list.map((e) => card(e.item)) : [h('p', { class: 'empty' }, entries.length ? 'Keine Einträge für dieses Thema.' : 'Noch nichts gemerkt. Tippe bei einer Meldung auf den Stern, um sie hier zu sammeln.')]));
}

/* ---------- Ansicht: Glossar ---------- */

async function loadGlossary() {
  if (!store.glossary) store.glossary = await getJSON('content/glossar.json');
  return store.glossary;
}
const escRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const glBase = (t) => t.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
const glSlug = (t) => t.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').replace(/^-|-$/g, '');
function glLetter(t) {
  const c = t.replace(/^[§\s"„(]+/, '').charAt(0).toUpperCase().replace('Ä', 'A').replace('Ö', 'O').replace('Ü', 'U');
  return /[A-Z]/.test(c) ? c : '#';
}

function backLabel(hsh) {
  const a = hsh.replace(/^#\//, '').split('?')[0].split('/')[0];
  return ({ '': 'Heute', tag: 'Heute', briefing: 'Kurz-Briefing', woche: 'Die Woche in Kürze', aiti: 'AITI', archiv: 'Archiv', suche: 'Suche', merkliste: 'Merkliste', einstellungen: 'Einstellungen', status: 'Status' })[a] || 'vorheriger Seite';
}

/* ---------- Ansicht: AITI (alle Meldungen mit dem Tag "AITI") ---------- */

const aitiItems = () => store.index.items.filter((i) => !i.dup_of && (i.tags || []).includes('AITI')).sort((a, b) => b.date.localeCompare(a.date) || b.relevanz - a.relevanz);

async function viewAiti() {
  await loadIndex();
  const list = aitiItems();
  const days = [...new Set(list.map((i) => i.date))];
  render(
    h('h1', null, 'AITI'),
    h('p', { class: 'sub' }, `${list.length} Meldungen, die für uns interessant sind: Weiterbildung, KI-Kompetenz, Bildungsmarkt, Qualifizierung und mehr.`),
    !list.length ? h('p', { class: 'empty' }, 'Noch keine Meldungen mit AITI-Bezug.') : null,
    ...days.map((d) => h('section', { class: 'section', style: '--c:var(--t-aiti, var(--accent))' },
      h('h2', null, dayLabel(d), h('span', { class: 'count-badge' }, list.filter((i) => i.date === d).length)),
      list.filter((i) => i.date === d).map((i) => card(i)))));
}

async function viewGlossary(q) {
  const backHref = store.hashPrev && !store.hashPrev.startsWith('#/glossar') ? store.hashPrev : null;
  const [gl, index] = await Promise.all([loadGlossary(), loadIndex().catch(() => null)]);
  const hay = index ? index.items.map((i) => `${i.headline} ${i.summary} ${(i.tags || []).join(' ')}`.toLowerCase()) : [];
  const byName = new Map(gl.map((x) => [x.term.toLowerCase(), x]));
  const newsCount = (term) => {
    const base = glBase(term).toLowerCase();
    if (base.length < 2) return 0;
    const re = base.length <= 4 ? new RegExp('\\b' + escRe(base) + '\\b', 'i') : null;
    return hay.filter((t) => (re ? re.test(t) : t.includes(base))).length;
  };

  const status = h('p', { class: 'sub' });
  const checkedMax = gl.reduce((m, x) => (x.geprueft && x.geprueft > m ? x.geprueft : m), '');
  const note = checkedMax ? h('p', { class: 'gl-note' }, `Rechtliche und zeitabhängige Einträge zuletzt geprüft am ${checkedMax.split('-').reverse().join('.')}. Das Glossar ersetzt keine Rechtsberatung.`) : null;
  const alpha = h('nav', { class: 'alpha', 'aria-label': 'Anfangsbuchstabe' });
  const list = h('div', { class: 'gl-list' });
  const input = h('input', { type: 'search', value: q.s || '', placeholder: `Im Glossar suchen (${gl.length} Begriffe)`, 'aria-label': 'Glossar durchsuchen', autocomplete: 'off', enterkeyhint: 'search' });

  const entry = (x, text) => {
    const n = newsCount(x.term);
    const rel = (x.related || []).map((r) => (typeof r === 'string' ? r : r.term)).filter((r) => r && byName.has(String(r).toLowerCase()));
    return h('article', { class: 'gl-item', id: 'gl-' + glSlug(x.term) },
      h('h3', null, text ? highlight(x.term, text) : x.term),
      x.aliases && x.aliases.length ? h('div', { class: 'gl-alias' }, 'auch: ' + x.aliases.join(', ')) : null,
      h('p', null, text ? highlight(x.def, text) : x.def),
      x.more ? h('details', { class: 'gl-more' }, h('summary', null, 'Mehr dazu'), h('p', null, x.more)) : null,
      (n || rel.length || x.geprueft) ? h('div', { class: 'gl-foot' },
        n ? h('a', { class: 'gl-news', href: '#/suche?q=' + encodeURIComponent(glBase(x.term)) }, `${n} ${n === 1 ? 'Meldung' : 'Meldungen'} dazu`) : null,
        rel.slice(0, 4).map((r) => h('a', { class: 'gl-rel', href: '#/glossar?t=' + encodeURIComponent(r) }, r)),
        x.geprueft ? h('span', { class: 'gl-checked', title: 'Inhalt und rechtlicher Stand wurden an diesem Tag geprüft' }, 'Geprüft ' + x.geprueft.split('-').reverse().join('.')) : null) : null);
  };

  const paint = (raw) => {
    const t = raw.trim().toLowerCase();
    const re = t ? new RegExp('(^|[^a-zäöüß0-9])' + escRe(t), 'i') : null;
    const rank = (x) => { const n = x.term.toLowerCase(), al = (x.aliases || []).map((a) => a.toLowerCase()); return n === t || al.includes(t) ? 0 : n.startsWith(t) || al.some((a) => a.startsWith(t)) ? 1 : re.test(x.term) ? 2 : 3; };
    const hits = t ? gl.filter((x) => re.test(`${x.term} ${(x.aliases || []).join(' ')} ${x.def}`)) : gl;
    if (t) hits.sort((a, b) => rank(a) - rank(b));
    status.textContent = t ? `${hits.length} Treffer` : `${gl.length} Begriffe, Abkürzungen und Konzepte rund um KI`;
    list.replaceChildren(); alpha.replaceChildren();
    if (!hits.length) { list.append(h('p', { class: 'empty' }, 'Kein Begriff gefunden.')); return; }
    const groups = new Map();
    if (t) groups.set('', hits);
    else hits.forEach((x) => { const l = glLetter(x.term); if (!groups.has(l)) groups.set(l, []); groups.get(l).push(x); });
    if (!t) {
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('').forEach((l) => alpha.append(h('button', {
        type: 'button', class: 'alpha-btn', disabled: !groups.has(l),
        onclick: () => document.getElementById('gl-letter-' + (l === '#' ? 'x' : l))?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      }, l)));
    }
    [...groups.keys()].sort((a, b) => (a === '#') - (b === '#') || a.localeCompare(b)).forEach((l) => {
      const items = groups.get(l);
      const sec = h('section', { class: 'gl-group' }, l ? h('h2', { class: 'gl-letter', id: 'gl-letter-' + (l === '#' ? 'x' : l) }, l) : null);
      items.forEach((x) => sec.append(entry(x, t)));
      list.append(sec);
    });
  };

  let timer;
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { go('/glossar', { s: input.value.trim() }, true); paint(input.value); }, 140); });

  render(
    backHref ? h('a', { class: 'back-link', href: backHref, onclick: () => { store.restore = true; } }, `\u2039 Zurück zu ${backLabel(backHref)}`) : null,
    h('h1', null, 'Glossar'),
    status,
    note,
    h('div', { class: 'gl-sticky' },
      h('form', { class: 'searchbar', role: 'search', onsubmit: (e) => { e.preventDefault(); input.blur(); paint(input.value); } }, input,
        h('button', { class: 'btn primary', type: 'submit', 'aria-label': 'Suchen' }, '\u{1F50D}\uFE0E')),
      alpha),
    list);
  paint(q.s || '');
  const target = q.t && byName.get(String(q.t).toLowerCase());
  if (target) {
    const el = document.getElementById('gl-' + glSlug(target.term));
    if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); }
  }
}

/* ---------- Ansicht: Einstellungen ---------- */


const BUILD = ([...document.scripts].map((el) => /app\.js\?v=(\d+)/.exec(el.src)).find(Boolean) || [0, '0'])[1];

function acc(title, open, ...kids) {
  return h('details', { class: 'acc', open }, h('summary', null, title), h('div', { class: 'acc-body' }, ...kids));
}

function toggleRow(label, hint, key) {
  const st = getSettings();
  return h('label', { class: 'toggle' },
    h('span', null, h('b', null, label), hint ? h('small', null, hint) : null),
    h('input', { type: 'checkbox', checked: !!st[key], onchange: (e) => saveSettings({ [key]: e.target.checked }) }));
}

function setTheme(mode) {
  try { if (mode === 'auto') localStorage.removeItem('theme'); else localStorage.setItem('theme', mode); } catch (e) { /* privater Modus */ }
  if (mode === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = mode;
  paintTheme();
}

async function viewSettings() {
  const index = await loadIndex().catch(() => null);
  const st = getSettings();
  let stored = 'auto';
  try { stored = localStorage.getItem('theme') || 'auto'; } catch (e) { /* ignorieren */ }
  const redo = () => route();
  const favN = Object.keys(favLoad()).length;
  const [imp, runState, glossary] = await Promise.all([getJSON('impressum.json').catch(() => ({})), getJSON('data/state.json').catch(() => null), loadGlossary().catch(() => [])]);
  const glN = glossary.length;

  const bySource = new Map();
  (index ? index.items : []).forEach((i) => {
    const e = bySource.get(i.source) || { n: 0, last: '' };
    e.n++; if (i.date > e.last) e.last = i.date;
    bySource.set(i.source, e);
  });
  const sources = [...bySource.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0], 'de'));
  const stand = index ? standText(index.updated) : null;

  const card_ = (title, ...kids) => h('section', { class: 'set-card' }, h('h2', null, title), ...kids);

  render(
    h('h1', null, 'Einstellungen'),
    h('p', { class: 'sub' }, 'Alles wird nur in diesem Browser gespeichert.'),

    card_('Darstellung',
      h('div', { class: 'set-label' }, 'Farbschema'),
      chipRow([['auto', 'System'], ['light', 'Hell'], ['dark', 'Dunkel']], stored, (v) => { setTheme(v); redo(); }, 'Farbschema'),
      h('div', { class: 'set-label' }, 'Schriftgröße'),
      h('div', { class: 'fs-row' },
        h('button', { class: 'btn', type: 'button', disabled: fsNow <= FS_STEPS[0], onclick: () => { stepFs(-1); redo(); } }, 'A−'),
        h('span', { class: 'fs-val' }, `${fsNow} px`),
        h('button', { class: 'btn', type: 'button', disabled: fsNow >= FS_STEPS[FS_STEPS.length - 1], onclick: () => { stepFs(1); redo(); } }, 'A+'),
        h('button', { class: 'btn', type: 'button', onclick: () => { try { localStorage.removeItem('fs'); } catch (e) { /* ignorieren */ } applyFs(FS_DEFAULT); redo(); } }, `Standard (${FS_DEFAULT} px)`))),

    card_('Startansicht',
      toggleRow('Briefing als Startseite', 'Beim Öffnen direkt das 3-Minuten-Briefing zeigen', 'startBriefing'),
      h('div', { class: 'set-label' }, 'Bereich in der Tagesansicht'),
      chipRow(REGIONEN, st.region, (v) => { saveSettings({ region: v }); store.regionSel = undefined; redo(); }, 'Bereich'),
      h('div', { class: 'set-label' }, 'Gruppierung im Archiv'),
      chipRow(GROUPINGS, st.grouping, (v) => { saveSettings({ grouping: v }); redo(); }, 'Gruppierung')),

    card_('Anzeige',
      toggleRow('Top-Stories', 'Der Tagesüberblick oben', 'showTop'),
      toggleRow('Aus Deutschland', 'Eigene Box mit Meldungen aus Deutschland', 'showDE'),
      toggleRow('Kurios & krass', 'Außergewöhnliche Fälle und Fakten', 'showKurios'),
      toggleRow('Kurztexte immer ausklappen', 'Auf dem Handy sind sie sonst gekürzt', 'expandAll'),
      toggleRow('Tags anzeigen', null, 'showTags'),
      toggleRow('Gelesene ganz ausblenden', 'Als gelesen markierte Meldungen sind sonst auf eine Zeile eingeklappt', 'hideSeen'),
      Object.keys(seenLoad()).length ? h('button', { class: 'btn', type: 'button', onclick: () => { seenMem = {}; seenSave(); redo(); } }, `Alle ${Object.keys(seenLoad()).length} Gelesen-Markierungen aufheben`) : null,
      h('div', { class: 'set-label' }, 'Themen in der Tagesansicht (antippen zum Ausblenden)'),
      h('div', { class: 'chips wrap', role: 'group', 'aria-label': 'Themen' },
        THEMEN.map(([n]) => h('button', {
          class: 'chip', type: 'button', 'aria-pressed': String(!st.hidden.includes(n)), style: `--c:${THEMA_VAR[n]}`,
          onclick: () => { saveSettings({ hidden: st.hidden.includes(n) ? st.hidden.filter((x) => x !== n) : [...st.hidden, n] }); redo(); },
        }, n)))),

    card_('Daten',
      h('p', { class: 'set-text' }, stand ? `Stand: ${stand.text}. ${index.count} Meldungen im Archiv.` : 'Daten konnten nicht geladen werden.'),
      h('p', { class: 'set-text' }, `Merkliste: ${favN} ${favN === 1 ? 'Eintrag' : 'Einträge'}.`),
      h('div', { class: 'row actions' },
        h('a', { class: 'btn', href: '#/merkliste' }, 'Merkliste öffnen'),
        h('a', { class: 'btn', href: '#/status' }, 'Systemstatus'),
        h('button', { class: 'btn', type: 'button', onclick: () => { VISIT.base = Date.now(); try { localStorage.setItem('visitBase', String(VISIT.base)); } catch (e) { /* ignorieren */ } paintNewCount(); redo(); } }, 'Alles als gelesen markieren'),
        h('button', { class: 'btn', type: 'button', onclick: () => { if (confirm('Alle Einstellungen auf Standard zurücksetzen? Die Merkliste bleibt erhalten.')) { ['settings', 'theme', 'fs'].forEach((k) => { try { localStorage.removeItem(k); } catch (e) { /* ignorieren */ } }); setMem = null; delete document.documentElement.dataset.theme; store.regionSel = undefined; applySettings(); applyFs(FS_DEFAULT); paintTheme(); redo(); } } }, 'Einstellungen zurücksetzen'),
        h('button', { class: 'btn danger', type: 'button', disabled: !favN, onclick: () => { if (confirm('Die gesamte Merkliste löschen? Das lässt sich nicht rückgängig machen.')) { favMem = {}; favSave(); redo(); } } }, 'Merkliste löschen'))),

    card_('Quellen',
      acc(`${sources.length} Quellen mit Meldungen im Archiv`, false,
        h('ul', { class: 'src-list' }, sources.map(([name, e]) => h('li', null,
          h('a', { href: '#/archiv?quelle=' + encodeURIComponent(name) }, name),
          h('span', null, `${e.n} · zuletzt ${fmtShort(e.last)}`)))))),

    card_('Impressum, Version & Rechtliches',
      acc('Version', true,
        h('dl', { class: 'kv' },
          h('dt', null, 'App'), h('dd', null, `KI News ${APP_VERSION} (Build ${BUILD}, ${APP_DATE.split('-').reverse().join('.')})`),
          h('dt', null, 'Datenstand'), h('dd', null, index ? `${new Date(index.updated).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin' })} Uhr` : 'unbekannt'),
          h('dt', null, 'Letzter Lauf'), h('dd', null, runState && runState.last_success ? `${new Date(runState.last_success).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin' })} Uhr` : 'unbekannt'),
          h('dt', null, 'Inhalt'), h('dd', null, `${index ? index.count : 0} Meldungen, ${sources.length} Quellen, ${glN} Glossarbegriffe`),
          h('dt', null, 'Projekt'), h('dd', null, h('a', { href: 'https://github.com/frankknebeljanssen-create/ai-news-hub', target: '_blank', rel: 'noopener noreferrer' }, 'GitHub ↗')))),
      acc('Impressum', false,
        imp.name ? h('div', null,
          h('p', { class: 'set-text' }, 'Angaben gemäß § 5 DDG'),
          h('p', { class: 'imp' }, imp.name, imp.anschrift ? [h('br'), ...imp.anschrift.split('\n').flatMap((l, i) => (i ? [h('br'), l] : [l]))] : null),
          imp.email || imp.telefon ? h('p', { class: 'imp' }, imp.email ? ['E-Mail: ', h('a', { href: 'mailto:' + imp.email }, imp.email)] : null, imp.email && imp.telefon ? h('br') : null, imp.telefon ? 'Telefon: ' + imp.telefon : null) : null,
          h('p', { class: 'set-text' }, 'Verantwortlich für den Inhalt (§ 18 Abs. 2 MStV): ' + imp.name))
        : h('p', { class: 'warn' }, 'Die Anbieterangaben (Name, Anschrift, E-Mail) fehlen noch. Sie werden aus der Datei impressum.json im Projekt gelesen.'),
        h('p', { class: 'set-text' }, 'Haftung für Links: Für die Inhalte verlinkter externer Seiten sind ausschließlich deren Betreiber verantwortlich. Zum Zeitpunkt der Verlinkung waren keine Rechtsverstöße erkennbar.')),
      acc('Datenschutz', false,
        h('p', { class: 'set-text' }, 'Diese Seite setzt keine Cookies, nutzt keine Analyse- oder Tracking-Dienste und lädt keine Schriften oder Skripte von Dritten. Einstellungen, Merkliste und Schriftgröße werden ausschließlich lokal in Ihrem Browser gespeichert (localStorage) und nicht übertragen.'),
        h('p', { class: 'set-text' }, 'Die Seite wird über GitHub Pages ausgeliefert. Dabei verarbeitet GitHub technisch bedingt Ihre IP-Adresse in Server-Logfiles (GitHub Inc., USA). Beim Aufruf verlinkter Quellen gelten die Datenschutzbestimmungen der jeweiligen Anbieter.')),
      acc('Hinweis zu KI-Inhalten', false,
        h('p', { class: 'set-text' }, 'Schlagzeilen, Kurzfassungen, Themenzuordnung, Kennzeichnung als Praxistipp oder Kurioses und der Tagesüberblick werden automatisch mit KI (Claude von Anthropic) aus Titel und Teaser der Quellen erstellt. Sie können Fehler enthalten und ersetzen nicht die Lektüre der Quelle. Maßgeblich ist stets der verlinkte Originalartikel.'),
        h('p', { class: 'set-text' }, 'Gespeichert werden nur eigene Kurzfassungen mit Titel und Link zur Quelle, keine Volltexte und keine Zitate.')),
      acc('Lizenzen', false,
        h('p', { class: 'set-text' }, 'Fuse.js 7.0.0 (Apache License 2.0) für die Suche. Symbole angelehnt an Feather Icons (MIT). Das Glossar besteht aus eigenen Texten.'))));
}

/* Farbige Kopfkarte fuer Kurz-Briefing und Woche */
function hero({ title, backHref, active, meta, nav }) {
  return h('header', { class: 'hero' + (active === 'woche' ? ' week' : '') },
    h('div', { class: 'hero-top' },
      h('a', { class: 'hero-back', href: backHref }, '\u2039 Alle Meldungen'),
      chipRow([['tag', 'Tag'], ['woche', 'Woche']], active, (v) => { if (v !== active) go(v === 'woche' ? '/woche' : '/briefing'); }, 'Ansicht')),
    h('h1', null, title),
    h('div', { class: 'hero-meta' }, ...[meta[0], meta[1] || h('div', { class: 'hero-sub' }, '\u00A0')]),
    nav);
}

/* ---------- Ansicht: Briefing (2 bis 3 Minuten) ---------- */

const ABBR = new Set(['z', 'B', 'd', 'h', 'u', 'a', 'ca', 'Nr', 'bzw', 'vgl', 'inkl', 'usw', 'ggf', 'Mio', 'Mrd', 'Dr', 'Prof', 'etc', 'ff', 'Abs', 'Art', 'Std', 'Min', 'sog', 'evtl', 'bspw', 'zzgl', 'max', 'mind', 'St', 'ca', 'Tel', 'Jh']);
const MONTHS = /^(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)/;
function splitSentences(t) {
  t = (t || '').trim();
  const out = []; let start = 0; const re = /[.!?]+(\s+)(?=[A-ZÄÖÜ„"(])/g; let m;
  while ((m = re.exec(t))) {
    const before = t.slice(start, m.index + 1);
    const tok = ((/(\S+)$/.exec(before) || [])[1] || '').replace(/[.!?]+$/, '');
    const next = t.slice(m.index + m[0].length);
    if (ABBR.has(tok) || (/^\d+$/.test(tok) && MONTHS.test(next))) continue;
    out.push(t.slice(start, m.index + m[0].length - m[1].length).trim());
    start = m.index + m[0].length;
  }
  if (start < t.length) out.push(t.slice(start).trim());
  return out.filter(Boolean);
}
const firstSentence = (t) => splitSentences(t)[0] || (t || '');

async function viewBriefing(q) {
  const index = await loadIndex();
  if (!store.dates.length) return render(stateBox('Noch keine Nachrichten vorhanden.'));
  const date = q.d && store.dates.includes(q.d) ? q.d : store.dates[0];
  const pos = store.dates.indexOf(date);
  const [day, gl] = await Promise.all([loadDay(date), loadGlossary().catch(() => [])]);
  const dayAll = day ? day.items.filter((i) => !i.dup_of) : index.items.filter((i) => i.date === date);
  const stand = standText(index.updated);
  const newN = dayAll.filter(isNew).length;
  const byRel = (a, b) => (isNew(b) - isNew(a)) || b.relevanz - a.relevanz || b.published.localeCompare(a.published);
  const used = new Set();

  // 1. Top-Stories (aus dem Tagesueberblick, sonst die relevantesten Meldungen)
  const top = ((day && day.overview) || []).map((o) => ({ text: o.text, item: store.resolve(o.id) })).filter((x) => x.item)
    .filter((x, k, arr) => arr.findIndex((y) => y.item.id === x.item.id) === k).slice(0, 5);
  if (top.length < 5) {
    dedupeSimilar(dayAll.filter((i) => !top.some((t) => t.item.id === i.id)).sort(byRel), 5 - top.length)
      .forEach((i) => top.push({ text: firstSentence(i.summary), item: i }));
  }
  top.forEach((t) => used.add(t.item.id));

  // 2. bis 4.: erst der Tag, wenn zu wenig, dann die letzten Tage
  const recent = (days) => index.items.filter((i) => i.date <= date && i.date >= dayShift(date, -days));
  const pick = (test, n, days) => {
    let list = dayAll.filter((i) => test(i) && !used.has(i.id));
    if (list.length < n) list = recent(days).filter((i) => test(i) && !used.has(i.id));
    const out = dedupeSimilar(list.sort(byRel), n);
    out.forEach((i) => used.add(i.id));
    return out;
  };
  const de = pick((i) => i.region === 'de', 3, 3);
  const praxis = pick((i) => i.praxis, 1, 7)[0];
  const kurios = pick((i) => i.kurios, 1, 7)[0];

  // 5. Begriff des Tages (stabil pro Datum)
  const pool = gl.filter((x) => x.def && x.def.length <= 220);
  const term = pool.length ? pool[Number(date.replace(/-/g, '')) % pool.length] : null;

  const words = [...top.map((t) => t.text), ...de.map((i) => i.headline), praxis && praxis.headline, praxis && firstSentence(praxis.summary),
    kurios && kurios.kurios, kurios && kurios.headline, term && term.term, term && term.def].filter(Boolean).join(' ').split(/\s+/).length;
  const minutes = Math.max(1, Math.ceil(words / 150));

  const srcLink = (it) => h('a', { class: 'b-src', href: safeUrl(it.url), target: '_blank', rel: 'noopener noreferrer' }, `${it.paywall ? LOCK + ' ' : ''}${it.source} \u2197`);
  const title = (it, txt) => h('a', { class: 'b-title', href: safeUrl(it.url), target: '_blank', rel: 'noopener noreferrer' }, txt || it.headline);
  const sec = (name, ...kids) => h('section', { class: 'brief-sec' }, h('h2', null, name), ...kids);
  const secTerm = (name, ...kids) => h('section', { class: 'brief-sec brief-term' }, h('h2', null, name), ...kids);

  const bar = h('div', { class: 'brief-progress', role: 'progressbar', 'aria-label': 'Fortschritt im Briefing', 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('i'));
  const fill = bar.firstChild;
  const update = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    const p = max > 0 ? Math.min(100, Math.round((scrollY / max) * 100)) : 100;
    fill.style.width = p + '%'; bar.setAttribute('aria-valuenow', String(p));
  };
  store.briefAbort = new AbortController();
  window.addEventListener('scroll', update, { passive: true, signal: store.briefAbort.signal });
  window.addEventListener('resize', update, { signal: store.briefAbort.signal });

  render(
    bar,
    hero({
      title: 'Kurz-Briefing - der Tag', backHref: '#/' + (pos === 0 ? '' : 'tag/' + date), active: 'tag',
      meta: [h('div', null, `${dayLabel(date)} \u00B7 ca. ${minutes} Min`),
        h('div', { class: 'hero-sub' }, h('span', { class: 'stand' + (stand.old ? ' old' : '') }, stand.text), newN ? ` \u00B7 ${newN} neu` : null)],
      nav: h('div', { class: 'daynav' },
      h('button', { class: 'btn', type: 'button', 'aria-label': 'Älterer Tag', disabled: pos >= store.dates.length - 1, onclick: () => go('/briefing', { d: store.dates[pos + 1] }) }, '\u2039'),
      daySelect(date, fmtShort(date) + date.slice(0, 4), (d) => go('/briefing', d === store.dates[0] ? {} : { d })),
      h('button', { class: 'btn', type: 'button', 'aria-label': 'Neuerer Tag', disabled: pos <= 0, onclick: () => go('/briefing', pos === 1 ? {} : { d: store.dates[pos - 1] }) }, '\u203A')),
    }),

    sec('Das Wichtigste',
      h('ol', { class: 'b-top' }, top.map(({ text, item }) => h('li', { style: `--c:${THEMA_VAR[item.thema] || 'var(--accent)'}` },
        h('span', { class: 'ts-label' }, THEMA_SHORT[item.thema] || item.thema),
        isNew(item) ? h('span', { class: 'ts-label new' }, 'Neu') : null,
        h('p', null, text),
        withMore([srcLink(item)], item, { skipFirst: true }))))),

    de.length ? sec('Deutschland',
      h('ul', { class: 'b-list' }, de.map((i) => h('li', null, title(i), withMore([srcLink(i)], i))))) : null,

    praxis ? sec('Praxistipp des Tages',
      h('div', { class: 'b-one' }, title(praxis), h('p', null, firstSentence(praxis.summary)), withMore([srcLink(praxis)], praxis, { skipFirst: true }))) : null,

    kurios ? sec('Kurios & krass',
      h('div', { class: 'b-one' }, h('span', { class: 'k-hook' }, kurios.kurios), title(kurios), withMore([srcLink(kurios)], kurios))) : null,

    term ? secTerm('Begriff des Tages',
      h('div', { class: 'b-one' }, h('strong', { class: 'b-term' }, term.term), h('p', null, term.def),
        h('a', { class: 'b-src', href: '#/glossar?t=' + encodeURIComponent(term.term) }, 'Im Glossar \u203A'))) : null,

    h('div', { class: 'brief-end' },
      h('p', null, h('strong', null, 'Fertig.'), ' Das war das Briefing, du bist auf dem Stand.'),
      h('div', { class: 'row actions' },
        h('a', { class: 'btn primary', href: '#/' + (pos === 0 ? '' : 'tag/' + date) }, 'Alle Meldungen des Tages'),
        h('a', { class: 'btn', href: '#/archiv' }, 'Archiv'))));
  update();
}

/* ---------- Ansicht: Wochenrückblick ---------- */

async function viewWeek(q) {
  const index = await loadIndex();
  if (!store.dates.length) return render(stateBox('Noch keine Nachrichten vorhanden.'));
  const weeks = [], seen = new Set();
  store.dates.forEach((d) => { const w = isoWeek(d); if (!seen.has(w.key)) { seen.add(w.key); weeks.push(w); } });
  const cur = weeks.find((w) => w.key === q.w) || weeks[0];
  const wi = weeks.indexOf(cur);
  const items = index.items.filter((i) => i.date >= cur.start && i.date <= cur.end);
  const score = (i) => i.relevanz * 2 + Math.min((i.also || []).length, 5);
  const byScore = (a, b) => score(b) - score(a) || b.published.localeCompare(a.published);
  const sorted = items.slice().sort(byScore);

  // Top 7, höchstens 2 je Thema
  const perThema = {};
  const top = [];
  for (const i of sorted) {
    if ((perThema[i.thema] || 0) >= 2) continue;
    perThema[i.thema] = (perThema[i.thema] || 0) + 1;
    top.push(i);
    if (top.length >= 7) break;
  }
  const used = new Set(top.map((i) => i.id));
  const de = dedupeSimilar(sorted.filter((i) => i.region === 'de' && !used.has(i.id)), 4);
  de.forEach((i) => used.add(i.id));
  const praxis = sorted.filter((i) => i.praxis && !used.has(i.id)).slice(0, 3);
  const kurios = sorted.filter((i) => i.kurios && !used.has(i.id)).slice(0, 2);

  const themaStats = THEMEN.map(([n]) => [n, sorted.filter((i) => i.thema === n)]).filter(([, l]) => l.length);
  const maxN = Math.max(1, ...themaStats.map(([, l]) => l.length));
  const tagCount = new Map();
  items.forEach((i) => (i.tags || []).forEach((t) => { if (t.length >= 3) tagCount.set(t, (tagCount.get(t) || 0) + 1); }));
  const tags = [...tagCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8);
  const days = new Set(items.map((i) => i.date)).size;
  const sourcesN = new Set(items.map((i) => i.source)).size;
  const running = cur.end >= todayStr();

  const words = [...top.map((i) => i.headline + ' ' + firstSentence(i.summary)), ...de.map((i) => i.headline), ...praxis.map((i) => i.headline), ...kurios.map((i) => i.kurios)].join(' ').split(/\s+/).length;
  const minutes = Math.max(1, Math.ceil(words / 150));

  const dayTag = (it) => h('span', { class: 'wk-day' }, weekdayName(it.date));
  const sec = (name, ...kids) => h('section', { class: 'brief-sec' }, h('h2', null, name), ...kids);
  const srcLink = (it) => h('a', { class: 'b-src', href: safeUrl(it.url), target: '_blank', rel: 'noopener noreferrer' }, `${it.paywall ? LOCK + ' ' : ''}${it.source} ↗`);
  const title = (it) => h('a', { class: 'b-title', href: safeUrl(it.url), target: '_blank', rel: 'noopener noreferrer' }, it.headline);

  render(
    hero({
      title: 'Die Woche in Kürze', backHref: '#/', active: 'woche',
      meta: [h('div', null, `${items.length} Meldungen an ${days} ${days === 1 ? 'Tag' : 'Tagen'} \u00B7 ca. ${minutes} Min`),
        h('div', { class: 'hero-sub' }, running ? h('span', { class: 'stand' }, 'Zwischenstand, die Woche läuft noch') : 'Die Woche ist abgeschlossen')],
      nav: h('div', { class: 'daynav' },
      h('button', { class: 'btn', type: 'button', 'aria-label': 'Ältere Woche', disabled: wi >= weeks.length - 1, onclick: () => go('/woche', { w: weeks[wi + 1].key }) }, '‹'),
      h('div', { class: 'label', title: `${fmtShort(cur.start)}${cur.start.slice(0, 4)} bis ${fmtShort(cur.end)}${cur.end.slice(0, 4)}` }, `KW ${cur.week} \u00B7 ${fmtShort(cur.start)} bis ${fmtShort(cur.end)}`),
      h('button', { class: 'btn', type: 'button', 'aria-label': 'Neuere Woche', disabled: wi <= 0, onclick: () => go('/woche', wi === 1 ? {} : { w: weeks[wi - 1].key }) }, '›')),
    }),

    !items.length ? h('p', { class: 'empty' }, 'Für diese Woche gibt es noch keine Meldungen.') : null,

    top.length ? sec('Die wichtigsten Meldungen',
      h('ol', { class: 'b-top' }, top.map((i) => h('li', { style: `--c:${THEMA_VAR[i.thema] || 'var(--accent)'}` },
        h('span', { class: 'ts-label' }, THEMA_SHORT[i.thema] || i.thema),
        title(i),
        h('p', { class: 'b-sum' }, firstSentence(i.summary)),
        withMore([dayTag(i), srcLink(i)], i, { skipFirst: true }))))) : null,

    de.length ? sec('Deutschland', h('ul', { class: 'b-list' }, de.map((i) => h('li', null, title(i), withMore([dayTag(i), srcLink(i)], i))))) : null,

    themaStats.length ? sec('Nach Themen',
      h('div', { class: 'wk-bars' }, themaStats.map(([n, l]) => h('div', { class: 'wk-row', style: `--c:${THEMA_VAR[n]}` },
        h('div', { class: 'wk-head' }, h('span', { class: 'wk-name' }, n), h('span', { class: 'wk-n' }, l.length)),
        h('div', { class: 'wk-bar' }, h('i', { style: `width:${Math.round((l.length / maxN) * 100)}%` })),
        h('div', { class: 'wk-top' }, l.slice(0, 2).map((i) => h('a', { class: 'wk-item', href: safeUrl(i.url), target: '_blank', rel: 'noopener noreferrer' }, h('span', { class: 'wk-title' }, i.headline), h('span', { class: 'wk-src' }, `${weekdayName(i.date)} \u00B7 ${i.source} \u2197`)))))))) : null,

    praxis.length ? sec('Praxistipps der Woche', h('ul', { class: 'b-list' }, praxis.map((i) => h('li', null, title(i), withMore([dayTag(i), srcLink(i)], i))))) : null,
    kurios.length ? sec('Kurios & krass', h('ul', { class: 'b-list' }, kurios.map((i) => h('li', null, h('span', { class: 'k-hook' }, i.kurios), title(i), withMore([dayTag(i), srcLink(i)], i))))) : null,

    items.length ? sec('Die Woche in Zahlen',
      h('dl', { class: 'kv' },
        h('dt', null, 'Meldungen'), h('dd', null, `${items.length} (International ${items.filter((i) => i.region === 'intl').length}, Deutschland ${items.filter((i) => i.region === 'de').length})`),
        h('dt', null, 'Quellen'), h('dd', null, String(sourcesN)),
        h('dt', null, 'Mehrfach berichtet'), h('dd', null, `${items.filter((i) => i.also && i.also.length).length} Ereignisse bei mehreren Quellen`),
        tags.length ? [h('dt', null, 'Häufige Tags'), h('dd', null, tags.map(([t, n]) => `#${t} (${n})`).join(' · '))] : null)) : null,

    h('div', { class: 'brief-end' },
      h('div', { class: 'row actions' },
        h('a', { class: 'btn primary', href: '#/briefing' }, 'Zum Tages-Briefing'),
        h('a', { class: 'btn', href: '#/archiv?g=woche' }, 'Archiv nach Wochen'))));
}

/* ---------- Ansicht: Systemstatus ---------- */

async function viewStatus() {
  const index = await loadIndex();
  const [state, gl] = await Promise.all([getJSON('data/state.json').catch(() => null), loadGlossary().catch(() => [])]);
  if (!state) return render(h('h1', null, 'Status'), stateBox('Der Status konnte nicht geladen werden.'));
  const names = new Map();
  store.allItems.forEach((i) => names.set(i.source_id, i.source));
  const srcs = Object.entries(state.sources || {}).map(([id, s]) => ({ ...s, id, name: s.name || names.get(id) || id }));
  const ok = srcs.filter((s) => s.ok === true), bad = srcs.filter((s) => s.ok === false), off = srcs.filter((s) => s.ok === null);
  const last = state.last_success ? Date.parse(state.last_success) : 0;
  const ageH = last ? (Date.now() - last) / 3600000 : null;
  const level = ageH == null || ageH > 26 ? 'late' : bad.length ? 'warn' : 'ok';
  const msg = { ok: 'Alles in Ordnung', warn: `Läuft, aber ${bad.length} ${bad.length === 1 ? 'Quelle hat' : 'Quellen haben'} Fehler`, late: 'Der letzte erfolgreiche Lauf ist überfällig' }[level];
  const fmt = (iso) => (iso ? `${new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin' })} Uhr` : 'unbekannt');
  const dup = store.allItems.filter((i) => i.dup_of).length;
  const dates = store.dates;
  const order = (s) => (s.ok === false ? 0 : s.ok === true ? 1 : 2);

  render(
    h('h1', null, 'Systemstatus'),
    h('p', { class: 'sub' }, 'Zustand der täglichen Pipeline und der Quellen.'),
    h('div', { class: 'status-banner ' + level, role: 'status' },
      h('strong', null, msg),
      h('span', null, last ? `Letzter erfolgreicher Lauf ${relTime(last)}` : 'Noch kein erfolgreicher Lauf bekannt.'),
      level === 'late' ? h('span', null, 'Mögliche Ursachen: Der Mac war aus, oder die Claude-Anmeldung ist abgelaufen (claude auth login).') : null),

    h('section', { class: 'set-card' }, h('h2', null, 'Lauf'),
      h('dl', { class: 'kv' },
        h('dt', null, 'Erfolgreich'), h('dd', null, fmt(state.last_success)),
        h('dt', null, 'Lauf-Tag'), h('dd', null, state.last_run_date ? state.last_run_date.split('-').reverse().join('.') : 'unbekannt'),
        h('dt', null, 'Zeitplan'), h('dd', null, 'täglich 07:00, beim Anmelden und stündlich'),
        h('dt', null, 'Datenstand'), h('dd', null, fmt(index.updated)))),

    h('section', { class: 'set-card' }, h('h2', null, 'Quellen'),
      h('p', { class: 'set-text' }, `${ok.length} in Ordnung, ${bad.length} mit Fehler, ${off.length} deaktiviert.`),
      bad.length ? h('ul', { class: 'src-list problems' }, bad.map((s) => h('li', null, h('span', null, h('strong', null, s.name), h('br'), h('small', null, s.error || 'Fehler')), h('span', null, s.checked ? relTime(Date.parse(s.checked)) : '')))) : null,
      acc('Alle Quellen anzeigen', false,
        h('ul', { class: 'src-list' }, srcs.slice().sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name, 'de')).map((s) => h('li', null,
          h('span', { class: 'st-name' }, h('i', { class: 'st-dot ' + (s.ok === true ? 'ok' : s.ok === false ? 'fail' : 'off') }), s.name),
          h('span', null, s.ok === null ? 'deaktiviert' : `${s.new ?? 0} neu · ${s.checked ? relTime(Date.parse(s.checked)) : '?'}`)))))),

    h('section', { class: 'set-card' }, h('h2', null, 'Datenbestand'),
      h('dl', { class: 'kv' },
        h('dt', null, 'Meldungen'), h('dd', null, `${index.items.length} sichtbar, ${dup} Mehrfachmeldungen zusammengeführt`),
        h('dt', null, 'Zeitraum'), h('dd', null, dates.length ? `${fmtShort(dates[dates.length - 1])}${dates[dates.length - 1].slice(0, 4)} bis ${fmtShort(dates[0])}${dates[0].slice(0, 4)} (${dates.length} Tage)` : 'leer'),
        h('dt', null, 'Quellen'), h('dd', null, `${new Set(index.items.map((i) => i.source)).size} mit Meldungen im Archiv`),
        h('dt', null, 'Glossar'), h('dd', null, `${gl.length} Begriffe`))),

    h('div', { class: 'row actions' }, h('a', { class: 'btn', href: '#/einstellungen' }, 'Zu den Einstellungen')));
}

/* ---------- Router und Start ---------- */





async function route() {
  touchActive();
  const curHash = location.hash || '#/';
  const areaOf = (hsh) => (hsh.replace(/^#\//, '').split('?')[0].split('/')[0] || 'heute').replace(/^tag$/, 'heute');
  store.scrollMem = store.scrollMem || {};
  if (store.hashCur && store.hashCur !== curHash) {
    store.scrollMem[store.hashCur] = window.scrollY;
    if (areaOf(store.hashCur) !== areaOf(curHash)) store.hashPrev = store.hashCur;
  }
  const cameBack = !store.linkNav && !!store.hashCur && store.hashCur !== curHash && curHash in store.scrollMem;
  store.hashCur = curHash;
  if (store.briefAbort) { store.briefAbort.abort(); store.briefAbort = null; }
  if (!location.hash && getSettings().startBriefing && !store.startDone) { store.startDone = true; history.replaceState(null, '', '#/briefing'); }
  const { parts, q } = parseHash();
  const area = ['archiv', 'suche', 'merkliste', 'einstellungen', 'glossar', 'briefing', 'woche', 'status', 'aiti'].includes(parts[0]) ? parts[0] : 'heute';
  document.querySelectorAll('[data-nav]').forEach((a) => ((a.dataset.nav === (area === 'woche' ? 'briefing' : area) || ((area === 'briefing' || area === 'woche') && a.closest('.tabbar') && a.dataset.nav === 'heute')) ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  $app.classList.toggle('mode-week', area === 'woche');
  document.getElementById('gsearch').hidden = area === 'suche' || area === 'glossar' || area === 'briefing' || area === 'woche';
  const keepScroll = ['archiv', 'suche', 'merkliste', 'einstellungen', 'glossar'].includes(area) && route.last === area;
  route.last = area;
  try {
    if (area === 'archiv') await viewArchive(q);
    else if (area === 'suche') await viewSearch(q);
    else if (area === 'merkliste') viewFavs(q);
    else if (area === 'einstellungen') await viewSettings();
    else if (area === 'glossar') await viewGlossary(q);
    else if (area === 'briefing') await viewBriefing(q);
    else if (area === 'woche') await viewWeek(q);
    else if (area === 'status') await viewStatus();
    else if (area === 'aiti') await viewAiti();
    else await viewDay(parts[0] === 'tag' ? parts[1] : null, q);
  } catch (err) {
    console.error(err);
    render(stateBox('Die Nachrichten konnten nicht geladen werden. Bitte später erneut versuchen.'));
  }
  document.title = area === 'heute' ? 'KI News' : { archiv: 'Archiv', suche: 'Suche', merkliste: 'Merkliste', einstellungen: 'Einstellungen', glossar: 'Glossar', briefing: 'Briefing', woche: 'Die Woche in Kürze', status: 'Status', aiti: 'AITI' }[area] + ' | KI News';
  fitCards();
  if (cameBack || store.restore) window.scrollTo(0, store.scrollMem[curHash] || 0);
  else if (!keepScroll && !(area === 'glossar' && q.t)) window.scrollTo(0, 0);
  store.linkNav = false; store.restore = false;
}

/* Schriftgroesse (Standard 15px) */
const FS_STEPS = [12, 13, 14, 15, 16, 17, 18, 20];
const FS_DEFAULT = matchMedia('(max-width: 719px)').matches ? 14 : 15;
const $fsDown = document.getElementById('fs-down'), $fsUp = document.getElementById('fs-up');
function getFs() {
  try { const v = parseInt(localStorage.getItem('fs'), 10); if (FS_STEPS.includes(v)) return v; } catch (e) { /* kein Speicher */ }
  return FS_DEFAULT;
}
let fsNow = getFs();
function applyFs(v) {
  fsNow = v;
  document.documentElement.style.fontSize = v + 'px';
  $fsDown.disabled = v <= FS_STEPS[0];
  $fsUp.disabled = v >= FS_STEPS[FS_STEPS.length - 1];
  $fsDown.title = $fsUp.title = `Schriftgröße ${v} px`;
}
function stepFs(dir) {
  const v = FS_STEPS[Math.min(FS_STEPS.length - 1, Math.max(0, FS_STEPS.indexOf(fsNow) + dir))];
  try { localStorage.setItem('fs', String(v)); } catch (e) { /* privater Modus */ }
  applyFs(v);
}
$fsDown.addEventListener('click', () => stepFs(-1));
$fsUp.addEventListener('click', () => stepFs(1));
applyFs(fsNow);

/* Darstellung (Hell/Dunkel) */
const ICONS = {
  light: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/></svg>',
  dark: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
};
function currentTheme() {
  return document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
function paintTheme() {
  const btn = document.getElementById('theme');
  btn.innerHTML = currentTheme() === 'dark' ? ICONS.light : ICONS.dark;
  btn.setAttribute('aria-label', currentTheme() === 'dark' ? 'Helle Darstellung' : 'Dunkle Darstellung');
}
document.getElementById('theme').addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch (e) { /* privater Modus */ }
  paintTheme();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paintTheme);
paintTheme();

applySettings();
document.getElementById('gsearch').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('gq');
  const text = input.value.trim();
  input.value = '';
  input.blur();
  go('/suche', { q: text });
});
paintFavCount();
window.addEventListener('storage', (e) => { if (e.key === FAV_KEY) { favMem = null; paintFavCount(); if (route.last === 'merkliste') route(); } });
window.addEventListener('resize', () => fitCards());
document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('a[href^="#/"]')) store.linkNav = true; }, true);
window.addEventListener('hashchange', route);
route();

/* ---------- Offline ---------- */
(function () {
  const banner = document.getElementById('offline');
  const paint = () => { banner.hidden = navigator.onLine; };
  window.addEventListener('online', paint);
  window.addEventListener('offline', paint);
  paint();
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* z. B. privater Modus */ }); });
  }
})();

/* ---------- Neue Version erkennen ---------- */
(function () {
  let last = 0;
  function showUpdate() {
    if (document.getElementById('update')) return;
    const bar = h('button', { id: 'update', class: 'update-bar', type: 'button' }, 'Neue Version verfügbar. Tippen zum Aktualisieren');
    bar.addEventListener('click', async () => {
      try { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map((r) => r.update())); } catch (e) { /* ignorieren */ }
      location.reload();
    });
    document.body.prepend(bar);
  }
  async function check() {
    if (Date.now() - last < 120000 || !navigator.onLine) return;
    last = Date.now();
    try {
      const html = await (await fetch('index.html', { cache: 'no-store' })).text();
      const m = /app\.js\?v=(\d+)/.exec(html);
      if (m && Number(m[1]) > Number(BUILD)) showUpdate();
    } catch (e) { /* offline oder Fehler: nichts tun */ }
  }
  window.addEventListener('load', check);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
})();
