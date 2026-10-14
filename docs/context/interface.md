# Interface

À lire avant de toucher `main.js`, `viewport.js`, `plan.js`, `profils.js`, `index.html`.

- **État unique `S`** dans `main.js` ; `recompute()` reconstruit tout depuis `S.project`
  puis redessine les trois viewports et les tables. Les rendus ne lisent que `S`.
- `Viewport` : `sx` (px/m), `sy = sx·yRatio` (exagération du profil en long, `setYRatio`),
  centre monde `(cx, cy)`, y vers le haut. Événements pointeur unifiés (souris/tactile) ;
  `hitTest(w, tolX, tolY)` en mètres par axe ; glisser un objet → `onDragObj(phase)` ; clic
  sans mouvement (< 3 px) → `onClick`. `ResizeObserver` redimensionne au DPR.
- **Modes** : `addSommet` (clic plan → sommet), `addRas` (clic profil → sommet de rasante) ;
  `Échap` les quitte. Hors mode, un clic sur le plan ou le profil sélectionne un PK
  (`S.selPk`) et affiche le profil en travers le plus proche.
- Pendant un glisser de sommet, seul `buildAxe` / `buildRasante` est recalculé (fluide) ;
  le `recompute()` complet attend le relâcher.
- **Fond** : primitives pré-calculées (`drawables`, bbox par polyligne) ; culling par bbox et
  rejet des entités sous-pixel ; textes seulement si hauteur ≥ 5 px. Les calques masqués
  servent aussi de filtre du TIN (voir mnt-dxf.md).
- Autosauvegarde `localStorage['route.project']` **sans** le semis (quota) ; le fichier
  `.route.json` enregistré l'inclut (`samples`) pour restaurer le TIN sans le DXF.
- Test de fumée jsdom (`tests/ui.smoke.test.js`) : parcourt import → axe → rasante → onglets
  → exports avec un canvas factice ; à faire passer après toute modification de l'UI.
- Sans navigateur headless disponible ici, l'aspect visuel n'a pas été vérifié pixel par
  pixel : première ouverture réelle à faire sur `python3 -m http.server`.
