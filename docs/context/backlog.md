# Backlog priorisé

1. **Ouverture réelle dans un navigateur** avec un DXF topo de chantier (Covadis/AutoCAD) :
   calques, blocs de points cotés, performances (> 100 k entités), rendu des textes.
2. **Valider les tables normatives** (normes.md) contre l'ARP, saisir ICTAAL / ICTAVRU,
   tableaux de dévers par catégorie, règle de gauchissement officielle.
3. **Breaklines** dans le TIN (Delaunay contraint, ex. `cdt-js`/`poly2tri`) ; chaînage des
   courbes de niveau en polylignes ; export TIN en 3DFACE.
4. **Raccordements dissymétriques** (A1 ≠ A2), ove, clothoïde en S, arc sans clothoïde
   mélangé ; saisie de l'axe par éléments (droite tangente, arc par 3 points) ; verrouillage
   d'un élément (épinglage à la BVTrace).
5. **Dévers** : pivot (axe / bord intérieur), gauchissement différencié, longueur de
   raccordement de dévers hors clothoïde, tableau d'ingénierie des dévers par station.
6. **Profils en travers** : profils types multiples par tronçon, sur-largeurs en courbe,
   bermes, redans, murs ; décapage, foisonnement, correction prismoïdale ; diagramme de
   Lalanne (mouvement des terres).
7. **Import/export** : import d'axe depuis polyligne DXF ou LandXML ; profils en travers depuis
   un levé (points sur des alignements perpendiculaires) ; export PDF des planches (profil en
   long avec cartouche : PK, Z TN, Z projet, hauteur, pentes, éléments en plan).
8. **Undo/redo** ; snapping (sommets du fond, intersections) ; saisie au clavier des
   coordonnées ; import de plusieurs DXF (fond + réseaux).
9. **Convertisseur** : file d'attente et limite de taille, conservation de l'encodage
   (`$DWGCODEPAGE`), test automatisé avec un DWG réel en CI.
10. Vue 3D légère (three.js) du TIN + plate-forme ; ombrage ; visibilité (distance d'arrêt).
