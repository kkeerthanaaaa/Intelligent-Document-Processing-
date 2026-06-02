"""
DocIntel — Database Layer
SQLite via aiosqlite for async operations
Tables: jobs, results, audit_log, review_feedback
"""

import aiosqlite
import os, json
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "db", "docintel.db")

async def get_db():
    return await aiosqlite.connect(DB_PATH)

async def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS jobs (
                id          TEXT PRIMARY KEY,
                filename    TEXT NOT NULL,
                filesize    INTEGER,
                filetype    TEXT,
                mimetype    TEXT,
                doc_type    TEXT DEFAULT 'Unknown',
                status      TEXT DEFAULT 'queued',
                stage       INTEGER DEFAULT 0,
                stage_name  TEXT DEFAULT '',
                progress    REAL DEFAULT 0,
                confidence  REAL,
                page_count  INTEGER DEFAULT 0,
                is_hybrid   INTEGER DEFAULT 0,
                ocr_engine  TEXT DEFAULT 'tesseract',
                sha256      TEXT,
                error_msg   TEXT,
                created_at  TEXT DEFAULT (datetime('now')),
                updated_at  TEXT DEFAULT (datetime('now')),
                completed_at TEXT
            );

            CREATE TABLE IF NOT EXISTS results (
                id            TEXT PRIMARY KEY,
                job_id        TEXT NOT NULL,
                filename      TEXT,
                doc_type      TEXT,
                confidence    REAL,
                page_count    INTEGER,
                full_text     TEXT,
                tables_json   TEXT DEFAULT '[]',
                entities_json TEXT DEFAULT '[]',
                kv_json       TEXT DEFAULT '{}',
                summary       TEXT,
                images_json   TEXT DEFAULT '[]',
                metadata_json TEXT DEFAULT '{}',
                created_at    TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (job_id) REFERENCES jobs(id)
            );

            CREATE TABLE IF NOT EXISTS audit_log (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id     TEXT,
                user       TEXT DEFAULT 'system',
                action     TEXT NOT NULL,
                detail     TEXT,
                level      TEXT DEFAULT 'info',
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS review_feedback (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id          TEXT NOT NULL,
                reviewer        TEXT DEFAULT 'Reviewer',
                decision        TEXT NOT NULL,
                corrected_kv    TEXT DEFAULT '{}',
                corrected_text  TEXT DEFAULT '',
                notes           TEXT DEFAULT '',
                error_types     TEXT DEFAULT '[]',
                created_at      TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (job_id) REFERENCES jobs(id)
            );

            CREATE INDEX IF NOT EXISTS idx_jobs_status    ON jobs(status);
            CREATE INDEX IF NOT EXISTS idx_results_job_id ON results(job_id);
            CREATE INDEX IF NOT EXISTS idx_audit_created  ON audit_log(created_at);
            CREATE INDEX IF NOT EXISTS idx_review_job     ON review_feedback(job_id);
        """)
        await db.commit()
    print(f"✓ Database initialised at {DB_PATH}")

async def log_audit(action: str, detail: str = "", job_id: str = None, user: str = "system", level: str = "info"):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO audit_log (job_id, user, action, detail, level) VALUES (?,?,?,?,?)",
            (job_id, user, action, detail, level)
        )
        await db.commit()
