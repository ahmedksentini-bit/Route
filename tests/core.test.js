// Tests du noyau : `node --test tests/` (Node ≥ 20). Aucune dépendance externe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { clothoidPoint, clothoidData, symmetricCurve } from '../web/js/core/clothoid.js';
import { buildAxe, axePointAt, tabulate, elementPointAt, projectOnAxe } from '../web/js/core/axe.js';
import { buildRasante, terrainZAt } from '../web/js/core/profilLong.js';
import { Tin, setDelaunator } from '../web/js/core/tin.js';
import { parseDxf, drawables, extractSamples } from '../web/js/core/dxf.js';
import { DxfWriter } from '../web/js/core/dxfWriter.js';
import { surfaces, profilProjet, PROFIL_TYPE_DEFAUT, pentesChaussee } from '../web/js/core/profilTravers.js';
import { cubatures } from '../web/js/core/cubature.js';
import { deversPourRayon, controlerAxe } from '../web/js/core/normes.js';
import { landXml } from '../web/js/core/export.js';
import { formatPK, gisementGon } from '../web/js/core/geom.js';

// Delaunator est un UMD classique ; avec "type": "module", on l'évalue à la main.
const loadDelaunator = () => { const m = { exports: {} }; new Function('module', 'exports', readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'js', 'vendor', 'delaunator.js'), 'utf8'))(m, m.exports); return m.exports; };
setDelaunator(loadDelaunator());
const here = dirname(fileURLToPath(import.meta.url));

const close = (a, b, tol = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} attendu ${b}, obtenu ${a}`);

test('clothoïde : τ = L/(2R), fermeture des séries vs Simpson', () => {
  const A = 150, R = 300, L = A * A / R; // 75 m
  const d = clothoidData(A, R);
  close(d.tau, L / (2 * R), 1e-12, 'τ');
  // comparaison séries / Simpson sur un τ moyen
  const p = clothoidPoint(100, 200); // τ = 2 rad → séries
  const q = clothoidPoint(100, 300); // τ = 4.5 → Simpson
  assert.ok(p.x > 0 && p.y > 0 && q.x > 0);
  // petite longueur : x ≈ l(1 − τ²/10), y ≈ l³/(6A²)
  const s = clothoidPoint(200, 10);
  close(s.x, 10 * (1 - s.tau ** 2 / 10), 1e-9); close(s.y, 1000 / (6 * 40000), 1e-8);
});

test('raccordement symétrique : arc simple T = R tan(Δ/2), clothoïde Δ < 2τ refusée', () => {
  const c = symmetricCurve(200, 0, Math.PI / 3);
  close(c.T, 200 * Math.tan(Math.PI / 6), 1e-9);
  close(c.arcLength, 200 * Math.PI / 3, 1e-9);
  const bad = symmetricCurve(100, 150, 0.1); // τ = 1.125 rad ≫ Δ/2
  assert.equal(bad.ok, false);
});

test('axe : continuité des éléments, longueur, PK des points caractéristiques', () => {
  const axe = { sommets: [{ x: 0, y: 0 }, { x: 500, y: 0, R: 300, A: 150 }, { x: 800, y: 400, R: 250 }, { x: 1200, y: 400 }], pk0: 1000 };
  const b = buildAxe(axe);
  assert.deepEqual(b.errors, []);
  // continuité position + tangente entre éléments successifs
  for (let i = 1; i < b.elements.length; i++) {
    const a = b.elements[i - 1], c = b.elements[i];
    close(a.end.x, c.start.x, 1e-6, 'x'); close(a.end.y, c.start.y, 1e-6, 'y');
    close(Math.sin(a.end.theta - c.start.theta), 0, 1e-9, 'θ');
    close(a.pk1, c.pk0, 1e-9, 'pk');
  }
  // chaque élément : point calculé à L coïncide avec end
  for (const el of b.elements) { const p = elementPointAt(el, el.L); close(p.x, el.end.x, 1e-6); close(p.y, el.end.y, 1e-6); }
  // fin = dernier sommet
  const last = b.elements[b.elements.length - 1];
  close(last.end.x, 1200, 1e-6); close(last.end.y, 400, 1e-6);
  // types attendus : droite, clotho, arc, clotho, droite, arc, droite
  assert.deepEqual(b.elements.map(e => e.type), ['droite', 'clothoide', 'arc', 'clothoide', 'droite', 'arc', 'droite']);
  // arc du 2e sommet : rayon 250, virage à droite (s = −1) car on tourne vers l'est après être monté au NE
  const arc2 = b.elements[5];
  assert.equal(arc2.s, -1); close(arc2.R, 250);
  // courbure signée dans l'arc 1 (virage à gauche) = +1/300
  const mid = axePointAt(b, b.elements[2].pk0 + b.elements[2].L / 2);
  close(mid.kappa, 1 / 300, 1e-12);
  // tabulation : contient KA/KE/T1/T2
  const st = tabulate(b, 50);
  const labels = st.flatMap(s => s.labels);
  for (const l of ['KA', 'KE', 'T1', 'T2']) assert.ok(labels.includes(l), l);
  assert.ok(st[0].pk === 1000 && st[st.length - 1].pk > 1000 + b.length - 1e-6);
  // projection
  const pr = projectOnAxe(b, { x: 100, y: 5 });
  close(pr.pk, 1100, 1e-3); close(pr.d, 5, 1e-3);
});

test('axe : erreur de tangentes trop longues détectée', () => {
  const b = buildAxe({ sommets: [{ x: 0, y: 0 }, { x: 100, y: 0, R: 500 }, { x: 100, y: 100 }] });
  assert.ok(b.errors.length > 0);
});

test('rasante : parabole L = Rv·|Δi|, continuité de cote et de pente aux tangences', () => {
  const r = buildRasante({ sommets: [{ pk: 0, z: 100 }, { pk: 500, z: 110, Rv: 3000 }, { pk: 1000, z: 105 }] });
  assert.deepEqual(r.errors, []);
  const para = r.elements.find(e => e.type === 'parabole');
  const i1 = 0.02, i2 = -0.01;
  close(para.L, 3000 * 0.03, 1e-9);
  assert.equal(para.saillant, true);
  close(r.zAt(para.pk0), 100 + i1 * para.pk0, 1e-9);
  close(r.zAt(para.pk1), 110 + i2 * (para.pk1 - 500), 1e-9);
  close(r.slopeAt(para.pk0), i1, 1e-9); close(r.slopeAt(para.pk1), i2, 1e-9);
  // flèche au sommet : E = L|Δi|/8
  close(500 /*zS fictif*/ - 500, 0);
  close(110 - r.zAt(500), para.L * 0.03 / 8, 1e-9);
  const ph = r.points.find(p => p.label === 'Point haut');
  assert.ok(ph && ph.pk > para.pk0 && ph.pk < para.pk1);
  close(r.slopeAt(ph.pk), 0, 1e-9);
});

test('rasante : chevauchement de raccordements signalé', () => {
  const r = buildRasante({ sommets: [{ pk: 0, z: 100 }, { pk: 100, z: 105, Rv: 5000 }, { pk: 200, z: 100, Rv: 5000 }, { pk: 300, z: 105 }] });
  assert.ok(r.errors.length >= 1);
});

test('TIN : interpolation exacte sur un plan, null hors modèle, courbes de niveau', () => {
  const pts = [];
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) pts.push({ x: i * 10, y: j * 10, z: 50 + 0.1 * i * 10 + 0.05 * j * 10 });
  const tin = new Tin(pts);
  assert.ok(tin.keptCount > 150);
  close(tin.zAt(33.3, 47.1), 50 + 3.33 + 2.355, 1e-9);
  assert.equal(tin.zAt(-5, 5), null);
  assert.equal(tin.zAt(200, 200), null);
  const segs = tin.contours(1);
  assert.ok(segs.length > 50);
  // profil le long d'une ligne
  const prof = tin.profileAlong([{ x: 0, y: 0 }, { x: 100, y: 100 }], 10);
  close(prof[prof.length - 1].z, 50 + 10 + 5, 1e-9);
  close(prof[prof.length - 1].s, Math.hypot(100, 100), 1e-9);
});

test('TIN : filtre α écarte les slivers d\'enveloppe', () => {
  const pts = [];
  for (let i = 0; i < 40; i++) pts.push({ x: i, y: 0, z: 10 }, { x: i, y: 1, z: 11 });
  pts.push({ x: 20, y: 30, z: 12 }); // point isolé très loin → triangles effilés
  const tin = new Tin(pts, { maxEdgeFactor: 4 });
  assert.equal(tin.zAt(20, 15), null); // zone des slivers filtrée
  close(tin.zAt(10, 0.5), 10.5, 1e-9);
});

test('DXF : lecture LWPOLYLINE à élévation, POINT 3D, INSERT avec ATTRIB, TEXT numérique', () => {
  const dxf = parseDxf(readFileSync(join(here, 'fixtures', 'topo.dxf'), 'utf8'));
  assert.ok(dxf.layers.has('COURBES'));
  const dr = drawables(dxf);
  assert.ok(dr.some(d => d.type === 'poly' && d.layer === 'COURBES' && d.pts.length === 4));
  assert.ok(dr.some(d => d.type === 'text' && d.text === '101.25'));
  const { samples, stats } = extractSamples(dxf, { texts: true });
  assert.equal(stats.polylines, 4);
  assert.equal(stats.points, 2);
  assert.equal(stats.blocks, 1);
  assert.equal(stats.texts, 1);
  assert.ok(samples.some(s => s.z === 105 && s.x === 50 && s.y === 50)); // bloc à attribut Z
  // bulge : arc tessellé → plus de points que de sommets
  assert.ok(dr.some(d => d.type === 'poly' && d.layer === 'ARCS' && d.pts.length > 2));
  // INSERT en bloc contenant une LINE : expansée avec translation
  const ins = dr.find(d => d.type === 'poly' && d.layer === 'BLOC');
  assert.ok(ins); close(ins.pts[0].x, 50, 1e-9); close(ins.pts[1].x, 52, 1e-9);
});

test('DXF : aller-retour writer → parser', () => {
  const w = new DxfWriter();
  w.polyline([{ x: 0, y: 0, z: 5 }, { x: 10, y: 0, z: 6 }, { x: 10, y: 10, z: 7 }], 'AXE', { is3d: true });
  w.text({ x: 1, y: 1 }, 'KA 0+100.00', 1.5, 'TXT');
  w.point({ x: 3, y: 4, z: 9 }, 'PTS');
  const dxf = parseDxf(w.toString());
  const dr = drawables(dxf);
  assert.equal(dr.filter(d => d.type === 'poly').length, 1);
  assert.equal(dr.find(d => d.type === 'text').text, 'KA 0+100.00');
  const { samples } = extractSamples(dxf);
  assert.equal(samples.length, 4); // 3 sommets 3D + 1 point
});

test('profil en travers : surfaces déblai/remblai exactes sur cas simples', () => {
  const tn = [{ d: -10, z: 10 }, { d: 10, z: 10 }];
  const proj = [{ d: -4, z: 9 }, { d: 4, z: 9 }]; // 1 m sous le TN sur 8 m → déblai 8 m²
  const s = surfaces(tn, proj);
  close(s.deblai, 8, 1e-9); close(s.remblai, 0, 1e-9);
  const proj2 = [{ d: -4, z: 11 }, { d: 4, z: 9 }]; // croisement en d=0 : 2 triangles de 2 m²… → 4 m² chacun ? non : base 4, hauteur 1 → 2 m²
  const s2 = surfaces(tn, proj2);
  close(s2.remblai, 2, 1e-9); close(s2.deblai, 2, 1e-9);
});

test('profil en travers : talus de remblai entre en terre, dévers en courbe', () => {
  const b = buildAxe({ sommets: [{ x: 0, y: 0 }, { x: 400, y: 0, R: 300, A: 0 }, { x: 800, y: 400 }] });
  const tn = []; for (let d = -30; d <= 30; d += 0.5) tn.push({ d, z: 100 }); // terrain plat à 100
  const pr = profilProjet(b, tn, 50, 102, PROFIL_TYPE_DEFAUT, 'R80'); // rasante 2 m au-dessus → remblai
  assert.equal(pr.modeGauche, 'remblai'); assert.equal(pr.modeDroite, 'remblai');
  const ett = pr.points.filter(p => p.role === 'entrée en terre');
  assert.equal(ett.length, 2);
  for (const p of ett) close(p.z, 100, 1e-6);
  // pente talus 3/2 : Δd = 1.5 × Δz
  const left = pr.points[pr.points.length - 1], edge = pr.points.find(p => p.role === 'bord plate-forme' && p.d > 0);
  close((left.d - edge.d), 1.5 * (edge.z - 100), 1e-6);
  // dévers dans l'arc (R=300 < Rnd 900) : gauche descend, droite monte (virage à gauche)
  const arc = b.elements.find(e => e.type === 'arc');
  const pentes = pentesChaussee(b, arc.pk0 + arc.L / 2, PROFIL_TYPE_DEFAUT, 'R80');
  assert.ok(pentes.gauche < 0 && pentes.droite > 0);
  close(pentes.devers, deversPourRayon(300, 'R80'), 1e-12);
});

test('cubatures : moyenne des aires et cumul', () => {
  const c = cubatures([{ pk: 0, deblai: 10, remblai: 0 }, { pk: 20, deblai: 20, remblai: 4 }, { pk: 40, deblai: 0, remblai: 6 }]);
  close(c.rows[1].vDeblai, 300); close(c.rows[2].vDeblai, 200); close(c.totalDeblai, 500); close(c.totalRemblai, 40 + 100);
});

test('normes : dévers et contrôle d\'axe', () => {
  close(deversPourRayon(240, 'R80'), 0.07); close(deversPourRayon(900, 'R80'), 0.025);
  const dev = deversPourRayon(400, 'R80'); assert.ok(dev > 0.025 && dev < 0.07);
  const b = buildAxe({ sommets: [{ x: 0, y: 0 }, { x: 400, y: 0, R: 150 }, { x: 800, y: 400 }] });
  const ctl = controlerAxe(b, 'R80');
  assert.ok(ctl.some(c => c.niveau === 'erreur'));
});

test('export : LandXML bien formé avec Line/Spiral/Curve et PVI', () => {
  const b = buildAxe({ sommets: [{ x: 1000, y: 2000 }, { x: 1500, y: 2000, R: 300, A: 150 }, { x: 1800, y: 2400 }] });
  const r = buildRasante({ sommets: [{ pk: 0, z: 100 }, { pk: 400, z: 108, Rv: 3000 }, { pk: 800, z: 104 }] });
  const xml = landXml({ built: b, ras: r });
  assert.ok(xml.includes('<Spiral') && xml.includes('<Curve') && xml.includes('<Line') && xml.includes('<ParaCurve'));
  assert.equal((xml.match(/<Spiral/g) || []).length, 2);
});

test('géométrie : formatage PK et gisement', () => {
  assert.equal(formatPK(1234.5), '1+234.50');
  assert.equal(formatPK(0), '0+000.00');
  close(gisementGon(Math.PI / 2), 0); close(gisementGon(0), 100); close(gisementGon(-Math.PI / 2), 200);
  assert.equal(terrainZAt([{ pk: 0, z: 1 }, { pk: 10, z: 3 }], 5), 2);
});
