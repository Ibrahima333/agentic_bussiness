"""Repository dashboard (graphiques épinglés) par user."""

from __future__ import annotations

from backend.auth.database import get_connection


def get_dashboard(user_id: int) -> list[dict]:
    conn = get_connection()
    cur  = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT * FROM dashboard WHERE user_id = %s ORDER BY pinned_at DESC", (user_id,))
        rows = cur.fetchall()
    finally:
        cur.close()
        conn.close()
    return [
        {
            "id":           r["id"],
            "questionName": r["question_name"],
            "questionText": r["question_text"],
            "chartUrl":     r["chart_url"],
            "pinnedAt":     r["pinned_at"],
        }
        for r in rows
    ]


def upsert_chart(user_id: int, item: dict) -> None:
    conn = get_connection()
    cur  = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO dashboard (id, user_id, question_name, question_text, chart_url, pinned_at)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                chart_url   = VALUES(chart_url),
                pinned_at   = VALUES(pinned_at)
        """, (
            item.get("id"),
            user_id,
            item.get("questionName", ""),
            item.get("questionText", ""),
            item.get("chartUrl", ""),
            item.get("pinnedAt"),
        ))
        conn.commit()
    finally:
        cur.close()
        conn.close()


def delete_chart(user_id: int, chart_id: str) -> None:
    conn = get_connection()
    cur  = conn.cursor()
    try:
        cur.execute("DELETE FROM dashboard WHERE id = %s AND user_id = %s", (chart_id, user_id))
        conn.commit()
    finally:
        cur.close()
        conn.close()


def clear_dashboard(user_id: int) -> None:
    conn = get_connection()
    cur  = conn.cursor()
    try:
        cur.execute("DELETE FROM dashboard WHERE user_id = %s", (user_id,))
        conn.commit()
    finally:
        cur.close()
        conn.close()
