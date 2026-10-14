# Profils en travers, dévers, surfaces, cubatures

À lire avant de toucher `profilTravers.js`, `cubature.js`, `drawProfilTravers`.

- Repère transversal : `d` **positif à gauche** (cohérent avec `axePointAt(pk, d)`), profils
  stockés en `d` croissant, **dessinés en x = −d** et exportés de même (gauche à gauche pour
  un observateur regardant vers les PK croissants).
- **Pentes chaussée** (`pentesChaussee`) : exprimées « en s'éloignant de l'axe ». Alignement :
  toit `−p` des deux côtés. Arc : plan unique `z = zAxe − s·dev·d` ⇒ gauche `−s·dev`, droite
  `+s·dev` (virage à gauche : la gauche, intérieure, descend). Clothoïde : interpolation
  linéaire du toit vers le plan unique (`t = λ/L` en entrée, `1 − λ/L` en sortie).
  Pas de pivot sur le bord ni de gauchissement différencié intérieur/extérieur (backlog).
- **Accotement** : côté extérieur d'un virage il suit le dévers (continuité) ; sinon au moins
  sa pente nominale vers l'extérieur.
- **Raccord au TN** (`raccordTalus`) : comparaison de la cote du bord de plate-forme au TN
  **à la même abscisse** ; déblai → fossé optionnel (descente `largeur`, fond `largeurFond`)
  puis talus montant `1/talusDeblai` ; remblai → talus descendant `1/talusRemblai`. Marche au
  pas de 0,25 m le long du TN, croisement par interpolation de l'écart. Pas de croisement
  dans l'emprise → point « hors emprise » + drapeau `horsEmprise` (l'UI l'affiche).
- **Surfaces** : différence `TN − projet` sur l'emprise du projet, bornes = union des
  abscisses des deux polylignes, croisements par interpolation de l'écart ; `deblai` = écart
  positif, `remblai` = négatif ; `manquant` si le TN est inconnu sur un tronçon.
- **Cubatures** : moyenne des aires entre profils successifs (stations de la tabulation :
  les points caractéristiques comptent comme profils). Pas de prismoïdal, pas de décapage,
  pas de foisonnement (backlog). Les profils sans TN à l'axe sont exclus.
- `profilEnTravers` sans rasante : renvoie le TN seul (`projet = null`) pour que la vue
  reste utile avant la saisie de la rasante.
