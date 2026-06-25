# CROK.md - Agentic Business Intelligence Workflow (CROK Model)

Ce projet supporte plusieurs providers LLM. Ce fichier documente le workflow lorsqu’on utilise le modèle/CLI **CROK** (comme alternative à Gemini), avec la même logique de génération des artefacts (SQL, CSV, dataviz HTML, Insights & Actions) que pour Gemini.

## Workflow (rappel)
1. **Question** : `requests/<name>.txt`
2. **Schéma** : `schema/<db>__<schema>_schema.md` (généré via `scripts/schema.py`)
3. **SQL** : `sql/<name>.sql` (généré via `scripts/generate_sql.py`)
4. **Exécution SQL** : `outputs/<name>/<name>.csv` + `metadata.json` (via `scripts/run_analysis.py`)
5. **Dataviz** : `dataviz/<name>.py` puis `outputs/<name>/<name>.html` (via `scripts/generate_dataviz.py` + `scripts/run_dataviz.py`)
6. **Insights & Actions** : `outputs/<name>/<name>.md` (via `scripts/generate_insights_actions.py`)

## Conditions préalables
- Python et dépendances installées
- Accès à la base de données (PostgreSQL ou MySQL selon votre config)
- Le CLI/model **CROK** doit être installé et accessible dans `PATH` (comme les CLIs Gemini/Codex)

## Exécution (exemples)
### 1) Générer le schéma
```bash
python -m scripts.schema --database <database_name> --schema <schema_name>
```

### 2) Générer le SQL avec CROK
```bash
python -m scripts.generate_sql \
  --request requests/<name>.txt \
  --database <database_name> \
  --schema <schema_name> \
  --provider crok
```

### 3) Exécuter le SQL
```bash
python -m scripts.run_analysis \
  --sql sql/<name>.sql \
  --database <database_name> \
  --schema <schema_name>
```

### 4) Générer la dataviz
```bash
python -m scripts.generate_dataviz \
  --request requests/<name>.txt \
  --provider crok
```

### 5) Générer les insights & actions
```bash
python -m scripts.generate_insights_actions \
  --request requests/<name>.txt \
  --provider crok
```

## Notes importantes
- Le pipeline écrit les artefacts dans leurs dossiers respectifs :
  - `sql/`, `schema/`, `dataviz/`, `outputs/`
- Si le schéma existe déjà et que `overwriteExisting=false`, la step **Schema generation** peut être **skip** (cache hit), ce qui accélère le workflow.

