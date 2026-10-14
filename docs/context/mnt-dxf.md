# TIN et lecture DXF

À lire avant de toucher `tin.js`, `dxf.js`, `extractSamples`, `buildTin` (main.js).

## Lecture DXF
- Parseur par couples (code, valeur) ; codes numériques listés dans `NUM_CODES` (virgule
  décimale tolérée). Sections HEADER ($INSUNITS), TABLES (LAYER), BLOCKS, ENTITIES.
- `groupSequences` rattache VERTEX→POLYLINE et ATTRIB→INSERT (code 66 = 1) jusqu'à SEQEND.
  Sans ce regroupement, les polylignes lourdes (R12, Covadis) et les blocs de points cotés
  sont perdus.
- Bulges : `θ = 4·atan(b)`, tessellés en 12 segments ; cercles 48, arcs 32.
- INSERT : transformation échelle → rotation → translation autour du point de base du bloc,
  récursive jusqu'à 4 niveaux pour le dessin ; **un seul** niveau pour le semis.
- MTEXT : codes 3 (morceaux) + 1 ; nettoyage sommaire des codes de format `\P`, `{}`, `\X;`.
- SPLINE : points d'ajustement (11/21) si présents, sinon polygone de contrôle (10/20) —
  approximation assumée (`approx: true`).

## Semis de points cotés (`extractSamples`)
Règles explicites, chacune débrayable, et **z = 0 ignoré par défaut** (un DXF 2D a
tous ses z à 0 : les prendre fabriquerait un plateau à la cote 0).
- POINT 3D ; polylignes à élévation (LWPOLYLINE 38, POLYLINE 2D 30 ou 3D flag 8) → courbes
  de niveau ; 3DFACE (maillages exportés) ; INSERT à ATTRIB numérique (bloc « point coté »)
  sinon z d'insertion ; TEXT/MTEXT numérique **désactivé par défaut** (confusions avec des
  numéros de bornes, de parcelles…), borné à [zMin, zMax].
- Filtre par calques = calques **visibles** dans le panneau Fond au moment du clic
  « Construire le TIN » : masquer un calque, c'est l'exclure du TIN.

## TIN
- Delaunator (sweep-hull, O(n log n)) sur les XY dédoublonnés au mm ; les points en double
  (fréquents : courbes qui se touchent) feraient des triangles dégénérés.
- **Filtre α** : triangle écarté si une arête > `maxEdgeFactor × arête médiane` (4 par
  défaut). Même rôle que `DemFromSamples` dans BVTrace : sans lui, l'enveloppe convexe
  relie les bords du levé par des triangles plats qui faussent le TN transversal.
- Index spatial = grille `√(nt/2)` cellules de côté ; `locate` teste les triangles de la
  cellule ; tolérance 1e-9 sur les signes (points sur une arête acceptés).
- `zAt` hors modèle → `null` ; tout consommateur (profil TN, profil transversal, surfaces)
  doit gérer `null` et le dire (« emprise insuffisante », `manquant`).
- Courbes de niveau : marching sur triangles, segments non chaînés (suffisant pour l'affichage
  et le DXF). Le chaînage en polylignes est au backlog.
- **Breaklines non gérées** (backlog) : un Delaunay seul traverse les crêtes de talus.
