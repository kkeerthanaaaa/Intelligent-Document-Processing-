"""
DocIntel — Jobs Router
GET /api/jobs        — list all jobs
GET /api/jobs/{id}   — get single job status
DELETE /api/jobs/{id} — delete job
"""

import aiosqlite
from fastapi import APIRouter, HTTPException
from backend.database import DB_PATH

router = APIRouter()

def _row_to_job(row, cols):
    d = dict(zip(cols, row))
    return d

@router.get("")
async def list_jobs():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM jobs ORDER BY created_at DESC LIMIT 200"
        ) as cur:
            rows = await cur.fetchall()
    return {"jobs": [dict(r) for r in rows]}

@router.get("/stats")
async def get_stats():
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT status, COUNT(*) FROM jobs GROUP BY status") as cur:
            status_counts = dict(await cur.fetchall())
        async with db.execute("SELECT AVG(confidence) FROM jobs WHERE confidence IS NOT NULL") as cur:
            row = await cur.fetchone()
            avg_conf = round(row[0], 1) if row and row[0] else None
        async with db.execute("SELECT COUNT(*) FROM jobs") as cur:
            total = (await cur.fetchone())[0]
    return {
        "total":      total,
        "done":       status_counts.get("done", 0),
        "processing": status_counts.get("processing", 0),
        "queued":     status_counts.get("queued", 0),
        "review":     status_counts.get("review", 0),
        "failed":     status_counts.get("failed", 0),
        "avg_confidence": avg_conf,
    }

@router.get("/{job_id}")
async def get_job(job_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM jobs WHERE id=?", (job_id,)) as cur:
            row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "Job not found")
    return dict(row)

@router.delete("/{job_id}")
async def delete_job(job_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM jobs WHERE id=?", (job_id,))
        await db.execute("DELETE FROM results WHERE job_id=?", (job_id,))
        await db.execute("DELETE FROM audit_log WHERE job_id=?", (job_id,))
        await db.commit()
    return {"deleted": job_id}
