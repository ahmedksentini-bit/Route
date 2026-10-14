// viewport.js — vue 2D sur canvas : transformation monde ↔ écran (y vers le haut),
// zoom à la molette, déplacement au glisser, pointeur (souris et tactile), et
// crochets de saisie (clic, glisser d'un objet). Facteur d'échelle vertical distinct
// pour le profil en long (exagération).

export class Viewport {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sx = 1; this.sy = 1; // px par mètre
    this.cx = 0; this.cy = 0; // centre monde
    this.yRatio = opts.yRatio ?? 1; // sy = sx × yRatio
    this.onDraw = opts.onDraw || (() => {});
    this.onClick = opts.onClick || null;     // (world, ev) → void
    this.onHover = opts.onHover || null;     // (world|null, ev)
    this.hitTest = opts.hitTest || null;     // (world, tolPx→m) → objet | null
    this.onDragObj = opts.onDragObj || null; // (obj, world, phase 'start'|'move'|'end')
    this.dpr = window.devicePixelRatio || 1;
    this._bind();
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width * this.dpr)), h = Math.max(1, Math.round(r.height * this.dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.W = r.width; this.H = r.height;
    this.draw();
  }

  setYRatio(r) { this.yRatio = r; this.sy = this.sx * r; this.draw(); }

  toScreen(p) { return { x: this.W / 2 + (p.x - this.cx) * this.sx, y: this.H / 2 - (p.y - this.cy) * this.sy }; }
  toWorld(s) { return { x: this.cx + (s.x - this.W / 2) / this.sx, y: this.cy - (s.y - this.H / 2) / this.sy }; }

  /** Cadre la boîte {minX,minY,maxX,maxY} avec une marge (fraction). */
  fit(b, margin = 0.08) {
    if (!b || !Number.isFinite(b.minX) || b.maxX <= b.minX && b.maxY <= b.minY) return;
    const w = Math.max(b.maxX - b.minX, 1e-6), h = Math.max(b.maxY - b.minY, 1e-6);
    this.sx = Math.min(this.W * (1 - 2 * margin) / w, this.H * (1 - 2 * margin) / (h * this.yRatio));
    if (!Number.isFinite(this.sx) || this.sx <= 0) this.sx = 1;
    this.sy = this.sx * this.yRatio;
    this.cx = (b.minX + b.maxX) / 2; this.cy = (b.minY + b.maxY) / 2;
    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    this.onDraw(ctx, this);
  }

  /** Taille d'un pixel en mètres (horizontal). */
  get pxToM() { return 1 / this.sx; }

  _bind() {
    const c = this.canvas;
    let drag = null;
    const pos = (ev) => { const r = c.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
    c.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const s = pos(ev), before = this.toWorld(s);
      const k = Math.exp(-ev.deltaY * 0.0015);
      this.sx *= k; this.sy = this.sx * this.yRatio;
      const after = this.toWorld(s);
      this.cx += before.x - after.x; this.cy += before.y - after.y;
      this.draw();
    }, { passive: false });
    c.addEventListener('pointerdown', (ev) => {
      c.setPointerCapture(ev.pointerId);
      const s = pos(ev), w = this.toWorld(s);
      let obj = null;
      if (this.hitTest && ev.button === 0) obj = this.hitTest(w, 8 / this.sx, 8 / this.sy);
      drag = { s0: s, w0: w, cx: this.cx, cy: this.cy, obj, moved: false };
      if (obj && this.onDragObj) this.onDragObj(obj, w, 'start');
    });
    c.addEventListener('pointermove', (ev) => {
      const s = pos(ev), w = this.toWorld(s);
      if (this.onHover) this.onHover(w, ev);
      if (!drag) return;
      const dx = s.x - drag.s0.x, dy = s.y - drag.s0.y;
      if (Math.hypot(dx, dy) > 3) drag.moved = true;
      if (drag.obj) { if (drag.moved && this.onDragObj) this.onDragObj(drag.obj, w, 'move'); return; }
      this.cx = drag.cx - dx / this.sx; this.cy = drag.cy + dy / this.sy;
      this.draw();
    });
    const up = (ev) => {
      if (!drag) return;
      const s = pos(ev), w = this.toWorld(s);
      if (drag.obj) { if (this.onDragObj) this.onDragObj(drag.obj, w, drag.moved ? 'end' : 'cancel'); }
      else if (!drag.moved && this.onClick && ev.button === 0) this.onClick(w, ev);
      drag = null;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', () => { drag = null; });
    c.addEventListener('pointerleave', () => { if (this.onHover) this.onHover(null); });
    new ResizeObserver(() => this.resize()).observe(c);
  }
}

/** Trace une polyligne monde sur le contexte. */
export function strokePoly(ctx, vp, pts, style = {}) {
  if (!pts || pts.length < 2) return;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) { const s = vp.toScreen(pts[i]); if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y); }
  if (style.closed) ctx.closePath();
  ctx.strokeStyle = style.color || '#000'; ctx.lineWidth = style.width || 1;
  ctx.setLineDash(style.dash || []);
  ctx.stroke(); ctx.setLineDash([]);
}

/** Pas de grille « rond » (1, 2, 5 × 10ⁿ) pour un espacement minimal en pixels. */
export function niceStep(pxPerUnit, minPx = 60) {
  const raw = minPx / pxPerUnit;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}
