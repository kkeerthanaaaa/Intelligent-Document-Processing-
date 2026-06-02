"""
DocIntel — Analytics Router
GET /api/analytics/summary  — aggregated stats
GET /api/analytics/volume   — daily volume last 7 days
GET /api/analytics/types    — doc type breakdown
GET /api/analytics/confidence — confidence band distribution
"""

import aiosqlite
from fastapi import APIRouter
from backend.database import DB_PATH
from datetime import datetime, timedelta

router = APIRouter()

@router.get("/summary")
async def summary():
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT COUNT(*) FROM jobs") as c:
            total = (await c.fetchone())[0]
        async with db.execute("SELECT COUNT(*) FROM jobs WHERE status='done'") as c:
            done = (await c.fetchone())[0]
        async with db.execute("SELECT COUNT(*) FROM jobs WHERE status='processing'") as c:
            processing = (await c.fetchone())[0]
        async with db.execute("SELECT COUNT(*) FROM jobs WHERE status='review'") as c:
            review = (await c.fetchone())[0]
        async with db.execute("SELECT COUNT(*) FROM jobs WHERE status='failed'") as c:
            failed = (await c.fetchone())[0]
        async with db.execute("SELECT AVG(confidence) FROM results") as c:
            row = await c.fetchone()
            avg_conf = round(row[0], 1) if row and row[0] else 0
        async with db.execute("SELECT COUNT(*) FROM results") as c:
            results_count = (await c.fetchone())[0]
    return {
        "total": total, "done": done, "processing": processing,
        "review": review, "failed": failed,
        "avg_confidence": avg_conf, "results_count": results_count
    }

@router.get("/volume")
async def volume():
    """Daily processing volume for last 7 days."""
    days = []
    async with aiosqlite.connect(DB_PATH) as db:
        for i in range(6, -1, -1):
            d = (datetime.utcnow() - timedelta(days=i)).strftime("%Y-%m-%d")
            async with db.execute(
                "SELECT COUNT(*) FROM jobs WHERE DATE(created_at)=? AND status='done'", (d,)
            ) as c:
                count = (await c.fetchone())[0]
            days.append({"date": d, "count": count,
                         "label": (datetime.utcnow() - timedelta(days=i)).strftime("%a")})
    return {"volume": days}

@router.get("/types")
async def types():
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT doc_type, COUNT(*) as cnt FROM results GROUP BY doc_type ORDER BY cnt DESC"
        ) as c:
            rows = await c.fetchall()
    total = sum(r[1] for r in rows) or 1
    return {"types": [{"label": r[0] or "Unknown", "value": r[1],
                       "pct": round(r[1]/total*100, 1)} for r in rows]}

@router.get("/confidence")
async def confidence():
    bands = [
        ("95-100", 95, 100),
        ("85-94",  85, 94),
        ("70-84",  70, 84),
        ("50-69",  50, 69),
        ("<50",     0, 49),
    ]
    result = []
    async with aiosqlite.connect(DB_PATH) as db:
        for label, low, high in bands:
            async with db.execute(
                "SELECT COUNT(*) FROM results WHERE confidence >= ? AND confidence <= ?", (low, high)
            ) as c:
                count = (await c.fetchone())[0]
            result.append({"label": label, "count": count})
    return {"bands": result}
