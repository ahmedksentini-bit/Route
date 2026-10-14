// export.js — sorties : DXF du tracé en plan, DXF du profil en long, DXF des profils
// en travers, LandXML 1.2 (axe + profil + surface TIN), CSV de tabulation.

import { DxfWriter } from './dxfWriter.js';
import { axePolyline, axePointAt } from './axe.js';
import { formatPK, gisementGon } from './geom.js';

/** DXF du plan : axe, bords, polygonale, points caractéristiques, stations, (option) TIN. */
export function dxfPlan({ built, axe, stations, profilType, tin, contoursStep }) {
  const w = new DxfWriter();
  w.layer('AXE', 1); w.layer('BORD_CHAUSSEE', 3); w.layer('BORD_PLATEFORME', 8); w.layer('POLYGONALE', 9);
  w.layer('POINTS_CARACT', 2); w.layer('STATIONS', 7); w.layer('TEXTES', 7); w.layer('TIN', 252); w.layer('COURBES', 6);
  w.polyline(axePolyline(built, 1), 'AXE');
  if (profilType) {
    const w1 = profilType.demiChaussee, w2 = w1 + profilType.accotement;
    for (const d of [w1, -w1]) w.polyline(axePolyline(built, 1, d), 'BORD_CHAUSSEE');
    for (const d of [w2, -w2]) w.polyline(axePolyline(built, 1, d), 'BORD_PLATEFORME');
  }
  w.polyline(axe.sommets.map(s => ({ x: s.x, y: s.y })), 'POLYGONALE');
  for (const p of built.points) {
    w.point(p, 'POINTS_CARACT');
    w.text({ x: p.x + 1, y: p.y + 1 }, `${p.label} ${formatPK(p.pk)}`, 1.5, 'TEXTES');
  }
  if (stations) for (const st of stations) {
    const a = axePointAt(built, st.pk, 3), b = axePointAt(built, st.pk, -3);
    w.line(a, b, 'STATIONS');
    w.text({ x: a.x + 0.5, y: a.y + 0.5 }, formatPK(st.pk), 1, 'TEXTES', st.theta * 180 / Math.PI);
  }
  if (tin) {
    if (contoursStep) for (const s of tin.contours(contoursStep)) w.line(s.a, s.b, 'COURBES');
    else for (const [a, b, c] of tin.keptTriangles()) w.polyline([a, b, c], 'TIN', { closed: true, is3d: true });
  }
  return w.toString();
}

/** DXF du profil en long : x = PK, y = z × exagération, plan de comparaison, TN, rasante, grille. */
export function dxfProfilLong({ built, terrain, ras, exag = 10, planComp = null }) {
  const w = new DxfWriter();
  w.layer('TN', 8); w.layer('RASANTE', 1); w.layer('CADRE', 7); w.layer('TEXTES', 7); w.layer('COTES', 2);
  const zs = terrain.filter(p => p.z !== null).map(p => p.z);
  const zMin = Math.min(...zs, ...(ras ? ras.sommets.map(s => s.z) : []));
  const pc = planComp ?? Math.floor(zMin / 5) * 5 - 5;
  const Y = (z) => (z - pc) * exag;
  const X = (pk) => pk - built.pk0;
  const tn = terrain.filter(p => p.z !== null).map(p => ({ x: X(p.pk), y: Y(p.z) }));
  w.polyline(tn, 'TN');
  if (ras) {
    const pts = [];
    for (let pk = ras.pk0; pk <= ras.pk1; pk += 1) pts.push({ x: X(pk), y: Y(ras.zAt(pk)) });
    pts.push({ x: X(ras.pk1), y: Y(ras.zAt(ras.pk1)) });
    w.polyline(pts, 'RASANTE');
    for (const p of ras.points) {
      w.line({ x: X(p.pk), y: 0 }, { x: X(p.pk), y: Y(p.z) }, 'COTES');
      w.text({ x: X(p.pk) + 0.5, y: Y(p.z) + 2 }, `${p.label} ${formatPK(p.pk)} z=${p.z.toFixed(2)}`, 1.5, 'TEXTES', 90);
    }
  }
  w.line({ x: 0, y: 0 }, { x: X(built.pk1), y: 0 }, 'CADRE');
  w.text({ x: 0, y: -4 }, `Plan de comparaison ${pc.toFixed(2)} m — échelle verticale ×${exag}`, 2, 'TEXTES');
  for (let pk = built.pk0; pk <= built.pk1 + 1e-9; pk += 100) {
    w.line({ x: X(pk), y: -2 }, { x: X(pk), y: 0 }, 'CADRE');
    w.text({ x: X(pk) - 3, y: -8 }, formatPK(pk, 0), 1.5, 'TEXTES');
  }
  return w.toString();
}

/** DXF des profils en travers : chaque profil dans une case (colonnes), échelle 1:1. */
export function dxfProfilsTravers({ profils, exag = 1, cols = 4 }) {
  const w = new DxfWriter();
  w.layer('TN', 8); w.layer('PROJET', 1); w.layer('CADRE', 7); w.layer('TEXTES', 7);
  let i = 0;
  const cellW = 2 * Math.max(...profils.map(p => Math.max(...p.tn.map(t => Math.abs(t.d))))) + 10;
  const cellH = 25;
  for (const pr of profils) {
    const col = i % cols, row = Math.floor(i / cols);
    const ox = col * cellW, oy = -row * cellH;
    const zs = pr.tn.filter(t => t.z !== null).map(t => t.z);
    if (zs.length === 0) { i++; continue; }
    const pc = Math.floor(Math.min(...zs, pr.zAxe ?? Infinity) / 2) * 2 - 2;
    // d croissant = gauche ; dessiné gauche à gauche → x = ox − d
    const P = (d, z) => ({ x: ox - d + cellW / 2, y: oy + (z - pc) * exag });
    w.polyline(pr.tn.filter(t => t.z !== null).map(t => P(t.d, t.z)), 'TN');
    if (pr.projet) w.polyline(pr.projet.points.map(q => P(q.d, q.z)), 'PROJET');
    w.line({ x: ox, y: oy }, { x: ox + cellW, y: oy }, 'CADRE');
    const s = pr.surfaces ? ` D=${pr.surfaces.deblai.toFixed(2)} m² R=${pr.surfaces.remblai.toFixed(2)} m²` : '';
    w.text({ x: ox + 1, y: oy - 3 }, `PK ${formatPK(pr.pk)}  PC ${pc.toFixed(2)}${s}`, 1, 'TEXTES');
    i++;
  }
  return w.toString();
}

const az = (theta) => { let d = (90 - theta * 180 / Math.PI) % 360; if (d < 0) d += 360; return d; };
const ne = (p) => `${p.y.toFixed(4)} ${p.x.toFixed(4)}`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** LandXML 1.2 : Alignment (Line/Spiral/Curve) + Profile (PVI/ParaCurve) + Surface TIN. */
export function landXml({ name = 'Axe', built, ras, tin }) {
  const L = [];
  L.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  L.push(`<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2" version="1.2" date="${new Date().toISOString().slice(0, 10)}" time="${new Date().toISOString().slice(11, 19)}">`);
  L.push(`<Units><Metric linearUnit="meter" areaUnit="squareMeter" volumeUnit="cubicMeter" temperatureUnit="celsius" pressureUnit="HPA" angularUnit="decimal degrees" directionUnit="decimal degrees"/></Units>`);
  L.push(`<Application name="Route (ksr-infra.org)" version="0.1"/>`);
  if (built && built.elements.length) {
    L.push(`<Alignments><Alignment name="${esc(name)}" length="${built.length.toFixed(4)}" staStart="${built.pk0.toFixed(4)}"><CoordGeom>`);
    for (const el of built.elements) {
      const rot = el.s > 0 ? 'ccw' : 'cw';
      if (el.type === 'droite') L.push(`<Line length="${el.L.toFixed(4)}" dir="${az(el.start.theta).toFixed(6)}"><Start>${ne(el.start)}</Start><End>${ne(el.end)}</End></Line>`);
      else if (el.type === 'arc') L.push(`<Curve rot="${rot}" radius="${el.R.toFixed(4)}" length="${el.L.toFixed(4)}" dirStart="${az(el.start.theta).toFixed(6)}" dirEnd="${az(el.end.theta).toFixed(6)}"><Start>${ne(el.start)}</Start><Center>${ne(el.center)}</Center><End>${ne(el.end)}</End></Curve>`);
      else {
        const entree = el.sens === 'entree';
        // PI = intersection des tangentes de début et de fin
        const t0 = el.start.theta, t1 = el.end.theta;
        const d0 = { x: Math.cos(t0), y: Math.sin(t0) }, d1 = { x: Math.cos(t1), y: Math.sin(t1) };
        const det = d0.x * d1.y - d0.y * d1.x;
        const dx = el.end.x - el.start.x, dy = el.end.y - el.start.y;
        const t = Math.abs(det) > 1e-12 ? (dx * d1.y - dy * d1.x) / det : el.L / 2;
        const PI = { x: el.start.x + t * d0.x, y: el.start.y + t * d0.y };
        L.push(`<Spiral length="${el.L.toFixed(4)}" radiusStart="${entree ? 'INF' : el.R.toFixed(4)}" radiusEnd="${entree ? el.R.toFixed(4) : 'INF'}" rot="${rot}" spiType="clothoid" theta="${(el.tau * 180 / Math.PI).toFixed(6)}" dirStart="${az(t0).toFixed(6)}" dirEnd="${az(t1).toFixed(6)}"><Start>${ne(el.start)}</Start><PI>${ne(PI)}</PI><End>${ne(el.end)}</End></Spiral>`);
      }
    }
    L.push(`</CoordGeom>`);
    if (ras && ras.sommets.length >= 2) {
      L.push(`<Profile name="${esc(name)}"><ProfAlign name="Rasante">`);
      ras.sommets.forEach((s, i) => {
        const para = ras.elements.find(e => e.type === 'parabole' && Math.abs(e.pkS - s.pk) < 1e-6);
        if (i > 0 && i < ras.sommets.length - 1 && para) L.push(`<ParaCurve length="${para.L.toFixed(4)}">${s.pk.toFixed(4)} ${s.z.toFixed(4)}</ParaCurve>`);
        else L.push(`<PVI>${s.pk.toFixed(4)} ${s.z.toFixed(4)}</PVI>`);
      });
      L.push(`</ProfAlign></Profile>`);
    }
    L.push(`</Alignment></Alignments>`);
  }
  if (tin && tin.keptCount > 0) {
    L.push(`<Surfaces><Surface name="TN"><Definition surfType="TIN"><Pnts>`);
    tin.points.forEach((p, i) => L.push(`<P id="${i + 1}">${p.y.toFixed(4)} ${p.x.toFixed(4)} ${p.z.toFixed(4)}</P>`));
    L.push(`</Pnts><Faces>`);
    const T = tin.triangles;
    for (let t = 0; t < tin.keep.length; t++) if (tin.keep[t]) L.push(`<F>${T[3 * t] + 1} ${T[3 * t + 1] + 1} ${T[3 * t + 2] + 1}</F>`);
    L.push(`</Faces></Definition></Surface></Surfaces>`);
  }
  L.push(`</LandXML>`);
  return L.join('\n');
}

/** CSV de tabulation de l'axe. */
export function tabulationCsv(stations, terrain, ras) {
  const h = ['N', 'PK', 'Point', 'X', 'Y', 'Gisement (gon)', 'Rayon (m)', 'Element', 'Z TN', 'Z projet', 'Hauteur'];
  const lines = [h.join(';')];
  for (const st of stations) {
    const zt = terrain ? interp(terrain, st.pk) : null;
    const zp = ras ? ras.zAt(st.pk) : null;
    lines.push([st.n, st.pk.toFixed(2), st.labels.join(' '), st.x.toFixed(3), st.y.toFixed(3), gisementGon(st.theta).toFixed(4),
      Number.isFinite(st.R) ? st.R.toFixed(2) : '', st.type, zt === null ? '' : zt.toFixed(2), zp === null ? '' : zp.toFixed(2),
      zt === null || zp === null ? '' : (zp - zt).toFixed(2)].join(';'));
  }
  return lines.join('\r\n');
}

function interp(terrain, pk) {
  let lo = 0, hi = terrain.length - 1;
  if (pk < terrain[0].pk || pk > terrain[hi].pk) return null;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (terrain[m].pk <= pk) lo = m; else hi = m; }
  const a = terrain[lo], b = terrain[hi];
  if (a.z === null || b.z === null) return null;
  return b.pk === a.pk ? a.z : a.z + (b.z - a.z) * (pk - a.pk) / (b.pk - a.pk);
}
