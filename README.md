# Route — conception géométrique des routes en ligne, sur fond topographique DXF/DWG

Application **100 % navigateur** (HTML/JS, aucun serveur de calcul) : import d'un fond
topographique DXF (ou DWG via un micro-service de conversion), construction du modèle
numérique de terrain (TIN), tracé en plan (alignements, arcs, clothoïdes), profil en long
(TN + rasante à raccordements paraboliques), profils en travers (profil type, dévers, talus,
fossé), surfaces et cubatures, contrôles normatifs (catégories ARP), exports DXF, LandXML et CSV.

Complément de la série ksr-infra.org (`hyd`, `chaussee`, `georoute`…) — prévu pour
`route.ksr-infra.org`.

## Ce que fait la v0

| Module | Contenu |
|---|---|
| **Fond** | DXF ASCII R12→2018 : LINE, LWPOLYLINE (bulges), POLYLINE 2D/3D, POINT, TEXT/MTEXT, CIRCLE, ARC, SPLINE (approx.), 3DFACE, INSERT (blocs expansés, attributs). Calques affichables/masquables. DWG → via `converter/`. |
| **TIN** | Delaunay (Delaunator, vendu dans `web/js/vendor/`), filtre α des slivers d'enveloppe, interpolation plane, courbes de niveau, profil le long d'une polyligne. Semis extrait selon des règles explicites (points 3D, polylignes à élévation, 3DFACE, blocs à attribut Z, textes numériques). |
| **Axe** | Polygonale de sommets + (R, A) par sommet → droite / clothoïde / arc / clothoïde / droite, points KA-KE-T1-T2, tabulation par PK, gisements, courbure signée, projection d'un point sur l'axe. |
| **Profil en long** | TN échantillonné sur l'axe, rasante = chaîne de sommets (PK, Z, Rv) → droites + paraboles (L = Rv·|Δi|), points hauts/bas, terrassements. |
| **Profils en travers** | Profil type (chaussée, accotements, talus déblai/remblai, fossé), dévers calé sur la catégorie (plan unique en courbe, variation linéaire en clothoïde), entrée en terre par intersection avec le TN, surfaces déblai/remblai exactes. |
| **Cubatures** | Moyenne des aires entre profils, cumuls, bilan. |
| **Normes** | ARP R60/R80/T80/T100 (Rmin, Rnd, dévers, déclivité max, Rv min) + catégorie personnalisée ; contrôles affichés sur l'axe et la rasante. **Valeurs à vérifier contre le texte** (voir `docs/context/normes.md`). |
| **Exports** | DXF R12 : plan (axe, bords, points, stations, TIN/courbes), profil en long, profils en travers ; LandXML 1.2 (Line/Spiral/Curve, PVI/ParaCurve, surface TIN) pour Covadis / Civil 3D ; CSV tabulation et cubatures ; projet `.route.json` (+ autosauvegarde navigateur). |

## Démarrage

Aucune compilation. Servir le dossier `web/` par n'importe quel serveur statique
(les modules ES exigent `http://`, pas `file://`) :

```bash
cd web && python3 -m http.server 8080     # puis http://localhost:8080
```

Déploiement : copier `web/` tel quel sur `route.ksr-infra.org`. Pour le DWG, déployer
`converter/` (voir son README) et renseigner son URL dans l'onglet **Fond**.

## Tests

```bash
node --test tests/core.test.js          # noyau de calcul, sans dépendance (Node ≥ 20)
npm i -D jsdom && npm run test:all   # + test de fumée de l'interface sous jsdom
```

## Organisation

```
web/            front statique
  index.html    quatre volets latéraux (Fond, Axe, Rasante, Profil type), cinq vues
  js/core/      noyau pur, testé : geom, clothoid, axe, tin, dxf, dxfWriter,
                profilLong, profilTravers, normes, cubature, export, project
  js/ui/        viewport (pan/zoom/saisie), rendus plan / profils
  js/main.js    orchestration (état, recalcul, événements)
converter/      micro-service DWG→DXF (Node, ODA File Converter ou LibreDWG, Dockerfile)
tests/          node --test (+ fixtures DXF)
docs/context/   invariants par domaine + backlog (voir CLAUDE.md)
```

## Limites connues (v0)

- Lignes de rupture (breaklines) non prises en compte dans le TIN : le Delaunay seul peut
  « couper » un talus existant. Au backlog.
- Raccordements en plan symétriques uniquement (même A à l'entrée et à la sortie) ; pas d'ove,
  pas de clothoïde en S, pas de raccordement sans arc. Au backlog.
- Dévers : interpolation 1/R entre Rmin et Rnd en attendant la saisie des tableaux ARP.
- Cubatures par moyenne des aires (pas de correction prismoïdale, pas de décapage ni foisonnement).
- Pas de vue 3D.

## Poursuivre le développement

`CLAUDE.md` (et son jumeau `AGENTS.md` pour Codex) décrit l'architecture et les invariants,
puis renvoie vers `docs/context/` — un fichier par domaine, qui porte les règles durement
acquises et le backlog. Même convention que BVTrace.
