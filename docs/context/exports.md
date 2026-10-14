# Exports

À lire avant de toucher `export.js`, `dxfWriter.js`.

- **DXF R12** (`AC1009`) : lu partout (AutoCAD, Covadis, Civil 3D, QGIS, LibreCAD). POLYLINE
  + VERTEX + SEQEND (flag 8 pour 3D, 32 sur les VERTEX 3D), pas de LWPOLYLINE, pas de handles.
  `$INSUNITS = 6` (mètres). Calques déclarés dans TABLES avec leur couleur ACI.
- **Plan** : AXE (polyligne au pas 1 m), BORD_CHAUSSEE / BORD_PLATEFORME (parallèles),
  POLYGONALE, POINTS_CARACT (+ TEXTES « KA 0+123.45 »), STATIONS (traits ±3 m + PK), et
  soit COURBES (si pas de courbes > 0) soit TIN (3DFACE-like en polylignes 3D fermées).
- **Profil en long** : x = PK − pk0, y = (z − plan de comparaison)·exagération ; plan de
  comparaison = multiple de 5 m sous le minimum TN/rasante ; cotes des points de rasante
  en textes verticaux ; graduation tous les 100 m.
- **Profils en travers** : grille de cases (4 colonnes), plan de comparaison par profil,
  surfaces dans le cartouche, échelle 1:1 (x = −d).
- **LandXML 1.2** : coordonnées **« N E »** (northing puis easting) partout ; directions en
  degrés décimaux azimut horaire depuis le Nord (`az`) ; `rot = ccw` pour `s = +1`.
  Spiral : `radiusStart="INF"` à l'entrée, `radiusEnd="INF"` à la sortie, `PI` = intersection
  des tangentes de début et de fin de la clothoïde, `theta = τ` en degrés. Profil :
  `PVI` aux extrémités, `ParaCurve length=L` aux sommets raccordés. Surface : `Pnts` indexés
  à partir de 1, `Faces` = triangles conservés seulement. Importé sans erreur dans un
  lecteur LandXML, validé structurellement par le test ; **test réel Covadis/Civil 3D à faire**.
- **CSV** : séparateur `;`, point décimal, CRLF (Excel FR ouvre directement).
