// plan.js — rendu de la vue en plan : fond DXF (par calque), TIN / courbes, axe
// (éléments colorés par type), polygonale, points caractéristiques, bords, stations.

import { strokePoly, niceStep } from './viewport.js';
import { axePolyline, elementPointAt, axePointAt } from '../core/axe.js';
import { formatPK } from '../core/geom.js';

const ACI = { 1: '#d00', 2: '#b8860b', 3: '#0a0', 4: '#099', 5: '#00c', 6: '#c0c', 7: '#333', 8: '#808080', 9: '#aaa', 250: '#555', 251: '#777', 252: '#999', 253: '#bbb', 254: '#ddd' };
export function aciColor(i, layerColor = 7) {
  if (i === 256 || i === undefined || i === null || i === 0) i = layerColor;
  if (ACI[i]) return ACI[i];
  if (i >= 10 && i <= 249) { const h = ((i - 10) / 240) * 360; const l = (i % 10) < 5 ? 40 : 60; return `hsl(${h.toFixed(0)} 70% ${l}%)`; }
  return '#333';
}

const COL = { droite: '#1d4ed8', clothoide: '#15803d', arc: '#b91c1c' };

export function drawPlan(ctx, vp, S, flags) {
  drawGrid(ctx, vp);
  const pxm = vp.pxToM;
  // fond
  if (flags.showFond && S.drawables) {
    const vis = S.layerVisible;
    const minX = vp.toWorld({ x: 0, y: vp.H }).x, maxX = vp.toWorld({ x: vp.W, y: 0 }).x;
    const minY = vp.toWorld({ x: 0, y: vp.H }).y, maxY = vp.toWorld({ x: vp.W, y: 0 }).y;
    ctx.lineWidth = 0.8;
    for (const d of S.drawables) {
      if (vis && vis.get(d.layer) === false) continue;
      const col = aciColor(d.color, S.layerColors?.get(d.layer));
      if (d.type === 'poly') {
        const b = d.bbox;
        if (b && (b.maxX < minX || b.minX > maxX || b.maxY < minY || b.minY > maxY)) continue;
        if (b && (b.maxX - b.minX) < pxm && (b.maxY - b.minY) < pxm) continue; // sous-pixel
        strokePoly(ctx, vp, d.pts, { color: col, width: 0.8, closed: d.closed });
      } else if (d.type === 'point') {
        if (d.x < minX || d.x > maxX || d.y < minY || d.y > maxY) continue;
        const s = vp.toScreen(d);
        ctx.fillStyle = col; ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
      } else if (d.type === 'text') {
        if (d.x < minX || d.x > maxX || d.y < minY || d.y > maxY) continue;
        const hpx = d.h * vp.sx;
        if (hpx < 5) continue;
        const s = vp.toScreen(d);
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(-d.rot * Math.PI / 180);
        ctx.fillStyle = col; ctx.font = `${Math.min(hpx, 24).toFixed(0)}px sans-serif`; ctx.fillText(d.text, 0, 0); ctx.restore();
      }
    }
  }
  // TIN
  if (S.tin) {
    if (flags.showTin && vp.sx > 0.3) for (const [a, b, c] of S.tin.keptTriangles()) strokePoly(ctx, vp, [a, b, c], { color: '#cbd5e1', width: 0.5, closed: true });
    if (flags.showContours && S.contours) {
      ctx.beginPath();
      for (const s of S.contours) { const a = vp.toScreen(s.a), b = vp.toScreen(s.b); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      ctx.strokeStyle = '#c2410c'; ctx.lineWidth = 0.6; ctx.globalAlpha = 0.7; ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
  // polygonale
  const som = S.project.axe.sommets;
  if (som.length >= 2) strokePoly(ctx, vp, som, { color: '#9ca3af', width: 1, dash: [6, 4] });
  for (let i = 0; i < som.length; i++) {
    const s = vp.toScreen(som[i]);
    ctx.fillStyle = i === S.selSommet ? '#f59e0b' : '#fff'; ctx.strokeStyle = '#374151'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.rect(s.x - 4, s.y - 4, 8, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#374151'; ctx.font = '11px sans-serif'; ctx.fillText(`S${i}`, s.x + 6, s.y - 6);
  }
  // axe
  const built = S.built;
  if (built && built.elements.length) {
    const step = Math.max(0.5, pxm * 2);
    if (flags.showBords && S.project.profilType) {
      const pt = S.project.profilType;
      for (const d of [pt.demiChaussee, -pt.demiChaussee]) strokePoly(ctx, vp, axePolyline(built, step, d), { color: '#64748b', width: 0.8 });
      for (const d of [pt.demiChaussee + pt.accotement, -(pt.demiChaussee + pt.accotement)]) strokePoly(ctx, vp, axePolyline(built, step, d), { color: '#94a3b8', width: 0.6, dash: [3, 3] });
    }
    for (const el of built.elements) {
      const n = Math.max(2, Math.ceil(el.L / step));
      const pts = [];
      for (let i = 0; i <= n; i++) pts.push(elementPointAt(el, el.L * i / n));
      strokePoly(ctx, vp, pts, { color: COL[el.type], width: 2.2 });
    }
    if (flags.showStations && S.stations && vp.sx > 0.15) {
      ctx.strokeStyle = '#475569'; ctx.lineWidth = 0.8; ctx.fillStyle = '#475569'; ctx.font = '10px sans-serif';
      for (const st of S.stations) {
        const a = vp.toScreen(axePointAt(built, st.pk, 2)), b = vp.toScreen(axePointAt(built, st.pk, -2));
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        if (vp.sx > 0.6 || st.labels.length) ctx.fillText(formatPK(st.pk, 0), a.x + 3, a.y - 3);
      }
    }
    ctx.font = 'bold 11px sans-serif';
    for (const p of built.points) {
      if (p.sommet) continue;
      const s = vp.toScreen(p);
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(s.x, s.y, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111'; ctx.fillText(`${p.label} ${formatPK(p.pk)}`, s.x + 5, s.y + 12);
    }
  }
  // sommet de rasante en cours / profil sélectionné
  if (built && S.selPk !== null && S.selPk !== undefined) {
    const p = axePointAt(built, S.selPk);
    const a = vp.toScreen(axePointAt(built, S.selPk, S.project.profilType.emprise)), b = vp.toScreen(axePointAt(built, S.selPk, -S.project.profilType.emprise));
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    const s = vp.toScreen(p); ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, Math.PI * 2); ctx.fill();
  }
}

function drawGrid(ctx, vp) {
  const step = niceStep(vp.sx, 80);
  const w0 = vp.toWorld({ x: 0, y: vp.H }), w1 = vp.toWorld({ x: vp.W, y: 0 });
  ctx.strokeStyle = '#eef2f7'; ctx.lineWidth = 1; ctx.fillStyle = '#9ca3af'; ctx.font = '10px sans-serif';
  ctx.beginPath();
  for (let x = Math.ceil(w0.x / step) * step; x <= w1.x; x += step) { const s = vp.toScreen({ x, y: 0 }); ctx.moveTo(s.x, 0); ctx.lineTo(s.x, vp.H); ctx.fillText(x.toFixed(0), s.x + 2, vp.H - 4); }
  for (let y = Math.ceil(w0.y / step) * step; y <= w1.y; y += step) { const s = vp.toScreen({ x: 0, y }); ctx.moveTo(0, s.y); ctx.lineTo(vp.W, s.y); ctx.fillText(y.toFixed(0), 2, s.y - 2); }
  ctx.stroke();
}
