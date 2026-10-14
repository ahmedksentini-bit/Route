# converter — micro-service DWG → DXF

Le navigateur ne sait pas lire le DWG (format propriétaire). Ce service le convertit en
DXF ASCII, que le front `web/` lit ensuite entièrement côté client. Il ne garde rien.

## API

| Méthode | Route | Corps | Réponse |
|---|---|---|---|
| `POST` | `/convert` | `multipart/form-data`, champ `file` (.dwg) | `text/plain` : le DXF |
| `GET` | `/health` | — | `{ ok, engine, maxMb }` |

Erreur de conversion → `422` avec le message du moteur.

## Moteurs

- **LibreDWG** (`dwg2dxf`, GPL) : installé par le Dockerfile (`libredwg-tools`). Lit R13 → 2018 ;
  quelques entités exotiques (certains proxies, MLEADER…) sont ignorées — sans incidence sur un fond topo.
- **ODA File Converter** (gratuit, non libre, licence ODA) : fidélité maximale, toutes versions.
  Télécharger sur opendesign.com, installer, puis `ODA_PATH=/opt/ODAFileConverter/ODAFileConverter`.
  Il a besoin d'un Qt « offscreen » (déjà forcé par `QT_QPA_PLATFORM=offscreen`).

## Lancer

```bash
cd converter && npm install && npm start          # http://localhost:8787
# ou
docker build -t route-converter . && docker run -p 8787:8787 route-converter
```

Variables : `PORT` (8787), `ODA_PATH`, `DWG2DXF` (chemin de dwg2dxf), `MAX_MB` (80),
`CORS_ORIGINS` (`*` ou liste `https://route.ksr-infra.org,https://…`), `TIMEOUT_MS` (120000).

## Déploiement (nginx)

```nginx
server {
  server_name convert.ksr-infra.org;
  client_max_body_size 100m;
  location / { proxy_pass http://127.0.0.1:8787; proxy_read_timeout 180s; }
}
```

Dans le front, renseigner l'URL `https://convert.ksr-infra.org/convert` (onglet Fond) ; elle est
mémorisée dans le navigateur.

## Test rapide

```bash
curl -F file=@plan.dwg http://localhost:8787/convert -o plan.dxf
```
