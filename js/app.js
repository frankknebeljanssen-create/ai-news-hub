'use strict';

const THEMEN = [
  ['Modelle und Produkte', 'modelle'], ['Forschung', 'forschung'], ['Business', 'business'],
  ['Politik und Regulierung', 'politik'], ['Weiterbildung DE', 'weiter'], ['Unternehmen DE', 'unternehmen'],
  ['Sicherheit und Ethik', 'sicherheit'],
];
const THEMA_SHORT = {
  'Modelle und Produkte': 'Technik', 'Forschung': 'Forschung', 'Business': 'Wirtschaft', 'Politik und Regulierung': 'Politik',
  'Weiterbildung DE': 'Bildung', 'Unternehmen DE': 'Unternehmen DE', 'Sicherheit und Ethik': 'Sicherheit & Ethik',
};
const THEMA_VAR = Object.fromEntries(THEMEN.map(([n, k]) => [n, `var(--t-${k})`]));
const REGIONEN = [['', 'Alle'], ['intl', 'International'], ['de', 'Deutschland']];
const PAGE = 30;

const $app = document.getElementById('app');
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
    store.dates = [...new Set(store.index.items.map((i) => i.date))].sort().reverse();
    store.byId = new Map(store.index.items.map((i) => [i.id, i]));
  }
  return store.index;
}

async function loadDay(date) {
  if (!(date in store.days)) {
    try { store.days[date] = await getJSON(`data/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}.json`); }
    catch { store.days[date] = null; }
  }
  return store.days[date];
}

/* ---------- Merkliste (nur localStorage, keine Server-Daten) ---------- */

const FAV_KEY = 'favs';
const FAV_FIELDS = ['id', 'date', 'published', 'headline', 'summary', 'thema', 'region', 'relevanz', 'tags', 'source', 'source_id', 'quelle_titel', 'url', 'kurios', 'praxis'];
let favMem = null;

function favLoad() {
  if (!favMem) {
    try { favMem = JSON.parse(localStorage.getItem(FAV_KEY)) || {}; } catch (e) { favMem = {}; }
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

/* ---------- Bausteine ---------- */


function chipRow(options, current, onPick, label) {
  return h('div', { class: 'chips', role: 'group', 'aria-label': label },
    options.map(([val, text]) => h('button', {
      class: 'chip', type: 'button', 'aria-pressed': String(val === current), onclick: () => onPick(val),
    }, text)));
}

function sourceSelect(current, onPick) {
  const counts = new Map();
  store.index.items.forEach((i) => counts.set(i.source, (counts.get(i.source) || 0) + 1));
  const names = [...counts.keys()].sort((a, b) => a.localeCompare(b, 'de'));
  return h('label', { class: 'field' }, 'Quelle',
    h('select', { onchange: (e) => onPick(e.target.value) },
      h('option', { value: '', selected: !current }, 'Alle Quellen'),
      names.map((n) => h('option', { value: n, selected: n === current }, `${n} (${counts.get(n)})`))));
}

function card(item, query) {
  const color = THEMA_VAR[item.thema] || 'var(--accent)';
  const mark = (txt) => (query ? highlight(txt, query) : txt);
  return h('article', { class: 'card', style: `--c:${color}` },
    h('div', { class: 'meta' },
      h('span', { class: 'tag-thema' }, item.thema),
      item.praxis ? h('span', { class: 'badge praxis' }, 'Praxistipp') : null,
      h('span', null, item.source),
      h('span', null, fmtShort(item.date)),
      item.region === 'de' ? h('span', { class: 'badge' }, 'DE') : null,
      h('span', { class: 'rel', title: `Relevanz ${item.relevanz} von 5`, 'aria-label': `Relevanz ${item.relevanz} von 5` }, '●'.repeat(item.relevanz)),
      starBtn(item)),
    h('h3', null, h('a', { href: safeUrl(item.url), target: '_blank', rel: 'noopener noreferrer' }, mark(item.headline))),
    h('p', null, mark(item.summary)),
    item.tags && item.tags.length ? h('div', { class: 'tags' }, item.tags.map((t) => h('span', null, '#' + t))) : null,
    h('a', { class: 'orig', href: safeUrl(item.url), target: '_blank', rel: 'noopener noreferrer', title: item.quelle_titel }, 'Quelle: ' + item.quelle_titel));
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
  const region = q.region || '';
  const day = await loadDay(date);
  const items = (day ? day.items : index.items.filter((i) => i.date === date)).filter((i) => !region || i.region === region);
  const pos = store.dates.indexOf(date);
  const stand = standText(index.updated);

  const nav = h('div', { class: 'daynav' },
    h('button', { class: 'btn', type: 'button', 'aria-label': 'Älterer Tag', disabled: pos >= store.dates.length - 1, onclick: () => go('/tag/' + store.dates[pos + 1], { region }) }, '‹'),
    h('div', { class: 'label' }, dayLabel(date)),
    h('button', { class: 'btn', type: 'button', 'aria-label': 'Neuerer Tag', disabled: pos <= 0, onclick: () => go(pos === 1 ? '/' : '/tag/' + store.dates[pos - 1], { region }) }, '›'));

  const top = ((day && day.overview) || []).map((o) => ({ o, item: store.byId.get(o.id) })).filter((x) => x.item && (!region || x.item.region === region));

  const kAll = index.items.filter((i) => i.kurios && (!region || i.region === region)).sort((a, b) => b.relevanz - a.relevanz || b.published.localeCompare(a.published));
  const kDay = kAll.filter((i) => i.date === date);
  const kWeek = kAll.filter((i) => i.date <= date && i.date >= dayShift(date, -6));
  const kScope = kDay.length >= 2 ? 'an diesem Tag' : 'in den letzten 7 Tagen';
  const kList = (kDay.length >= 2 ? kDay : kWeek).slice(0, 4);

  const sections = THEMEN.map(([name]) => [name, items.filter((i) => i.thema === name).sort((a, b) => b.relevanz - a.relevanz)]).filter(([, l]) => l.length);

  render(
    h('h1', null, 'KI-News'),
    h('p', { class: 'sub' }, h('span', { class: 'stand' + (stand.old ? ' old' : '') }, stand.text), ` · ${items.length} Meldungen an diesem Tag`),
    nav,
    chipRow(REGIONEN, region, (v) => go(dateArg ? '/tag/' + date : '/', { region: v }, true) || route(), 'Bereich'),
    top.length ? h('section', { class: 'top-stories', 'aria-labelledby': 'ts' },
      h('h2', { id: 'ts' }, 'Top-Stories'),
      h('ol', null, top.map(({ o, item }) => h('li', { style: `--c:${THEMA_VAR[item.thema] || 'var(--accent)'}` }, h('div', null,
        h('span', { class: 'ts-label' }, THEMA_SHORT[item.thema] || item.thema),
        item.praxis ? h('span', { class: 'ts-label praxis' }, 'Praxistipp') : null,
        h('p', null, o.text),
        h('a', { class: 'src', href: safeUrl(item.url), target: '_blank', rel: 'noopener noreferrer' }, `${item.source} ↗`)))))) : null,
    kList.length ? h('section', { class: 'kurios', 'aria-labelledby': 'kur' },
      h('div', { class: 'kurios-head' }, h('h2', { id: 'kur' }, 'Kurios & krass'), h('span', { class: 'k-scope' }, kScope)),
      h('ul', null, kList.map((i) => h('li', null,
        h('span', { class: 'k-hook' }, i.kurios),
        h('a', { class: 'k-title', href: safeUrl(i.url), target: '_blank', rel: 'noopener noreferrer' }, i.headline),
        h('span', { class: 'k-meta' }, `${i.source} · ${fmtShort(i.date)}`))))) : null,
    ...(sections.length ? sections.map(([name, list]) => h('section', { class: 'section', style: `--c:${THEMA_VAR[name]}` },
      h('div', { class: 'section-head' }, h('span', { class: 'dot' }), h('h2', null, name), h('span', { class: 'count' }, list.length)),
      list.map((i) => card(i)))) : [h('p', { class: 'empty' }, 'Keine Meldungen für diese Auswahl.')]),
    h('p', { class: 'foot' }, 'Eigene Kurzfassungen mit Link zur Quelle. Keine Volltexte.'));
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
const SORTS = [['neu', 'Neueste zuerst'], ['rel', 'Wichtigste zuerst']];
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
  const g = GROUPINGS.some(([k]) => k === q.g) ? q.g : 'woche';
  const sort = q.s === 'rel' ? 'rel' : 'neu';
  const f = { thema: q.thema || '', region: q.region || '', von: q.von || '', bis: q.bis || '', quelle: q.quelle || '', g, s: sort };
  const filtered = index.items.filter((i) =>
    (!f.thema || (f.thema === PRAXIS ? i.praxis : i.thema === f.thema)) && (!f.region || i.region === f.region) &&
    (!f.quelle || i.source === f.quelle) && (!f.von || i.date >= f.von) && (!f.bis || i.date <= f.bis))
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
    det.addEventListener('toggle', () => { if (det.open) fill(); });
    list.append(det);
  });
  const toggleAll = (open) => list.querySelectorAll('details').forEach((d) => { d.open = open; });
  const unit = { tag: 'Tagen', woche: 'Wochen', monat: 'Monaten', kategorie: 'Kategorien' }[g];
  const praxisN = index.items.filter((i) => i.praxis).length;

  render(
    h('h1', null, 'Archiv'),
    h('p', { class: 'sub' }, `${filtered.length} von ${index.items.length} Meldungen in ${groups.size} ${unit}`),
    h('div', { class: 'filters' },
      chipRow(GROUPINGS, g, (v) => set({ g: v }), 'Gruppierung'),
      chipRow(SORTS, sort, (v) => set({ s: v }), 'Sortierung'),
      chipRow([['', 'Alle Themen'], [PRAXIS, `Praxistipps & Tools (${praxisN})`], ...THEMEN.map(([n]) => [n, n])], f.thema, (v) => set({ thema: v }), 'Kategorie'),
      chipRow(REGIONEN, f.region, (v) => set({ region: v }), 'Bereich'),
      h('div', { class: 'row' },
        sourceSelect(f.quelle, (v) => set({ quelle: v })),
        h('label', { class: 'field' }, 'Von', h('input', { type: 'date', value: f.von, min: minD, max: maxD, onchange: (e) => set({ von: e.target.value }) })),
        h('label', { class: 'field' }, 'Bis', h('input', { type: 'date', value: f.bis, min: minD, max: maxD, onchange: (e) => set({ bis: e.target.value }) })),
        (f.thema || f.region || f.von || f.bis || f.quelle) ? h('button', { class: 'btn', type: 'button', onclick: () => { go('/archiv', { g, s: sort }, true); route(); } }, 'Zurücksetzen') : null)),
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
    entries.length > 1 ? chipRow([['', 'Alle Themen'], ...THEMEN.filter(([n]) => used.has(n)).map(([n]) => [n, n])], thema, (v) => { go('/merkliste', { thema: v }, true); route(); }, 'Thema') : null,
    ...(list.length ? list.map((e) => card(e.item)) : [h('p', { class: 'empty' }, entries.length ? 'Keine Einträge für dieses Thema.' : 'Noch nichts gemerkt. Tippe bei einer Meldung auf den Stern, um sie hier zu sammeln.')]));
}

/* ---------- Router und Start ---------- */


async function route() {
  const { parts, q } = parseHash();
  const area = ['archiv', 'suche', 'merkliste'].includes(parts[0]) ? parts[0] : 'heute';
  document.querySelectorAll('[data-nav]').forEach((a) => (a.dataset.nav === area ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  const keepScroll = ['archiv', 'suche', 'merkliste'].includes(area) && route.last === area;
  route.last = area;
  try {
    if (area === 'archiv') await viewArchive(q);
    else if (area === 'suche') await viewSearch(q);
    else if (area === 'merkliste') viewFavs(q);
    else await viewDay(parts[0] === 'tag' ? parts[1] : null, q);
  } catch (err) {
    console.error(err);
    render(stateBox('Die Nachrichten konnten nicht geladen werden. Bitte später erneut versuchen.'));
  }
  document.title = area === 'heute' ? 'KI-News Hub' : { archiv: 'Archiv', suche: 'Suche', merkliste: 'Merkliste' }[area] + ' | KI-News Hub';
  if (!keepScroll) window.scrollTo(0, 0);
}

/* Schriftgroesse (Standard 15px) */
const FS_STEPS = [12, 13, 14, 15, 16, 17, 18, 20];
const FS_DEFAULT = 15;
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

paintFavCount();
window.addEventListener('storage', (e) => { if (e.key === FAV_KEY) { favMem = null; paintFavCount(); if (route.last === 'merkliste') route(); } });
window.addEventListener('hashchange', route);
route();
