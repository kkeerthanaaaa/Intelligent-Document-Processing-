"""
DocIntel — System Router
GET /api/system/audit     — audit log
GET /api/system/health    — system health + resource usage
GET /api/system/audit/export — download audit CSV
"""

import csv, io, psutil, time
import aiosqlite
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from backend.database import DB_PATH

router = APIRouter()

START_TIME = time.time()

@router.get("/health")
async def health():
    cpu    = psutil.cpu_percent(interval=0.2)
    mem    = psutil.virtual_memory()
    disk   = psutil.disk_usage("/")
    uptime = time.time() - START_TIME
    return {
        "status":    "ok",
        "cpu_pct":   cpu,
        "mem_pct":   mem.percent,
        "mem_used_mb": round(mem.used / 1024 / 1024, 1),
        "mem_total_mb": round(mem.total / 1024 / 1024, 1),
        "disk_pct":  disk.percent,
        "disk_used_gb": round(disk.used / 1024**3, 2),
        "disk_total_gb": round(disk.total / 1024**3, 2),
        "uptime_s":  round(uptime, 0),
    }

@router.get("/audit")
async def audit_log(limit: int = Query(default=100, le=500)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?", (limit,)
        ) as cur:
            rows = await cur.fetchall()
    return {"entries": [dict(r) for r in rows]}

@router.get("/audit/export")
async def export_audit():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM audit_log ORDER BY created_at DESC") as cur:
            rows = await cur.fetchall()
    buf = io.StringIO()
    w   = csv.writer(buf)
    w.writerow(["ID", "Job ID", "User", "Action", "Detail", "Level", "Timestamp"])
    for r in rows:
        d = dict(r)
        w.writerow([d["id"], d["job_id"], d["user"], d["action"], d["detail"], d["level"], d["created_at"]])
    buf.seek(0)
    return StreamingResponse(buf, media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="audit_log.csv"'})
