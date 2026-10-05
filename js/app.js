'use strict';

const THEMEN = [
  ['Modelle und Produkte', 'modelle'], ['Forschung', 'forschung'], ['Business', 'business'],
  ['Politik und Regulierung', 'politik'], ['Weiterbildung DE', 'weiter'], ['Unternehmen DE', 'unternehmen'],
  ['Sicherheit und Ethik', 'sicherheit'],
];
const THEMA_VAR = Object.fromEntries(THEMEN.map(([n, k]) => [n, `var(--t-${k})`]));
const REGIONEN = [['', 'Alle'], ['intl', 'International'], ['de', 'Deutschland']];
const PAGE = 30;

const $app = document.getElementById('app');
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

/* ---------- Bausteine ---------- */

function chipRow(options, current, onPick, label) {
  return h('div', { class: 'chips', role: 'group', 'aria-label': label },
    options.map(([val, text]) => h('button', {
      class: 'chip', type: 'button', 'aria-pressed': String(val === current), onclick: () => onPick(val),
    }, text)));
}

function card(item, query) {
  const color = THEMA_VAR[item.thema] || 'var(--accent)';
  const mark = (txt) => (query ? highlight(txt, query) : txt);
  return h('article', { class: 'card', style: `--c:${color}` },
    h('div', { class: 'meta' },
      h('span', { class: 'tag-thema' }, item.thema),
      h('span', null, item.source),
      h('span', null, fmtShort(item.date)),
      item.region === 'de' ? h('span', { class: 'badge' }, 'DE') : null,
      h('span', { class: 'rel', title: `Relevanz ${item.relevanz} von 5`, 'aria-label': `Relevanz ${item.relevanz} von 5` }, '●'.repeat(item.relevanz))),
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
  if (!store.dates.length) return $app.replaceChildren(stateBox('Noch keine Nachrichten vorhanden.'));
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

  const sections = THEMEN.map(([name]) => [name, items.filter((i) => i.thema === name).sort((a, b) => b.relevanz - a.relevanz)]).filter(([, l]) => l.length);

  $app.replaceChildren(
    h('h1', null, 'KI-News'),
    h('p', { class: 'sub' }, h('span', { class: 'stand' + (stand.old ? ' old' : '') }, stand.text), ` · ${items.length} Meldungen an diesem Tag`),
    nav,
    chipRow(REGIONEN, region, (v) => go(dateArg ? '/tag/' + date : '/', { region: v }, true) || route(), 'Bereich'),
    top.length ? h('section', { class: 'top-stories', 'aria-labelledby': 'ts' },
      h('h2', { id: 'ts' }, 'Top-Stories'),
      h('ol', null, top.map(({ o, item }) => h('li', null, h('div', null,
        h('p', null, o.text),
        h('a', { class: 'src', href: safeUrl(item.url), target: '_blank', rel: 'noopener noreferrer' }, `${item.source} ↗`)))))) : null,
    ...(sections.length ? sections.map(([name, list]) => h('section', { class: 'section', style: `--c:${THEMA_VAR[name]}` },
      h('div', { class: 'section-head' }, h('span', { class: 'dot' }), h('h2', null, name), h('span', { class: 'count' }, list.length)),
      list.map((i) => card(i)))) : [h('p', { class: 'empty' }, 'Keine Meldungen für diese Auswahl.')]),
    h('p', { class: 'foot' }, 'Eigene Kurzfassungen mit Link zur Quelle. Keine Volltexte.'));
}

/* ---------- Ansicht: Archiv ---------- */

async function viewArchive(q) {
  const index = await loadIndex();
  const f = { thema: q.thema || '', region: q.region || '', von: q.von || '', bis: q.bis || '' };
  const filtered = index.items.filter((i) =>
    (!f.thema || i.thema === f.thema) && (!f.region || i.region === f.region) &&
    (!f.von || i.date >= f.von) && (!f.bis || i.date <= f.bis))
    .sort((a, b) => b.published.localeCompare(a.published));
  const limit = Math.max(PAGE, parseInt(q.n, 10) || PAGE);
  const set = (patch) => { go('/archiv', { ...f, ...patch, n: '' }, true); route(); };

  const minD = store.dates[store.dates.length - 1], maxD = store.dates[0];
  const list = h('div');
  let last = '';
  filtered.slice(0, limit).forEach((i) => {
    if (i.date !== last) { last = i.date; list.append(h('h2', { class: 'group-date' }, dayLabel(i.date))); }
    list.append(card(i));
  });

  $app.replaceChildren(
    h('h1', null, 'Archiv'),
    h('p', { class: 'sub' }, `${filtered.length} von ${index.items.length} Meldungen`),
    h('div', { class: 'filters' },
      chipRow([['', 'Alle Themen'], ...THEMEN.map(([n]) => [n, n])], f.thema, (v) => set({ thema: v }), 'Thema'),
      chipRow(REGIONEN, f.region, (v) => set({ region: v }), 'Bereich'),
      h('div', { class: 'row' },
        h('label', { class: 'field' }, 'Von', h('input', { type: 'date', value: f.von, min: minD, max: maxD, onchange: (e) => set({ von: e.target.value }) })),
        h('label', { class: 'field' }, 'Bis', h('input', { type: 'date', value: f.bis, min: minD, max: maxD, onchange: (e) => set({ bis: e.target.value }) })),
        (f.thema || f.region || f.von || f.bis) ? h('button', { class: 'btn', type: 'button', onclick: () => { go('/archiv', {}, true); route(); } }, 'Zurücksetzen') : null)),
    filtered.length ? list : h('p', { class: 'empty' }, 'Keine Meldungen für diese Filter.'),
    filtered.length > limit ? h('button', { class: 'btn primary more', type: 'button', onclick: () => { go('/archiv', { ...f, n: limit + PAGE }, true); route(); } }, `Mehr laden (${filtered.length - limit})`) : null);
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
  const results = h('div');
  const status = h('p', { class: 'sub' });

  const render = (text) => {
    results.replaceChildren();
    const hits = text.length >= 2 ? store.fuse.search(text).map((r) => r.item).filter((i) => !region || i.region === region).slice(0, 80) : [];
    status.textContent = text.length < 2 ? `Suche in ${index.items.length} Meldungen (Titel, Text, Tags, Quelle).` : `${hits.length} Treffer`;
    if (text.length >= 2 && !hits.length) results.append(h('p', { class: 'empty' }, 'Keine Treffer.'));
    hits.forEach((i) => results.append(card(i, text)));
  };

  const input = h('input', { type: 'search', value: query, placeholder: 'Suchen, z. B. AI Act, OpenAI, Weiterbildung', 'aria-label': 'Suchbegriff', autocomplete: 'off', enterkeyhint: 'search' });
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { go('/suche', { q: input.value.trim(), region }, true); render(input.value.trim()); }, 160);
  });

  $app.replaceChildren(
    h('h1', null, 'Suche'),
    h('div', { class: 'filters' }, input, chipRow(REGIONEN, region, (v) => { go('/suche', { q: input.value.trim(), region: v }, true); route(); }, 'Bereich')),
    status, results);
  render(query);
  if (!query) input.focus({ preventScroll: true });
}

/* ---------- Router und Start ---------- */

async function route() {
  const { parts, q } = parseHash();
  const area = parts[0] === 'archiv' ? 'archiv' : parts[0] === 'suche' ? 'suche' : 'heute';
  document.querySelectorAll('[data-nav]').forEach((a) => (a.dataset.nav === area ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  const keepScroll = ['archiv', 'suche'].includes(area) && route.last === area;
  route.last = area;
  try {
    if (area === 'archiv') await viewArchive(q);
    else if (area === 'suche') await viewSearch(q);
    else await viewDay(parts[0] === 'tag' ? parts[1] : null, q);
  } catch (err) {
    console.error(err);
    $app.replaceChildren(stateBox('Die Nachrichten konnten nicht geladen werden. Bitte später erneut versuchen.'));
  }
  const t = document.title.split(' | ')[0];
  document.title = area === 'heute' ? 'KI-News Hub' : (area === 'archiv' ? 'Archiv' : 'Suche') + ' | ' + t;
  if (!keepScroll) window.scrollTo(0, 0);
}

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

window.addEventListener('hashchange', route);
route();
