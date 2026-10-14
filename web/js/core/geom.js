// geom.js — géométrie plane élémentaire (aucune dépendance).
// Convention : angles en radians, orientés trigonométriquement (sens direct),
// repère (x = Est, y = Nord). Unité de longueur : mètre.

export const TWO_PI = 2 * Math.PI;

/** Ramène un angle dans ]-π, π]. */
export function normAngle(a) {
  a = a % TWO_PI;
  if (a > Math.PI) a -= TWO_PI;
  if (a <= -Math.PI) a += TWO_PI;
  return a;
}

export function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Azimut géométrique (angle trigonométrique) du vecteur a→b. */
export function heading(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/** Gisement topographique en grades (0 = Nord, sens horaire), depuis l'angle trigo. */
export function gisementGon(thetaRad) {
  let g = (Math.PI / 2 - thetaRad) * (200 / Math.PI);
  g %= 400;
  if (g < 0) g += 400;
  return g;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Intersection de deux droites (p1,d1) et (p2,d2) ; null si parallèles. */
export function intersectLines(p1, d1, p2, d2) {
  const det = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(det) < 1e-12) return null;
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const t = (dx * d2.y - dy * d2.x) / det;
  return { x: p1.x + t * d1.x, y: p1.y + t * d1.y, t };
}

/** Intersection de deux segments [a,b] et [c,d] ; null s'ils ne se coupent pas. */
export function intersectSegments(a, b, c, d) {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-12) return null;
  const qp = { x: c.x - a.x, y: c.y - a.y };
  const t = (qp.x * s.y - qp.y * s.x) / den;
  const u = (qp.x * r.y - qp.y * r.x) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return { x: a.x + t * r.x, y: a.y + t * r.y, t, u };
}

/** Longueur cumulée d'une polyligne [{x,y}]. */
export function polylineLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  return L;
}

/** Abscisses cumulées d'une polyligne (même longueur que pts). */
export function cumulative(pts) {
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + dist(pts[i - 1], pts[i]));
  return s;
}

/** Point d'une polyligne à l'abscisse curviligne s (prolongation aux extrémités). */
export function polylinePointAt(pts, s) {
  if (pts.length === 0) return null;
  if (pts.length === 1) return { ...pts[0], theta: 0 };
  const cum = cumulative(pts);
  let i = 1;
  while (i < pts.length - 1 && cum[i] < s) i++;
  const a = pts[i - 1], b = pts[i];
  const len = cum[i] - cum[i - 1];
  const t = len > 0 ? (s - cum[i - 1]) / len : 0;
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), theta: heading(a, b) };
}

/** Projection orthogonale de p sur la polyligne : {s, d (signé, gauche > 0), x, y}. */
export function projectOnPolyline(pts, p) {
  let best = null;
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const vx = b.x - a.x, vy = b.y - a.y;
    const L2 = vx * vx + vy * vy;
    const L = Math.sqrt(L2);
    let t = L2 > 0 ? ((p.x - a.x) * vx + (p.y - a.y) * vy) / L2 : 0;
    t = clamp(t, 0, 1);
    const q = { x: a.x + t * vx, y: a.y + t * vy };
    const dd = dist(p, q);
    if (best === null || dd < best.dist) {
      // signe : produit vectoriel (gauche de la marche = positif)
      const cross = vx * (p.y - a.y) - vy * (p.x - a.x);
      best = { dist: dd, s: acc + t * L, d: cross >= 0 ? dd : -dd, x: q.x, y: q.y };
    }
    acc += L;
  }
  return best;
}

/** Aire signée (formule du lacet) d'un polygone fermé. */
export function signedArea(poly) {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Boîte englobante d'une liste de points. */
export function bbox(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** Simplification de Ramer–Douglas–Peucker. */
export function rdp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const a = pts[0], b = pts[pts.length - 1];
  let imax = 0, dmax = 0;
  const vx = b.x - a.x, vy = b.y - a.y;
  const L = Math.hypot(vx, vy) || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(vx * (pts[i].y - a.y) - vy * (pts[i].x - a.x)) / L;
    if (d > dmax) { dmax = d; imax = i; }
  }
  if (dmax <= eps) return [a, b];
  const left = rdp(pts.slice(0, imax + 1), eps);
  const right = rdp(pts.slice(imax), eps);
  return left.slice(0, -1).concat(right);
}

/** Formatage d'un PK en « k+mmm.mm » (cohérent avec BVTrace). */
export function formatPK(s, decimals = 2) {
  const sign = s < 0 ? '-' : '';
  s = Math.abs(s);
  const km = Math.floor(s / 1000);
  const m = s - km * 1000;
  const ms = m.toFixed(decimals).padStart(decimals > 0 ? 4 + decimals : 3, '0');
  return `${sign}${km}+${ms}`;
}

/** Nombre formaté en culture invariante (point décimal). */
export function fmt(v, decimals = 2) {
  if (v === null || v === undefined || Number.isNaN(v)) return '';
  return Number(v).toFixed(decimals);
}
