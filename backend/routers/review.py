"""
DocIntel — Review Router
Full human-in-the-loop review system with field corrections and feedback.

GET  /api/review/queue          — jobs needing review
GET  /api/review/{job_id}       — review detail for one job
POST /api/review/{job_id}       — submit review (approve/reject + corrections)
GET  /api/review/{job_id}/history — past feedback for a job
GET  /api/review/stats          — feedback statistics
"""

import json
from datetime import datetime
from typing import Optional, List
import aiosqlite
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from backend.database import DB_PATH, log_audit

router = APIRouter()


class ReviewSubmission(BaseModel):
    reviewer:       str            = "Reviewer"
    decision:       str            # "approve" | "reject" | "correct"
    corrected_kv:   dict           = {}
    corrected_text: str            = ""
    notes:          str            = ""
    error_types:    List[str]      = []   # ["ocr_error","wrong_classification","missing_entity",…]


# ── GET: Queue of jobs needing review ─────────────────
@router.get("/queue")
async def get_review_queue():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("""
            SELECT j.id, j.filename, j.doc_type, j.confidence, j.page_count,
                   j.created_at, j.completed_at,
                   r.summary, r.kv_json, r.entities_json, r.images_json,
                   (SELECT COUNT(*) FROM review_feedback rf WHERE rf.job_id = j.id) as review_count,
                   (SELECT decision FROM review_feedback rf WHERE rf.job_id = j.id ORDER BY rf.created_at DESC LIMIT 1) as last_decision
            FROM jobs j
            LEFT JOIN results r ON r.job_id = j.id
            WHERE j.status = 'review'
            ORDER BY j.confidence ASC, j.created_at DESC
        """) as cur:
            rows = await cur.fetchall()

    queue = []
    for row in rows:
        d = dict(row)
        for field in ("kv_json", "entities_json", "images_json"):
            try:   d[field] = json.loads(d[field] or "[]")
            except: d[field] = []
        queue.append(d)

    return {"count": len(queue), "queue": queue}


# ── GET: Full detail for one job's review ─────────────
@router.get("/{job_id}")
async def get_review_detail(job_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM jobs WHERE id=?", (job_id,)) as cur:
            job = await cur.fetchone()
        if not job:
            raise HTTPException(404, "Job not found")
        async with db.execute("SELECT * FROM results WHERE job_id=?", (job_id,)) as cur:
            result = await cur.fetchone()

    if not result:
        raise HTTPException(404, "Result not ready yet")

    d = dict(result)
    for field in ("tables_json", "entities_json", "kv_json", "images_json", "metadata_json"):
        try:   d[field] = json.loads(d[field] or "[]")
        except: d[field] = []

    return {"job": dict(job), "result": d}


# ── POST: Submit review decision + corrections ─────────
@router.post("/{job_id}")
async def submit_review(job_id: str, body: ReviewSubmission):
    # Validate job exists and is in review state
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT status FROM jobs WHERE id=?", (job_id,)) as cur:
            job = await cur.fetchone()
    if not job:
        raise HTTPException(404, "Job not found")

    decision = body.decision.lower()
    if decision not in ("approve", "reject", "correct"):
        raise HTTPException(400, "decision must be 'approve', 'reject', or 'correct'")

    async with aiosqlite.connect(DB_PATH) as db:
        # Save feedback
        await db.execute("""
            INSERT INTO review_feedback
            (job_id, reviewer, decision, corrected_kv, corrected_text, notes, error_types)
            VALUES (?,?,?,?,?,?,?)
        """, (
            job_id,
            body.reviewer,
            decision,
            json.dumps(body.corrected_kv),
            body.corrected_text,
            body.notes,
            json.dumps(body.error_types),
        ))

        # If corrections provided, update the result's kv_json
        if body.corrected_kv:
            async with db.execute("SELECT kv_json FROM results WHERE job_id=?", (job_id,)) as cur:
                res = await cur.fetchone()
            if res:
                existing_kv = json.loads(res["kv_json"] or "{}")
                existing_kv.update(body.corrected_kv)   # merge corrections
                await db.execute(
                    "UPDATE results SET kv_json=? WHERE job_id=?",
                    (json.dumps(existing_kv), job_id)
                )

        # If corrected text provided, update full_text
        if body.corrected_text.strip():
            await db.execute(
                "UPDATE results SET full_text=? WHERE job_id=?",
                (body.corrected_text, job_id)
            )

        # Update job status based on decision
        new_status = "done" if decision in ("approve", "correct") else "failed"
        await db.execute(
            "UPDATE jobs SET status=?, updated_at=? WHERE id=?",
            (new_status, datetime.utcnow().isoformat(), job_id)
        )
        await db.commit()

    # Audit log
    detail = f"Decision: {decision} | Reviewer: {body.reviewer}"
    if body.error_types:
        detail += f" | Errors: {', '.join(body.error_types)}"
    await log_audit(f"Review submitted: {decision}", detail, job_id,
                    user=body.reviewer,
                    level="success" if decision in ("approve","correct") else "warning")

    return {
        "job_id":   job_id,
        "decision": decision,
        "new_status": new_status,
        "message":  f"Review submitted. Job moved to '{new_status}'.",
    }


# ── GET: Review history for a job ─────────────────────
@router.get("/{job_id}/history")
async def review_history(job_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM review_feedback WHERE job_id=? ORDER BY created_at DESC", (job_id,)
        ) as cur:
            rows = await cur.fetchall()
    entries = []
    for row in rows:
        d = dict(row)
        for field in ("corrected_kv", "error_types"):
            try:   d[field] = json.loads(d[field] or "{}")
            except: d[field] = {}
        entries.append(d)
    return {"job_id": job_id, "count": len(entries), "history": entries}


# ── GET: Review statistics ─────────────────────────────
@router.get("/stats/summary")
async def review_stats():
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT COUNT(*) FROM jobs WHERE status='review'") as c:
            pending = (await c.fetchone())[0]
        async with db.execute("SELECT COUNT(*) FROM review_feedback") as c:
            total_reviews = (await c.fetchone())[0]
        async with db.execute(
            "SELECT decision, COUNT(*) FROM review_feedback GROUP BY decision"
        ) as c:
            decisions = dict(await c.fetchall())
        async with db.execute("""
            SELECT error_types FROM review_feedback WHERE error_types != '[]'
        """) as c:
            rows = await c.fetchall()
    
    # Count error types
    error_counts = {}
    for row in rows:
        try:
            for et in json.loads(row[0]):
                error_counts[et] = error_counts.get(et, 0) + 1
        except:
            pass

    return {
        "pending_review":  pending,
        "total_reviews":   total_reviews,
        "decisions":       decisions,
        "top_error_types": sorted(error_counts.items(), key=lambda x: -x[1])[:10],
    }
