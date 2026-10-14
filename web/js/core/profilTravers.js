// profilTravers.js — profils en travers : profil type appliqué à l'axe (dévers, talus,
// fossé), TN transversal échantillonné dans le TIN, surfaces déblai / remblai.
//
// Repère transversal : d = distance à l'axe, POSITIVE À GAUCHE (cohérent avec axe.js),
// z = cote. Un profil est une polyligne [{d, z}] triée par d croissant.
//
// Profil type (modèle) :
//   { demiChaussee: 3.5, penteChaussee: 0.025,   (toit : pente vers l'extérieur de chaque côté)
//     accotement: 1.5, penteAccotement: 0.04,
//     talusDeblai: 1.0,   (horizontal pour 1 vertical, ex. 1/1)
//     talusRemblai: 1.5,  (ex. 3/2 → 1.5)
//     fosse: { largeur: 0.5, profondeur: 0.5, largeurFond: 0.3 } | null,
//     emprise: 30 }       (demi-largeur de TN explorée)
// Convention dévers en courbe : plan unique incliné vers l'intérieur, z(d) = zAxe − s·dev·d.

import { axePointAt } from './axe.js';
import { deversPourRayon } from './normes.js';

export const PROFIL_TYPE_DEFAUT = {
  demiChaussee: 3.5, penteChaussee: 0.025,
  accotement: 1.5, penteAccotement: 0.04,
  talusDeblai: 1.0, talusRemblai: 1.5,
  fosse: { largeur: 0.5, profondeur: 0.5, largeurFond: 0.3 },
  emprise: 30,
};

/**
 * Pentes transversales de la chaussée au PK (gauche, droite), valeurs décimales
 * (positif = monte en s'éloignant de l'axe). Toit en alignement, dévers dans l'arc,
 * variation linéaire dans la clothoïde.
 */
export function pentesChaussee(built, pk, profilType, cat) {
  const p = axePointAt(built, pk);
  const el = p.element;
  const toit = -profilType.penteChaussee;
  if (el.type === 'droite') return { gauche: toit, droite: toit, devers: 0, s: 0 };
  const R = el.R, s = el.s;
  const dev = deversPourRayon(R, cat);
  // plan unique z = zAxe − s·dev·d. Pentes exprimées « en s'éloignant de l'axe » :
  //  gauche (d croissant)  → dz/d|d| = −s·dev ;  droite (d décroissant) → dz/d|d| = +s·dev.
  // Virage à gauche (s = +1) : gauche descend (intérieur), droite monte (extérieur). ✓
  const full = { gauche: -s * dev, droite: s * dev };
  if (el.type === 'arc') return { ...full, devers: dev, s };
  // clothoïde : t = progression du toit (0) vers le plan unique (1)
  const lambda = pk - el.pk0;
  const t = el.sens === 'entree' ? lambda / el.L : 1 - lambda / el.L;
  return { gauche: toit + t * (full.gauche - toit), droite: toit + t * (full.droite - toit), devers: dev * t, s };
}

/** TN transversal au PK : [{d, z|null, x, y}] de −emprise à +emprise. */
export function terrainTransversal(built, tin, pk, emprise = 30, step = 0.5) {
  const out = [];
  const n = Math.ceil(emprise / step);
  for (let k = -n; k <= n; k++) {
    const d = k * step;
    const p = axePointAt(built, pk, d);
    out.push({ d, x: p.x, y: p.y, z: tin ? tin.zAt(p.x, p.y) : null });
  }
  return out;
}

function zTn(tn, d) {
  let lo = 0, hi = tn.length - 1;
  if (d < tn[0].d || d > tn[hi].d) return null;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tn[m].d <= d) lo = m; else hi = m; }
  const a = tn[lo], b = tn[hi];
  if (a.z === null || b.z === null) return null;
  return b.d === a.d ? a.z : a.z + (b.z - a.z) * (d - a.d) / (b.d - a.d);
}

/**
 * Raccordement au terrain depuis le bord de plate-forme (dE, zE) vers l'extérieur
 * (dir = +1 gauche, −1 droite). Retourne les points ajoutés [{d, z, role}] et le mode.
 */
function raccordTalus(tn, dE, zE, dir, pt) {
  const zT = zTn(tn, dE);
  if (zT === null) return { pts: [], mode: 'inconnu' };
  const pts = [];
  let d0 = dE, z0 = zE;
  let mode;
  if (zT > zE) { // déblai : fossé éventuel puis talus montant
    mode = 'deblai';
    if (pt.fosse) {
      const f = pt.fosse;
      d0 = dE + dir * f.largeur; z0 = zE - f.profondeur; pts.push({ d: d0, z: z0, role: 'fond fossé' });
      d0 = d0 + dir * f.largeurFond; pts.push({ d: d0, z: z0, role: 'fond fossé' });
    }
  } else mode = 'remblai';
  const n = mode === 'deblai' ? pt.talusDeblai : pt.talusRemblai; // H pour 1 V
  const slope = (mode === 'deblai' ? 1 : -1) / n; // dz par mètre horizontal
  // marche le long du TN jusqu'au croisement
  const step = 0.25;
  let prevDiff = null, prevD = d0;
  for (let d = d0; Math.abs(d) <= Math.abs(tn[tn.length - 1].d); d += dir * step) {
    const zt = zTn(tn, d);
    if (zt === null) break;
    const zp = z0 + slope * Math.abs(d - d0);
    const diff = zp - zt;
    if (prevDiff !== null && (diff === 0 || (diff > 0) !== (prevDiff > 0))) {
      const t = prevDiff / (prevDiff - diff);
      const dc = prevD + (d - prevD) * t;
      pts.push({ d: dc, z: z0 + slope * Math.abs(dc - d0), role: 'entrée en terre' });
      return { pts, mode };
    }
    prevDiff = diff; prevD = d;
  }
  // pas de croisement dans l'emprise : on s'arrête au bord
  const dEnd = tn[dir > 0 ? tn.length - 1 : 0].d;
  pts.push({ d: dEnd, z: z0 + slope * Math.abs(dEnd - d0), role: 'hors emprise' });
  return { pts, mode, horsEmprise: true };
}

/**
 * Profil projet au PK : polyligne [{d, z, role}] de gauche à droite, calée sur zAxe.
 * Retourne aussi les modes de raccordement et l'emprise.
 */
export function profilProjet(built, tn, pk, zAxe, profilType, cat) {
  const pt = profilType;
  const pentes = pentesChaussee(built, pk, pt, cat);
  const sides = [];
  for (const dir of [1, -1]) {
    const pente = dir > 0 ? pentes.gauche : pentes.droite;
    const w = pt.demiChaussee;
    const zB = zAxe + pente * w; // bord de chaussée
    // accotement : côté extérieur d'un virage il suit le dévers (continuité du plan) ;
    // sinon il est au moins aussi pentu que sa pente nominale vers l'extérieur.
    const pAcc = pente > 0 ? pente : Math.min(pente, -pt.penteAccotement);
    const zE = zB + pAcc * pt.accotement;
    const dE = dir * (w + pt.accotement);
    const side = [{ d: dir * w, z: zB, role: 'bord chaussée' }, { d: dE, z: zE, role: 'bord plate-forme' }];
    const rac = raccordTalus(tn, dE, zE, dir, pt);
    sides.push({ dir, pts: side.concat(rac.pts), mode: rac.mode, horsEmprise: !!rac.horsEmprise });
  }
  const left = sides[0], right = sides[1];
  // polyligne triée par d croissant (droite → axe → gauche) ; le rendu inverse l'axe des d
  // pour dessiner la gauche à gauche (observateur regardant vers les PK croissants).
  const poly = left.pts.slice().reverse().concat([{ d: 0, z: zAxe, role: 'axe' }], right.pts);
  poly.sort((a, b) => a.d - b.d);
  return { pk, zAxe, points: poly, pentes, modeGauche: left.mode, modeDroite: right.mode, horsEmprise: left.horsEmprise || right.horsEmprise,
    empriseGauche: Math.abs(poly[poly.length - 1].d), empriseDroite: Math.abs(poly[0].d) };
}

/** Interpolation d'une polyligne [{d,z}] en d (null hors domaine). */
function zPoly(poly, d) {
  if (d < poly[0].d || d > poly[poly.length - 1].d) return null;
  for (let i = 1; i < poly.length; i++) {
    if (d <= poly[i].d) {
      const a = poly[i - 1], b = poly[i];
      return b.d === a.d ? b.z : a.z + (b.z - a.z) * (d - a.d) / (b.d - a.d);
    }
  }
  return poly[poly.length - 1].z;
}

/**
 * Surfaces déblai / remblai (m²) entre TN et projet sur l'emprise du projet.
 * Intégration exacte de la différence linéaire par morceaux, coupée aux croisements
 * (interpolation de l'ÉCART, pas de d — même invariant que BVTrace).
 */
export function surfaces(tn, projet) {
  const dMin = projet[0].d, dMax = projet[projet.length - 1].d;
  const breaks = new Set();
  for (const p of projet) breaks.add(p.d);
  for (const p of tn) if (p.d >= dMin && p.d <= dMax) breaks.add(p.d);
  const ds = [...breaks].sort((a, b) => a - b);
  let deblai = 0, remblai = 0, manquant = false;
  const diff = (d) => { const zt = zTn(tn, d), zp = zPoly(projet, d); if (zt === null || zp === null) return null; return zt - zp; };
  for (let i = 1; i < ds.length; i++) {
    const d0 = ds[i - 1], d1 = ds[i];
    const f0 = diff(d0), f1 = diff(d1);
    if (f0 === null || f1 === null) { manquant = true; continue; }
    const w = d1 - d0;
    if (f0 * f1 >= 0) {
      const a = (f0 + f1) / 2 * w;
      if (a >= 0) deblai += a; else remblai -= a;
    } else {
      const t = f0 / (f0 - f1);
      const a0 = f0 * t * w / 2, a1 = f1 * (1 - t) * w / 2;
      if (a0 >= 0) deblai += a0; else remblai -= a0;
      if (a1 >= 0) deblai += a1; else remblai -= a1;
    }
  }
  return { deblai, remblai, manquant };
}

/** Calcule un profil en travers complet au PK. */
export function profilEnTravers(built, tin, pk, ras, profilType, cat) {
  const tn = terrainTransversal(built, tin, pk, profilType.emprise);
  const zAxe = ras ? ras.zAt(pk) : null;
  const zTnAxe = zTn(tn, 0);
  if (zAxe === null) return { pk, tn, zTnAxe, projet: null, surfaces: null };
  const projet = profilProjet(built, tn, pk, zAxe, profilType, cat);
  const surf = surfaces(tn, projet.points);
  return { pk, tn, zTnAxe, zAxe, projet, surfaces: surf, hauteur: zTnAxe === null ? null : zAxe - zTnAxe };
}
