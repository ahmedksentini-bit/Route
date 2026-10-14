// normes.js — valeurs normatives de conception géométrique.
//
// ⚠ Les tableaux ci-dessous sont transcrits de mémoire des catégories ARP (SETRA, 1994,
// « Aménagement des routes principales ») et doivent être vérifiés contre le texte avant
// tout usage contractuel (voir docs/context/normes.md : chaque valeur y est tracée avec
// son statut « vérifié / à vérifier »). Les tables ICTAAL (autoroutes) et ICTAVRU (voies
// rapides urbaines) ne sont pas encore saisies — catégorie « personnalisée » en attendant.

export const CATEGORIES = {
  R60: { label: 'ARP R60 (Vr 60)', V: 60, Rmin: 120, Rnd: 600, deversMax: 0.07, deversMin: 0.025, penteMax: 0.07, RvSaillantMin: 1500, RvRentrantMin: 1500 },
  R80: { label: 'ARP R80 (Vr 80)', V: 80, Rmin: 240, Rnd: 900, deversMax: 0.07, deversMin: 0.025, penteMax: 0.06, RvSaillantMin: 3000, RvRentrantMin: 2200 },
  T80: { label: 'ARP T80 (Vr 80)', V: 80, Rmin: 240, Rnd: 900, deversMax: 0.07, deversMin: 0.025, penteMax: 0.06, RvSaillantMin: 3000, RvRentrantMin: 2200 },
  T100: { label: 'ARP T100 (Vr 100)', V: 100, Rmin: 425, Rnd: 1300, deversMax: 0.07, deversMin: 0.025, penteMax: 0.05, RvSaillantMin: 6000, RvRentrantMin: 3000 },
  perso: { label: 'Personnalisée', V: 80, Rmin: 240, Rnd: 900, deversMax: 0.07, deversMin: 0.025, penteMax: 0.06, RvSaillantMin: 3000, RvRentrantMin: 2200 },
};

/**
 * Dévers (valeur décimale, positive) pour un rayon R dans la catégorie donnée.
 * R ≥ Rnd → toit (profil en travers normal, dévers = deversMin de chaque côté).
 * Rmin ≤ R < Rnd → interpolation linéaire en 1/R entre deversMax (à Rmin) et deversMin (à Rnd).
 * (Simplification : l'ARP donne un tableau par catégorie — à substituer, cf. normes.md.)
 */
export function deversPourRayon(R, cat) {
  const c = typeof cat === 'string' ? CATEGORIES[cat] : cat;
  if (!Number.isFinite(R) || R <= 0) return c.deversMin;
  R = Math.abs(R);
  if (R >= c.Rnd) return c.deversMin;
  if (R <= c.Rmin) return c.deversMax;
  const t = (1 / R - 1 / c.Rnd) / (1 / c.Rmin - 1 / c.Rnd);
  return c.deversMin + t * (c.deversMax - c.deversMin);
}

/**
 * Longueur minimale de clothoïde (m) :
 *  - gauchissement : variation de dévers ≤ 2 %/s de parcours à la vitesse V
 *    (Δd en valeur décimale, V en km/h) ;
 *  - perception optique : A ≥ R/3 ⇒ L = A²/R ≥ R/9.
 */
export function clothoideLongueurMin(R, cat, deltaDevers) {
  const c = typeof cat === 'string' ? CATEGORIES[cat] : cat;
  const v = c.V / 3.6; // m/s
  const Lgauch = (Math.abs(deltaDevers) * 100 / 2) * v; // Δd(%) / (2 %/s) × v
  const Loptique = R / 9;
  return { Lgauch, Loptique, Lmin: Math.max(Lgauch, Loptique), Amin: Math.sqrt(R * Math.max(Lgauch, Loptique)) };
}

/** Contrôles normatifs d'un axe construit (buildAxe) : [{pk, niveau:'erreur'|'avert', message}]. */
export function controlerAxe(built, cat) {
  const c = typeof cat === 'string' ? CATEGORIES[cat] : cat;
  const out = [];
  for (const el of built.elements) {
    if (el.type === 'arc') {
      if (el.R < c.Rmin) out.push({ pk: el.pk0, niveau: 'erreur', message: `Arc R=${el.R} m < Rmin ${c.Rmin} m (${c.label})` });
      else if (el.R < c.Rnd && el.A === 0) out.push({ pk: el.pk0, niveau: 'avert', message: `Arc R=${el.R} m déversé sans clothoïde (R < Rnd ${c.Rnd} m)` });
    }
    if (el.type === 'clothoide' && el.sens === 'entree') {
      const dev = deversPourRayon(el.R, c);
      const delta = dev + c.deversMin; // passage du toit (−2,5 %) au dévers extérieur (+d)
      const m = clothoideLongueurMin(el.R, c, delta);
      if (el.L < m.Lmin - 1e-6) out.push({ pk: el.pk0, niveau: 'avert', message: `Clothoïde A=${el.A} (L=${el.L.toFixed(1)} m) < Lmin ${m.Lmin.toFixed(1)} m (gauchissement ${m.Lgauch.toFixed(1)}, optique ${m.Loptique.toFixed(1)}) → A ≥ ${m.Amin.toFixed(0)}` });
    }
  }
  return out;
}

/** Contrôles de la rasante construite (buildRasante). */
export function controlerRasante(ras, cat) {
  const c = typeof cat === 'string' ? CATEGORIES[cat] : cat;
  const out = [];
  for (const el of ras.elements) {
    if (el.type === 'droite' && Math.abs(el.pente) > c.penteMax + 1e-9) out.push({ pk: el.pk0, niveau: 'erreur', message: `Déclivité ${(el.pente * 100).toFixed(2)} % > max ${(c.penteMax * 100).toFixed(0)} %` });
    if (el.type === 'parabole') {
      const min = el.saillant ? c.RvSaillantMin : c.RvRentrantMin;
      if (Math.abs(el.Rv) < min) out.push({ pk: el.pkS, niveau: 'erreur', message: `Rayon ${el.saillant ? 'saillant' : 'rentrant'} ${Math.abs(el.Rv)} m < min ${min} m` });
    }
  }
  for (let i = 1; i < ras.sommets.length - 1; i++) {
    const s = ras.sommets[i];
    if (!(Math.abs(Number(s.Rv) || 0) > 0)) out.push({ pk: s.pk, niveau: 'avert', message: `Sommet sans raccordement parabolique (angle vif)` });
  }
  return out;
}
