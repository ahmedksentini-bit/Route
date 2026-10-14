// Fumée UI sous jsdom (facultatif : `npm i -D jsdom` puis `node --test tests/ui.smoke.test.js`).
// Charge index.html + main.js avec un canvas factice, importe un DXF de test, trace un axe,
// une rasante, et parcourt les onglets / exports pour attraper les erreurs d'exécution.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
let JSDOM;
try { ({ JSDOM } = require('jsdom')); } catch { JSDOM = null; }

test('UI : import DXF, axe, rasante, onglets, exports sans exception', { skip: !JSDOM && 'jsdom absent' }, async () => {
  const html = readFileSync(join(here, '..', 'web', 'index.html'), 'utf8');
  const { VirtualConsole } = require('jsdom');
  const jsErrors = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', (e) => jsErrors.push(e)); vc.on('error', (m) => console.error(m));
  const dom = new JSDOM(html, { pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc });
  const { window } = dom;
  const calls = [];
  const ctxProxy = new Proxy({}, { get: (_, k) => (k === 'measureText' ? () => ({ width: 10 }) : (...a) => { calls.push(k); }), set: () => true });
  window.HTMLCanvasElement.prototype.getContext = () => ctxProxy;
  window.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({ width: 800, height: 600, left: 0, top: 0 });
  window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 800, height: 600, left: 0, top: 0 });
  window.ResizeObserver = class { observe() {} disconnect() {} };
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.confirm = () => true;
  globalThis.window = window; globalThis.document = window.document; globalThis.localStorage = window.localStorage; globalThis.confirm = window.confirm;
  globalThis.ResizeObserver = window.ResizeObserver;
  globalThis.URL.createObjectURL = () => 'blob:x'; globalThis.URL.revokeObjectURL = () => {};
  const m = { exports: {} }; new Function('module', 'exports', readFileSync(join(here, '..', 'web', 'js', 'vendor', 'delaunator.js'), 'utf8'))(m, m.exports);
  globalThis.Delaunator = m.exports;
  const downloads = [];
  window.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };

  await import(pathToFileURL(join(here, '..', 'web', 'js', 'main.js')).href);
  const $ = (id) => window.document.getElementById(id);
  assert.ok($('categorie').options.length >= 4);

  // import DXF via File
  const dxfText = readFileSync(join(here, 'fixtures', 'grid.dxf'), 'utf8');
  const file = new window.File([dxfText], 'grid.dxf', { type: 'application/dxf' });
  file.text = async () => dxfText;
  const input = $('fileDxf');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new window.Event('change'));
  await new Promise(r => setTimeout(r, 200));
  assert.match($('tinInfo').textContent, /triangles conservés/);

  // axe par le mode clic (coordonnées écran → monde via le viewport ; on passe par la table)
  $('modeAddSommet').click();
  const cv = $('cvPlan');
  const ev = (type, x, y) => cv.dispatchEvent(new window.PointerEvent(type, { clientX: x, clientY: y, button: 0, pointerId: 1, bubbles: true }));
  cv.setPointerCapture = () => {};
  for (const [x, y] of [[100, 300], [400, 320], [700, 250]]) { ev('pointerdown', x, y); ev('pointerup', x, y); }
  await new Promise(r => setTimeout(r, 50));
  assert.equal($('tblSommets').querySelectorAll('tbody tr').length, 3);
  // rayon sur le sommet 1
  const rInput = $('tblSommets').querySelector('tbody tr:nth-child(2) input[data-k=R]');
  rInput.value = '150'; rInput.dispatchEvent(new window.Event('change'));
  assert.match($('axeElements').textContent, /arc/);
  // rasante auto
  $('btnRasAuto').click();
  assert.equal($('tblRasante').querySelectorAll('tbody tr').length, 2);
  // onglets
  for (const v of ['pl', 'pt', 'tab', 'cub', 'plan']) { window.document.querySelector(`.main-tabs button[data-view=${v}]`).click(); await new Promise(r => setTimeout(r, 10)); }
  assert.ok($('tblTab').querySelectorAll('tbody tr').length > 3);
  assert.match($('cubSummary').textContent, /Déblai/);
  // exports
  for (const b of window.document.querySelectorAll('[data-export]')) b.click();
  assert.ok(downloads.some(d => d.endsWith('_plan.dxf')) && downloads.some(d => d.endsWith('.xml')));
  // sauvegarde / rechargement
  $('btnSave').click();
  assert.ok(downloads.some(d => d.endsWith('.route.json')));
  assert.ok(calls.length > 100, 'le canvas a été dessiné');
  assert.match($('ptInfo').textContent, /déblai/);
  assert.deepEqual(jsErrors.map(e => String(e.detail || e.message)), [], 'erreurs dans les gestionnaires d\'événements');
});
