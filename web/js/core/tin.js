// tin.js — modèle numérique de terrain par triangulation de Delaunay (TIN).
// Dépend de Delaunator (web/js/vendor/delaunator.js, licence ISC) exposé en global,
// ou injecté via setDelaunator(ctor) (tests Node).
//
// Invariant hérité de BVTrace (DemFromSamples) : les triangles « slivers » de
// l'enveloppe convexe sont écartés par un filtre de longueur d'arête (α), sinon
// le TN est faussé en périphérie du semis. Un point hors TIN renvoie null, jamais
// une valeur extrapolée.

let DelaunatorCtor = typeof globalThis !== 'undefined' ? globalThis.Delaunator : undefined;
export function setDelaunator(ctor) { DelaunatorCtor = ctor; }

export class Tin {
  /**
   * @param {{x:number,y:number,z:number}[]} samples semis de points cotés
   * @param {{maxEdge?:number, maxEdgeFactor?:number}} opts filtre α (défaut : 4 × arête médiane)
   */
  constructor(samples, opts = {}) {
    const D = DelaunatorCtor || globalThis.Delaunator;
    if (!D) throw new Error('Delaunator non chargé');
    // dédoublonnage des XY (sinon triangles dégénérés)
    const seen = new Map();
    const pts = [];
    for (const p of samples) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) continue;
      const key = `${Math.round(p.x * 1000)}|${Math.round(p.y * 1000)}`;
      if (seen.has(key)) continue;
      seen.set(key, pts.length);
      pts.push({ x: p.x, y: p.y, z: p.z });
    }
    this.points = pts;
    this.n = pts.length;
    if (pts.length < 3) { this.triangles = new Uint32Array(0); this.keep = new Uint8Array(0); this.bbox = null; return; }
    const coords = new Float64Array(pts.length * 2);
    pts.forEach((p, i) => { coords[2 * i] = p.x; coords[2 * i + 1] = p.y; });
    const del = new D(coords);
    this.triangles = del.triangles; // 3 indices par triangle
    this.hull = del.hull;
    const nt = this.triangles.length / 3;
    // filtre α : longueur d'arête
    const edgeLens = [];
    for (let t = 0; t < nt; t++) {
      const a = pts[this.triangles[3 * t]], b = pts[this.triangles[3 * t + 1]], c = pts[this.triangles[3 * t + 2]];
      edgeLens.push(Math.hypot(b.x - a.x, b.y - a.y), Math.hypot(c.x - b.x, c.y - b.y), Math.hypot(a.x - c.x, a.y - c.y));
    }
    const sorted = edgeLens.slice().sort((u, v) => u - v);
    this.medianEdge = sorted[Math.floor(sorted.length / 2)] || 0;
    const maxEdge = opts.maxEdge ?? (opts.maxEdgeFactor ?? 4) * this.medianEdge;
    this.maxEdge = maxEdge;
    this.keep = new Uint8Array(nt);
    let kept = 0;
    for (let t = 0; t < nt; t++) {
      const ok = edgeLens[3 * t] <= maxEdge && edgeLens[3 * t + 1] <= maxEdge && edgeLens[3 * t + 2] <= maxEdge;
      this.keep[t] = ok ? 1 : 0;
      if (ok) kept++;
    }
    this.keptCount = kept;
    // bbox + index spatial (grille de cellules → triangles)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of pts) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z; }
    this.bbox = { minX, minY, maxX, maxY, minZ, maxZ };
    const cells = Math.max(1, Math.round(Math.sqrt(kept / 2)));
    this.gx = cells; this.gy = cells;
    this.cw = (maxX - minX) / cells || 1; this.ch = (maxY - minY) / cells || 1;
    this.grid = new Array(cells * cells);
    for (let i = 0; i < this.grid.length; i++) this.grid[i] = [];
    for (let t = 0; t < nt; t++) {
      if (!this.keep[t]) continue;
      const a = pts[this.triangles[3 * t]], b = pts[this.triangles[3 * t + 1]], c = pts[this.triangles[3 * t + 2]];
      const x0 = Math.min(a.x, b.x, c.x), x1 = Math.max(a.x, b.x, c.x);
      const y0 = Math.min(a.y, b.y, c.y), y1 = Math.max(a.y, b.y, c.y);
      const i0 = this._cx(x0), i1 = this._cx(x1), j0 = this._cy(y0), j1 = this._cy(y1);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) this.grid[j * cells + i].push(t);
    }
  }
  _cx(x) { return Math.min(this.gx - 1, Math.max(0, Math.floor((x - this.bbox.minX) / this.cw))); }
  _cy(y) { return Math.min(this.gy - 1, Math.max(0, Math.floor((y - this.bbox.minY) / this.ch))); }

  /** Indice du triangle contenant (x, y), ou -1. */
  locate(x, y) {
    if (!this.bbox || x < this.bbox.minX || x > this.bbox.maxX || y < this.bbox.minY || y > this.bbox.maxY) return -1;
    const cell = this.grid[this._cy(y) * this.gx + this._cx(x)];
    const P = this.points, T = this.triangles;
    for (const t of cell) {
      const a = P[T[3 * t]], b = P[T[3 * t + 1]], c = P[T[3 * t + 2]];
      const d1 = (x - b.x) * (a.y - b.y) - (a.x - b.x) * (y - b.y);
      const d2 = (x - c.x) * (b.y - c.y) - (b.x - c.x) * (y - c.y);
      const d3 = (x - a.x) * (c.y - a.y) - (c.x - a.x) * (y - a.y);
      const neg = d1 < -1e-9 || d2 < -1e-9 || d3 < -1e-9;
      const pos = d1 > 1e-9 || d2 > 1e-9 || d3 > 1e-9;
      if (!(neg && pos)) return t;
    }
    return -1;
  }

  /** Cote interpolée (plan du triangle) ou null hors modèle. */
  zAt(x, y) {
    const t = this.locate(x, y);
    if (t < 0) return null;
    const P = this.points, T = this.triangles;
    const a = P[T[3 * t]], b = P[T[3 * t + 1]], c = P[T[3 * t + 2]];
    const det = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
    if (Math.abs(det) < 1e-12) return (a.z + b.z + c.z) / 3;
    const l1 = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / det;
    const l2 = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / det;
    const l3 = 1 - l1 - l2;
    return l1 * a.z + l2 * b.z + l3 * c.z;
  }

  /** Triangles conservés sous forme de triplets de points (pour le rendu). */
  *keptTriangles() {
    const P = this.points, T = this.triangles;
    for (let t = 0; t < this.keep.length; t++) if (this.keep[t]) yield [P[T[3 * t]], P[T[3 * t + 1]], P[T[3 * t + 2]]];
  }

  /** Courbes de niveau : segments {z, a:{x,y}, b:{x,y}} pour les niveaux multiples de `step`. */
  contours(step = 1) {
    const segs = [];
    if (!this.bbox) return segs;
    const z0 = Math.ceil(this.bbox.minZ / step) * step;
    for (const [a, b, c] of this.keptTriangles()) {
      const lo = Math.min(a.z, b.z, c.z), hi = Math.max(a.z, b.z, c.z);
      for (let z = Math.max(z0, Math.ceil(lo / step) * step); z <= hi; z += step) {
        const pts = [];
        const edges = [[a, b], [b, c], [c, a]];
        for (const [p, q] of edges) {
          if ((p.z - z) * (q.z - z) < 0 || (p.z === z && q.z !== z)) {
            const t = (z - p.z) / (q.z - p.z);
            pts.push({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) });
          }
        }
        if (pts.length >= 2) segs.push({ z, a: pts[0], b: pts[1] });
      }
    }
    return segs;
  }

  /** Profil du TN le long d'une polyligne [{x,y}] : [{s, z|null}] ré-échantillonné au pas. */
  profileAlong(polyline, step = 1) {
    const out = [];
    let s = 0;
    for (let i = 1; i < polyline.length; i++) {
      const a = polyline[i - 1], b = polyline[i];
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      const n = Math.max(1, Math.ceil(L / step));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const x = a.x + t * (b.x - a.x), y = a.y + t * (b.y - a.y);
        out.push({ s: s + t * L, x, y, z: this.zAt(x, y) });
      }
      s += L;
    }
    const last = polyline[polyline.length - 1];
    if (last) out.push({ s, x: last.x, y: last.y, z: this.zAt(last.x, last.y) });
    return out;
  }
}
