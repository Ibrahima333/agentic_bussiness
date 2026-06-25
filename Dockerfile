# ── Stage 1 : build du frontend React ──────────────────────────────────────
FROM node:20-bookworm-slim AS frontend_build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --silent
COPY frontend/ ./
# URL vide = chemins relatifs → fonctionne quel que soit le port exposé
RUN VITE_API_BASE_URL="" npm run build   # → frontend/dist/

# ── Stage 2 : image Python + backend + frontend buildé ─────────────────────
FROM python:3.12.3-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    postgresql-client \
    default-mysql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --upgrade pip && pip install --no-cache-dir -r requirements.txt

# Code backend
COPY backend/      ./backend/
COPY requirements.txt ./

# Frontend buildé
COPY --from=frontend_build /app/frontend/dist ./frontend/dist

EXPOSE 8000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
