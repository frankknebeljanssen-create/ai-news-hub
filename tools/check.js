#!/usr/bin/env node
/* Schnellpruefung vor dem Veroeffentlichen: Syntax, JSON, Kern-Dateien des Service Workers, Versionsnummern. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.resolve(__dirname, '..');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FEHLER ') + m); if (!c) fails++; };

for (const f of ['sw.js', 'js/app.js', 'js/modelle.js']) {
  try { execFileSync(process.execPath, ['--check', path.join(root, f)]); ok(true, `${f} Syntax`); } catch (e) { ok(false, `${f} Syntax`); }
}
for (const f of ['content/glossar.json', 'content/modelle.json', 'data/index.json', 'data/recent.json', 'data/archive.json', 'data/state.json', 'manifest.webmanifest']) {
  try { JSON.parse(fs.readFileSync(path.join(root, f), 'utf8')); ok(true, `${f} gueltig`); } catch (e) { ok(false, `${f} ungueltig`); }
}
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const core = (sw.match(/const CORE = \[(.*?)\];/s) || [, ''])[1].match(/'([^']+)'/g) || [];
for (const c of core.map((s) => s.slice(1, -1))) {
  const p = c.split('?')[0];
  if (p === './') continue;
  ok(fs.existsSync(path.join(root, p)), `Kern-Datei vorhanden: ${p}`);
}
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const vers = [...html.matchAll(/(?:js|css)\/[\w.\/-]+\?v=(\d+)/g)].map((m) => m[1]);
ok(vers.length >= 3 && new Set(vers).size === 1, `Versionsnummern einheitlich (${[...new Set(vers)].join(',')})`);
const refs = [...html.matchAll(/(?:src|href)="((?:js|css)\/[^"?]+)/g)].map((m) => m[1]);
refs.forEach((r) => ok(fs.existsSync(path.join(root, r)), `eingebunden und vorhanden: ${r}`));
ok(!/[—–]/.test(fs.readFileSync(path.join(root, 'content/modelle.json'), 'utf8')), 'keine Gedankenstriche in modelle.json');
console.log(fails ? `\n${fails} Pruefung(en) fehlgeschlagen` : '\nalle Pruefungen bestanden');
process.exit(fails ? 1 : 0);
