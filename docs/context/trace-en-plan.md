# Tracé en plan : sommets + raccordements symétriques

À lire avant de toucher `axe.js`, `clothoid.js`, `elementPointAt`, `symmetricCurve`.

- **Modèle** : polygonale de sommets `{x, y, R, A}` ; R et A ne sont lus que sur les sommets
  intermédiaires. `A = 0` → arc simple (T1/T2). `A > 0` → clothoïde–arc–clothoïde symétrique
  (KA/KE … KE/KA). Pas de raccordement dissymétrique en v0 (backlog).
- **Raccordement** (`symmetricCurve`) : `L = A²/R`, `τ = L/(2R)`, `ΔR = yM − R(1−cos τ)`,
  `XM = xM − R sin τ`, `T = (R+ΔR)·tan(Δ/2) + XM`, arc restant `Δ − 2τ`. Refus explicite si
  `Δ < 2τ` (message « réduire A ou augmenter R ») — jamais de réduction automatique de A.
- **Contrôle des tangentes** : `T_i + T_{i−1} ≤ |S_{i−1}S_i|` et symétrique côté aval. En cas
  de dépassement, l'axe est quand même construit (l'utilisateur voit le chevauchement) mais
  `ok = false` et le message est affiché. Ne pas « réparer » silencieusement.
- **Sommet sans rayon** (R = 0 avec déflexion) : angle vif conservé, signalé comme erreur.
  Utile pendant la saisie (le rayon arrive après le clic).
- **Clothoïde de sortie** : paramétrée depuis KA2 à rebours (`lp = L − λ`), coordonnées
  `X = KA2 − x·u_out + s·y·n_out`, tangente `θ_out − s·τ(lp)`. C'est ce qui garantit que
  KA2 = S_i + T·u_out exactement et que les droites suivantes partent du bon point. Ne pas
  recalculer la sortie depuis KE2 par intégration (dérive numérique cumulée).
- **Séries de la clothoïde** : convergentes pour tout τ mais on bascule sur Simpson au-delà
  de 2,5 rad (perte de chiffres par annulation). Vérifié : `x ≈ l(1 − τ²/10)` pour τ petit.
- **PK du sommet** : `pk(KA) + T` (prolongement de la tangente) — il est hors de l'axe et
  marqué `sommet: true` ; `tabulate` l'ignore, les listes de points caractéristiques aussi.
- `tabulate` dédoublonne au 1/10 mm (`Math.round(pk·1e4)`) et fusionne les étiquettes d'un
  même PK (ex. KE et T1 ne coexistent jamais, mais une station ronde peut tomber sur un KA).
- `projectOnAxe` : recherche grossière sur la polyligne au pas de 1 m puis affinage
  ternaire ±1 m ; `d` signé par le produit scalaire avec la normale gauche.
- Gisement affiché en **gon** depuis l'angle trigo (`gisementGon`) : 0 = Nord, horaire.
