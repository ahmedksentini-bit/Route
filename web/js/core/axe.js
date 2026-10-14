// axe.js — tracé en plan : polygonale de sommets + raccordements symétriques
// (arc simple ou clothoïde–arc–clothoïde) → suite d'éléments stationnés en PK.
//
// Modèle d'entrée :  { sommets: [{x, y, R?, A?}, …], pk0?: number }
//   R, A sont lus sur les sommets intermédiaires uniquement (A = 0 ou absent → arc simple).
// Modèle de sortie : { ok, errors[], elements[], length, points[] (points caractéristiques) }
//   element = { type: 'droite'|'clothoide'|'arc', pk0, pk1, L, s (±1 : +gauche), R, A,
//               start:{x,y,theta}, end:{x,y,theta}, … paramètres propres }
// Convention de signe : s = +1 pour un virage à gauche (sens trigonométrique).

import { heading, normAngle, dist } from './geom.js';
import { clothoidPoint, symmetricCurve } from './clothoid.js';

const EPS = 1e-9;

function unit(theta) {
  return { x: Math.cos(theta), y: Math.sin(theta) };
}
function leftNormal(theta) {
  return { x: -Math.sin(theta), y: Math.cos(theta) };
}

/** Construit les éléments de l'axe. */
export function buildAxe(axe) {
  const S = axe.sommets || [];
  const pkStart = Number(axe.pk0) || 0;
  const errors = [];
  const elements = [];
  const points = [];
  if (S.length < 2) return { ok: false, errors: ['au moins deux sommets'], elements, length: 0, points };

  // 1) raccordement à chaque sommet intermédiaire
  const curves = new Array(S.length).fill(null);
  for (let i = 1; i < S.length - 1; i++) {
    const thIn = heading(S[i - 1], S[i]);
    const thOut = heading(S[i], S[i + 1]);
    const delta = normAngle(thOut - thIn);
    const R = Number(S[i].R) || 0;
    const A = Number(S[i].A) || 0;
    if (Math.abs(delta) < 1e-9 || R <= 0) {
      if (R <= 0 && Math.abs(delta) > 1e-6) errors.push(`sommet ${i} : pas de rayon (déflexion ${(delta * 180 / Math.PI).toFixed(2)}°)`);
      continue;
    }
    const c = symmetricCurve(R, A, delta);
    if (!c.ok) { errors.push(`sommet ${i} : ${c.reason}`); continue; }
    curves[i] = { ...c, thIn, thOut, delta, s: delta > 0 ? 1 : -1 };
  }
  // 2) contrôle des tangentes
  for (let i = 1; i < S.length - 1; i++) {
    if (!curves[i]) continue;
    const dPrev = dist(S[i - 1], S[i]);
    const dNext = dist(S[i], S[i + 1]);
    const tPrev = curves[i - 1] ? curves[i - 1].T : 0;
    const tNext = curves[i + 1] ? curves[i + 1].T : 0;
    if (curves[i].T + tPrev > dPrev + 1e-6) errors.push(`sommet ${i} : tangentes trop longues côté amont (${(curves[i].T + tPrev).toFixed(2)} m > ${dPrev.toFixed(2)} m)`);
    if (curves[i].T + tNext > dNext + 1e-6) errors.push(`sommet ${i} : tangentes trop longues côté aval (${(curves[i].T + tNext).toFixed(2)} m > ${dNext.toFixed(2)} m)`);
  }

  // 3) parcours
  let pk = pkStart;
  let P = { x: S[0].x, y: S[0].y };
  let thetaP = heading(S[0], S[1]);
  const pushDroite = (from, to, theta) => {
    const L = dist(from, to);
    if (L < EPS) return;
    elements.push({ type: 'droite', pk0: pk, pk1: pk + L, L, s: 0, R: Infinity, A: 0,
      start: { x: from.x, y: from.y, theta }, end: { x: to.x, y: to.y, theta } });
    pk += L;
  };
  points.push({ pk, label: 'Origine', x: P.x, y: P.y });

  for (let i = 1; i < S.length - 1; i++) {
    const c = curves[i];
    if (!c) { // sommet sans raccordement : simple changement de direction (angle vif)
      pushDroite(P, S[i], thetaP);
      P = { x: S[i].x, y: S[i].y };
      thetaP = heading(S[i], S[i + 1]);
      points.push({ pk, label: `S${i} (angle vif)`, x: P.x, y: P.y });
      continue;
    }
    const uIn = unit(c.thIn), nIn = leftNormal(c.thIn);
    const uOut = unit(c.thOut), nOut = leftNormal(c.thOut);
    const s = c.s, R = c.R, A = c.A;
    const KA = { x: S[i].x - c.T * uIn.x, y: S[i].y - c.T * uIn.y };
    const KA2 = { x: S[i].x + c.T * uOut.x, y: S[i].y + c.T * uOut.y };
    pushDroite(P, KA, c.thIn);
    const sommetPk = pk + c.T; // PK du sommet "virtuel" (prolongement de la tangente)

    if (A > 0) {
      // clothoïde d'entrée
      const Lc = c.L;
      const p = clothoidPoint(A, Lc);
      const KE1 = { x: KA.x + p.x * uIn.x + s * p.y * nIn.x, y: KA.y + p.x * uIn.y + s * p.y * nIn.y };
      const thKE1 = c.thIn + s * c.tau;
      elements.push({ type: 'clothoide', sens: 'entree', pk0: pk, pk1: pk + Lc, L: Lc, s, R, A, tau: c.tau,
        origin: KA, theta0: c.thIn, start: { ...KA, theta: c.thIn }, end: { ...KE1, theta: thKE1 } });
      points.push({ pk, label: 'KA', x: KA.x, y: KA.y });
      pk += Lc;
      points.push({ pk, label: 'KE', x: KE1.x, y: KE1.y });
      // arc
      const n1 = leftNormal(thKE1);
      const C = { x: KE1.x + s * R * n1.x, y: KE1.y + s * R * n1.y };
      const La = c.arcLength;
      const thKE2 = thKE1 + s * c.arcAngle;
      const n2 = leftNormal(thKE2);
      const KE2 = { x: C.x - s * R * n2.x, y: C.y - s * R * n2.y };
      elements.push({ type: 'arc', pk0: pk, pk1: pk + La, L: La, s, R, A, center: C, angle: c.arcAngle,
        start: { ...KE1, theta: thKE1 }, end: { ...KE2, theta: thKE2 } });
      pk += La;
      points.push({ pk, label: 'KE', x: KE2.x, y: KE2.y });
      // clothoïde de sortie (paramétrée depuis KA2 à rebours)
      elements.push({ type: 'clothoide', sens: 'sortie', pk0: pk, pk1: pk + Lc, L: Lc, s, R, A, tau: c.tau,
        origin: KA2, theta0: c.thOut, start: { ...KE2, theta: thKE2 }, end: { ...KA2, theta: c.thOut } });
      pk += Lc;
      points.push({ pk, label: 'KA', x: KA2.x, y: KA2.y });
    } else {
      const C = { x: KA.x + s * R * nIn.x, y: KA.y + s * R * nIn.y };
      const La = c.arcLength;
      elements.push({ type: 'arc', pk0: pk, pk1: pk + La, L: La, s, R, A: 0, center: C, angle: c.arcAngle,
        start: { ...KA, theta: c.thIn }, end: { ...KA2, theta: c.thOut } });
      points.push({ pk, label: 'T1', x: KA.x, y: KA.y });
      pk += La;
      points.push({ pk, label: 'T2', x: KA2.x, y: KA2.y });
    }
    points.push({ pk: sommetPk, label: `S${i}`, x: S[i].x, y: S[i].y, sommet: true });
    P = KA2;
    thetaP = c.thOut;
  }
  const last = S[S.length - 1];
  pushDroite(P, last, thetaP);
  points.push({ pk, label: 'Fin', x: last.x, y: last.y });

  return { ok: errors.length === 0, errors, elements, length: pk - pkStart, pk0: pkStart, pk1: pk, points };
}

/** Point sur un élément à l'abscisse λ ∈ [0, L] depuis son début : {x, y, theta, kappa}. */
export function elementPointAt(el, lambda) {
  switch (el.type) {
    case 'droite': {
      const u = unit(el.start.theta);
      return { x: el.start.x + lambda * u.x, y: el.start.y + lambda * u.y, theta: el.start.theta, kappa: 0 };
    }
    case 'arc': {
      const th = el.start.theta + el.s * (lambda / el.R);
      const n = leftNormal(th);
      return { x: el.center.x - el.s * el.R * n.x, y: el.center.y - el.s * el.R * n.y, theta: th, kappa: el.s / el.R };
    }
    case 'clothoide': {
      const u = unit(el.theta0), n = leftNormal(el.theta0);
      if (el.sens === 'entree') {
        const p = clothoidPoint(el.A, lambda);
        return { x: el.origin.x + p.x * u.x + el.s * p.y * n.x, y: el.origin.y + p.x * u.y + el.s * p.y * n.y,
          theta: el.theta0 + el.s * p.tau, kappa: el.s * lambda / (el.A * el.A) };
      }
      const lp = el.L - lambda; // distance à KA2
      const p = clothoidPoint(el.A, lp);
      return { x: el.origin.x - p.x * u.x + el.s * p.y * n.x, y: el.origin.y - p.x * u.y + el.s * p.y * n.y,
        theta: el.theta0 - el.s * p.tau, kappa: el.s * lp / (el.A * el.A) };
    }
    default:
      throw new Error('élément inconnu ' + el.type);
  }
}

/** Point de l'axe au PK donné (+ décalage d, positif à gauche). */
export function axePointAt(built, pk, d = 0) {
  const els = built.elements;
  if (els.length === 0) return null;
  let el = null;
  if (pk <= els[0].pk0) el = els[0];
  else if (pk >= els[els.length - 1].pk1) el = els[els.length - 1];
  else {
    let lo = 0, hi = els.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (els[mid].pk1 < pk) lo = mid + 1; else hi = mid; }
    el = els[lo];
  }
  const lambda = Math.min(Math.max(pk - el.pk0, 0), el.L);
  const p = elementPointAt(el, lambda);
  if (d !== 0) { const n = leftNormal(p.theta); p.x += d * n.x; p.y += d * n.y; }
  p.element = el;
  p.R = el.type === 'droite' ? Infinity : el.type === 'arc' ? el.R * el.s : (p.kappa !== 0 ? 1 / p.kappa : Infinity);
  return p;
}

/** Tabulation : PK réguliers + points caractéristiques, triés et dédoublonnés. */
export function tabulate(built, step = 25, extra = []) {
  const set = new Map();
  const add = (pk, label) => {
    const key = Math.round(pk * 1e4);
    const cur = set.get(key);
    if (!cur) set.set(key, { pk, labels: label ? [label] : [] });
    else if (label && !cur.labels.includes(label)) cur.labels.push(label);
  };
  const first = Math.ceil(built.pk0 / step) * step;
  for (let pk = first; pk <= built.pk1 + 1e-9; pk += step) add(pk, null);
  for (const p of built.points) if (!p.sommet) add(p.pk, p.label);
  for (const e of extra) add(e.pk, e.label);
  add(built.pk0, null); add(built.pk1, null);
  const out = [...set.values()].sort((a, b) => a.pk - b.pk);
  return out.map((st, i) => {
    const p = axePointAt(built, st.pk);
    return { n: i + 1, pk: st.pk, labels: st.labels, x: p.x, y: p.y, theta: p.theta, kappa: p.kappa, R: p.R, type: p.element.type };
  });
}

/** Polyligne de l'axe (ou d'une parallèle à d) échantillonnée au pas donné. */
export function axePolyline(built, step = 2, d = 0) {
  const pts = [];
  for (const el of built.elements) {
    const n = Math.max(1, Math.ceil(el.L / step));
    for (let i = 0; i < n; i++) {
      const p = elementPointAt(el, (el.L * i) / n);
      if (d !== 0) { const nn = leftNormal(p.theta); p.x += d * nn.x; p.y += d * nn.y; }
      pts.push({ x: p.x, y: p.y });
    }
  }
  const last = built.elements[built.elements.length - 1];
  if (last) {
    const p = elementPointAt(last, last.L);
    if (d !== 0) { const nn = leftNormal(p.theta); p.x += d * nn.x; p.y += d * nn.y; }
    pts.push({ x: p.x, y: p.y });
  }
  return pts;
}

/** Projection d'un point sur l'axe : {pk, d} par recherche sur la polyligne puis affinage. */
export function projectOnAxe(built, p) {
  const pl = axePolyline(built, 1);
  let best = { d2: Infinity, i: 0 };
  for (let i = 0; i < pl.length; i++) {
    const dx = pl[i].x - p.x, dy = pl[i].y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < best.d2) best = { d2, i };
  }
  let pk = built.pk0 + best.i; // pas de 1 m
  // affinage par recherche ternaire sur ±1 m
  let lo = Math.max(built.pk0, pk - 1), hi = Math.min(built.pk1, pk + 1);
  for (let k = 0; k < 30; k++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    const a = axePointAt(built, m1), b = axePointAt(built, m2);
    if (dist(a, p) < dist(b, p)) hi = m2; else lo = m1;
  }
  pk = (lo + hi) / 2;
  const q = axePointAt(built, pk);
  const n = leftNormal(q.theta);
  const d = (p.x - q.x) * n.x + (p.y - q.y) * n.y;
  return { pk, d, x: q.x, y: q.y };
}
