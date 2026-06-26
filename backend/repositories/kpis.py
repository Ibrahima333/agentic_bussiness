"""Repository KPIs épinglés par user."""

from __future__ import annotations

from backend.auth.database import get_connection


def get_kpis(user_id: int) -> list[dict]:
    conn = get_connection()
    cur  = conn.cursor(dictionary=True)
    cur.execute("SELECT * FROM kpis WHERE user_id = %s ORDER BY pinned_at DESC", (user_id,))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows


def upsert_kpi(user_id: int, kpi: dict) -> None:
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("""
        INSERT INTO kpis
            (id, user_id, question_name, question_text, column_name, value,
             raw_value, previous_value, database_name, schema_name, provider_name,
             pinned_at, last_updated)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON DUPLICATE KEY UPDATE
            value          = VALUES(value),
            raw_value      = VALUES(raw_value),
            previous_value = VALUES(previous_value),
            last_updated   = VALUES(last_updated)
    """, (
        kpi.get("id"),
        user_id,
        kpi.get("questionName", ""),
        kpi.get("questionText", ""),
        kpi.get("columnName", ""),
        kpi.get("value", ""),
        kpi.get("rawValue"),
        kpi.get("previousValue"),
        kpi.get("database", ""),
        kpi.get("schema", ""),
        kpi.get("provider", ""),
        kpi.get("pinnedAt"),
        kpi.get("lastUpdated"),
    ))
    conn.commit()
    cur.close()
    conn.close()


def delete_kpi(user_id: int, kpi_id: str) -> None:
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("DELETE FROM kpis WHERE id = %s AND user_id = %s", (kpi_id, user_id))
    conn.commit()
    cur.close()
    conn.close()


def clear_kpis(user_id: int) -> None:
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("DELETE FROM kpis WHERE user_id = %s", (user_id,))
    conn.commit()
    cur.close()
    conn.close()
