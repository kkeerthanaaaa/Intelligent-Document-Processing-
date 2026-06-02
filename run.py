#!/usr/bin/env python3
"""
DocIntel — Start Server
Run:  python run.py
Then: open http://localhost:8000
"""
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_dirs=["backend", "frontend"],
        log_level="info",
    )
