# Normes de conception

À lire avant de toucher `normes.js`, `CATEGORIES`, `controlerAxe`, `controlerRasante`.

## Statut des valeurs (⚠ transcrites de mémoire, à vérifier contre les textes)

| Cat. | Vr | Rmin | Rnd | Dévers max | Déclivité max | Rv saillant | Rv rentrant | Statut |
|---|---|---|---|---|---|---|---|---|
| R60 | 60 | 120 | 600 | 7 % | 7 % | 1500 | 1500 | à vérifier (ARP 1994) |
| R80 | 80 | 240 | 900 | 7 % | 6 % | 3000 | 2200 | à vérifier |
| T80 | 80 | 240 | 900 | 7 % | 6 % | 3000 | 2200 | à vérifier |
| T100 | 100 | 425 | 1300 | 7 % | 5 % | 6000 | 3000 | à vérifier |

Source visée : SETRA, *Aménagement des routes principales (ARP)*, 1994. Remplacer « à vérifier »
par « vérifié (ARP §x.y) » au fur et à mesure, et ajouter ICTAAL 2000 (L1/L2) et ICTAVRU.
Les normes tunisiennes (DGPC) suivent largement l'ARP : prévoir une catégorie dédiée si
des valeurs propres sont confirmées.

## Règles implémentées
- `deversPourRayon` : interpolation linéaire **en 1/R** entre `(Rmin, deversMax)` et
  `(Rnd, deversMin)`. Simplification en attendant les tableaux ARP par catégorie.
- `clothoideLongueurMin` : gauchissement (variation de dévers ≤ 2 %/s de parcours à Vr ⇒
  `L ≥ Δd(%)/2 · Vr/3,6`) et perception optique (`A ≥ R/3` ⇒ `L ≥ R/9`). Le contrôle prend
  `Δd = dev + deversMin` (passage du toit −2,5 % au dévers extérieur +dev). À confronter au
  texte (certaines versions donnent `A ≥ R/3` comme condition d'ICTAAL seulement).
- `controlerAxe` : erreur si `R < Rmin`, avertissement si `R < Rnd` sans clothoïde ou si
  `L_clotho < Lmin`. `controlerRasante` : déclivité > max, `Rv < min` selon saillant/rentrant,
  sommet sans raccordement.
- Les contrôles **n'empêchent rien** : ils s'affichent (erreur rouge / avertissement orange).
  Un auditeur veut voir la non-conformité, pas une géométrie corrigée à son insu.
