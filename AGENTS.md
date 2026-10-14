# AGENTS.md — contexte projet pour Codex (jumeau de CLAUDE.md)

## Objet

Route : moteur de conception géométrique des routes **dans le navigateur** (HTML/JS, modules
ES, aucun framework), sur fond topographique DXF (DWG via `converter/`). Tracé en plan,
profil en long, profils en travers, cubatures, contrôles normatifs, exports DXF / LandXML / CSV.
Destination : `route.ksr-infra.org`, à côté de `hyd`, `chaussee`, `georoute`, `urbain`…

Spécification d'origine (utilisateur) : « créer un moteur de conception géométrique des
routes en ligne avec en fond topo DWG », web pur, DWG converti côté serveur, livré sur GitHub.

## Architecture

```
web/js/core/   noyau PUR (aucun accès au DOM, importable sous Node, testé dans tests/)
  geom.js        vecteurs, intersections, polylignes, PK « k+mmm.mm », gisement en gon
  clothoid.js    séries entières (τ < 2,5 rad) / Simpson ; raccordement symétrique T, ΔR, XM
  axe.js         sommets {x,y,R,A} → éléments stationnés ; elementPointAt, axePointAt(pk,d),
                 tabulate, axePolyline, projectOnAxe
  tin.js         Delaunay (Delaunator vendu, global ou setDelaunator), filtre α, grille
                 d'indexation, zAt, contours, profileAlong
  dxf.js         parseur DXF (sections, blocs, séquences) → drawables + extractSamples
  dxfWriter.js   DXF R12 (POLYLINE/VERTEX, pas de LWPOLYLINE)
  profilLong.js  TN le long de l'axe ; rasante = sommets (pk,z,Rv) → droites + paraboles
  profilTravers.js  pentes (toit/dévers/clothoïde), TN transversal, profil projet, surfaces
  normes.js      catégories ARP, dévers(R), Lmin clothoïde, contrôles axe/rasante
  cubature.js    moyenne des aires, cumuls, CSV
  export.js      dxfPlan, dxfProfilLong, dxfProfilsTravers, landXml, tabulationCsv
  project.js     modèle d'entrée + (dé)sérialisation
web/js/ui/     viewport.js (monde↔écran, yRatio = exagération, saisie), plan.js, profils.js
web/js/main.js état S, recompute(), tables, import/export, autosave localStorage
converter/     Express + multer ; ODA File Converter si ODA_PATH, sinon dwg2dxf (LibreDWG)
```

Flux de recalcul (`main.js: recompute`) : `buildAxe` → `terrainAlongAxe` → `tabulate` →
`buildRasante` → `profilEnTravers` par station → `cubatures` → rendu. Tout est recalculé à
chaque modification ; rien n'est incrémental (volontaire tant que c'est < 100 ms).

## Invariants (à préserver absolument)

1. **Le noyau ne touche jamais au DOM** ; tout nouveau calcul va dans `core/` avec un test
   dans `tests/core.test.js`. `main.js` ne contient pas de formule.
2. **Signes** : angles trigonométriques, `s = +1` virage à **gauche**, offset `d` **positif à
   gauche** de l'axe (`axePointAt(pk, d)`), courbure signée `kappa = s/R`. Les profils en
   travers sont stockés en `d` croissant et **dessinés en x = −d** (gauche à gauche).
3. **Clothoïde** : `A² = R·L`, `τ = L/(2R)` ; raccordement refusé si `Δ < 2τ`, jamais
   « bricolé ». La clothoïde de sortie est paramétrée **depuis KA2 à rebours** (symétrie
   exacte), pas recalculée depuis KE2.
4. **Rasante paramétrique** : seuls les sommets `(pk, z, Rv)` sont la vérité ; droites et
   paraboles sont un cache (`buildRasante`). Parabole : `L = Rv·|Δi|`, `z = zS + i1(s−pkS) +
   (i2−i1)(s−s0)²/(2L)`. Chevauchements signalés, jamais résolus au jugé. (Hérité de BVTrace,
   docs/context/rasante.md là-bas.)
5. **TIN** : filtre α par longueur d'arête (slivers d'enveloppe) ; `zAt` renvoie **null**
   hors modèle, jamais une extrapolation. Dédoublonnage XY au millimètre avant Delaunay.
6. **Surfaces** : différence TN−projet intégrée par morceaux, coupée aux croisements par
   interpolation **de l'écart** (pas de `d`). Même règle pour les bandes de terrassement
   du profil en long.
7. **Modèle de projet** = données d'entrée seulement (`project.js`) ; les éléments d'axe,
   la rasante construite, les profils et cubatures ne sont **jamais** persistés.
8. Culture invariante (point décimal, `toFixed`), commentaires et UI en français.
9. **DXF** : le DWG n'est jamais lu dans le navigateur ; `extractSamples` n'invente pas de
   cote (z = 0 ignoré sauf option explicite ; textes numériques désactivés par défaut).

## Contexte détaillé : lire le fichier du domaine AVANT d'y toucher

| Domaine | Fichier | Déclencheurs |
|---|---|---|
| Tracé en plan, clothoïdes | [trace-en-plan.md](docs/context/trace-en-plan.md) | `axe.js`, `clothoid.js`, `elementPointAt`, `symmetricCurve` |
| TIN et lecture DXF | [mnt-dxf.md](docs/context/mnt-dxf.md) | `tin.js`, `dxf.js`, `extractSamples`, `buildTin` |
| Profil en long et rasante | [profil-en-long.md](docs/context/profil-en-long.md) | `profilLong.js`, `drawProfilLong`, `rasanteFromTerrain` |
| Profils en travers, dévers, cubatures | [profils-en-travers.md](docs/context/profils-en-travers.md) | `profilTravers.js`, `cubature.js`, `drawProfilTravers` |
| Normes (ARP…) | [normes.md](docs/context/normes.md) | `normes.js`, `CATEGORIES`, `controler*` |
| Exports | [exports.md](docs/context/exports.md) | `export.js`, `dxfWriter.js` |
| Interface | [interface.md](docs/context/interface.md) | `main.js`, `viewport.js`, `plan.js`, `profils.js`, `index.html` |
| Convertisseur DWG | [converter/README.md](converter/README.md) | `converter/server.js` |
| Backlog priorisé | [backlog.md](docs/context/backlog.md) | ouverture d'un nouveau chantier |

Règle : toute règle nouvelle s'écrit **dans le fichier du domaine**, pas ici ; `AGENTS.md`
porte le même noyau et le même index (ne pas les faire diverger).

## Pièges connus

- Les modules ES exigent un serveur HTTP (`file://` bloque les imports) : `python3 -m http.server`.
- Delaunator est un UMD global (`window.Delaunator`) ; sous Node, `setDelaunator(require(...))`.
- `Viewport.hitTest(w, tolX, tolY)` : tolérances en mètres **par axe** (le profil en long est exagéré).
- jsdom (test de fumée) : les erreurs dans les gestionnaires d'événements ne remontent que par
  `VirtualConsole('jsdomError')` — le test les capture, ne pas retirer ce crochet.
- `extractSamples` ne descend qu'à un niveau de bloc pour le semis (les blocs de points cotés
  sont plats) ; `drawables` descend à 4 niveaux.
