# ── Dockerfile frontend React (Agentic BI) ────────────────────────────────────
# Construction multi-stage :
#   Stage 1 : build de l'application React/Vite (Node.js)
#   Stage 2 : service des fichiers statiques via Nginx
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1 : Build React ─────────────────────────────────────────────────────
# Utilise Node 20 LTS pour compiler l'application React avec Vite
FROM node:20-bookworm-slim AS builder

# Répertoire de travail pour le build
WORKDIR /app/frontend

# Installation des dépendances Node.js
# Copie séparée pour profiter du cache Docker
COPY package*.json ./
RUN npm ci --silent

# Copie du code source frontend
COPY . ./

# Build de production :
# VITE_API_BASE_URL="" → utilisation de chemins relatifs (fonctionne quel que soit le domaine)
# Le résultat est écrit dans /app/frontend/dist/
RUN VITE_API_BASE_URL="" npm run build

# ── Stage 2 : Serveur Nginx ───────────────────────────────────────────────────
# Image Nginx légère pour servir les fichiers statiques compilés
FROM nginx:alpine

# Copie des fichiers buildés vers le répertoire de service Nginx
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

# Configuration Nginx pour les SPA React :
# - Toutes les routes inconnues sont redirigées vers index.html (client-side routing)
# - Fichiers statiques servis directement
RUN printf 'server {\n\
    listen 80;\n\
    server_name _;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
\n\
    # Compression gzip pour les fichiers texte\n\
    gzip on;\n\
    gzip_types text/plain text/css application/javascript application/json;\n\
\n\
    # Fichiers statiques avec cache long\n\
    location /assets/ {\n\
        expires 1y;\n\
        add_header Cache-Control "public, immutable";\n\
    }\n\
\n\
    # SPA fallback : toutes les routes retournent index.html\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

# Port exposé par Nginx (mappé sur 3000 côté hôte via docker-compose)
EXPOSE 80

# Démarrage de Nginx en mode foreground (requis pour Docker)
CMD ["nginx", "-g", "daemon off;"]
