// dxf.js — lecteur DXF ASCII (AutoCAD R12 → 2018) sans dépendance, orienté fond
// topographique : LINE, LWPOLYLINE, POLYLINE/VERTEX, POINT, TEXT, MTEXT, CIRCLE, ARC,
// SPLINE (approximée), 3DFACE, INSERT (expansion des blocs, attributs ATTRIB).
//
// Deux sorties :
//   - drawables : primitives planes prêtes au rendu ({type:'poly'|'text'|'point', layer, …})
//   - extractSamples : semis de points cotés {x, y, z} pour le TIN, selon des règles
//     explicites (points 3D, polylignes à élévation, 3DFACE, textes numériques, blocs à attribut).
//
// Le DWG natif n'est pas lu : il passe par le micro-service converter/ (ODA / LibreDWG) ou
// par un export DXF depuis AutoCAD.

const NUM_CODES = new Set([10, 11, 12, 13, 20, 21, 22, 23, 30, 31, 32, 33, 38, 39, 40, 41, 42, 43, 44, 45, 48, 50, 51, 62, 66, 70, 71, 72, 73, 90, 210, 220, 230]);

/** Découpe le texte en couples {code, value}. */
function* pairs(text) {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i], 10);
    if (Number.isNaN(code)) continue;
    const raw = lines[i + 1];
    yield { code, value: NUM_CODES.has(code) ? parseFloat(raw.replace(',', '.')) : raw.trim() };
  }
}

/** Groupe les couples en entités (chaque 0 ouvre une entité). */
function entitiesFrom(iter, stopAt) {
  const out = [];
  let cur = null;
  for (const p of iter) {
    if (p.code === 0) {
      if (cur) out.push(cur);
      if (p.value === stopAt) { cur = null; break; }
      cur = { type: p.value, g: new Map() };
      continue;
    }
    if (!cur) continue;
    const arr = cur.g.get(p.code);
    if (arr) arr.push(p.value); else cur.g.set(p.code, [p.value]);
  }
  if (cur) out.push(cur);
  return out;
}

export function parseDxf(text) {
  const it = pairs(text);
  const dxf = { header: {}, layers: new Map(), blocks: new Map(), entities: [], units: 0 };
  let section = null;
  let buf = [];
  const flush = () => {
    if (section === 'HEADER') {
      let key = null;
      for (const p of buf) { if (p.code === 9) key = p.value; else if (key) { (dxf.header[key] ||= []).push(p.value); } }
      if (dxf.header.$INSUNITS) dxf.units = dxf.header.$INSUNITS[0];
    } else if (section === 'TABLES') {
      const ents = entitiesFrom(buf[Symbol.iterator](), null);
      for (const e of ents) if (e.type === 'LAYER' && e.g.get(2)) dxf.layers.set(e.g.get(2)[0], { name: e.g.get(2)[0], color: e.g.get(62)?.[0] ?? 7, frozen: ((e.g.get(70)?.[0] ?? 0) & 1) === 1 });
    } else if (section === 'BLOCKS') {
      const ents = entitiesFrom(buf[Symbol.iterator](), null);
      let cur = null;
      for (const e of ents) {
        if (e.type === 'BLOCK') { cur = { name: e.g.get(2)?.[0] ?? '', base: { x: e.g.get(10)?.[0] ?? 0, y: e.g.get(20)?.[0] ?? 0 }, entities: [] }; dxf.blocks.set(cur.name, cur); }
        else if (e.type === 'ENDBLK') cur = null;
        else if (cur) cur.entities.push(e);
      }
    } else if (section === 'ENTITIES') {
      dxf.entities = entitiesFrom(buf[Symbol.iterator](), null);
    }
    buf = [];
  };
  for (const p of it) {
    if (p.code === 0 && p.value === 'SECTION') { buf = []; continue; }
    if (p.code === 2 && section === null && buf.length === 0) { section = p.value; continue; }
    if (p.code === 0 && p.value === 'ENDSEC') { flush(); section = null; continue; }
    if (p.code === 0 && p.value === 'EOF') break;
    if (section) buf.push(p);
  }
  // regroupement POLYLINE + VERTEX… + SEQEND et INSERT + ATTRIB… + SEQEND
  dxf.entities = groupSequences(dxf.entities);
  for (const b of dxf.blocks.values()) b.entities = groupSequences(b.entities);
  return dxf;
}

function groupSequences(ents) {
  const out = [];
  let owner = null;
  for (const e of ents) {
    if (e.type === 'VERTEX' || e.type === 'ATTRIB') { if (owner) (owner.children ||= []).push(e); continue; }
    if (e.type === 'SEQEND') { owner = null; continue; }
    out.push(e);
    owner = (e.type === 'POLYLINE' || (e.type === 'INSERT' && (e.g.get(66)?.[0] ?? 0) === 1)) ? e : null;
  }
  return out;
}

const g1 = (e, c, d = 0) => (e.g.get(c)?.[0] ?? d);

/** Tessellation d'un arc de polyligne à bulge (AutoCAD) entre p et q. */
function bulgeArc(p, q, bulge, n = 12) {
  const pts = [];
  const theta = 4 * Math.atan(bulge);
  const chord = Math.hypot(q.x - p.x, q.y - p.y);
  if (chord < 1e-9 || Math.abs(theta) < 1e-9) return [];
  const r = chord / (2 * Math.sin(Math.abs(theta) / 2));
  const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
  const h = Math.sqrt(Math.max(0, r * r - (chord / 2) ** 2)) * (bulge > 0 ? 1 : -1);
  const cx = mx - h * (q.y - p.y) / chord, cy = my + h * (q.x - p.x) / chord;
  const a0 = Math.atan2(p.y - cy, p.x - cx);
  for (let i = 1; i < n; i++) { const a = a0 + theta * i / n; pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
  return pts;
}

function arcPoints(cx, cy, r, a0deg, a1deg, n = 32) {
  let a0 = a0deg * Math.PI / 180, a1 = a1deg * Math.PI / 180;
  if (a1 <= a0) a1 += 2 * Math.PI;
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
  return pts;
}

/** Transformation (INSERT) : translation, échelle, rotation (degrés) autour du point de base du bloc. */
function makeXform(ins, block) {
  const sx = g1(ins, 41, 1), sy = g1(ins, 42, 1), rot = g1(ins, 50, 0) * Math.PI / 180;
  const tx = g1(ins, 10), ty = g1(ins, 20);
  const c = Math.cos(rot), s = Math.sin(rot);
  const bx = block?.base?.x ?? 0, by = block?.base?.y ?? 0;
  return (p) => { const x = (p.x - bx) * sx, y = (p.y - by) * sy; return { x: tx + x * c - y * s, y: ty + x * s + y * c }; };
}

/**
 * Primitives de rendu : [{type:'poly', pts:[{x,y}], layer, color, closed}, {type:'text', x, y, text, h, rot, layer}, {type:'point', x, y, layer}]
 */
export function drawables(dxf, opts = {}) {
  const out = [];
  const visit = (ents, xf, depth) => {
    for (const e of ents) {
      const layer = g1(e, 8, '0');
      const color = g1(e, 62, 256);
      const T = xf || ((p) => p);
      switch (e.type) {
        case 'LINE':
          out.push({ type: 'poly', layer, color, pts: [T({ x: g1(e, 10), y: g1(e, 20) }), T({ x: g1(e, 11), y: g1(e, 21) })] });
          break;
        case 'LWPOLYLINE': {
          const xs = e.g.get(10) || [], ys = e.g.get(20) || [], bs = e.g.get(42);
          const closed = (g1(e, 70) & 1) === 1;
          const raw = xs.map((x, i) => ({ x, y: ys[i] }));
          const pts = [];
          const hasBulge = bs && bs.length === raw.length;
          for (let i = 0; i < raw.length; i++) {
            pts.push(T(raw[i]));
            const b = hasBulge ? bs[i] : 0;
            const nxt = i + 1 < raw.length ? raw[i + 1] : (closed ? raw[0] : null);
            if (b && nxt) for (const p of bulgeArc(raw[i], nxt, b)) pts.push(T(p));
          }
          out.push({ type: 'poly', layer, color, pts, closed, elevation: g1(e, 38, 0) });
          break;
        }
        case 'POLYLINE': {
          const closed = (g1(e, 70) & 1) === 1;
          const verts = (e.children || []).filter(v => ((g1(v, 70) & 16) === 0)); // ignore sommets de contrôle des maillages
          const pts = [];
          for (let i = 0; i < verts.length; i++) {
            const v = verts[i];
            const p = { x: g1(v, 10), y: g1(v, 20) };
            pts.push(T(p));
            const b = g1(v, 42, 0);
            const nv = i + 1 < verts.length ? verts[i + 1] : (closed ? verts[0] : null);
            if (b && nv) for (const q of bulgeArc(p, { x: g1(nv, 10), y: g1(nv, 20) }, b)) pts.push(T(q));
          }
          out.push({ type: 'poly', layer, color, pts, closed, elevation: g1(e, 30, 0) });
          break;
        }
        case 'POINT':
          out.push({ type: 'point', layer, color, ...T({ x: g1(e, 10), y: g1(e, 20) }), z: g1(e, 30, 0) });
          break;
        case 'TEXT': case 'ATTDEF': {
          const p = T({ x: g1(e, 10), y: g1(e, 20) });
          out.push({ type: 'text', layer, color, x: p.x, y: p.y, text: g1(e, 1, ''), h: g1(e, 40, 1), rot: g1(e, 50, 0) });
          break;
        }
        case 'MTEXT': {
          const p = T({ x: g1(e, 10), y: g1(e, 20) });
          const txt = ((e.g.get(3) || []).join('') + g1(e, 1, '')).replace(/\\P/g, ' ').replace(/\{|\}|\\[A-Za-z][^;]*;/g, '');
          out.push({ type: 'text', layer, color, x: p.x, y: p.y, text: txt, h: g1(e, 40, 1), rot: g1(e, 50, 0) });
          break;
        }
        case 'CIRCLE':
          out.push({ type: 'poly', layer, color, closed: true, pts: arcPoints(g1(e, 10), g1(e, 20), g1(e, 40), 0, 360, 48).map(T) });
          break;
        case 'ARC':
          out.push({ type: 'poly', layer, color, pts: arcPoints(g1(e, 10), g1(e, 20), g1(e, 40), g1(e, 50), g1(e, 51)).map(T) });
          break;
        case 'SPLINE': {
          const fx = e.g.get(11), fy = e.g.get(21), cx = e.g.get(10), cy = e.g.get(20);
          const xs = fx && fx.length ? fx : cx || [], ys = fx && fx.length ? fy : cy || [];
          out.push({ type: 'poly', layer, color, pts: xs.map((x, i) => T({ x, y: ys[i] })), approx: true });
          break;
        }
        case '3DFACE': {
          const pts = [];
          for (const c of [10, 11, 12, 13]) pts.push(T({ x: g1(e, c), y: g1(e, c + 10) }));
          out.push({ type: 'poly', layer, color, pts, closed: true, face: true });
          break;
        }
        case 'INSERT': {
          const block = dxf.blocks.get(g1(e, 2, ''));
          const xf2 = makeXform(e, block);
          const TT = xf ? (p) => T(xf2(p)) : xf2;
          if (block && depth < 4 && opts.expandBlocks !== false) visit(block.entities, TT, depth + 1);
          else out.push({ type: 'point', layer, color, ...T({ x: g1(e, 10), y: g1(e, 20) }) });
          for (const a of e.children || []) {
            const p = T({ x: g1(a, 10), y: g1(a, 20) });
            out.push({ type: 'text', layer, color, x: p.x, y: p.y, text: g1(a, 1, ''), h: g1(a, 40, 1), rot: g1(a, 50, 0), attrib: g1(a, 2, '') });
          }
          break;
        }
        default:
          break;
      }
    }
  };
  visit(dxf.entities, null, 0);
  return out;
}

function numericText(t) {
  if (!t) return null;
  const m = String(t).replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const v = parseFloat(m[0]);
  return Number.isFinite(v) ? v : null;
}

/**
 * Semis de points cotés. Règles (toutes désactivables) :
 *  - points: POINT dont z ≠ 0 (ou tout POINT si includeZero)
 *  - polylines: sommets des polylignes à élévation ≠ 0 (LWPOLYLINE code 38, POLYLINE 3D ou élévation 30)
 *  - faces: sommets des 3DFACE
 *  - texts: TEXT/MTEXT dont le contenu est un nombre plausible (zMin ≤ v ≤ zMax), placé à l'insertion
 *  - blocks: INSERT dont un ATTRIB est numérique (ou dont z d'insertion ≠ 0), placé à l'insertion
 *  - layers: Set de calques autorisés (null = tous)
 */
export function extractSamples(dxf, opts = {}) {
  const o = { points: true, polylines: true, faces: true, texts: false, blocks: true, includeZero: false, zMin: -500, zMax: 9000, layers: null, ...opts };
  const okLayer = (l) => !o.layers || o.layers.has(l);
  const okZ = (z) => Number.isFinite(z) && z >= o.zMin && z <= o.zMax && (o.includeZero || z !== 0);
  const out = [];
  const stats = { points: 0, polylines: 0, faces: 0, texts: 0, blocks: 0 };
  const visit = (ents, xf) => {
    const T = xf || ((p) => p);
    for (const e of ents) {
      const layer = g1(e, 8, '0');
      if (!okLayer(layer)) continue;
      switch (e.type) {
        case 'POINT': if (o.points) { const z = g1(e, 30, 0); if (okZ(z)) { const p = T({ x: g1(e, 10), y: g1(e, 20) }); out.push({ x: p.x, y: p.y, z }); stats.points++; } } break;
        case 'LWPOLYLINE': if (o.polylines) { const z = g1(e, 38, 0); if (okZ(z)) { const xs = e.g.get(10) || [], ys = e.g.get(20) || []; for (let i = 0; i < xs.length; i++) { const p = T({ x: xs[i], y: ys[i] }); out.push({ x: p.x, y: p.y, z }); } stats.polylines += xs.length; } } break;
        case 'POLYLINE': if (o.polylines) { const is3d = (g1(e, 70) & 8) === 8; const ze = g1(e, 30, 0); for (const v of e.children || []) { if ((g1(v, 70) & 16) !== 0) continue; const z = is3d ? g1(v, 30, 0) : ze; if (!okZ(z)) continue; const p = T({ x: g1(v, 10), y: g1(v, 20) }); out.push({ x: p.x, y: p.y, z }); stats.polylines++; } } break;
        case '3DFACE': if (o.faces) { for (const c of [10, 11, 12, 13]) { const z = g1(e, c + 20, 0); if (!okZ(z)) continue; const p = T({ x: g1(e, c), y: g1(e, c + 10) }); out.push({ x: p.x, y: p.y, z }); stats.faces++; } } break;
        case 'TEXT': case 'MTEXT': if (o.texts) { const v = numericText(e.type === 'TEXT' ? g1(e, 1, '') : (e.g.get(3) || []).join('') + g1(e, 1, '')); if (v !== null && okZ(v)) { const p = T({ x: g1(e, 10), y: g1(e, 20) }); out.push({ x: p.x, y: p.y, z: v }); stats.texts++; } } break;
        case 'INSERT': {
          const block = dxf.blocks.get(g1(e, 2, ''));
          const xf2 = makeXform(e, block);
          const TT = xf ? (p) => T(xf2(p)) : xf2;
          if (o.blocks) {
            let z = null;
            for (const a of e.children || []) { const v = numericText(g1(a, 1, '')); if (v !== null && okZ(v)) { z = v; break; } }
            if (z === null) { const zi = g1(e, 30, 0); if (okZ(zi)) z = zi; }
            if (z !== null) { const p = T({ x: g1(e, 10), y: g1(e, 20) }); out.push({ x: p.x, y: p.y, z }); stats.blocks++; }
          }
          if (block && xf === null) visit(block.entities, TT); // un seul niveau d'imbrication pour le semis
          break;
        }
        default: break;
      }
    }
  };
  visit(dxf.entities, null);
  return { samples: out, stats };
}

/** Liste des calques rencontrés dans les entités avec leur effectif. */
export function layerStats(dxf) {
  const m = new Map();
  const count = (ents) => { for (const e of ents) { const l = g1(e, 8, '0'); m.set(l, (m.get(l) || 0) + 1); } };
  count(dxf.entities);
  return [...m.entries()].map(([name, n]) => ({ name, n, color: dxf.layers.get(name)?.color ?? 7 })).sort((a, b) => a.name.localeCompare(b.name));
}
