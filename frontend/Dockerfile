# ── Dockerfile frontend AskData ───────────────────────────────────────────────
# Construction multi-stage :
#   Stage 1 : build de l'application React/Vite (Node.js)
#   Stage 2 : service des fichiers statiques + proxy API via Nginx
#
# Nginx joue deux rôles :
#   1. Servir les fichiers statiques React (port 80)
#   2. Proxifier /api/* vers le backend FastAPI (http://backend:8000)
#      → évite tout problème CORS, les appels semblent same-origin
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1 : Build React ─────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder

WORKDIR /app/frontend

COPY package*.json ./
RUN npm ci --silent

COPY . ./

# VITE_API_BASE_URL="" → chemins relatifs (/api/...)
# Nginx intercepte /api/* et proxifie vers le backend
RUN VITE_API_BASE_URL="" npm run build

# ── Stage 2 : Nginx ───────────────────────────────────────────────────────────
FROM nginx:alpine

COPY --from=builder /app/frontend/dist /usr/share/nginx/html

RUN printf 'server {\n\
    listen 80;\n\
    server_name _;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
\n\
    gzip on;\n\
    gzip_types text/plain text/css application/javascript application/json;\n\
\n\
    # Proxy /api/* vers le backend FastAPI (service "backend" dans docker-compose)\n\
    location /api/ {\n\
        proxy_pass http://backend:8000;\n\
        proxy_set_header Host $host;\n\
        proxy_set_header X-Real-IP $remote_addr;\n\
        proxy_read_timeout 120s;\n\
    }\n\
\n\
    location /assets/ {\n\
        expires 1y;\n\
        add_header Cache-Control "public, immutable";\n\
    }\n\
\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
