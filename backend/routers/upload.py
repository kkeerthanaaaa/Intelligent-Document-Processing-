"""
DocIntel — Upload Router
POST /api/upload — accepts PDF/JPG/PNG, creates job, runs pipeline in background
"""

import os, uuid, shutil
from datetime import datetime
from typing import List

import aiosqlite
from fastapi import APIRouter, UploadFile, File, Form, BackgroundTasks, HTTPException
from fastapi.responses import JSONResponse

from backend.database import DB_PATH, log_audit
from backend.services.pipeline import UPLOAD_DIR, run_pipeline

router = APIRouter()

ALLOWED_TYPES = {
    "application/pdf": ".pdf",
    "image/jpeg":      ".jpg",
    "image/png":       ".png",
    "image/jpg":       ".jpg",
}
MAX_SIZE = 100 * 1024 * 1024  # 100 MB

@router.post("")
async def upload_files(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    doc_type: str  = Form(default="Auto-Detect"),
    ocr_engine: str = Form(default="tesseract"),
):
    if not files:
        raise HTTPException(400, "No files provided")

    created_jobs = []

    for file in files:
        # Basic validation
        content_type = file.content_type or ""
        ext = ALLOWED_TYPES.get(content_type)
        if not ext:
            # Try by filename
            fname = (file.filename or "").lower()
            if fname.endswith(".pdf"):   ext = ".pdf"
            elif fname.endswith(".jpg") or fname.endswith(".jpeg"): ext = ".jpg"
            elif fname.endswith(".png"): ext = ".png"
            else:
                created_jobs.append({"filename": file.filename, "error": "Unsupported file type"})
                continue

        # Read file content
        content = await file.read()
        if len(content) > MAX_SIZE:
            created_jobs.append({"filename": file.filename, "error": "File exceeds 100MB"})
            continue
        if len(content) < 100:
            created_jobs.append({"filename": file.filename, "error": "File too small or empty"})
            continue

        # Save file
        job_id   = str(uuid.uuid4())
        safe_name = f"{job_id}{ext}"
        filepath = os.path.join(UPLOAD_DIR, safe_name)
        with open(filepath, "wb") as f:
            f.write(content)

        # Create job record
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute("""
                INSERT INTO jobs (id, filename, filesize, filetype, mimetype, doc_type, status,
                                  stage, stage_name, progress, ocr_engine, created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                job_id,
                file.filename,
                len(content),
                doc_type if doc_type != "Auto-Detect" else "Unknown",
                content_type,
                doc_type if doc_type != "Auto-Detect" else "Unknown",
                "queued",
                0, "Queued",
                0.0,
                ocr_engine,
                datetime.utcnow().isoformat(),
            ))
            await db.commit()

        await log_audit("File uploaded", f"{file.filename} ({len(content)//1024}KB)", job_id)

        # Kick off pipeline in background
        background_tasks.add_task(run_pipeline, job_id, filepath)

        created_jobs.append({
            "job_id":   job_id,
            "filename": file.filename,
            "filesize": len(content),
            "status":   "queued",
        })

    return JSONResponse({"jobs": created_jobs, "count": len(created_jobs)})
