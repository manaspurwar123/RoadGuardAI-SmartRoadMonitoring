
from fastapi import (
    FastAPI,
    UploadFile,
    File,
    HTTPException,
    Depends,
)

from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from pydantic import BaseModel, Field
from typing import Literal
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from PIL import Image, UnidentifiedImageError


import os

ENABLE_AI = os.getenv("ROADGUARD_ENABLE_AI", "false").lower() == "true"

tf = None
np = None

if ENABLE_AI:
    import tensorflow as tf
    import numpy as np
import io

# ==========================================
# DATABASE IMPORTS
# ==========================================

from reports_db import (
    init_reports_db,
    get_reports,
    create_report,
    update_report_status,
    update_road_report,
    calculate_priority_score,
    get_priority_level,
    update_report_ai,
)

# ==========================================
# ADMIN AUTHENTICATION
# ==========================================

from auth import (
    init_auth_db,
    authenticate_admin,
    create_access_token,
    require_admin,
)

# ==========================================
# REPAIR MANAGEMENT
# ==========================================

from repair_management import (
    router as repair_router,
    initialize_repair_tables,
)

# ==========================================
# FASTAPI APPLICATION
# ==========================================

app = FastAPI(
    title="RoadGuard AI",
    description=(
        "AI Road Damage Detection and "
        "Maintenance Prioritization"
    ),
    version="2.0.0",
)



# ==========================================
# CORS CONFIGURATION
# ==========================================



app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://road-guard-ai-smart-road-monitoring.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# IMAGE STORAGE
# ==========================================

BASE_DIR = Path(__file__).resolve().parent

UPLOAD_DIR = BASE_DIR / "uploads"

UPLOAD_DIR.mkdir(
    parents=True,
    exist_ok=True,
)

app.mount(
    "/uploads",
    StaticFiles(directory=str(UPLOAD_DIR)),
    name="uploads",
)

# ==========================================
# INITIALIZE DATABASE
# ==========================================

init_reports_db()
init_auth_db()
initialize_repair_tables()

# ==========================================
# REGISTER REPAIR MANAGEMENT ROUTER
# ==========================================

app.include_router(repair_router)

# ==========================================
# LOAD AI MODEL
# ==========================================

MODEL_PATH = (
    BASE_DIR
    / "models"
    / "pothole_classifier.keras"
)

model = None

if ENABLE_AI:
    try:
        model = tf.keras.models.load_model(MODEL_PATH)
        print("AI model loaded successfully")
    except Exception as e:
        print(f"AI model loading failed: {e}")
else:
    print("AI inference disabled for lightweight deployment")

# ==========================================
# ADMIN AUTHENTICATION MODELS
# ==========================================

class AdminLoginRequest(BaseModel):
    username: str
    password: str


# ==========================================
# ADMIN LOGIN API
# ==========================================

@app.post("/admin/login")
def admin_login(request: AdminLoginRequest):

    admin = authenticate_admin(
        request.username,
        request.password,
    )

    if admin is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password",
        )

    token = create_access_token(
        admin["username"]
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "username": admin["username"],
    }


# ==========================================
# ADMIN PROFILE API
# ==========================================

@app.get("/admin/me")
def get_admin_profile(
    username: str = Depends(require_admin),
):

    return {
        "username": username,
        "role": "admin",
    }


# ==========================================
# HOME API
# ==========================================

@app.get("/")
def home():

    return {
        "project": "RoadGuard AI",
        "version": "2.0.0",
        "message": "Backend Running Successfully",
        "model_loaded": model is not None,
    }


# ==========================================
# IMAGE VALIDATION
# ==========================================

MAX_IMAGE_SIZE = 10 * 1024 * 1024

ALLOWED_IMAGE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
]


async def validate_image(file: UploadFile):

    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=(
                "Only JPG, PNG and WebP images allowed"
            ),
        )

    image_bytes = await file.read()

    if not image_bytes:
        raise HTTPException(
            status_code=400,
            detail="Uploaded image is empty",
        )

    if len(image_bytes) > MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="Image must be less than 10 MB",
        )

    try:
        image = Image.open(
            io.BytesIO(image_bytes)
        )

        image.load()

        image = image.convert("RGB")

    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
    ):
        raise HTTPException(
            status_code=400,
            detail="Invalid or corrupted image",
        )

    return image


# ==========================================
# AI PREDICTION HELPER
# ==========================================

def predict_road_damage(image):

    if model is None:
        raise HTTPException(
            status_code=503,
            detail="AI model is not loaded",
        )

    try:
        resized_image = image.resize(
            (224, 224)
        )

        image_array = np.array(
            resized_image,
            dtype=np.float32,
        )

        image_array = np.expand_dims(
            image_array,
            axis=0,
        )

        prediction = model.predict(
            image_array,
            verbose=0,
        )[0][0]

        prediction = float(prediction)

        if prediction >= 0.5:
            result = "Pothole"
            confidence = prediction

        else:
            result = "Normal Road"
            confidence = 1 - prediction

        return {
            "prediction": result,
            "confidence": round(
                confidence * 100,
                2,
            ),
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=(
                f"Prediction failed: {str(e)}"
            ),
        )


# ==========================================
# IMAGE UPLOAD API
# ==========================================

@app.post("/upload")
async def upload_image(
    file: UploadFile = File(...),
):

    await validate_image(file)

    return {
        "filename": file.filename,
        "message": (
            "Road image validated successfully"
        ),
    }


# ==========================================
# AI PREDICTION API
# ==========================================

@app.post("/predict")
async def predict_image(
    file: UploadFile = File(...),
):

    image = await validate_image(file)

    result = predict_road_damage(image)

    return {
        "filename": file.filename,
        "prediction": result["prediction"],
        "confidence": result["confidence"],
    }


# ==========================================
# ROAD REPORT DATA MODELS
# ==========================================

class RoadReportCreate(BaseModel):

    lat: float = Field(
        ge=-90,
        le=90,
    )

    lng: float = Field(
        ge=-180,
        le=180,
    )

    description: str = Field(
        min_length=3,
        max_length=1000,
    )

    severity: Literal[
        "Low",
        "Medium",
        "High",
    ] = "Medium"

    traffic_importance: Literal[
        "Low",
        "Medium",
        "High",
    ] = "Medium"


class RoadReportUpdate(BaseModel):

    description: str = Field(
        min_length=3,
        max_length=1000,
    )

    severity: Literal[
        "Low",
        "Medium",
        "High",
    ]

    traffic_importance: Literal[
        "Low",
        "Medium",
        "High",
    ]


class ReportStatusUpdate(BaseModel):

    status: Literal[
        "Open",
        "In Progress",
        "Resolved",
    ]


class PriorityCalculationRequest(BaseModel):

    severity: Literal[
        "Low",
        "Medium",
        "High",
    ]

    traffic_importance: Literal[
        "Low",
        "Medium",
        "High",
    ]


# ==========================================
# FORMAT REPORT HELPER
# ==========================================

def format_report(report):

    report["priority_level"] = (
        get_priority_level(
            report["priority_score"]
        )
    )

    report["needs_repair"] = (
        report["status"] != "Resolved"
    )

    return report


# ==========================================
# GET ALL ROAD REPORTS
# ==========================================

@app.get("/reports")
def list_road_reports():

    reports = get_reports()

    return [
        format_report(report)
        for report in reports
    ]


# ==========================================
# CREATE ROAD REPORT
# ==========================================

@app.post("/reports", status_code=201)
def add_road_report(
    report: RoadReportCreate,
):

    description = (
        report.description.strip()
    )

    if len(description) < 3:
        raise HTTPException(
            status_code=422,
            detail=(
                "Description must contain "
                "at least 3 characters"
            ),
        )

    saved_report = create_report(
        lat=report.lat,
        lng=report.lng,
        description=description,
        created_at=datetime.now(
            timezone.utc
        ).isoformat(),
        severity=report.severity,
        traffic_importance=(
            report.traffic_importance
        ),
    )

    return format_report(
        saved_report
    )


# ==========================================
# UPDATE ROAD REPORT STATUS
# ADMIN ONLY
# ==========================================


@app.patch("/reports/{report_id}/status")
def change_road_report_status(
    report_id: int,
    update: ReportStatusUpdate,
    admin: str = Depends(require_admin),
):
    report = update_report_status(
        report_id,
        update.status,
        admin_username=admin,
    )

    if report is None:
        raise HTTPException(
            status_code=404,
            detail="Road report not found",
        )

    return format_report(report)


# ==========================================
# EDIT ROAD REPORT
# ADMIN ONLY
# ==========================================

@app.patch("/reports/{report_id}")
def edit_road_report(
    report_id: int,
    update: RoadReportUpdate,
    admin: str = Depends(require_admin),
):

    description = (
        update.description.strip()
    )

    if len(description) < 3:
        raise HTTPException(
            status_code=422,
            detail=(
                "Description must contain "
                "at least 3 characters"
            ),
        )

    report = update_road_report(
        report_id=report_id,
        description=description,
        severity=update.severity,
        traffic_importance=(
            update.traffic_importance
        ),
    )

    if report is None:
        raise HTTPException(
            status_code=404,
            detail="Road report not found",
        )

    return format_report(report)


# ==========================================
# PRIORITY CALCULATOR
# ==========================================

@app.post("/calculate-priority")
def calculate_priority(
    request: PriorityCalculationRequest,
):

    score = calculate_priority_score(
        request.severity,
        request.traffic_importance,
    )

    level = get_priority_level(
        score
    )

    return {
        "severity": request.severity,
        "traffic_importance": (
            request.traffic_importance
        ),
        "priority_score": score,
        "priority_level": level,
        "formula": (
            "60% Severity + "
            "40% Traffic Importance"
        ),
    }


# ==========================================
# IMAGE ANALYSIS + PERMANENT STORAGE
# ==========================================

@app.post("/reports/{report_id}/analyze")
async def analyze_report_image(
    report_id: int,
    file: UploadFile = File(...),
):

    # STEP 1 - CHECK AI MODEL

    if model is None:
        raise HTTPException(
            status_code=503,
            detail="AI model is not loaded",
        )

    # STEP 2 - CHECK REPORT EXISTS

    reports = get_reports()

    existing_report = next(
        (
            report
            for report in reports
            if report["id"] == report_id
        ),
        None,
    )

    if existing_report is None:
        raise HTTPException(
            status_code=404,
            detail="Road report not found",
        )

    # STEP 3 - VALIDATE IMAGE

    image = await validate_image(file)

    # STEP 4 - AI PREDICTION

    ai_result = predict_road_damage(
        image
    )

    # STEP 5 - GENERATE IMAGE FILENAME

    filename = (
        f"{uuid4().hex}.jpg"
    )

    image_file_path = (
        UPLOAD_DIR / filename
    )

    image_url = (
        f"/uploads/{filename}"
    )

    # STEP 6 - SAVE IMAGE

    try:
        image.save(
            image_file_path,
            format="JPEG",
            quality=90,
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=(
                f"Image saving failed: {str(e)}"
            ),
        )

    # STEP 7 - SAVE AI RESULT TO SQLITE

    try:
        updated_report = update_report_ai(
            report_id=report_id,
            image_path=image_url,
            ai_prediction=(
                ai_result["prediction"]
            ),
            ai_confidence=(
                ai_result["confidence"]
            ),
        )

        if updated_report is None:
            raise HTTPException(
                status_code=404,
                detail="Road report not found",
            )

    except Exception as e:

        image_file_path.unlink(
            missing_ok=True
        )

        if isinstance(e, HTTPException):
            raise e

        raise HTTPException(
            status_code=500,
            detail=(
                f"Database update failed: {str(e)}"
            ),
        )

    # STEP 8 - RETURN RESULT

    return {
        "message": (
            "AI image saved successfully"
        ),
        "report": format_report(
            updated_report
        ),
        "image_url": image_url,
        "prediction": (
            ai_result["prediction"]
        ),
        "confidence": (
            ai_result["confidence"]
        ),
    }
