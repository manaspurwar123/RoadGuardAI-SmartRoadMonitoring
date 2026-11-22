
import sqlite3
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import require_admin
from reports_db import get_reports

from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile, File, HTTPException
from reports_db import get_connection


# ==========================================
# DATABASE CONFIGURATION
# ==========================================

BASE_DIR = Path(__file__).resolve().parent

DB_PATH = BASE_DIR / "roadguard.db"


def get_connection():
    conn = sqlite3.connect(
        DB_PATH,
        timeout=10
    )

    conn.row_factory = sqlite3.Row

    conn.execute(
        "PRAGMA foreign_keys = ON"
    )

    return conn


# ==========================================
# REPAIR MANAGEMENT ROUTER
# ==========================================

router = APIRouter(
    prefix="/admin/repairs",
    tags=["Repair Management"],
    dependencies=[Depends(require_admin)]
)


# ==========================================
# INITIALIZE DATABASE TABLES
# ==========================================

def initialize_repair_tables():

    with get_connection() as conn:

        # REPAIR TEAMS TABLE

        conn.execute("""
            CREATE TABLE IF NOT EXISTS repair_teams (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                contact TEXT,
                available INTEGER NOT NULL DEFAULT 1
            )
        """)

        # REPAIR ASSIGNMENTS TABLE

        conn.execute("""
            CREATE TABLE IF NOT EXISTS repair_assignments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                report_id INTEGER NOT NULL UNIQUE,
                team_id INTEGER NOT NULL,
                assigned_at TEXT DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (team_id)
                REFERENCES repair_teams(id)
            )
        """)

        # REPAIR HISTORY TABLE

        conn.execute("""
            CREATE TABLE IF NOT EXISTS repair_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                report_id INTEGER NOT NULL,
                action TEXT NOT NULL,
                details TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        conn.commit()

    print(
        "Repair Management tables initialized successfully"
    )


# ==========================================
# PYDANTIC MODELS
# ==========================================

class TeamCreate(BaseModel):

    name: str = Field(
        min_length=2,
        max_length=100
    )

    contact: str = Field(
        default="",
        max_length=150
    )


class AssignmentCreate(BaseModel):

    report_id: int = Field(
        gt=0
    )

    team_id: int = Field(
        gt=0
    )


class TeamAvailabilityUpdate(BaseModel):

    available: bool


# ==========================================
# HELPER: CHECK REPORT EXISTS
# ==========================================

def check_report_exists(report_id: int):

    # IMPORTANT:
    # Road reports are stored by reports_db.py.
    # Do not query a "reports" table in roadguard.db.

    reports = get_reports()

    for report in reports:

        if int(report["id"]) == report_id:
            return True

    return False


# ==========================================
# CREATE REPAIR TEAM
# ==========================================

@router.post("/teams", status_code=201)
def create_team(data: TeamCreate):

    team_name = data.name.strip()

    contact = data.contact.strip()

    if len(team_name) < 2:
        raise HTTPException(
            status_code=422,
            detail="Team name must contain at least 2 characters"
        )

    with get_connection() as conn:

        try:

            cursor = conn.execute(
                """
                INSERT INTO repair_teams
                (name, contact, available)
                VALUES (?, ?, 1)
                """,
                (
                    team_name,
                    contact
                )
            )

            team_id = cursor.lastrowid

            conn.commit()

        except sqlite3.IntegrityError:

            raise HTTPException(
                status_code=409,
                detail="Repair team already exists"
            )

    return {
        "message": "Repair team created successfully",
        "team_id": team_id,
        "name": team_name,
        "contact": contact,
        "available": True
    }


# ==========================================
# GET ALL REPAIR TEAMS
# ==========================================

@router.get("/teams")
def list_teams():

    with get_connection() as conn:

        rows = conn.execute(
            """
            SELECT
                id,
                name,
                contact,
                available
            FROM repair_teams
            ORDER BY id DESC
            """
        ).fetchall()

    return [
        dict(row)
        for row in rows
    ]


# ==========================================
# UPDATE TEAM AVAILABILITY
# ==========================================

@router.patch("/teams/{team_id}/availability")
def update_team_availability(
    team_id: int,
    data: TeamAvailabilityUpdate
):

    with get_connection() as conn:

        cursor = conn.execute(
            """
            UPDATE repair_teams
            SET available = ?
            WHERE id = ?
            """,
            (
                int(data.available),
                team_id
            )
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Repair team not found"
            )

        conn.commit()

    return {
        "message": "Team availability updated",
        "team_id": team_id,
        "available": data.available
    }


# ==========================================
# ASSIGN REPAIR TEAM TO ROAD REPORT
# ==========================================

@router.post("/assign")
def assign_team(data: AssignmentCreate):

    # STEP 1:
    # Verify road report using reports_db.py

    report_exists = check_report_exists(
        data.report_id
    )

    if not report_exists:
        raise HTTPException(
            status_code=404,
            detail="Road report not found"
        )

    with get_connection() as conn:

        # STEP 2:
        # Check repair team availability

        team = conn.execute(
            """
            SELECT
                id,
                name,
                available
            FROM repair_teams
            WHERE id = ?
            """,
            (data.team_id,)
        ).fetchone()

        if team is None:
            raise HTTPException(
                status_code=404,
                detail="Repair team not found"
            )

        if not team["available"]:
            raise HTTPException(
                status_code=400,
                detail="Selected repair team is unavailable"
            )

        # STEP 3:
        # Check existing assignment

        existing = conn.execute(
            """
            SELECT
                id,
                team_id
            FROM repair_assignments
            WHERE report_id = ?
            """,
            (data.report_id,)
        ).fetchone()

        # STEP 4:
        # Create or update assignment

        if existing:

            if existing["team_id"] == data.team_id:
                return {
                    "message": "This team is already assigned",
                    "report_id": data.report_id,
                    "team_id": data.team_id,
                    "team_name": team["name"]
                }

            conn.execute(
                """
                UPDATE repair_assignments
                SET
                    team_id = ?,
                    assigned_at = CURRENT_TIMESTAMP
                WHERE report_id = ?
                """,
                (
                    data.team_id,
                    data.report_id
                )
            )

            action = "Team Reassigned"

        else:

            conn.execute(
                """
                INSERT INTO repair_assignments
                (report_id, team_id)
                VALUES (?, ?)
                """,
                (
                    data.report_id,
                    data.team_id
                )
            )

            action = "Team Assigned"

        # STEP 5:
        # Save assignment history

        conn.execute(
            """
            INSERT INTO repair_history
            (
                report_id,
                action,
                details
            )
            VALUES (?, ?, ?)
            """,
            (
                data.report_id,
                action,
                f"Assigned to {team['name']}"
            )
        )

        conn.commit()

    return {
        "message": "Repair team assigned successfully",
        "report_id": data.report_id,
        "team_id": data.team_id,
        "team_name": team["name"],
        "action": action
    }


# ==========================================
# GET ALL REPAIR ASSIGNMENTS
# ==========================================

@router.get("/assignments")
def list_assignments():

    with get_connection() as conn:

        rows = conn.execute(
            """
            SELECT
                a.id,
                a.report_id,
                a.team_id,
                t.name AS team_name,
                t.contact AS team_contact,
                a.assigned_at

            FROM repair_assignments a

            INNER JOIN repair_teams t
                ON a.team_id = t.id

            ORDER BY a.assigned_at DESC, a.id DESC
            """
        ).fetchall()

    return [
        dict(row)
        for row in rows
    ]


# ==========================================
# GET ASSIGNMENT FOR SPECIFIC REPORT
# ==========================================

@router.get("/assignments/{report_id}")
def get_report_assignment(report_id: int):

    with get_connection() as conn:

        row = conn.execute(
            """
            SELECT
                a.id,
                a.report_id,
                a.team_id,
                t.name AS team_name,
                t.contact AS team_contact,
                a.assigned_at

            FROM repair_assignments a

            INNER JOIN repair_teams t
                ON a.team_id = t.id

            WHERE a.report_id = ?
            """,
            (report_id,)
        ).fetchone()

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="No repair team assigned to this report"
        )

    return dict(row)


# ==========================================
# GET REPAIR HISTORY
# ==========================================

@router.get("/history/{report_id}")
def get_repair_history(report_id: int):

    if not check_report_exists(report_id):
        raise HTTPException(
            status_code=404,
            detail="Road report not found"
        )

    with get_connection() as conn:

        rows = conn.execute(
            """
            SELECT
                id,
                report_id,
                action,
                details,
                created_at

            FROM repair_history

            WHERE report_id = ?

            ORDER BY id DESC
            """,
            (report_id,)
        ).fetchall()

    return [
        dict(row)
        for row in rows
    ]


# ==========================================
# REPAIR MANAGEMENT STATISTICS
# ==========================================

@router.get("/stats")
def get_repair_stats():

    with get_connection() as conn:

        total_teams = conn.execute(
            """
            SELECT COUNT(*)
            FROM repair_teams
            """
        ).fetchone()[0]

        available_teams = conn.execute(
            """
            SELECT COUNT(*)
            FROM repair_teams
            WHERE available = 1
            """
        ).fetchone()[0]

        assigned_reports = conn.execute(
            """
            SELECT COUNT(*)
            FROM repair_assignments
            """
        ).fetchone()[0]

        total_history = conn.execute(
            """
            SELECT COUNT(*)
            FROM repair_history
            """
        ).fetchone()[0]

    return {
        "total_teams": total_teams,
        "available_teams": available_teams,
        "assigned_reports": assigned_reports,
        "total_history_events": total_history
    }


# ==========================================
# PHASE 23 - REPAIR PHOTO MANAGEMENT
# ==========================================

REPAIR_UPLOAD_DIR = (
    Path(__file__).resolve().parent
    / "uploads"
    / "repairs"
)

REPAIR_UPLOAD_DIR.mkdir(
    parents=True,
    exist_ok=True
)


def init_repair_photo_db():
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS repair_photos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                report_id INTEGER NOT NULL UNIQUE,
                after_image TEXT NOT NULL,
                verified INTEGER NOT NULL DEFAULT 0,
                uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
                verified_at TEXT
            )
        """)


init_repair_photo_db()


@router.post("/photos/{report_id}")
async def upload_repair_photo(
    report_id: int,
    file: UploadFile = File(...),
):
    if not check_report_exists(report_id):
        raise HTTPException(
            status_code=404,
            detail="Road report not found"
        )

    allowed_types = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }

    extension = allowed_types.get(file.content_type)

    if extension is None:
        raise HTTPException(
            status_code=400,
            detail="Only JPG, PNG and WEBP images are allowed"
        )

    # Maximum 5 MB
    image_data = await file.read(5 * 1024 * 1024 + 1)

    if len(image_data) > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail="Image must be smaller than 5 MB"
        )

    if not image_data:
        raise HTTPException(
            status_code=400,
            detail="Image is empty"
        )

    filename = f"{uuid4().hex}{extension}"
    file_path = REPAIR_UPLOAD_DIR / filename

    file_path.write_bytes(image_data)

    image_url = f"/uploads/repairs/{filename}"

    try:
        with get_connection() as conn:
            old_photo = conn.execute(
                """
                SELECT after_image
                FROM repair_photos
                WHERE report_id = ?
                """,
                (report_id,)
            ).fetchone()

            conn.execute(
                """
                INSERT INTO repair_photos
                (report_id, after_image, verified)
                VALUES (?, ?, 0)

                ON CONFLICT(report_id)
                DO UPDATE SET
                    after_image = excluded.after_image,
                    verified = 0,
                    uploaded_at = CURRENT_TIMESTAMP,
                    verified_at = NULL
                """,
                (report_id, image_url)
            )

            conn.execute(
                """
                INSERT INTO repair_history
                (report_id, action, details)
                VALUES (?, ?, ?)
                """,
                (
                    report_id,
                    "Repair Photo Uploaded",
                    image_url
                )
            )

            conn.commit()

        # Remove previous photo after successful update
        if old_photo:
            old_name = Path(old_photo["after_image"]).name
            if old_name != filename:
                (REPAIR_UPLOAD_DIR / old_name).unlink(
                    missing_ok=True
                )

    except Exception:
        file_path.unlink(missing_ok=True)
        raise

    return {
        "message": "Repair photo uploaded successfully",
        "report_id": report_id,
        "after_image": image_url,
        "verified": False
    }


@router.get("/photos/{report_id}")
def get_repair_photo(report_id: int):
    if not check_report_exists(report_id):
        raise HTTPException(
            status_code=404,
            detail="Road report not found"
        )

    with get_connection() as conn:
        photo = conn.execute(
            """
            SELECT *
            FROM repair_photos
            WHERE report_id = ?
            """,
            (report_id,)
        ).fetchone()

    if photo is None:
        return {
            "report_id": report_id,
            "after_image": None,
            "verified": False
        }

    return dict(photo)



# ==========================================
# PHASE 24 - VERIFY REPAIR + AUTO COMPLETE
# ==========================================

@router.patch("/photos/{report_id}/verify")
def verify_repair_photo(report_id: int):

    with get_connection() as conn:

        # STEP 1: Check road report
        report = conn.execute(
            """
            SELECT id, status
            FROM road_reports
            WHERE id = ?
            """,
            (report_id,)
        ).fetchone()

        if report is None:
            raise HTTPException(
                status_code=404,
                detail="Road report not found"
            )

        # STEP 2: Check repair photo
        photo = conn.execute(
            """
            SELECT id, verified
            FROM repair_photos
            WHERE report_id = ?
            """,
            (report_id,)
        ).fetchone()

        if photo is None:
            raise HTTPException(
                status_code=404,
                detail="Upload after-repair photo first"
            )

        # STEP 3: Check already verified repair
        if photo["verified"]:

            # Sync older verified records with Completed status
            if report["status"] != "Completed":

                conn.execute(
                    """
                    UPDATE road_reports
                    SET status = 'Completed'
                    WHERE id = ?
                    """,
                    (report_id,)
                )

                conn.execute(
                    """
                    INSERT INTO repair_history
                    (report_id, action, details)
                    VALUES (?, ?, ?)
                    """,
                    (
                        report_id,
                        "Repair Completed",
                        "Previously verified repair marked Completed"
                    )
                )

                conn.commit()

            return {
                "message": "Repair already verified",
                "report_id": report_id,
                "status": "Completed",
                "verified": True
            }

        # STEP 4: Verify repair photo
        conn.execute(
            """
            UPDATE repair_photos
            SET verified = 1,
                verified_at = CURRENT_TIMESTAMP
            WHERE report_id = ?
            """,
            (report_id,)
        )

        # STEP 5: Automatically complete report
        conn.execute(
            """
            UPDATE road_reports
            SET status = 'Completed'
            WHERE id = ?
            """,
            (report_id,)
        )

        # STEP 6: Save repair history
        conn.execute(
            """
            INSERT INTO repair_history
            (report_id, action, details)
            VALUES (?, ?, ?)
            """,
            (
                report_id,
                "Repair Completed",
                "Repair photo verified and road report completed"
            )
        )

        conn.commit()

    return {
        "message": "Repair verified and completed successfully",
        "report_id": report_id,
        "status": "Completed",
        "verified": True
    }
