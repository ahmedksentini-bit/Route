# Convertisseur DWG → DXF (LibreDWG par défaut ; monter ODA File Converter pour une fidélité maximale)
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends libredwg-tools ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
ENV PORT=8787 CORS_ORIGINS=* MAX_MB=80
EXPOSE 8787
CMD ["node", "server.js"]
