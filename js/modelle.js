/* ---------- Ansicht: Modelle (Steckbriefe, Vergleich, Diagramme) ---------- */
/* Daten: content/modelle.json. Diagramme sind reines SVG ohne Fremdbibliothek. */

const MDL = { data: null, tab: 'steck', filter: '', metric: 'preis_out', scatterX: 'preis_out', scatterY: 'ai_index', donut: 'anbieter', cmp: [] };
try { MDL.cmp = (JSON.parse(localStorage.getItem('mdlCmp')) || []).slice(-4); } catch (e) { MDL.cmp = []; }

const ANBIETER_FARBE = {
  Anthropic: '#d9774f', OpenAI: '#10a37f', Google: '#4285f4', xAI: '#7a7f87', Meta: '#00b8d9', Mistral: '#ff7a00',
  DeepSeek: '#4d6bfe', Alibaba: '#7b61ff', Moonshot: '#e0457b', Zhipu: '#8d6e63', 'Reflection AI': '#9b59b6', Cohere: '#c2a000',
};
const mFarbe = (m) => ANBIETER_FARBE[m.anbieter] || '#8a9199';
const HERKUNFT = { Anthropic: 'USA', OpenAI: 'USA', Google: 'USA', xAI: 'USA', Meta: 'USA', 'Reflection AI': 'USA', Cohere: 'Kanada', Mistral: 'EU', 'Aleph Alpha': 'EU', DeepSeek: 'China', Alibaba: 'China', Moonshot: 'China', Zhipu: 'China' };

const fmtTok = (n) => (n == null ? '–' : n >= 1e6 ? `${(n / 1e6).toLocaleString('de-DE', { maximumFractionDigits: 2 })} Mio` : n >= 1e3 ? `${Math.round(n / 1e3).toLocaleString('de-DE')} Tsd` : String(n));
const fmtUsd = (n) => (n == null ? '–' : `$${n.toLocaleString('de-DE', { minimumFractionDigits: n < 10 && n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`);
const fmtPct = (n) => (n == null ? '–' : `${n.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`);
const fmtNum = (n) => (n == null ? '–' : n.toLocaleString('de-DE', { maximumFractionDigits: 1 }));

const mu = (m) => m.unabhaengig || {};
const mb = (m) => m.benchmarks || {};
const METRIKEN = [
  { k: 'preis_in', t: 'Preis Input', u: 'USD je Mio Token', low: true, get: (m) => m.preis_in, fmt: fmtUsd, grp: 'Kosten' },
  { k: 'preis_out', t: 'Preis Output', u: 'USD je Mio Token', low: true, get: (m) => m.preis_out, fmt: fmtUsd, grp: 'Kosten' },
  { k: 'kontext', t: 'Kontextfenster', u: 'Token', get: (m) => m.kontext, fmt: fmtTok, grp: 'Umfang' },
  { k: 'max_output', t: 'Max. Ausgabe', u: 'Token', get: (m) => m.max_output, fmt: fmtTok, grp: 'Umfang' },
  { k: 'ai_index', t: 'Intelligence Index (Artificial Analysis)', u: 'Punkte', get: (m) => mu(m).ai_index, fmt: fmtNum, grp: 'Leistung' },
  { k: 'gpqa', t: 'GPQA Diamond', u: '%', get: (m) => mb(m).gpqa_diamond, fmt: fmtPct, grp: 'Leistung' },
  { k: 'swe', t: 'SWE-bench Verified', u: '%', get: (m) => mu(m).swe_bench_verified ?? mb(m).swe_bench_verified, fmt: fmtPct, grp: 'Leistung' },
  { k: 'mmlu', t: 'MMLU-Pro', u: '%', get: (m) => mb(m).mmlu_pro, fmt: fmtPct, grp: 'Leistung' },
  { k: 'aime', t: 'AIME 2025', u: '%', get: (m) => mb(m).aime_2025, fmt: fmtPct, grp: 'Leistung' },
  { k: 'speed', t: 'Geschwindigkeit', u: 'Token je Sekunde', get: (m) => mu(m).tokens_pro_sekunde, fmt: fmtNum, grp: 'Tempo' },
];
const metr = (k) => METRIKEN.find((x) => x.k === k);

/* ----- kleine SVG-Helfer ----- */
const SVGNS = 'http://www.w3.org/2000/svg';
function s(tag, attrs, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null && v !== false) el.setAttribute(k, v);
  kids.flat().forEach((c) => { if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c))); });
  return el;
}

function legend(models) {
  const used = [...new Set(models.map((m) => m.anbieter))];
  return h('div', { class: 'mdl-legend' }, used.map((a) => h('span', null, h('i', { style: `background:${ANBIETER_FARBE[a] || '#8a9199'}` }), a)));
}

/* Balkendiagramm (waagerecht), sortiert, bester Wert oben */
function barChart(models, met) {
  const rows = models.map((m) => ({ m, v: met.get(m) })).filter((r) => r.v != null).sort((a, b) => (met.low ? a.v - b.v : b.v - a.v));
  if (!rows.length) return h('p', { class: 'empty' }, 'Für diese Kennzahl liegen noch keine belegten Werte vor.');
  const max = Math.max(...rows.map((r) => r.v));
  return h('div', { class: 'mdl-bars', role: 'list' }, rows.map(({ m, v }, i) => h('div', { class: 'mdl-bar', role: 'listitem' },
    h('span', { class: 'mdl-bar-name' }, m.name),
    h('span', { class: 'mdl-bar-track' }, h('i', { style: `width:${Math.max(2, (v / max) * 100)}%;background:${mFarbe(m)}` })),
    h('b', { class: i === 0 ? 'best' : null }, met.fmt(v)))));
}

/* Streudiagramm: zwei Kennzahlen gegeneinander, Preis logarithmisch */
/* Beschriftungen ohne Ueberlappung: je Punkt rechts, links, oben oder unten probieren */
function labelPoints(list, W, H, L, R, T, B) {
  const placed = [];
  const hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  const dots = list.map(({ p, cx, cy }) => s('circle', { cx, cy, r: 6.5, fill: mFarbe(p.m), 'fill-opacity': '.9', stroke: 'var(--surface)', 'stroke-width': 2 }, s('title', null, p.m.name)));
  list.forEach(({ cx, cy }) => placed.push({ x0: cx - 8, x1: cx + 8, y0: cy - 8, y1: cy + 8 }));
  const texts = [...list].sort((a, b) => a.cy - b.cy).map(({ p, cx, cy }) => {
    const name = p.m.name.replace(/\s*\(.*?\)/, '');
    const w = name.length * 6.1 + 4;
    const cands = [['start', cx + 10, cy + 4, cx + 9, cx + 11 + w, cy - 8, cy + 6], ['end', cx - 10, cy + 4, cx - 11 - w, cx - 9, cy - 8, cy + 6],
      ['middle', cx, cy - 11, cx - w / 2, cx + w / 2, cy - 22, cy - 9], ['middle', cx, cy + 20, cx - w / 2, cx + w / 2, cy + 9, cy + 22]];
    const pick = cands.find((c) => c[3] >= L - 30 && c[4] <= W - 2 && c[5] >= T - 6 && c[6] <= H - B + 6 && !placed.some((r) => hit({ x0: c[3], x1: c[4], y0: c[5], y1: c[6] }, r))) || cands[0];
    placed.push({ x0: pick[3], x1: pick[4], y0: pick[5], y1: pick[6] });
    return s('text', { x: pick[1], y: pick[2], class: 'lbl', 'text-anchor': pick[0] }, name);
  });
  return s('g', null, dots, texts);
}

function scatterChart(models, mx, my) {
  const pts = models.map((m) => ({ m, x: mx.get(m), y: my.get(m) })).filter((p) => p.x != null && p.y != null && (!mx.low || p.x > 0));
  if (pts.length < 2) return h('p', { class: 'empty' }, 'Für diese Kombination liegen zu wenige Werte vor.');
  const W = 440, H = 440, L = 46, R = 14, T = 14, B = 52;
  const logX = mx.k.startsWith('preis') || mx.k === 'kontext';
  const fx = (v) => (logX ? Math.log10(v) : v);
  const xs = pts.map((p) => fx(p.x)), ys = pts.map((p) => p.y);
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const padX = (x1 - x0 || 1) * 0.08, padY = (y1 - y0 || 1) * 0.1;
  x0 -= padX; x1 += padX; y0 -= padY; y1 += padY;
  const X = (v) => L + ((fx(v) - x0) / (x1 - x0)) * (W - L - R);
  const Y = (v) => H - B - ((v - y0) / (y1 - y0)) * (H - T - B);
  const ticks = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
  const yt = ticks(y0, y1, 4);
  const xt = logX ? [...new Set(pts.map((p) => Math.floor(fx(p.x))))].concat(Math.ceil(x1)).filter((e) => e >= x0 && e <= x1).sort((a, b) => a - b).map((e) => 10 ** e) : ticks(x0, x1, 4);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'mdl-svg', role: 'img', 'aria-label': `${my.t} gegen ${mx.t}` },
    yt.map((v) => s('g', null, s('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), class: 'grid' }), s('text', { x: L - 8, y: Y(v) + 4, class: 'tick', 'text-anchor': 'end' }, my.fmt(y1 - y0 > 15 ? Math.round(v) : Math.round(v * 10) / 10).replace(' %', '')))),
    xt.map((v) => s('g', null, s('line', { x1: X(v), x2: X(v), y1: T, y2: H - B, class: 'grid' }), s('text', { x: X(v), y: H - B + 18, class: 'tick', 'text-anchor': 'middle' }, mx.fmt(logX ? v : Math.round(v * 10) / 10).replace(' %', '')))),
    s('text', { x: (L + W - R) / 2, y: H - 6, class: 'axis', 'text-anchor': 'middle' }, `${mx.t}${logX ? ' (logarithmisch)' : ''}${mx.low ? ', links ist günstiger' : ''}`),
    s('text', { x: 12, y: (T + H - B) / 2, class: 'axis', 'text-anchor': 'middle', transform: `rotate(-90 12 ${(T + H - B) / 2})` }, my.t),
    labelPoints(pts.map((p) => ({ p, cx: X(p.x), cy: Y(p.y) })), W, H, L, R, T, B));
  return h('div', { class: 'mdl-scatter' }, svg);
}

/* Kreisdiagramm (Ring) mit Legende und Anzahl */
function donutChart(models, by) {
  const keyOf = { anbieter: (m) => m.anbieter, typ: (m) => (m.typ === 'open weights' ? 'Offene Gewichte' : 'Proprietär'), herkunft: (m) => HERKUNFT[m.anbieter] || 'Andere' }[by];
  const cnt = new Map();
  models.forEach((m) => cnt.set(keyOf(m), (cnt.get(keyOf(m)) || 0) + 1));
  const parts = [...cnt.entries()].sort((a, b) => b[1] - a[1]);
  const total = models.length;
  const pal = ['#26595E', '#2f6bff', '#e8a317', '#d9483b', '#20b26b', '#9b59b6', '#14a0b8', '#e0457b', '#8a9199'];
  const colorOf = (name, i) => (by === 'anbieter' ? ANBIETER_FARBE[name] || pal[i % pal.length] : by === 'typ' ? (name === 'Proprietär' ? '#26595E' : '#20b26b') : pal[i % pal.length]);
  const R = 70, r = 42, C = 100;
  let a0 = -Math.PI / 2;
  const arcs = parts.map(([name, n], i) => {
    const a1 = a0 + (n / total) * Math.PI * 2 - (parts.length > 1 ? 0.012 : 0);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rad, a) => `${C + rad * Math.cos(a)} ${C + rad * Math.sin(a)}`;
    const d = parts.length === 1 ? `M ${C} ${C - R} A ${R} ${R} 0 1 1 ${C - 0.01} ${C - R} L ${C - 0.01} ${C - r} A ${r} ${r} 0 1 0 ${C} ${C - r} Z` : `M ${p(R, a0)} A ${R} ${R} 0 ${large} 1 ${p(R, a1)} L ${p(r, a1)} A ${r} ${r} 0 ${large} 0 ${p(r, a0)} Z`;
    a0 += (n / total) * Math.PI * 2;
    return s('path', { d, fill: colorOf(name, i) }, s('title', null, `${name}: ${n}`));
  });
  const svg = s('svg', { viewBox: '0 0 200 200', class: 'mdl-donut', role: 'img', 'aria-label': 'Verteilung der Modelle' }, arcs,
    s('text', { x: C, y: C + 2, 'text-anchor': 'middle', class: 'donut-n' }, total), s('text', { x: C, y: C + 18, 'text-anchor': 'middle', class: 'donut-l' }, 'Modelle'));
  return h('div', { class: 'mdl-donut-wrap' }, svg,
    h('ul', { class: 'mdl-donut-leg' }, parts.map(([name, n], i) => h('li', null, h('i', { style: `background:${colorOf(name, i)}` }), h('span', null, name), h('b', null, `${n} (${Math.round((n / total) * 100)} %)`)))));
}

/* ----- Steckbrief-Karte ----- */
const BENCH_ZEILEN = ['gpqa', 'swe', 'mmlu', 'aime', 'ai_index'];

function fact(label, value) {
  return h('div', { class: 'fact' }, h('dt', null, label), h('dd', null, value));
}

function steckbrief(m) {
  const on = MDL.cmp.includes(m.id);
  const bench = BENCH_ZEILEN.map((k) => [metr(k), metr(k).get(m)]).filter(([, v]) => v != null);
  const cmpBtn = h('button', { class: 'btn small', type: 'button', 'aria-pressed': String(on), onclick: () => { toggleCmp(m.id); redoModelle(); } }, on ? '✓ Im Vergleich' : '+ Vergleichen');
  return h('article', { class: 'mdl-card', style: `--c:${mFarbe(m)}` },
    h('header', null,
      h('div', null, h('h3', null, m.name), h('p', { class: 'mdl-sub' }, `${m.anbieter} · ${m.release ? m.release.split('-').reverse().join('/') : ''}`)),
      h('span', { class: 'badge' + (m.typ === 'open weights' ? ' open' : '') }, m.typ === 'open weights' ? 'Offene Gewichte' : 'Proprietär')),
    h('dl', { class: 'facts' },
      fact('Preis Input', m.preis_in != null ? `${fmtUsd(m.preis_in)} je Mio` : '–'),
      fact('Preis Output', m.preis_out != null ? `${fmtUsd(m.preis_out)} je Mio` : '–'),
      fact('Kontextfenster', fmtTok(m.kontext)),
      fact('Max. Ausgabe', fmtTok(m.max_output)),
      fact('Reasoning', m.reasoning === true ? 'Ja' : m.reasoning === false ? 'Nein' : m.reasoning ? String(m.reasoning) : '–'),
      fact('Wissensstand', m.wissensstand || '–'),
      m.params ? fact('Parameter', m.params) : null,
      fact('Eingaben', (m.modalitaeten || []).join(', ') || '–')),
    bench.length ? h('div', { class: 'mdl-mini' }, h('h4', null, 'Leistung'), bench.map(([me, v]) => {
      const pct = me.u === '%' ? v : null;
      return h('div', { class: 'mini-row' }, h('span', null, me.t.replace(' (Artificial Analysis)', '').replace(' (LMArena)', '')),
        pct != null ? h('span', { class: 'mini-track' }, h('i', { style: `width:${Math.min(100, pct)}%` })) : h('span', { class: 'mini-track none' }), h('b', null, me.fmt(v)));
    }), m.benchmark_quelle ? h('p', { class: 'mdl-note' }, `Quelle der Werte: ${m.benchmark_quelle}`) : null) : null,
    m.staerken && m.staerken.length ? h('div', { class: 'tags' }, m.staerken.map((t) => h('span', null, t))) : null,
    m.hinweis ? h('p', { class: 'mdl-hint' }, m.hinweis) : null,
    h('div', { class: 'row-meta' },
      cmpBtn,
      (m.quellen || []).slice(0, 2).map((u, i) => h('a', { class: 'b-src', href: safeUrl(u), target: '_blank', rel: 'noopener noreferrer' }, `Quelle ${i + 1} ↗`))));
}

function toggleCmp(id) {
  MDL.cmp = MDL.cmp.includes(id) ? MDL.cmp.filter((x) => x !== id) : [...MDL.cmp, id].slice(-4);
  try { localStorage.setItem('mdlCmp', JSON.stringify(MDL.cmp)); } catch (e) { /* ignorieren */ }
}

/* ----- Vergleichstabelle ----- */
function vergleich(models) {
  const sel = MDL.cmp.map((id) => models.find((m) => m.id === id)).filter(Boolean);
  const picker = h('div', { class: 'chips wrap', role: 'group', 'aria-label': 'Modelle auswählen' },
    models.map((m) => h('button', { class: 'chip', type: 'button', style: `--c:${mFarbe(m)}`, 'aria-pressed': String(MDL.cmp.includes(m.id)), onclick: () => { toggleCmp(m.id); redoModelle(); } }, m.name)));
  if (sel.length < 2) return [h('p', { class: 'set-text' }, 'Wähle mindestens zwei Modelle (bis zu vier) zum Vergleichen aus.'), picker];
  const rows = [];
  let lastGrp = '';
  METRIKEN.forEach((me) => {
    const vals = sel.map((m) => me.get(m));
    if (vals.every((v) => v == null)) return;
    const nums = vals.filter((v) => v != null);
    const best = nums.length > 1 ? (me.low ? Math.min(...nums) : Math.max(...nums)) : null;
    if (me.grp !== lastGrp) { rows.push(h('tr', { class: 'grp' }, h('th', { colspan: sel.length + 1 }, me.grp))); lastGrp = me.grp; }
    rows.push(h('tr', null, h('th', { scope: 'row' }, h('span', null, me.t), h('small', null, me.u)),
      vals.map((v) => h('td', { class: v != null && v === best ? 'best' : null }, v == null ? '–' : me.fmt(v)))));
  });
  const textRow = (label, fn) => h('tr', null, h('th', { scope: 'row' }, label), sel.map((m) => h('td', null, fn(m))));
  return [picker,
    h('div', { class: 'mdl-table-wrap' }, h('table', { class: 'mdl-table' },
      h('thead', null, h('tr', null, h('th', null, ''), sel.map((m) => h('th', { scope: 'col', style: `--c:${mFarbe(m)}` }, h('span', { class: 'dot', style: `background:${mFarbe(m)}` }), m.name)))),
      h('tbody', null,
        h('tr', { class: 'grp' }, h('th', { colspan: sel.length + 1 }, 'Allgemein')),
        textRow('Anbieter', (m) => m.anbieter), textRow('Release', (m) => m.release || '–'), textRow('Lizenz', (m) => (m.typ === 'open weights' ? 'Offene Gewichte' : 'Proprietär')),
        textRow('Eingaben', (m) => (m.modalitaeten || []).join(', ') || '–'), textRow('Reasoning', (m) => (m.reasoning === true ? 'Ja' : m.reasoning === false ? 'Nein' : m.reasoning || '–')),
        rows))),
    h('p', { class: 'mdl-note' }, 'Grün markiert ist der beste Wert je Zeile (bei Preisen der niedrigste). Fehlende Werte sind nicht belegt.')];
}

/* ----- Diagramme ----- */
function diagramme(models) {
  // Nur Kennzahlen mit Werten für mindestens 5 Modelle: sonst wäre der Vergleich lückenhaft
  const enough = (me) => models.filter((m) => me.get(m) != null).length >= 5;
  const opts = METRIKEN.filter(enough).map((me) => [me.k, me.t]);
  if (!opts.some(([k]) => k === MDL.metric)) MDL.metric = 'preis_out';
  const mx = metr(MDL.scatterX), my = metr(MDL.scatterY);
  const metOpts = (list) => list.map((me) => [me.k, me.t]);
  return [
    h('section', { class: 'set-card' }, h('h2', null, 'Balkenvergleich'),
      selectField('Kennzahl', opts, MDL.metric, (v) => { MDL.metric = v; redoModelle(); }),
      h('p', { class: 'set-text' }, `${metr(MDL.metric).t} (${metr(MDL.metric).u})${metr(MDL.metric).low ? ', weniger ist besser' : ''}`),
      barChart(models, metr(MDL.metric)), legend(models)),
    h('section', { class: 'set-card' }, h('h2', null, 'Preis und Leistung'),
      h('div', { class: 'filter-grid' },
        selectField('Querachse (x)', metOpts(METRIKEN.filter((me) => enough(me) && ['preis_in', 'preis_out', 'kontext', 'speed'].includes(me.k))), MDL.scatterX, (v) => { MDL.scatterX = v; redoModelle(); }),
        selectField('Hochachse (y)', metOpts(METRIKEN.filter((me) => enough(me) && ['ai_index', 'gpqa', 'swe', 'mmlu', 'aime', 'speed'].includes(me.k))), MDL.scatterY, (v) => { MDL.scatterY = v; redoModelle(); })),
      scatterChart(models, mx, my), legend(models)),
    h('section', { class: 'set-card' }, h('h2', null, 'Verteilung der Modelle'),
      chipRow([['anbieter', 'Anbieter'], ['typ', 'Lizenz'], ['herkunft', 'Herkunft']], MDL.donut, (v) => { MDL.donut = v; redoModelle(); }, 'Gruppieren nach'),
      donutChart(models, MDL.donut))];
}

let redoModelle = () => {};

async function viewModelle() {
  if (!MDL.data) MDL.data = await getJSON('content/modelle.json');
  const all = MDL.data.modelle || [];
  const anbieter = [...new Set(all.map((m) => m.anbieter))];
  const models = all.filter((m) => !MDL.filter || m.anbieter === MDL.filter);
  redoModelle = () => { viewModelle(); };
  render(
    h('h1', null, 'Modelle'),
    h('p', { class: 'sub' }, `Stand ${MDL.data.stand ? MDL.data.stand.split('-').reverse().join('.') : ''}`),
    chipRow([['steck', 'Steckbriefe'], ['vergleich', 'Vergleich'], ['charts', 'Diagramme']], MDL.tab, (v) => { MDL.tab = v; viewModelle(); }, 'Ansicht'),
    h('div', { class: 'mdl-filter' }, selectField('Anbieter', [['', `Alle Anbieter (${all.length})`], ...anbieter.map((a) => [a, `${a} (${all.filter((m) => m.anbieter === a).length})`])], MDL.filter, (v) => { MDL.filter = v; viewModelle(); })),
    MDL.tab === 'steck' ? h('div', { class: 'mdl-grid' }, models.map(steckbrief)) : null,
    ...(MDL.tab === 'vergleich' ? vergleich(models) : []),
    ...(MDL.tab === 'charts' ? diagramme(models) : []),
    h('section', { class: 'set-card mdl-disclaimer' }, h('h2', null, 'Hinweise zu den Zahlen'),
      h('p', { class: 'set-text' }, 'Preise und Kontextfenster stammen von den Anbieterseiten und ändern sich häufig. Benchmarkwerte sind teils Herstellerangaben und nur bedingt vergleichbar, unabhängige Werte sind als solche gekennzeichnet. Fehlende Angaben sind nicht belegt. Bitte vor Entscheidungen die Originalquellen prüfen.'),
      MDL.data.quellen && MDL.data.quellen.length ? h('p', { class: 'set-text' }, 'Unabhängige Quellen: ', ...MDL.data.quellen.flatMap((q, i) => [i ? ' · ' : '', h('a', { href: safeUrl(q.url), target: '_blank', rel: 'noopener noreferrer' }, q.name)])) : null));
}
