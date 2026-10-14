# Profil en long et rasante

À lire avant de toucher `profilLong.js`, `drawProfilLong`, `rasanteFromTerrain`.

- **TN le long de l'axe** : polyligne de l'axe au pas ≤ 2 m, échantillonnée au pas 1 m dans
  le TIN, abscisses **recalées** sur la longueur vraie de l'axe (les cordes raccourcissent).
  Trous (`z = null`) conservés : le tracé TN est coupé, jamais interpolé à travers un trou.
- **Rasante paramétrique** : sommets `(pk, z, Rv)` triés par PK ; `Rv` ignoré aux extrémités.
  Le signe affiché du rayon (`−` saillant, `+` rentrant) est **déduit** de `Δi`, l'utilisateur
  saisit une valeur positive. Parabole : `L = Rv·|Δi|`, `s0 = pkS − L/2`, flèche `E = L|Δi|/8`,
  point haut/bas si la dérivée s'annule dans `[s0, s1]`.
- Chevauchement de deux raccordements ou débordement sur un sommet voisin → erreur listée,
  géométrie quand même construite (visible), jamais tronquée.
- `zAt`/`slopeAt` cherchent l'élément par dichotomie sur `pk1` ; **les paraboles priment**
  puisque les droites s'arrêtent à `s0`/`s1`.
- `rasanteFromTerrain` : droite TN→TN aux extrémités valides (point de départ de la saisie),
  `Rv = 3000` par défaut sur les sommets intermédiaires éventuels.
- **Rendu** : bandes de terrassement coupées aux passages à l'écart nul par interpolation de
  l'écart (`e = zr − zt`), dessinées **avant** les traits ; déblai rouge clair, remblai jaune.
- Glisser un sommet dans la vue recalcule `buildRasante` seul pendant le mouvement et le
  `recompute()` complet au relâcher (tri par PK à ce moment-là).
