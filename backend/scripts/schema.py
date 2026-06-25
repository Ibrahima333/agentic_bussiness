import argparse
import os
from pathlib import Path
import sys

if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from backend.utils.db_utils import run_query


def _db_type() -> str:
    return os.getenv("DB_TYPE", "postgresql").lower()


def _generate_schema_mysql(database_name: str, schema_name: str) -> list[str]:
    # En MySQL schema == database
    target = schema_name if schema_name else database_name

    content = [
        f"# Schéma MySQL : `{target}`\n",
        "_Seules les tables physiques (BASE TABLE) sont prises en compte._\n",
    ]

    # Tables
    _, rows = run_query(
        "SELECT table_name FROM information_schema.tables "
        "WHERE table_schema = %s AND table_type = 'BASE TABLE' ORDER BY table_name;",
        target, (target,)
    )
    content.append("\n## TABLES\n")
    for (table_name,) in rows:
        content.append(f"- {target}.{table_name}")

    # Colonnes
    _, rows = run_query(
        "SELECT table_name, column_name, column_type, is_nullable "
        "FROM information_schema.columns "
        "WHERE table_schema = %s "
        "ORDER BY table_name, ordinal_position;",
        target, (target,)
    )
    content.append("\n## COLUMNS\n")
    for row in rows:
        content.append("- " + " | ".join(map(str, [f"{target}.{row[0]}"] + list(row[1:]))))

    # Contraintes (clés primaires + étrangères via key_column_usage)
    _, rows = run_query(
        """
        SELECT kcu.table_name, kcu.constraint_name, kcu.column_name,
               kcu.referenced_table_name, kcu.referenced_column_name,
               tc.constraint_type
        FROM information_schema.key_column_usage kcu
        JOIN information_schema.table_constraints tc
          ON kcu.constraint_name = tc.constraint_name
         AND kcu.table_schema = tc.table_schema
        WHERE kcu.table_schema = %s
        ORDER BY kcu.table_name, tc.constraint_type;
        """,
        target, (target,)
    )
    content.append("\n## CONSTRAINTS\n")
    for row in rows:
        table, cname, col, ref_table, ref_col, ctype = row
        ref = f" -> {target}.{ref_table}.{ref_col}" if ref_table else ""
        content.append(f"- {target}.{table} | {ctype} | {col}{ref}")

    return content


def _generate_schema_postgresql(database_name: str, schema_name: str) -> list[str]:
    content = [
        f"# Schéma PostgreSQL : `{database_name}.{schema_name}`\n",
        "_Seules les tables physiques (BASE TABLE) sont prises en compte._\n",
    ]

    queries = {
        "tables": (
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = %s AND table_type = 'BASE TABLE' ORDER BY table_name;",
            (schema_name,)
        ),
        "columns": (
            "SELECT c.table_name, c.column_name, c.data_type, c.is_nullable "
            "FROM information_schema.columns c "
            "JOIN information_schema.tables t ON c.table_name = t.table_name AND c.table_schema = t.table_schema "
            "WHERE c.table_schema = %s AND t.table_type = 'BASE TABLE' "
            "ORDER BY c.table_name, c.ordinal_position;",
            (schema_name,)
        ),
        "constraints": (
            """
            SELECT tc.table_name, tc.constraint_type, kcu.column_name,
                   ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
            FROM information_schema.table_constraints tc
            JOIN information_schema.tables t ON tc.table_name = t.table_name AND tc.table_schema = t.table_schema
            LEFT JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
            LEFT JOIN information_schema.constraint_column_usage ccu
              ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
            WHERE tc.table_schema = %s AND t.table_type = 'BASE TABLE'
            ORDER BY tc.table_name, tc.constraint_type;
            """,
            (schema_name,)
        ),
    }

    for section, (sql, params) in queries.items():
        _, rows = run_query(sql, database_name, params)
        content.append(f"\n## {section.upper()}\n")
        for row in rows:
            row_list = list(row)
            row_list[0] = f"{schema_name}.{row_list[0]}"
            if section == "constraints" and row_list[3] and str(row_list[3]) != "None":
                row_list[3] = f"{schema_name}.{row_list[3]}"
            content.append("- " + " | ".join(map(str, row_list)))

    return content


def generate_schema(database_name: str, schema_name: str = "public"):
    # Pour MySQL : schema_name == database_name
    if _db_type() == "mysql" and not schema_name:
        schema_name = database_name

    schema_path = Path(f"schema/{database_name}__{schema_name}_schema.md")
    schema_path.parent.mkdir(exist_ok=True)

    if _db_type() == "mysql":
        content = _generate_schema_mysql(database_name, schema_name)
    else:
        content = _generate_schema_postgresql(database_name, schema_name)

    schema_path.write_text("\n".join(content), encoding="utf-8")
    print(f"[schema] Généré : {schema_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Génère le schéma d'une base de données.")
    parser.add_argument("--database", required=True)
    parser.add_argument("--schema", default="")
    args = parser.parse_args()
    generate_schema(args.database, args.schema)
