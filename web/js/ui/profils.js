// profils.js — rendu du profil en long (TN + rasante + terrassements) et des profils
// en travers (TN, projet, surfaces déblai/remblai). Axes et grilles en coordonnées
// (PK, Z) et (d, Z) ; le viewport porte l'exagération verticale.

import { strokePoly, niceStep } from './viewport.js';
import { formatPK } from '../core/geom.js';

const C = { tn: '#6b7280', ras: '#dc2626', deblai: 'rgba(220,38,38,.18)', remblai: 'rgba(234,179,8,.25)', grid: '#eef2f7', txt: '#6b7280' };

function gridPL(ctx, vp, xLabel) {
  const sx = niceStep(vp.sx, 80), sy = niceStep(vp.sy, 40);
  const w0 = vp.toWorld({ x: 0, y: vp.H }), w1 = vp.toWorld({ x: vp.W, y: 0 });
  ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.fillStyle = C.txt; ctx.font = '10px sans-serif';
  ctx.beginPath();
  for (let x = Math.ceil(w0.x / sx) * sx; x <= w1.x; x += sx) { const s = vp.toScreen({ x, y: 0 }); ctx.moveTo(s.x, 0); ctx.lineTo(s.x, vp.H); ctx.fillText(xLabel(x), s.x + 2, vp.H - 4); }
  for (let y = Math.ceil(w0.y / sy) * sy; y <= w1.y; y += sy) { const s = vp.toScreen({ x: 0, y }); ctx.moveTo(0, s.y); ctx.lineTo(vp.W, s.y); ctx.fillText(y.toFixed(sy < 1 ? 1 : 0), 2, s.y - 2); }
  ctx.stroke();
}

/** Profil en long. S : {terrain, ras, project, selRas} */
export function drawProfilLong(ctx, vp, S) {
  gridPL(ctx, vp, (x) => formatPK(x, 0));
  const terrain = S.terrain || [];
  const ras = S.ras;
  // terrassements (bandes) coupées à l'écart nul (interpolation de l'écart)
  if (ras && terrain.length) {
    const runs = [];
    let cur = null;
    const push = (pk, zt, zr) => {
      const e = zr - zt; // > 0 remblai
      if (cur && Math.sign(e) !== cur.sign && cur.pts.length) {
        const last = cur.pts[cur.pts.length - 1];
        const t = last.e / (last.e - e);
        const pkc = last.pk + (pk - last.pk) * t, zc = last.zt + (zt - last.zt) * t;
        cur.pts.push({ pk: pkc, zt: zc, zr: zc, e: 0 }); runs.push(cur);
        cur = { sign: Math.sign(e), pts: [{ pk: pkc, zt: zc, zr: zc, e: 0 }] };
      }
      if (!cur) cur = { sign: Math.sign(e), pts: [] };
      cur.pts.push({ pk, zt, zr, e });
    };
    for (const p of terrain) { if (p.z === null) { if (cur) { runs.push(cur); cur = null; } continue; } const zr = ras.zAt(p.pk); if (zr === null) { if (cur) { runs.push(cur); cur = null; } continue; } push(p.pk, p.z, zr); }
    if (cur) runs.push(cur);
    for (const r of runs) {
      if (r.pts.length < 2) continue;
      ctx.beginPath();
      r.pts.forEach((p, i) => { const s = vp.toScreen({ x: p.pk, y: p.zr }); if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y); });
      for (let i = r.pts.length - 1; i >= 0; i--) { const s = vp.toScreen({ x: r.pts[i].pk, y: r.pts[i].zt }); ctx.lineTo(s.x, s.y); }
      ctx.closePath(); ctx.fillStyle = r.sign > 0 ? C.remblai : C.deblai; ctx.fill();
    }
  }
  // TN
  let seg = [];
  for (const p of terrain) { if (p.z === null) { strokePoly(ctx, vp, seg, { color: C.tn, width: 1.5 }); seg = []; } else seg.push({ x: p.pk, y: p.z }); }
  strokePoly(ctx, vp, seg, { color: C.tn, width: 1.5 });
  // rasante
  if (ras && ras.elements.length) {
    const pts = [];
    const step = Math.max(0.5, vp.pxToM * 2);
    for (const el of ras.elements) { const n = Math.max(2, Math.ceil((el.pk1 - el.pk0) / step)); for (let i = 0; i <= n; i++) { const pk = el.pk0 + (el.pk1 - el.pk0) * i / n; pts.push({ x: pk, y: ras.zAt(pk) }); } }
    strokePoly(ctx, vp, pts, { color: C.ras, width: 2.2 });
    ctx.font = '10px sans-serif';
    for (const p of ras.points) {
      if (p.sommet) continue;
      const s = vp.toScreen({ x: p.pk, y: p.z });
      ctx.fillStyle = '#7f1d1d'; ctx.beginPath(); ctx.arc(s.x, s.y, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillText(`${p.label} ${formatPK(p.pk)} / ${p.z.toFixed(2)}`, s.x + 4, s.y - 4);
    }
    // pentes
    ctx.fillStyle = '#991b1b'; ctx.font = 'bold 11px sans-serif';
    for (const el of ras.elements) if (el.type === 'droite' && (el.pk1 - el.pk0) * vp.sx > 40) {
      const s = vp.toScreen({ x: (el.pk0 + el.pk1) / 2, y: (el.z0 + el.z1) / 2 });
      ctx.fillText(`${(el.pente * 100).toFixed(2)} %`, s.x - 15, s.y - 8);
    } else if (el.type === 'parabole') {
      const s = vp.toScreen({ x: el.pkS, y: el.zS });
      ctx.fillText(`Rv=${el.Rv.toFixed(0)} L=${el.L.toFixed(0)}`, s.x - 30, s.y + (el.saillant ? -14 : 16));
    }
  }
  // sommets (poignées)
  const som = S.project.rasante.sommets;
  for (let i = 0; i < som.length; i++) {
    const s = vp.toScreen({ x: som[i].pk, y: som[i].z });
    ctx.fillStyle = i === S.selRas ? '#f59e0b' : '#fff'; ctx.strokeStyle = '#7f1d1d'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.rect(s.x - 4, s.y - 4, 8, 8); ctx.fill(); ctx.stroke();
  }
  if (S.selPk !== null && S.selPk !== undefined) {
    const s = vp.toScreen({ x: S.selPk, y: 0 });
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(s.x, 0); ctx.lineTo(s.x, vp.H); ctx.stroke(); ctx.setLineDash([]);
  }
}

/** Profil en travers. pr : résultat de profilEnTravers ; d croissant = gauche → dessiné à gauche (x = −d). */
export function drawProfilTravers(ctx, vp, pr) {
  gridPL(ctx, vp, (x) => (-x).toFixed(0));
  if (!pr) return;
  const tn = pr.tn.filter(t => t.z !== null).map(t => ({ x: -t.d, y: t.z }));
  if (pr.projet) {
    const pj = pr.projet.points.map(q => ({ x: -q.d, y: q.z }));
    // surfaces : polygone entre TN et projet, coloré par signe (approximation visuelle : bande par segment)
    const zTn = (d) => { const arr = pr.tn; for (let i = 1; i < arr.length; i++) if (d <= arr[i].d) { const a = arr[i - 1], b = arr[i]; if (a.z === null || b.z === null) return null; return a.z + (b.z - a.z) * (d - a.d) / (b.d - a.d); } return null; };
    const ds = [...new Set(pr.projet.points.map(p => p.d).concat(pr.tn.map(t => t.d)))].filter(d => d >= pr.projet.points[0].d && d <= pr.projet.points[pr.projet.points.length - 1].d).sort((a, b) => a - b);
    const zPj = (d) => { const arr = pr.projet.points; for (let i = 1; i < arr.length; i++) if (d <= arr[i].d) { const a = arr[i - 1], b = arr[i]; return a.z + (b.z - a.z) * (d - a.d) / (b.d - a.d); } return arr[arr.length - 1].z; };
    for (let i = 1; i < ds.length; i++) {
      const d0 = ds[i - 1], d1 = ds[i];
      const t0 = zTn(d0), t1 = zTn(d1); if (t0 === null || t1 === null) continue;
      const p0 = zPj(d0), p1 = zPj(d1);
      const e0 = t0 - p0, e1 = t1 - p1;
      const quads = [];
      if (e0 * e1 >= 0) quads.push({ d0, d1, t0, t1, p0, p1, sign: e0 + e1 });
      else { const t = e0 / (e0 - e1); const dc = d0 + (d1 - d0) * t, zc = p0 + (p1 - p0) * t; quads.push({ d0, d1: dc, t0, t1: zc, p0, p1: zc, sign: e0 }, { d0: dc, d1, t0: zc, t1, p0: zc, p1, sign: e1 }); }
      for (const q of quads) {
        const a = vp.toScreen({ x: -q.d0, y: q.t0 }), b = vp.toScreen({ x: -q.d1, y: q.t1 }), c = vp.toScreen({ x: -q.d1, y: q.p1 }), d = vp.toScreen({ x: -q.d0, y: q.p0 });
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
        ctx.fillStyle = q.sign >= 0 ? C.deblai : C.remblai; ctx.fill();
      }
    }
    strokePoly(ctx, vp, pj, { color: C.ras, width: 2.2 });
    ctx.fillStyle = '#7f1d1d'; ctx.font = '10px sans-serif';
    for (const q of pr.projet.points) { const s = vp.toScreen({ x: -q.d, y: q.z }); ctx.beginPath(); ctx.arc(s.x, s.y, 2, 0, Math.PI * 2); ctx.fill(); if (q.role !== 'bord chaussée') ctx.fillText(`${q.role} ${q.d.toFixed(2)} / ${q.z.toFixed(2)}`, s.x + 3, s.y - 4); }
  }
  strokePoly(ctx, vp, tn, { color: C.tn, width: 1.5 });
  const s0 = vp.toScreen({ x: 0, y: pr.zAxe ?? pr.zTnAxe ?? 0 });
  ctx.strokeStyle = '#f59e0b'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(s0.x, 0); ctx.lineTo(s0.x, vp.H); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#374151'; ctx.font = 'bold 12px sans-serif';
  ctx.fillText(`PK ${formatPK(pr.pk)}   gauche ◄ · ► droite`, 10, 16);
}
