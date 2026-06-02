"""
DocIntel — FastAPI Backend v2
Document Processing Pipeline: Upload → Validate → OCR → NER → AI → Output
"""

import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
import uvicorn

from backend.database import init_db
from backend.routers import upload, jobs, results, search, analytics, system, review

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUTS_DIR = os.path.join(BASE_DIR, "outputs")
IMAGES_DIR  = os.path.join(OUTPUTS_DIR, "images")
os.makedirs(IMAGES_DIR, exist_ok=True)

app = FastAPI(
    title="DocIntel API",
    description="Intelligent Document Processing Pipeline",
    version="2.5.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files
app.mount("/static",  StaticFiles(directory=os.path.join(BASE_DIR, "frontend", "static")), name="static")
app.mount("/outputs", StaticFiles(directory=OUTPUTS_DIR), name="outputs")

templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "frontend", "templates"))

# Routers
app.include_router(upload.router,    prefix="/api/upload",    tags=["Upload"])
app.include_router(jobs.router,      prefix="/api/jobs",      tags=["Jobs"])
app.include_router(results.router,   prefix="/api/results",   tags=["Results"])
app.include_router(search.router,    prefix="/api/search",    tags=["Search"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])
app.include_router(system.router,    prefix="/api/system",    tags=["System"])
app.include_router(review.router,    prefix="/api/review",    tags=["Review"])

@app.on_event("startup")
async def startup():
    await init_db()
    print("\n✓ DocIntel API v2.5.0 — http://localhost:8000\n")

@app.get("/", response_class=HTMLResponse)
async def root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.5.0"}

if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
