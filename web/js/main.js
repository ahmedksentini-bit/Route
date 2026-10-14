// main.js — orchestration de l'interface : état, recalcul, saisie, import/export.
// Tout le calcul vit dans js/core (pur, testé) ; ce fichier ne fait que relier l'UI.

import { buildAxe, tabulate, axePointAt, projectOnAxe } from './core/axe.js';
import { terrainAlongAxe, buildRasante, rasanteFromTerrain } from './core/profilLong.js';
import { profilEnTravers } from './core/profilTravers.js';
import { cubatures, cubaturesCsv } from './core/cubature.js';
import { CATEGORIES, controlerAxe, controlerRasante } from './core/normes.js';
import { Tin } from './core/tin.js';
import { parseDxf, drawables, extractSamples, layerStats } from './core/dxf.js';
import { dxfPlan, dxfProfilLong, dxfProfilsTravers, landXml, tabulationCsv } from './core/export.js';
import { newProject, serialize, deserialize } from './core/project.js';
import { bbox, formatPK, gisementGon } from './core/geom.js';
import { Viewport } from './ui/viewport.js';
import { drawPlan, aciColor as aci } from './ui/plan.js';
import { drawProfilLong, drawProfilTravers } from './ui/profils.js';

const $ = (id) => document.getElementById(id);
const S = {
  project: newProject(),
  dxf: null, drawables: null, layerVisible: new Map(), layerColors: new Map(),
  tin: null, contours: null,
  built: null, terrain: null, ras: null, stations: null, profils: null, cub: null,
  selSommet: null, selRas: null, selPk: null,
  mode: null, // 'addSommet' | 'addRas'
};
let vpPlan, vpPL, vpPT;

// ───────────────────────── statut
let statusTimer = null;
function status(msg, ms = 2500) { const el = $('status'); el.textContent = msg; el.classList.add('show'); clearTimeout(statusTimer); statusTimer = setTimeout(() => el.classList.remove('show'), ms); }

// ───────────────────────── recalcul
function recompute() {
  const P = S.project;
  S.built = buildAxe(P.axe);
  if (S.built.elements.length) {
    S.terrain = terrainAlongAxe(S.built, S.tin, 1);
    S.stations = tabulate(S.built, P.tabulation.pas || 25);
    S.ras = P.rasante.sommets.length >= 2 ? buildRasante(P.rasante) : null;
    if (S.tin && S.ras) {
      S.profils = S.stations.map(st => profilEnTravers(S.built, S.tin, st.pk, S.ras, P.profilType, P.categorie));
      S.cub = cubatures(S.profils.filter(p => p.surfaces).map(p => ({ pk: p.pk, deblai: p.surfaces.deblai, remblai: p.surfaces.remblai })));
    } else { S.profils = null; S.cub = null; }
  } else { S.terrain = null; S.stations = null; S.ras = null; S.profils = null; S.cub = null; }
  renderSidebar();
  renderTables();
  vpPlan.draw(); vpPL.draw(); renderPT();
  autosave();
}

// ───────────────────────── sidebar
function renderSidebar() {
  const P = S.project;
  // sommets
  const tb = $('tblSommets').querySelector('tbody');
  tb.innerHTML = '';
  P.axe.sommets.forEach((s, i) => {
    const tr = document.createElement('tr');
    if (i === S.selSommet) tr.className = 'sel';
    const inter = i > 0 && i < P.axe.sommets.length - 1;
    tr.innerHTML = `<td>S${i}</td><td><input data-k="x" value="${s.x.toFixed(3)}"></td><td><input data-k="y" value="${s.y.toFixed(3)}"></td>` +
      `<td><input data-k="R" value="${inter ? (s.R || '') : ''}" ${inter ? '' : 'disabled'}></td><td><input data-k="A" value="${inter ? (s.A || '') : ''}" ${inter ? '' : 'disabled'}></td><td class="del"><button title="Supprimer">✕</button></td>`;
    tr.querySelectorAll('input').forEach(inp => inp.addEventListener('change', () => { const v = parseFloat(inp.value.replace(',', '.')); s[inp.dataset.k] = Number.isFinite(v) ? v : 0; recompute(); }));
    tr.querySelector('button').addEventListener('click', () => { P.axe.sommets.splice(i, 1); S.selSommet = null; recompute(); });
    tr.addEventListener('click', () => { S.selSommet = i; vpPlan.draw(); });
    tb.appendChild(tr);
  });
  $('axeErrors').innerHTML = S.built ? S.built.errors.map(e => `<div>⚠ ${e}</div>`).join('') : '';
  const ctl = S.built && S.built.elements.length ? controlerAxe(S.built, P.categorie) : [];
  $('axeControls').innerHTML = ctl.map(c => `<div class="${c.niveau}">${c.niveau === 'erreur' ? '✖' : '△'} PK ${formatPK(c.pk)} : ${c.message}</div>`).join('') || (S.built?.elements.length ? '<div class="muted">Contrôles ARP : conforme</div>' : '');
  $('axeElements').innerHTML = S.built ? S.built.elements.map(el => {
    const d = el.type === 'droite' ? `gisement ${gisementGon(el.start.theta).toFixed(3)} gon` : el.type === 'arc' ? `R=${el.R} (${el.s > 0 ? 'gauche' : 'droite'}) θ=${(el.angle * 180 / Math.PI).toFixed(3)}°` : `A=${el.A} R=${el.R} τ=${(el.tau * 180 / Math.PI).toFixed(3)}° ${el.sens}`;
    return `<div class="${el.type}">${formatPK(el.pk0)} → ${formatPK(el.pk1)} · ${el.type} L=${el.L.toFixed(2)} · ${d}</div>`;
  }).join('') + (S.built.elements.length ? `<div><b>Longueur ${S.built.length.toFixed(2)} m</b></div>` : '') : '';
  // rasante
  const tr2 = $('tblRasante').querySelector('tbody');
  tr2.innerHTML = '';
  P.rasante.sommets.forEach((s, i) => {
    const tr = document.createElement('tr');
    if (i === S.selRas) tr.className = 'sel';
    const inter = i > 0 && i < P.rasante.sommets.length - 1;
    tr.innerHTML = `<td>${i}</td><td><input data-k="pk" value="${s.pk.toFixed(2)}"></td><td><input data-k="z" value="${s.z.toFixed(3)}"></td><td><input data-k="Rv" value="${inter ? (s.Rv || '') : ''}" ${inter ? '' : 'disabled'}></td><td class="del"><button title="Supprimer">✕</button></td>`;
    tr.querySelectorAll('input').forEach(inp => inp.addEventListener('change', () => { const v = parseFloat(inp.value.replace(',', '.')); s[inp.dataset.k] = Number.isFinite(v) ? v : 0; P.rasante.sommets.sort((a, b) => a.pk - b.pk); recompute(); }));
    tr.querySelector('button').addEventListener('click', () => { P.rasante.sommets.splice(i, 1); S.selRas = null; recompute(); });
    tr.addEventListener('click', () => { S.selRas = i; vpPL.draw(); });
    tr2.appendChild(tr);
  });
  $('rasErrors').innerHTML = S.ras ? S.ras.errors.map(e => `<div>⚠ ${e}</div>`).join('') : '';
  const ctr = S.ras ? controlerRasante(S.ras, P.categorie) : [];
  $('rasControls').innerHTML = ctr.map(c => `<div class="${c.niveau}">${c.niveau === 'erreur' ? '✖' : '△'} PK ${formatPK(c.pk)} : ${c.message}</div>`).join('') || (S.ras ? '<div class="muted">Contrôles ARP : conforme</div>' : '');
}

function renderProfilTypeInputs() {
  const pt = S.project.profilType;
  $('ptDemi').value = pt.demiChaussee; $('ptPente').value = pt.penteChaussee * 100; $('ptAcc').value = pt.accotement; $('ptPenteAcc').value = pt.penteAccotement * 100;
  $('ptTalD').value = pt.talusDeblai; $('ptTalR').value = pt.talusRemblai; $('ptFosse').checked = !!pt.fosse;
  $('ptFL').value = pt.fosse?.largeur ?? 0.5; $('ptFP').value = pt.fosse?.profondeur ?? 0.5; $('ptFF').value = pt.fosse?.largeurFond ?? 0.3; $('ptEmprise').value = pt.emprise;
  $('pk0').value = S.project.axe.pk0 || 0; $('pasTab').value = S.project.tabulation.pas; $('categorie').value = S.project.categorie; $('projName').value = S.project.nom;
  const r = S.project.fond.regles; $('rPoints').checked = r.points; $('rPolys').checked = r.polylines; $('rFaces').checked = r.faces; $('rBlocks').checked = r.blocks; $('rTexts').checked = r.texts; $('rZero').checked = !!r.includeZero;
  $('maxEdgeFactor').value = S.project.fond.maxEdgeFactor;
}
function readProfilTypeInputs() {
  const pt = S.project.profilType;
  const num = (id, d) => { const v = parseFloat($(id).value); return Number.isFinite(v) ? v : d; };
  pt.demiChaussee = num('ptDemi', 3.5); pt.penteChaussee = num('ptPente', 2.5) / 100; pt.accotement = num('ptAcc', 1.5); pt.penteAccotement = num('ptPenteAcc', 4) / 100;
  pt.talusDeblai = num('ptTalD', 1); pt.talusRemblai = num('ptTalR', 1.5);
  pt.fosse = $('ptFosse').checked ? { largeur: num('ptFL', 0.5), profondeur: num('ptFP', 0.5), largeurFond: num('ptFF', 0.3) } : null;
  pt.emprise = num('ptEmprise', 30);
  S.project.axe.pk0 = num('pk0', 0); S.project.tabulation.pas = Math.max(1, num('pasTab', 25));
  S.project.categorie = $('categorie').value; S.project.nom = $('projName').value;
  const r = S.project.fond.regles; r.points = $('rPoints').checked; r.polylines = $('rPolys').checked; r.faces = $('rFaces').checked; r.blocks = $('rBlocks').checked; r.texts = $('rTexts').checked; r.includeZero = $('rZero').checked;
  S.project.fond.maxEdgeFactor = num('maxEdgeFactor', 4);
}

function renderLayers() {
  const el = $('layerList');
  el.innerHTML = '';
  if (!S.dxf) { el.innerHTML = '<span class="muted">—</span>'; return; }
  for (const l of layerStats(S.dxf)) {
    const lab = document.createElement('label');
    const vis = S.layerVisible.get(l.name) !== false;
    lab.innerHTML = `<input type="checkbox" ${vis ? 'checked' : ''}><span class="sw" style="background:${aci(l.color)}"></span><span>${l.name}</span><span class="n">${l.n}</span>`;
    lab.querySelector('input').addEventListener('change', (e) => { S.layerVisible.set(l.name, e.target.checked); vpPlan.draw(); });
    el.appendChild(lab);
  }
}

// ───────────────────────── tables
function td(v) { return `<td>${v}</td>`; }
function renderTables() {
  const t = $('tblTab');
  if (!S.stations) { t.innerHTML = '<tr><td class="muted">Tracer un axe.</td></tr>'; }
  else {
    const zt = (pk) => { const a = S.terrain; if (!a) return null; let lo = 0, hi = a.length - 1; if (pk < a[0].pk || pk > a[hi].pk) return null; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (a[m].pk <= pk) lo = m; else hi = m; } if (a[lo].z === null || a[hi].z === null) return null; return a[hi].pk === a[lo].pk ? a[lo].z : a[lo].z + (a[hi].z - a[lo].z) * (pk - a[lo].pk) / (a[hi].pk - a[lo].pk); };
    let h = '<thead><tr><th>N</th><th>PK</th><th>Point</th><th>X</th><th>Y</th><th>Gisement (gon)</th><th>R (m)</th><th>Élément</th><th>Z TN</th><th>Z projet</th><th>Hauteur</th><th>S déblai</th><th>S remblai</th></tr></thead><tbody>';
    S.stations.forEach((st, i) => {
      const z = zt(st.pk), zp = S.ras ? S.ras.zAt(st.pk) : null, pr = S.profils ? S.profils[i] : null;
      h += `<tr data-pk="${st.pk}">${td(st.n)}${td(formatPK(st.pk))}${td(st.labels.join(' '))}${td(st.x.toFixed(3))}${td(st.y.toFixed(3))}${td(gisementGon(st.theta).toFixed(4))}${td(Number.isFinite(st.R) ? st.R.toFixed(1) : '∞')}${td(st.type)}${td(z === null ? '' : z.toFixed(2))}${td(zp === null ? '' : zp.toFixed(2))}${td(z === null || zp === null ? '' : (zp - z).toFixed(2))}${td(pr?.surfaces ? pr.surfaces.deblai.toFixed(2) : '')}${td(pr?.surfaces ? pr.surfaces.remblai.toFixed(2) : '')}</tr>`;
    });
    t.innerHTML = h + '</tbody>';
    t.querySelectorAll('tr[data-pk]').forEach(tr => tr.addEventListener('click', () => { S.selPk = parseFloat(tr.dataset.pk); vpPlan.draw(); vpPL.draw(); selectPT(S.selPk); }));
  }
  const c = $('tblCub'), sum = $('cubSummary');
  if (!S.cub || !S.cub.rows.length) { c.innerHTML = ''; sum.innerHTML = '<span class="muted">Cubatures : il faut un TIN, un axe et une rasante.</span>'; return; }
  sum.innerHTML = `<span>Déblai <b>${S.cub.totalDeblai.toFixed(0)} m³</b></span><span>Remblai <b>${S.cub.totalRemblai.toFixed(0)} m³</b></span><span>Bilan <b>${S.cub.bilan.toFixed(0)} m³</b> (${S.cub.bilan >= 0 ? 'excédent' : 'déficit'})</span>`;
  let h = '<thead><tr><th>PK</th><th>S déblai (m²)</th><th>S remblai (m²)</th><th>Dist. (m)</th><th>V déblai (m³)</th><th>V remblai (m³)</th><th>Cumul déblai</th><th>Cumul remblai</th><th>Mouvement</th></tr></thead><tbody>';
  for (const r of S.cub.rows) h += `<tr>${td(formatPK(r.pk))}${td(r.deblai.toFixed(2))}${td(r.remblai.toFixed(2))}${td(r.dPk.toFixed(2))}${td(r.vDeblai.toFixed(1))}${td(r.vRemblai.toFixed(1))}${td(r.cumDeblai.toFixed(1))}${td(r.cumRemblai.toFixed(1))}${td(r.mouvement.toFixed(1))}</tr>`;
  c.innerHTML = h + '</tbody>';
}

// ───────────────────────── profils en travers
function renderPT() {
  const sel = $('ptSelect');
  const prev = sel.value;
  sel.innerHTML = '';
  if (!S.stations) { $('ptInfo').textContent = 'Tracer un axe (et une rasante) pour calculer les profils.'; vpPT.draw(); return; }
  S.stations.forEach((st, i) => { const o = document.createElement('option'); o.value = i; o.textContent = `${st.n} — PK ${formatPK(st.pk)} ${st.labels.join(' ')}`; sel.appendChild(o); });
  if (prev && sel.querySelector(`option[value="${prev}"]`)) sel.value = prev;
  drawPTCurrent();
}
function selectPT(pk) {
  if (!S.stations) return;
  let best = 0; S.stations.forEach((st, i) => { if (Math.abs(st.pk - pk) < Math.abs(S.stations[best].pk - pk)) best = i; });
  $('ptSelect').value = best; drawPTCurrent();
}
let ptCurrent = null;
function drawPTCurrent() {
  const i = parseInt($('ptSelect').value, 10);
  if (!S.stations || !Number.isFinite(i)) { ptCurrent = null; vpPT.draw(); return; }
  const st = S.stations[i];
  ptCurrent = S.profils ? S.profils[i] : profilEnTravers(S.built, S.tin, st.pk, S.ras, S.project.profilType, S.project.categorie);
  S.selPk = st.pk;
  const pr = ptCurrent;
  const info = [];
  if (pr.zTnAxe !== null && pr.zTnAxe !== undefined) info.push(`Z TN ${pr.zTnAxe.toFixed(2)}`);
  if (pr.zAxe !== null && pr.zAxe !== undefined) info.push(`Z projet ${pr.zAxe.toFixed(2)}`, `hauteur ${(pr.hauteur ?? 0).toFixed(2)} m`);
  if (pr.surfaces) info.push(`déblai ${pr.surfaces.deblai.toFixed(2)} m²`, `remblai ${pr.surfaces.remblai.toFixed(2)} m²`);
  if (pr.projet) { info.push(`pentes G ${(pr.projet.pentes.gauche * 100).toFixed(2)} % / D ${(pr.projet.pentes.droite * 100).toFixed(2)} %`); if (pr.projet.horsEmprise) info.push('⚠ talus hors emprise'); }
  if (!S.tin) info.push('(pas de TIN : TN inconnu)');
  $('ptInfo').textContent = info.join(' · ');
  const pts = pr.tn.filter(t => t.z !== null).map(t => ({ x: -t.d, y: t.z })).concat(pr.projet ? pr.projet.points.map(q => ({ x: -q.d, y: q.z })) : []);
  if (pts.length) vpPT.fit(bbox(pts), 0.1); else vpPT.draw();
  vpPlan.draw(); vpPL.draw();
}

// ───────────────────────── import DXF / DWG
async function importFile(file) {
  let text;
  if (/\.dwg$/i.test(file.name)) {
    const url = $('convUrl').value.trim();
    if (!url) { status('Renseigner l\'URL du convertisseur DWG→DXF (ou exporter en DXF depuis AutoCAD).', 5000); return; }
    status('Conversion DWG → DXF…', 60000);
    const fd = new FormData(); fd.append('file', file);
    const resp = await fetch(url, { method: 'POST', body: fd });
    if (!resp.ok) { status(`Conversion échouée (${resp.status}) : ${await resp.text()}`, 6000); return; }
    text = await resp.text();
  } else text = await file.text();
  status('Lecture du DXF…', 10000);
  await new Promise(r => setTimeout(r, 10));
  S.dxf = parseDxf(text);
  S.drawables = drawables(S.dxf);
  for (const d of S.drawables) if (d.type === 'poly') d.bbox = bbox(d.pts);
  S.layerColors = new Map([...S.dxf.layers.values()].map(l => [l.name, l.color]));
  S.layerVisible = new Map();
  S.project.fond.fichier = file.name;
  S.tin = null; S.contours = null;
  const all = S.drawables.flatMap(d => d.type === 'poly' ? d.pts : [d]);
  $('fondInfo').textContent = `${file.name} — ${S.dxf.entities.length} entités, ${S.dxf.layers.size} calques, ${S.dxf.blocks.size} blocs`;
  renderLayers();
  if (all.length) vpPlan.fit(bbox(all));
  status(`DXF chargé : ${S.dxf.entities.length} entités.`);
  buildTin();
}

function buildTin() {
  if (!S.dxf) { status('Importer d\'abord un DXF.'); return; }
  readProfilTypeInputs();
  const layers = new Set([...S.layerVisible.entries()].filter(([, v]) => v === false).map(([k]) => k));
  const allowed = new Set(layerStats(S.dxf).map(l => l.name).filter(n => !layers.has(n)));
  const { samples, stats } = extractSamples(S.dxf, { ...S.project.fond.regles, layers: allowed });
  if (samples.length < 3) { S.tin = null; S.contours = null; $('tinInfo').textContent = `Semis insuffisant (${samples.length} points). Vérifier les règles d'extraction et les calques.`; recompute(); return; }
  const t0 = performance.now();
  S.tin = new Tin(samples, { maxEdgeFactor: S.project.fond.maxEdgeFactor });
  S.project.samples = samples;
  const step = parseFloat($('contourStep').value);
  S.contours = step > 0 ? S.tin.contours(step) : null;
  $('tinInfo').textContent = `${samples.length} points (POINT ${stats.points}, polylignes ${stats.polylines}, faces ${stats.faces}, textes ${stats.texts}, blocs ${stats.blocks}) → ${S.tin.keptCount} triangles conservés (arête médiane ${S.tin.medianEdge.toFixed(1)} m, α = ${S.tin.maxEdge.toFixed(1)} m), Z ${S.tin.bbox.minZ.toFixed(1)} à ${S.tin.bbox.maxZ.toFixed(1)} — ${(performance.now() - t0).toFixed(0)} ms`;
  status(`TIN construit : ${S.tin.keptCount} triangles.`);
  recompute();
}

// ───────────────────────── fichiers
function download(name, content, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function autosave() { try { localStorage.setItem('route.project', serialize(S.project, { includeSamples: false })); } catch { /* quota */ } }
function loadProject(obj) {
  S.project = obj; S.selSommet = S.selRas = S.selPk = null;
  if (obj.samples && obj.samples.length >= 3) { S.tin = new Tin(obj.samples, { maxEdgeFactor: obj.fond.maxEdgeFactor || 4 }); S.contours = S.tin.contours(parseFloat($('contourStep').value) || 1); $('tinInfo').textContent = `TIN restauré depuis le projet : ${S.tin.keptCount} triangles.`; }
  renderProfilTypeInputs();
  recompute();
  const pts = obj.axe.sommets.length ? obj.axe.sommets : (obj.samples || []);
  if (pts.length) vpPlan.fit(bbox(pts));
  fitPL();
}
function fitPL() {
  if (!S.terrain) return;
  const pts = S.terrain.filter(p => p.z !== null).map(p => ({ x: p.pk, y: p.z })).concat(S.project.rasante.sommets.map(s => ({ x: s.pk, y: s.z })));
  if (!pts.length) pts.push({ x: S.built.pk0, y: 0 }, { x: S.built.pk1, y: 10 });
  vpPL.fit(bbox(pts), 0.1);
}

function exportFile(kind) {
  readProfilTypeInputs();
  const P = S.project, base = (P.nom || 'route').replace(/[^\w\-]+/g, '_');
  if (!S.built || !S.built.elements.length) { status('Aucun axe à exporter.'); return; }
  switch (kind) {
    case 'dxfPlan': download(`${base}_plan.dxf`, dxfPlan({ built: S.built, axe: P.axe, stations: S.stations, profilType: P.profilType, tin: S.tin, contoursStep: parseFloat($('contourStep').value) || 0 }), 'application/dxf'); break;
    case 'dxfPL': if (!S.terrain) return status('Pas de profil en long.'); download(`${base}_profil_en_long.dxf`, dxfProfilLong({ built: S.built, terrain: S.terrain, ras: S.ras, exag: parseFloat($('exag').value) || 10 }), 'application/dxf'); break;
    case 'dxfPT': if (!S.profils) return status('Il faut un TIN et une rasante.'); download(`${base}_profils_en_travers.dxf`, dxfProfilsTravers({ profils: S.profils }), 'application/dxf'); break;
    case 'landxml': download(`${base}.xml`, landXml({ name: P.nom, built: S.built, ras: S.ras, tin: S.tin }), 'application/xml'); break;
    case 'csvTab': download(`${base}_tabulation.csv`, tabulationCsv(S.stations, S.terrain, S.ras), 'text/csv'); break;
    case 'csvCub': if (!S.cub) return status('Pas de cubatures.'); download(`${base}_cubatures.csv`, cubaturesCsv(S.cub), 'text/csv'); break;
  }
}

// ───────────────────────── initialisation
function init() {
  for (const [k, c] of Object.entries(CATEGORIES)) { const o = document.createElement('option'); o.value = k; o.textContent = c.label; $('categorie').appendChild(o); }
  vpPlan = new Viewport($('cvPlan'), {
    onDraw: (ctx, vp) => drawPlan(ctx, vp, S, { showFond: $('showFond').checked, showContours: $('showContours').checked, showTin: $('showTin').checked, showBords: $('showBords').checked, showStations: $('showStations').checked }),
    onClick: (w) => {
      if (S.mode === 'addSommet') { S.project.axe.sommets.push({ x: +w.x.toFixed(3), y: +w.y.toFixed(3), R: 0, A: 0 }); S.selSommet = S.project.axe.sommets.length - 1; recompute(); }
      else if (S.built && S.built.elements.length) { const pr = projectOnAxe(S.built, w); if (Math.abs(pr.d) < S.project.profilType.emprise) { S.selPk = pr.pk; selectPT(pr.pk); } }
    },
    onHover: (w) => { if (!w) return; let extra = ''; if (S.tin) { const z = S.tin.zAt(w.x, w.y); if (z !== null) extra = `  Z ${z.toFixed(2)}`; } if (S.built && S.built.elements.length) { const pr = projectOnAxe(S.built, w); extra += `  PK ${formatPK(pr.pk)} d ${pr.d.toFixed(2)}`; } $('planCoords').textContent = `X ${w.x.toFixed(2)}  Y ${w.y.toFixed(2)}${extra}`; },
    hitTest: (w, tol) => { const som = S.project.axe.sommets; for (let i = som.length - 1; i >= 0; i--) if (Math.hypot(som[i].x - w.x, som[i].y - w.y) < tol) return { i }; return null; },
    onDragObj: (obj, w, phase) => { if (phase === 'start' || phase === 'cancel') { S.selSommet = obj.i; vpPlan.draw(); renderSidebar(); return; } const s = S.project.axe.sommets[obj.i]; s.x = +w.x.toFixed(3); s.y = +w.y.toFixed(3); if (phase === 'end') recompute(); else { S.built = buildAxe(S.project.axe); vpPlan.draw(); } },
  });
  vpPL = new Viewport($('cvPL'), {
    yRatio: 10,
    onDraw: (ctx, vp) => drawProfilLong(ctx, vp, S),
    onClick: (w) => { if (S.mode === 'addRas' && S.built) { S.project.rasante.sommets.push({ pk: +w.x.toFixed(2), z: +w.y.toFixed(3), Rv: 0 }); S.project.rasante.sommets.sort((a, b) => a.pk - b.pk); recompute(); } else if (S.built) { S.selPk = w.x; selectPT(w.x); } },
    onHover: (w) => { if (!w) return; let zt = ''; if (S.terrain) { const t = S.terrain.find(p => Math.abs(p.pk - w.x) < 0.5); if (t && t.z !== null) zt = `  TN ${t.z.toFixed(2)}`; } const zr = S.ras ? S.ras.zAt(w.x) : null; $('plCoords').textContent = `PK ${formatPK(w.x)}  Z ${w.y.toFixed(2)}${zt}${zr !== null ? `  projet ${zr.toFixed(2)}` : ''}`; },
    hitTest: (w, tolX, tolY) => { const som = S.project.rasante.sommets; for (let i = som.length - 1; i >= 0; i--) if (Math.abs(som[i].pk - w.x) < tolX && Math.abs(som[i].z - w.y) < tolY) return { i }; return null; },
    onDragObj: (obj, w, phase) => { if (phase === 'start' || phase === 'cancel') { S.selRas = obj.i; vpPL.draw(); renderSidebar(); return; } const s = S.project.rasante.sommets[obj.i]; s.pk = +w.x.toFixed(2); s.z = +w.y.toFixed(3); if (phase === 'end') { S.project.rasante.sommets.sort((a, b) => a.pk - b.pk); recompute(); } else { S.ras = buildRasante(S.project.rasante); vpPL.draw(); } },
  });
  vpPT = new Viewport($('cvPT'), { yRatio: 1, onDraw: (ctx, vp) => drawProfilTravers(ctx, vp, ptCurrent) });

  // onglets
  document.querySelectorAll('.side-tabs button').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('.side-tabs button, .side-panel').forEach(e => e.classList.remove('active')); b.classList.add('active'); $('side-' + b.dataset.side).classList.add('active'); }));
  document.querySelectorAll('.main-tabs button').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('.main-tabs button, .view').forEach(e => e.classList.remove('active')); b.classList.add('active'); $('view-' + b.dataset.view).classList.add('active'); setTimeout(() => { vpPlan.resize(); vpPL.resize(); vpPT.resize(); if (b.dataset.view === 'pl') fitPL(); if (b.dataset.view === 'pt') drawPTCurrent(); }, 0); }));
  // modes
  const setMode = (m) => { S.mode = S.mode === m ? null : m; $('modeAddSommet').classList.toggle('active', S.mode === 'addSommet'); $('modeAddRas').classList.toggle('active', S.mode === 'addRas'); $('cvPlan').style.cursor = S.mode === 'addSommet' ? 'crosshair' : ''; $('cvPL').style.cursor = S.mode === 'addRas' ? 'crosshair' : ''; };
  $('modeAddSommet').addEventListener('click', () => { setMode('addSommet'); });
  $('modeAddRas').addEventListener('click', () => { setMode('addRas'); document.querySelector('.main-tabs button[data-view=pl]').click(); });
  $('btnClearAxe').addEventListener('click', () => { if (confirm('Supprimer tous les sommets de l\'axe ?')) { S.project.axe.sommets = []; S.project.rasante.sommets = []; recompute(); } });
  $('btnClearRas').addEventListener('click', () => { S.project.rasante.sommets = []; recompute(); });
  $('btnRasAuto').addEventListener('click', () => { if (!S.terrain) return status('Il faut un axe et un TIN.'); S.project.rasante = rasanteFromTerrain(S.terrain, 2); recompute(); fitPL(); });
  $('btnTin').addEventListener('click', buildTin);
  $('contourStep').addEventListener('change', () => { if (S.tin) { const st = parseFloat($('contourStep').value); S.contours = st > 0 ? S.tin.contours(st) : null; vpPlan.draw(); } });
  ['ptDemi', 'ptPente', 'ptAcc', 'ptPenteAcc', 'ptTalD', 'ptTalR', 'ptFosse', 'ptFL', 'ptFP', 'ptFF', 'ptEmprise', 'pk0', 'pasTab', 'categorie', 'projName'].forEach(id => $(id).addEventListener('change', () => { readProfilTypeInputs(); recompute(); }));
  ['showFond', 'showContours', 'showTin', 'showBords', 'showStations'].forEach(id => $(id).addEventListener('change', () => vpPlan.draw()));
  $('exag').addEventListener('change', () => { vpPL.setYRatio(parseFloat($('exag').value) || 10); fitPL(); });
  $('btnZoomFit').addEventListener('click', () => { const pts = (S.drawables ? S.drawables.flatMap(d => d.type === 'poly' ? d.pts : [d]) : []).concat(S.project.axe.sommets); if (pts.length) vpPlan.fit(bbox(pts)); });
  $('ptSelect').addEventListener('change', drawPTCurrent);
  // fichiers
  $('btnImport').addEventListener('click', () => $('fileDxf').click());
  $('fileDxf').addEventListener('change', async (e) => { const f = e.target.files[0]; if (f) { try { await importFile(f); } catch (err) { console.error(err); status('Erreur de lecture : ' + err.message, 6000); } } e.target.value = ''; });
  $('btnOpen').addEventListener('click', () => $('fileProj').click());
  $('fileProj').addEventListener('change', async (e) => { const f = e.target.files[0]; if (f) { try { loadProject(deserialize(await f.text())); status('Projet chargé.'); } catch (err) { status('Projet illisible : ' + err.message, 5000); } } e.target.value = ''; });
  $('btnSave').addEventListener('click', () => { readProfilTypeInputs(); download(`${(S.project.nom || 'route').replace(/[^\w\-]+/g, '_')}.route.json`, serialize(S.project), 'application/json'); });
  $('btnNew').addEventListener('click', () => { if (confirm('Nouveau projet ? (le fond DXF et le TIN sont conservés)')) { const p = newProject(); p.fond = S.project.fond; p.samples = S.project.samples; loadProject(p); } });
  document.querySelectorAll('[data-export]').forEach(b => b.addEventListener('click', () => exportFile(b.dataset.export)));
  $('btnHelp').addEventListener('click', () => $('helpDlg').showModal());
  $('convUrl').value = localStorage.getItem('route.convUrl') || '';
  $('convUrl').addEventListener('change', () => localStorage.setItem('route.convUrl', $('convUrl').value.trim()));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMode(null); if (e.key === 'Delete' && S.selSommet !== null && document.activeElement.tagName !== 'INPUT') { S.project.axe.sommets.splice(S.selSommet, 1); S.selSommet = null; recompute(); } });

  // restauration
  const saved = localStorage.getItem('route.project');
  if (saved) { try { loadProject(deserialize(saved)); } catch { renderProfilTypeInputs(); recompute(); } }
  else { renderProfilTypeInputs(); recompute(); }
  renderLayers();
}
init();
