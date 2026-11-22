
import sqlite3
from pathlib import Path

# --------------------------------
# DATABASE PATH
# --------------------------------

DB_PATH = Path(__file__).resolve().parent / "roadguard.db"


# --------------------------------
# DATABASE CONNECTION
# --------------------------------

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# --------------------------------
# CALCULATE PRIORITY SCORE
# --------------------------------

def calculate_priority_score(severity, traffic_importance):

    severity_scores = {
        "Low": 20,
        "Medium": 50,
        "High": 80,
    }

    traffic_scores = {
        "Low": 20,
        "Medium": 50,
        "High": 100,
    }

    severity_value = severity_scores.get(severity, 50)
    traffic_value = traffic_scores.get(
        traffic_importance, 50
    )

    score = (
        severity_value * 0.6
        + traffic_value * 0.4
    )

    return round(score)


# --------------------------------
# PRIORITY LEVEL
# --------------------------------

def get_priority_level(score):

    if score >= 70:
        return "High"

    if score >= 40:
        return "Medium"

    return "Low"


# --------------------------------
# INITIALIZE DATABASE
# --------------------------------

def init_reports_db():

    with get_connection() as conn:

        conn.execute("""
            CREATE TABLE IF NOT EXISTS road_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lat REAL NOT NULL,
                lng REAL NOT NULL,
                description TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'Open',
                created_at TEXT NOT NULL,
                severity TEXT NOT NULL DEFAULT 'Medium',
                traffic_importance TEXT NOT NULL DEFAULT 'Medium',
                priority_score INTEGER NOT NULL DEFAULT 50
            )
        """)

        columns = conn.execute(
            "PRAGMA table_info(road_reports)"
        ).fetchall()

        existing_columns = {
            column["name"]
            for column in columns
        }

        new_columns = {
            "severity": "TEXT NOT NULL DEFAULT 'Medium'",
            "traffic_importance": "TEXT NOT NULL DEFAULT 'Medium'",
            "priority_score": "INTEGER NOT NULL DEFAULT 50",
        }

        for column_name, column_type in new_columns.items():

            if column_name not in existing_columns:

                conn.execute(
                    f"ALTER TABLE road_reports "
                    f"ADD COLUMN {column_name} {column_type}"
                )

        conn.commit()


# --------------------------------
# GET ALL REPORTS
# --------------------------------

def get_reports():

    with get_connection() as conn:

        rows = conn.execute(
            """
            SELECT *
            FROM road_reports
            ORDER BY priority_score DESC, id DESC
            """
        ).fetchall()

        return [
            dict(row)
            for row in rows
        ]


# --------------------------------
# CREATE NEW REPORT
# --------------------------------

def create_report(
    lat,
    lng,
    description,
    created_at,
    severity="Medium",
    traffic_importance="Medium",
):

    priority_score = calculate_priority_score(
        severity,
        traffic_importance
    )

    with get_connection() as conn:

        cursor = conn.execute(
            """
            INSERT INTO road_reports
            (
                lat,
                lng,
                description,
                created_at,
                severity,
                traffic_importance,
                priority_score
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                lat,
                lng,
                description,
                created_at,
                severity,
                traffic_importance,
                priority_score
            )
        )

        report_id = cursor.lastrowid

        conn.commit()

        row = conn.execute(
            """
            SELECT *
            FROM road_reports
            WHERE id = ?
            """,
            (report_id,)
        ).fetchone()

        return dict(row)


# --------------------------------
# UPDATE REPAIR STATUS
# --------------------------------

def update_report_status(report_id, status, admin_username=None):
    with get_connection() as conn:
        # Get existing report and its previous status
        old_report = conn.execute(
            """
            SELECT *
            FROM road_reports
            WHERE id = ?
            """,
            (report_id,)
        ).fetchone()

        if old_report is None:
            return None

        old_status = old_report["status"]

        # Skip database changes if status is unchanged
        if old_status == status:
            return dict(old_report)

        # Update road report status
        conn.execute(
            """
            UPDATE road_reports
            SET status = ?
            WHERE id = ?
            """,
            (status, report_id)
        )

        # Ensure history table exists
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS repair_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                report_id INTEGER NOT NULL,
                action TEXT NOT NULL,
                details TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )

        # Record status change
        details = (
            f"Status changed from {old_status} to {status}"
            f" by admin {admin_username or 'unknown'}"
        )

        conn.execute(
            """
            INSERT INTO repair_history
            (report_id, action, details)
            VALUES (?, ?, ?)
            """,
            (
                report_id,
                "Status Updated",
                details
            )
        )

        # Get updated report
        updated_report = conn.execute(
            """
            SELECT *
            FROM road_reports
            WHERE id = ?
            """,
            (report_id,)
        ).fetchone()

        return dict(updated_report)


# --------------------------------
# EDIT EXISTING REPORT
# --------------------------------

def update_road_report(
    report_id,
    description,
    severity,
    traffic_importance
):

    priority_score = calculate_priority_score(
        severity,
        traffic_importance
    )

    with get_connection() as conn:

        cursor = conn.execute(
            """
            UPDATE road_reports
            SET description = ?,
                severity = ?,
                traffic_importance = ?,
                priority_score = ?
            WHERE id = ?
            """,
            (
                description,
                severity,
                traffic_importance,
                priority_score,
                report_id
            )
        )

        if cursor.rowcount == 0:
            return None

        conn.commit()

        row = conn.execute(
            """
            SELECT *
            FROM road_reports
            WHERE id = ?
            """,
            (report_id,)
        ).fetchone()

        return dict(row)



# --------------------------------
# SAVE IMAGE AND AI PREDICTION
# --------------------------------

def update_report_ai(
    report_id,
    image_path,
    ai_prediction,
    ai_confidence,
):
    with get_connection() as conn:
        cursor = conn.execute(
            """
            UPDATE road_reports
            SET image_path = ?,
                ai_prediction = ?,
                ai_confidence = ?
            WHERE id = ?
            """,
            (
                image_path,
                ai_prediction,
                ai_confidence,
                report_id,
            ),
        )

        if cursor.rowcount == 0:
            return None

        conn.commit()

        row = conn.execute(
            "SELECT * FROM road_reports WHERE id = ?",
            (report_id,),
        ).fetchone()

        return dict(row)
