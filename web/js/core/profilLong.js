// profilLong.js — profil en long : terrain naturel (TN) le long de l'axe et rasante
// (ligne rouge) en « modèle paramétrique » : chaîne de sommets (pk, z, Rv) d'où se
// déduisent alignements droits et raccordements paraboliques. Comme dans BVTrace
// (docs/context/rasante.md), la géométrie n'est qu'un CACHE recalculé depuis les sommets :
// il n'existe pas de solveur bidirectionnel, et un état contradictoire est impossible.
//
// Convention : pentes en valeur décimale (0.03 = 3 %), montée positive dans le sens des PK.
// Parabole au sommet (pkS, zS) entre pentes i1 et i2, rayon Rv > 0 :
//   L = Rv·|i2 − i1| ; s0 = pkS − L/2 ; z(s) = zS + i1·(s − pkS) + (i2 − i1)·(s − s0)² / (2L)
// Signe du rayon affiché : négatif = angle saillant (butte), positif = angle rentrant (cuvette).

import { axePolyline } from './axe.js';

/** TN échantillonné le long de l'axe construit : [{pk, x, y, z|null}]. */
export function terrainAlongAxe(built, tin, step = 1) {
  const pl = axePolyline(built, Math.min(step, 2));
  const prof = tin ? tin.profileAlong(pl, step) : pl.map((p, i) => ({ s: i, x: p.x, y: p.y, z: null }));
  // recalage des abscisses sur les PK réels (la polyligne approche l'axe par des cordes)
  const scale = prof.length > 1 && prof[prof.length - 1].s > 0 ? built.length / prof[prof.length - 1].s : 1;
  return prof.map(p => ({ pk: built.pk0 + p.s * scale, x: p.x, y: p.y, z: p.z }));
}

/** Cote du TN interpolée dans un profil [{pk, z}] (null si pas d'encadrement valide). */
export function terrainZAt(profile, pk) {
  if (!profile || profile.length === 0) return null;
  let lo = 0, hi = profile.length - 1;
  if (pk < profile[0].pk || pk > profile[hi].pk) return null;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (profile[m].pk <= pk) lo = m; else hi = m; }
  const a = profile[lo], b = profile[hi];
  if (a.z === null || b.z === null) return null;
  if (b.pk === a.pk) return a.z;
  return a.z + (b.z - a.z) * (pk - a.pk) / (b.pk - a.pk);
}

/**
 * Construit la rasante. Entrée : { sommets: [{pk, z, Rv?}] } (Rv ignoré aux extrémités).
 * Sortie : { ok, errors, elements[], points[], zAt(pk), slopeAt(pk) }
 */
export function buildRasante(rasante) {
  const S = (rasante?.sommets || []).slice().sort((a, b) => a.pk - b.pk);
  const errors = [];
  const elements = [];
  const points = [];
  if (S.length < 2) return { ok: false, errors: ['au moins deux sommets de rasante'], elements, points, zAt: () => null, slopeAt: () => null, sommets: S };
  const slopes = [];
  for (let i = 1; i < S.length; i++) {
    const d = S[i].pk - S[i - 1].pk;
    if (d <= 0) { errors.push(`sommets ${i - 1} et ${i} : PK non croissants`); slopes.push(0); continue; }
    slopes.push((S[i].z - S[i - 1].z) / d);
  }
  // paraboles
  const paras = new Array(S.length).fill(null);
  for (let i = 1; i < S.length - 1; i++) {
    const Rv = Math.abs(Number(S[i].Rv) || 0);
    const i1 = slopes[i - 1], i2 = slopes[i];
    const di = i2 - i1;
    if (Rv <= 0 || Math.abs(di) < 1e-9) continue;
    const L = Rv * Math.abs(di);
    paras[i] = { Rv, i1, i2, L, s0: S[i].pk - L / 2, s1: S[i].pk + L / 2, pkS: S[i].pk, zS: S[i].z, saillant: di < 0, fleche: L * Math.abs(di) / 8 };
  }
  for (let i = 1; i < S.length - 1; i++) {
    const p = paras[i]; if (!p) continue;
    const prevEnd = paras[i - 1] ? paras[i - 1].s1 : S[i - 1].pk;
    const nextStart = paras[i + 1] ? paras[i + 1].s0 : S[i + 1].pk;
    if (p.s0 < prevEnd - 1e-6) errors.push(`sommet ${i} (PK ${S[i].pk.toFixed(2)}) : raccordement L=${p.L.toFixed(1)} m chevauche l'amont`);
    if (p.s1 > nextStart + 1e-6) errors.push(`sommet ${i} (PK ${S[i].pk.toFixed(2)}) : raccordement L=${p.L.toFixed(1)} m chevauche l'aval`);
  }
  // éléments
  let cur = S[0].pk;
  points.push({ pk: S[0].pk, z: S[0].z, label: 'Origine' });
  for (let i = 1; i < S.length; i++) {
    const i1 = slopes[i - 1];
    const p = paras[i];
    const endDroite = p ? p.s0 : S[i].pk;
    const zAtCur = S[i - 1].z + i1 * (cur - S[i - 1].pk);
    if (endDroite > cur + 1e-9) {
      elements.push({ type: 'droite', pk0: cur, pk1: endDroite, pente: i1, z0: zAtCur, z1: S[i - 1].z + i1 * (endDroite - S[i - 1].pk) });
    }
    if (p) {
      elements.push({ type: 'parabole', pk0: p.s0, pk1: p.s1, Rv: p.Rv * (p.saillant ? -1 : 1), L: p.L, i1: p.i1, i2: p.i2, pkS: p.pkS, zS: p.zS, s0: p.s0, saillant: p.saillant, fleche: p.fleche });
      points.push({ pk: p.s0, z: p.zS + p.i1 * (p.s0 - p.pkS), label: 'DR' });
      points.push({ pk: p.pkS, z: p.zS, label: `S${i} (${p.saillant ? 'saillant' : 'rentrant'})`, sommet: true });
      points.push({ pk: p.s1, z: p.zS + p.i2 * (p.s1 - p.pkS), label: 'FR' });
      // point haut / bas si la dérivée s'annule dans l'intervalle
      const sExt = p.s0 - p.i1 * p.L / (p.i2 - p.i1);
      if (sExt > p.s0 && sExt < p.s1) {
        const z = p.zS + p.i1 * (sExt - p.pkS) + (p.i2 - p.i1) * (sExt - p.s0) ** 2 / (2 * p.L);
        points.push({ pk: sExt, z, label: p.saillant ? 'Point haut' : 'Point bas' });
      }
      cur = p.s1;
    } else {
      cur = S[i].pk;
      if (i < S.length - 1) points.push({ pk: S[i].pk, z: S[i].z, label: `S${i} (angle vif)`, sommet: true });
    }
  }
  points.push({ pk: S[S.length - 1].pk, z: S[S.length - 1].z, label: 'Fin' });

  const find = (pk) => {
    if (elements.length === 0) return null;
    if (pk < elements[0].pk0 - 1e-9 || pk > elements[elements.length - 1].pk1 + 1e-9) return null;
    let lo = 0, hi = elements.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (elements[m].pk1 < pk) lo = m + 1; else hi = m; }
    return elements[lo];
  };
  const zAt = (pk) => {
    const e = find(pk); if (!e) return null;
    if (e.type === 'droite') return e.z0 + e.pente * (pk - e.pk0);
    return e.zS + e.i1 * (pk - e.pkS) + (e.i2 - e.i1) * (pk - e.s0) ** 2 / (2 * e.L);
  };
  const slopeAt = (pk) => {
    const e = find(pk); if (!e) return null;
    if (e.type === 'droite') return e.pente;
    return e.i1 + (e.i2 - e.i1) * (pk - e.s0) / e.L;
  };
  return { ok: errors.length === 0, errors, elements, points, zAt, slopeAt, sommets: S, pk0: S[0].pk, pk1: S[S.length - 1].pk };
}

/** Rasante automatique : droite joignant le TN aux deux extrémités (point de départ). */
export function rasanteFromTerrain(profile, nSommets = 2) {
  const valid = profile.filter(p => p.z !== null);
  if (valid.length < 2) return { sommets: [] };
  const first = valid[0], last = valid[valid.length - 1];
  const sommets = [];
  for (let k = 0; k < nSommets; k++) {
    const t = k / (nSommets - 1);
    const pk = first.pk + t * (last.pk - first.pk);
    const z = k === 0 ? first.z : k === nSommets - 1 ? last.z : terrainZAt(profile, pk);
    sommets.push({ pk, z: z ?? first.z, Rv: k === 0 || k === nSommets - 1 ? 0 : 3000 });
  }
  return { sommets };
}
