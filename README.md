# AskData — BI Conversationnelle

> Posez vos questions métier en français. Obtenez du SQL, des graphiques et des insights en quelques secondes.

AskData est une application de **Business Intelligence conversationnelle** déployable en entreprise. Elle permet à chaque collaborateur de poser des questions sur ses données sans écrire une seule ligne de SQL, depuis un navigateur web sécurisé.

---

## Sommaire

1. [Présentation](#1-présentation)
2. [Architecture](#2-architecture)
3. [Prérequis](#3-prérequis)
4. [Installation](#4-installation)
5. [Configuration](#5-configuration)
6. [Démarrage](#6-démarrage)
7. [Fonctionnalités](#7-fonctionnalités)
8. [Authentification et gestion des utilisateurs](#8-authentification-et-gestion-des-utilisateurs)
9. [Pipeline d'analyse](#9-pipeline-danalyse)
10. [API backend](#10-api-backend)
11. [Déploiement en réseau local](#11-déploiement-en-réseau-local)
12. [Résolution de problèmes](#12-résolution-de-problèmes)

---

## 1. Présentation

AskData transforme une base de données SQL en assistant analytique conversationnel :

```
Question en français
      ↓
Génération SQL automatique (LLM)
      ↓
Exécution sur votre base de données
      ↓
Graphique Plotly interactif
      ↓
Insights & recommandations business
```

**Ce que vous obtenez pour chaque question :**
- Le SQL généré (auditable, téléchargeable)
- Les données en tableau et CSV
- Un graphique interactif HTML
- Des KPIs calculés automatiquement (total, moyenne, min, max)
- Un rapport Markdown avec insights et recommandations
- Export PDF complet (graphique + rapport + extraits de chat)

**Sans :** écrire du code, configurer un outil BI, payer des licences.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Docker Network                       │
│                                                         │
│  ┌──────────────┐    ┌──────────────┐                   │
│  │   Frontend   │    │   Backend    │                   │
│  │ React + Vite │───▶│   FastAPI    │                   │
│  │    Nginx     │    │  Python 3.12 │                   │
│  │  Port 3000   │    │  Port 8000   │                   │
│  └──────────────┘    └──────┬───────┘                   │
│                             │                           │
│                    ┌────────┴────────┐                  │
│                    │                │                   │
│             ┌──────▼──────┐  ┌──────▼──────┐           │
│             │  mysql-auth │  │ Votre base  │           │
│             │  MySQL 8.0  │  │ MySQL / PG  │           │
│             │  (interne)  │  │  (externe)  │           │
│             └─────────────┘  └─────────────┘           │
│                                                         │
│  ┌──────────────┐                                       │
│  │   Adminer    │  ← Interface web mysql-auth           │
│  │  Port 8080   │                                       │
│  └──────────────┘                                       │
└─────────────────────────────────────────────────────────┘
```

### Services Docker

| Service | Rôle | Port exposé |
|---|---|---|
| `frontend` | Interface React + Nginx HTTPS | 3000 (HTTPS), 3080 (redirect) |
| `backend` | API FastAPI + pipeline BI | 8009 (debug) |
| `mysql-auth` | Base utilisateurs, KPIs, dashboard | interne uniquement |
| `adminer` | Interface web pour mysql-auth | 8080 |

### Stack technique

| Couche | Technologies |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | FastAPI, Python 3.12, Uvicorn |
| Base auth | MySQL 8.0 (Docker interne) |
| Base métier | MySQL 8.x ou PostgreSQL (externe) |
| LLM | Gemini 2.0 Flash (Google) ou Groq llama-3.3-70b |
| Graphiques | Plotly (Python + HTML interactif) |
| Auth | JWT (PyJWT) + bcrypt |
| Conteneurisation | Docker + Docker Compose |

---

## 3. Prérequis

- **Docker Desktop** 4.x+ (Windows / macOS / Linux)
- **Docker Compose** v2+ (inclus dans Docker Desktop)
- Une base de données **MySQL 8.x** ou **PostgreSQL** accessible (votre base métier)
- Une clé API **Gemini** (Google) ou **Groq**

### Obtenir une clé API

**Gemini** (recommandé, gratuit) :
→ [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)

**Groq** (gratuit, très rapide) :
→ [https://console.groq.com/keys](https://console.groq.com/keys)

---

## 4. Installation

```bash
# Cloner le projet
git clone <url-du-repo>
cd agentic-business-intelligence-main

# Vérifier que Docker est lancé
docker --version
docker compose version
```

---

## 5. Configuration

### 5.1 Fichier `.env`

Le fichier `.env` à la racine du projet contient toutes les variables de configuration. Il est déjà créé avec des valeurs par défaut. **Modifiez les valeurs sensibles avant le premier démarrage.**

```env
# ── Base de données métier (votre base existante) ─────────────────────────────
DB_TYPE=mysql                        # mysql ou postgresql
DB_HOST=host.docker.internal         # hôte de votre base (depuis Docker)
DB_PORT=3306                         # 3306 MySQL, 5432 PostgreSQL
DB_USER=root                         # utilisateur
DB_PASSWORD=votre_mot_de_passe       # mot de passe

# ── Base MySQL interne (authentification AskData) ─────────────────────────────
AUTH_DB_HOST=mysql-auth              # nom du service Docker (ne pas changer)
AUTH_DB_PORT=3306
AUTH_DB_USER=askdata
AUTH_DB_PASSWORD=askdata_secret      # mot de passe utilisateur askdata
AUTH_DB_ROOT_PASSWORD=askdata_root_secret  # mot de passe root MySQL
AUTH_DB_NAME=askdata_auth

# ── JWT (authentification) ────────────────────────────────────────────────────
JWT_SECRET=changez_cette_valeur_en_production   # ⚠️ IMPORTANT : changer en prod
JWT_EXPIRE_SECONDS=28800             # durée de session (8h par défaut)

# ── Compte administrateur initial ────────────────────────────────────────────
ADMIN_EMAIL=admin@askdata.local      # email du premier admin
ADMIN_PASSWORD=Admin1234!            # ⚠️ changer avant mise en production

# ── Clés LLM (fallback si non configurées via l'interface) ───────────────────
GEMINI_API_KEY=votre_cle_gemini
GROQ_API_KEY=votre_cle_groq          # commence par gsk_...

# ── Frontend ──────────────────────────────────────────────────────────────────
FRONTEND_ORIGIN=https://localhost:3000
```

### 5.2 Variables critiques à modifier

| Variable | Pourquoi la changer |
|---|---|
| `JWT_SECRET` | Sécurité des tokens — doit être unique et long |
| `AUTH_DB_PASSWORD` | Mot de passe de la base auth |
| `AUTH_DB_ROOT_PASSWORD` | Mot de passe root MySQL |
| `ADMIN_PASSWORD` | Mot de passe du premier compte admin |
| `DB_PASSWORD` | Mot de passe de votre base métier |

---

## 6. Démarrage

### Premier démarrage

```bash
# Construction et démarrage de tous les services
docker compose up -d --build

# Vérifier que tout tourne
docker compose ps
```

**Au premier démarrage, le backend :**
1. Attend que `mysql-auth` soit prêt (healthcheck automatique)
2. Crée les tables `users`, `analyses`, `kpis`, `dashboard`, `llm_config`
3. Crée le compte admin depuis `ADMIN_EMAIL` / `ADMIN_PASSWORD` du `.env`

### Accès

| Service | URL |
|---|---|
| **Application** | https://localhost:3000 |
| **Adminer** (base auth) | http://localhost:8080 |
| **Backend** (debug) | http://localhost:8009 |

> ⚠️ Le navigateur affiche un avertissement de sécurité (certificat auto-signé). Cliquer **"Continuer quand même"** — c'est attendu en développement.

### Connexion initiale

```
Email    : admin@askdata.local   (valeur de ADMIN_EMAIL dans .env)
Mot de passe : Admin1234!        (valeur de ADMIN_PASSWORD dans .env)
```

### Commandes utiles

```bash
# Démarrer
docker compose up -d

# Arrêter
docker compose down

# Rebuild complet (après modification de code)
docker compose build --no-cache && docker compose up -d

# Rebuild d'un seul service
docker compose build --no-cache frontend && docker compose up -d
docker compose build --no-cache backend  && docker compose up -d

# Voir les logs
docker compose logs backend --tail=50
docker compose logs frontend --tail=20

# Reset complet (supprime la base auth — perd les utilisateurs)
docker compose down -v
docker compose up -d --build
```

---

## 7. Fonctionnalités

### 7.1 Analyse conversationnelle

L'onglet principal. Posez une question en français, le pipeline complet s'exécute automatiquement.

**Exemple :**
> "Quels sont les 5 clients ayant généré le plus de chiffre d'affaires ce trimestre ?"

**Résultat :**
- Onglet **Results** — tableau des données + téléchargement CSV
- Onglet **SQL** — requête générée (auditable, téléchargeable)
- Onglet **Chart** — graphique Plotly interactif (épinglable au dashboard)
- Onglet **KPIs** — métriques automatiques (Total, Moyenne, Min, Max) sur toutes les colonnes numériques, chaque valeur épinglable au dashboard
- Onglet **Report** — insights & recommandations en Markdown + export PDF

**Option "Écraser les résultats existants" :** si activée, relancer la même question écrase les anciens artefacts au lieu de retourner une erreur.

### 7.2 Chat IA

Un assistant conversationnel qui connaît le schéma de votre base. Il ne génère pas de SQL — il répond à des questions d'analyse business, identifie des tendances, formule des recommandations.

- Historique de conversation maintenu dans la session
- Bouton **"Ajouter au rapport"** sur chaque message pour l'inclure dans le PDF
- Contextualisation automatique sur le schéma de la base sélectionnée

### 7.3 Dashboard

Tableau de bord personnalisé par utilisateur (stocké en base MySQL).

**Graphiques épinglés :**
- Chaque graphique de l'onglet Chart peut être épinglé
- Affichage en grille, redimensionnable (demi/pleine largeur)
- Réorganisable par drag & drop

**KPIs épinglés :**
- Cartes affichant valeur + delta % (comparaison avec valeur précédente)
- Bouton Rafraîchir → rejoue le SQL sans appel LLM
- Couleur verte/rouge selon l'évolution

### 7.4 Export PDF

Depuis l'onglet Report, le PDF inclut :
- En-tête avec question, base, provider, date
- Métriques (lignes, colonnes, temps d'exécution)
- KPIs épinglés dans le dashboard
- Graphique (capture PNG ou fallback interactif)
- Insights & recommandations
- Extraits de Chat IA sélectionnés (si des messages ont été ajoutés au rapport)

### 7.5 Explorateur de schéma

Dans la sidebar, section **Schéma** : liste toutes les tables et colonnes de la base sélectionnée. Cliquer sur une colonne l'insère dans le champ de question.

---

## 8. Authentification et gestion des utilisateurs

### Architecture auth

- **JWT stateless** — token signé (HS256), expiration 8h par défaut
- **Deux rôles** : `admin` et `user`
- **Stockage** : table `users` dans `mysql-auth` (Docker interne)

### Comptes et isolation

Chaque utilisateur possède ses propres :
- Historique d'analyses
- KPIs épinglés
- Dashboard

Les données ne sont **jamais** visibles entre utilisateurs.

### Panel Admin

Accessible depuis la navbar (bouton **Admin**, visible uniquement pour les admins).

| Action | Description |
|---|---|
| Voir tous les comptes | Liste avec rôle, statut, date de création |
| Créer un compte | Email + mot de passe + rôle |
| Désactiver / Réactiver | Bloque l'accès sans supprimer les données |
| Supprimer | Suppression définitive avec toutes les données |

> Seul l'admin peut créer des comptes — il n'y a pas d'inscription ouverte.

### Configuration LLM

**Admin uniquement :**
- Configure les clés API Gemini et/ou Groq via la sidebar
- Les clés sont testées avant sauvegarde
- Stockées en base MySQL + fichier runtime (persistant entre redémarrages)
- Au démarrage Docker, les clés sont rechargées automatiquement depuis MySQL

**Utilisateurs :**
- Voient uniquement un sélecteur Gemini / Groq
- Ne peuvent ni voir ni modifier les clés API
- L'icône 🔒 indique "configuré par l'administrateur"

### Adminer — Inspecter la base auth

Accès : [http://localhost:8080](http://localhost:8080)

```
Serveur   : mysql-auth
Utilisateur : root
Mot de passe : askdata_root_secret  (valeur de AUTH_DB_ROOT_PASSWORD)
Base      : askdata_auth
```

Tables disponibles : `users`, `analyses`, `kpis`, `dashboard`, `llm_config`

---

## 9. Pipeline d'analyse

Le pipeline exécute 6 étapes séquentielles pour chaque question :

### Étape 1 — Génération du schéma
```
scripts/schema.py
→ schema/<base>__<schema>_schema.md
```
Documente toutes les tables et colonnes de la base sélectionnée. Utilisé comme contexte pour le LLM.

### Étape 2 — Génération SQL
```
scripts/generate_sql.py  +  prompt_template.txt
→ sql/<nom_question>.sql
```
Le LLM reçoit le schéma + la question et génère une requête SQL adaptée.

### Étape 3 — Exécution SQL
```
utils/db_utils.py
→ outputs/<nom>/<nom>.csv  +  metadata.json
```
Connexion directe à votre base (MySQL ou PostgreSQL). Le CSV contient les données brutes.

### Étape 4 — Génération dataviz
```
scripts/generate_dataviz.py  +  prompt_template_dataviz.txt
→ dataviz/<nom>.py
```
Le LLM génère un script Python Plotly adapté aux données.

### Étape 5 — Exécution dataviz
```
scripts/run_dataviz.py
→ outputs/<nom>/<nom>.html
```
Exécute le script Plotly et produit un graphique HTML interactif.

### Étape 6 — Génération insights
```
scripts/generate_insights_actions.py  +  prompt_template_insights.txt
→ outputs/<nom>/<nom>.md
```
Le LLM analyse les données et produit des insights business et recommandations actionnables.

### Artefacts produits

```
outputs/<nom_question>/
├── <nom>.csv          — données brutes
├── <nom>.html         — graphique Plotly interactif
├── <nom>.md           — insights & recommandations
├── metadata.json      — infos techniques (lignes, colonnes, temps d'exécution)
└── backend_context.json  — contexte d'exécution (provider, DB, etc.)

sql/
└── <nom>.sql          — requête SQL générée

schema/
└── <base>__<schema>_schema.md  — schéma documenté
```

> Tous ces dossiers sont **gitignoré** et montés en volume Docker — ils persistent entre les redémarrages.

### Refresh KPI sans LLM

L'endpoint `POST /api/kpi/refresh/{nom}` rejoue directement le fichier SQL existant sur la base configurée, sans aucun appel LLM. Utilisé par le bouton Rafraîchir des cartes KPI du dashboard.

---

## 10. API backend

Toutes les routes (sauf `/api/health` et `/api/auth/login`) requièrent un token JWT valide dans le header :
```
Authorization: Bearer <token>
```

### Auth

| Méthode | Route | Rôle requis | Description |
|---|---|---|---|
| POST | `/api/auth/login` | — | Connexion, retourne JWT |
| GET | `/api/auth/me` | user | Profil de l'utilisateur connecté |
| GET | `/api/auth/users` | admin | Liste tous les utilisateurs |
| POST | `/api/auth/users` | admin | Créer un utilisateur |
| PATCH | `/api/auth/users/{id}` | admin | Modifier rôle ou statut |
| DELETE | `/api/auth/users/{id}` | admin | Supprimer un utilisateur |

### Configuration

| Méthode | Route | Rôle requis | Description |
|---|---|---|---|
| GET | `/api/health` | — | Santé du service |
| GET | `/api/config` | user | Bases, schémas, providers disponibles |
| GET | `/api/schema/explore` | user | Tables et colonnes d'une base |
| GET | `/api/llm-config` | user | Config LLM (clés masquées pour admin, providers pour user) |
| POST | `/api/llm-config/test` | admin | Tester une clé API |
| POST | `/api/llm-config/save` | admin | Sauvegarder la config LLM |
| GET | `/api/db-config` | user | Config DB actuelle |
| POST | `/api/db-config/connect` | user | Tester + sauvegarder une connexion DB |
| POST | `/api/db-config/test` | user | Tester une connexion DB |
| POST | `/api/db-config/save` | user | Sauvegarder une config DB |

### Pipeline et résultats

| Méthode | Route | Rôle requis | Description |
|---|---|---|---|
| POST | `/api/pipeline/run` | user | Lancer le pipeline complet |
| GET | `/api/results` | user | Historique des analyses (filtré par user) |
| GET | `/api/results/{nom}` | user | Résultat complet d'une analyse |
| DELETE | `/api/history` | user | Supprimer tout l'historique |
| GET | `/api/artifacts/{nom}/{type}` | — | Artefact (sql, csv, chart, report) |

### Dashboard utilisateur

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/user/kpis` | KPIs épinglés de l'utilisateur |
| POST | `/api/user/kpis` | Épingler un KPI |
| DELETE | `/api/user/kpis/{id}` | Désépingler un KPI |
| GET | `/api/user/dashboard` | Graphiques épinglés |
| POST | `/api/user/dashboard` | Épingler un graphique |
| DELETE | `/api/user/dashboard/{id}` | Désépingler un graphique |
| POST | `/api/kpi/refresh/{nom}` | Rafraîchir un KPI (rejoue le SQL) |

### Chat

| Méthode | Route | Description |
|---|---|---|
| POST | `/api/chat/message` | Envoyer un message au data analyst IA |

---

## 11. Déploiement en réseau local

Pour rendre l'application accessible depuis les autres postes de l'entreprise :

### Étape 1 — Trouver l'IP de la machine serveur

```bash
# macOS
ipconfig getifaddr en0

# Linux
hostname -I

# Windows
ipconfig   # → chercher "Adresse IPv4"
```

### Étape 2 — Régénérer le certificat TLS avec l'IP

Dans `frontend/Dockerfile`, modifier la ligne `openssl` :

```dockerfile
RUN openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout /etc/nginx/certs/askdata.key \
    -out /etc/nginx/certs/askdata.crt \
    -subj "/CN=askdata" \
    -addext "subjectAltName=IP:192.168.1.XX,IP:127.0.0.1,DNS:localhost"
```

Remplacer `192.168.1.XX` par l'IP réelle du serveur.

### Étape 3 — Rebuild et démarrage

```bash
docker compose build --no-cache frontend
docker compose up -d
```

### Étape 4 — Ouvrir le firewall

Sur la machine serveur, autoriser le port **3000** (et **8080** pour Adminer si besoin).

### Accès depuis les autres postes

```
https://192.168.1.XX:3000
```

Les employés acceptent l'avertissement du certificat auto-signé une seule fois.

### Avec un nom de domaine interne

Si le réseau d'entreprise dispose d'un DNS interne (Active Directory), demander à l'administrateur réseau de créer :

```
askdata.entreprise.local → 192.168.1.XX
```

Accès via : `https://askdata.entreprise.local:3000`

---

## 12. Résolution de problèmes

### L'application affiche "Internal Server Error" au démarrage

```bash
docker compose logs backend --tail=30
```

Cause la plus fréquente : `mysql-auth` n'est pas encore prêt. Attendre 10-15 secondes et recharger.

### "Access denied for user 'askdata'"

Le volume MySQL a été créé avant les variables d'environnement. Solution :

```bash
docker compose down -v   # ⚠️ supprime les données de la base auth
docker compose up -d --build
```

### Le backend tourne encore avec l'ancien code

Docker a mis en cache les couches. Forcer le rebuild :

```bash
docker compose build --no-cache backend
docker compose up -d
```

### La page de login boucle (refresh infini)

Vider le localStorage du navigateur :
```javascript
// Console navigateur (F12)
localStorage.clear()
```
Puis recharger la page.

### Les graphiques n'apparaissent pas dans le dashboard

Vérifier que la route `/api/artifacts` est accessible (elle ne requiert pas de JWT — les iframes ne peuvent pas envoyer de headers). Si le problème persiste, vérifier que les volumes `outputs/` sont bien montés.

### Changer le mot de passe admin

Via le panel Admin → modifier le rôle ou recréer le compte. Ou directement dans Adminer :
```sql
UPDATE users SET password_hash = '...' WHERE email = 'admin@askdata.local';
```
(le hash doit être généré avec bcrypt)

### Connexion à une base sur la machine hôte

Depuis Docker, utiliser `host.docker.internal` comme hôte (pas `localhost`).

```
Host     : host.docker.internal
Port     : 3306 (MySQL) ou 5432 (PostgreSQL)
```

---

## Licence

MIT — usage libre, modification autorisée, redistribution autorisée avec attribution.
