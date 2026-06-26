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

# ── Stage 2 : Nginx (HTTPS) ───────────────────────────────────────────────────
# Nginx sert l'app en HTTPS sur le port 443 avec un certificat auto-signé généré
# au build. En production, monter un vrai certificat via :
#   volumes:
#     - /chemin/vers/cert.pem:/etc/nginx/certs/askdata.crt:ro
#     - /chemin/vers/key.pem:/etc/nginx/certs/askdata.key:ro
FROM nginx:alpine

COPY --from=builder /app/frontend/dist /usr/share/nginx/html

# Génération d'un certificat TLS auto-signé (valable 10 ans, couvre localhost)
RUN apk add --no-cache openssl && \
    mkdir -p /etc/nginx/certs && \
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
        -keyout /etc/nginx/certs/askdata.key \
        -out  /etc/nginx/certs/askdata.crt \
        -subj "/CN=localhost" \
        -addext "subjectAltName=IP:127.0.0.1,DNS:localhost" && \
    chmod 600 /etc/nginx/certs/askdata.key

RUN printf 'server {\n\
    listen 443 ssl;\n\
    server_name _;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
\n\
    # Certificat TLS (auto-signe au build, remplacable via volume en prod)\n\
    ssl_certificate     /etc/nginx/certs/askdata.crt;\n\
    ssl_certificate_key /etc/nginx/certs/askdata.key;\n\
    ssl_protocols       TLSv1.2 TLSv1.3;\n\
    ssl_ciphers         HIGH:!aNULL:!MD5;\n\
    ssl_session_cache   shared:SSL:10m;\n\
    ssl_session_timeout 10m;\n\
\n\
    # En-tetes de securite\n\
    add_header Strict-Transport-Security "max-age=31536000" always;\n\
    add_header X-Frame-Options SAMEORIGIN always;\n\
    add_header X-Content-Type-Options nosniff always;\n\
\n\
    gzip on;\n\
    gzip_types text/plain text/css application/javascript application/json;\n\
\n\
    # Proxy /api/* vers le backend FastAPI (service "backend" dans docker-compose)\n\
    location /api/ {\n\
        proxy_pass http://backend:8000;\n\
        proxy_set_header Host $host;\n\
        proxy_set_header X-Real-IP $remote_addr;\n\
        proxy_set_header X-Forwarded-Proto https;\n\
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
}\n\
\n\
# Redirection HTTP -> HTTPS\n\
server {\n\
    listen 80;\n\
    server_name _;\n\
    return 301 https://$host$request_uri;\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 443 80

CMD ["nginx", "-g", "daemon off;"]
