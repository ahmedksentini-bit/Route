// dxfWriter.js — écriture DXF R12 (AC1009) minimale : calques, POLYLINE/VERTEX,
// LINE, POINT, TEXT, CIRCLE. R12 est lu par tout logiciel CAO/DAO (AutoCAD, Covadis,
// Civil 3D, QGIS, LibreCAD). Pas de LWPOLYLINE (R14+) pour rester universel.

const n = (v, d = 4) => Number(v).toFixed(d);

export class DxfWriter {
  constructor() { this.layers = new Map(); this.body = []; }

  layer(name, color = 7) { if (!this.layers.has(name)) this.layers.set(name, color); return name; }

  _h(type, layer) { return `0\n${type}\n8\n${this.layer(layer)}\n`; }

  line(a, b, layer = '0') {
    this.body.push(this._h('LINE', layer) + `10\n${n(a.x)}\n20\n${n(a.y)}\n30\n${n(a.z || 0)}\n11\n${n(b.x)}\n21\n${n(b.y)}\n31\n${n(b.z || 0)}\n`);
  }

  point(p, layer = '0') {
    this.body.push(this._h('POINT', layer) + `10\n${n(p.x)}\n20\n${n(p.y)}\n30\n${n(p.z || 0)}\n`);
  }

  /** Polyligne 2D (élévation commune) ou 3D si opts.is3d (z par sommet). */
  polyline(pts, layer = '0', opts = {}) {
    if (!pts || pts.length < 2) return;
    const flags = (opts.closed ? 1 : 0) | (opts.is3d ? 8 : 0);
    let s = this._h('POLYLINE', layer) + `66\n1\n10\n0\n20\n0\n30\n${n(opts.elevation || 0)}\n70\n${flags}\n`;
    for (const p of pts) {
      s += `0\nVERTEX\n8\n${layer}\n10\n${n(p.x)}\n20\n${n(p.y)}\n30\n${n(opts.is3d ? (p.z || 0) : (opts.elevation || 0))}\n`;
      if (opts.is3d) s += `70\n32\n`;
    }
    s += `0\nSEQEND\n8\n${layer}\n`;
    this.body.push(s);
  }

  text(p, txt, h = 1, layer = '0', rotDeg = 0) {
    const t = String(txt).replace(/\r?\n/g, ' ');
    this.body.push(this._h('TEXT', layer) + `10\n${n(p.x)}\n20\n${n(p.y)}\n30\n0\n40\n${n(h, 3)}\n1\n${t}\n50\n${n(rotDeg, 3)}\n`);
  }

  circle(c, r, layer = '0') {
    this.body.push(this._h('CIRCLE', layer) + `10\n${n(c.x)}\n20\n${n(c.y)}\n30\n0\n40\n${n(r)}\n`);
  }

  toString() {
    let s = `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n9\n$INSUNITS\n70\n6\n0\nENDSEC\n`;
    s += `0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n${this.layers.size}\n`;
    for (const [name, color] of this.layers) s += `0\nLAYER\n2\n${name}\n70\n0\n62\n${color}\n6\nCONTINUOUS\n`;
    s += `0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n`;
    s += this.body.join('');
    s += `0\nENDSEC\n0\nEOF\n`;
    return s;
  }
}
