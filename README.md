# DocIntel — Intelligent Document Processing Pipeline

A **production-ready, full-stack** document intelligence system.
Real OCR · Real NER · Real database · Real API · Real backend.

---

## Tech Stack

| Layer       | Technology                                   |
|-------------|----------------------------------------------|
| Backend     | **FastAPI** (Python 3.12) + Uvicorn          |
| Database    | **SQLite** via aiosqlite (async)             |
| OCR         | **Tesseract v5 LSTM** via pytesseract        |
| PDF Extract | **pdfplumber** (native text + tables)        |
| Img Proc    | **OpenCV** — grayscale, deskew, binarize     |
| NER         | Regex engine (Email, Phone, GST, PAN, Money) |
| Frontend    | Vanilla JS + Canvas charts (zero npm)        |
| Fonts       | Syne + DM Sans + JetBrains Mono (Google)     |

---

## Project Structure

```
docintel/
├── run.py                     ← START HERE
├── requirements.txt
├── backend/
│   ├── main.py                ← FastAPI app, routes, startup
│   ├── database.py            ← SQLite schema, init, audit logging
│   ├── services/
│   │   └── pipeline.py        ← FULL 10-stage pipeline (real OCR)
│   └── routers/
│       ├── upload.py          ← POST /api/upload
│       ├── jobs.py            ← GET/DELETE /api/jobs
│       ├── results.py         ← GET /api/results + exports
│       ├── search.py          ← GET /api/search
│       ├── analytics.py       ← GET /api/analytics/*
│       └── system.py          ← GET /api/system/health + audit
├── frontend/
│   ├── templates/
│   │   └── index.html         ← Main UI (served by FastAPI)
│   └── static/
│       ├── css/main.css       ← Full design system
│       └── js/app.js          ← All frontend logic + API calls
├── uploads/                   ← Raw uploaded files (auto-created)
├── outputs/                   ← JSON result files (auto-created)
└── db/
    └── docintel.db            ← SQLite database (auto-created)
```

---

## Quick Start

### 1. Install system dependencies (Ubuntu/Debian)

```bash
sudo apt-get update
sudo apt-get install -y tesseract-ocr poppler-utils
```

### 2. Install Python packages

```bash
pip install -r requirements.txt
```

### 3. Run

```bash
python run.py
```

Open **http://localhost:8000** in your browser.

---

## macOS Setup

```bash
brew install tesseract poppler
pip install -r requirements.txt
python run.py
```

## Windows Setup

1. Install [Tesseract](https://github.com/UB-Mannheim/tesseract/wiki) — add to PATH
2. Install [Poppler for Windows](https://github.com/oschwartz10612/poppler-windows/releases/)
3. Add Poppler `bin/` folder to PATH
4. `pip install -r requirements.txt`
5. `python run.py`

---

## API Reference

All endpoints return JSON. Full Swagger UI at **http://localhost:8000/docs**

| Method | Endpoint                              | Description                   |
|--------|---------------------------------------|-------------------------------|
| POST   | `/api/upload`                         | Upload files, start pipeline  |
| GET    | `/api/jobs`                           | List all jobs                 |
| GET    | `/api/jobs/stats`                     | Aggregate job counts          |
| GET    | `/api/jobs/{id}`                      | Single job status + progress  |
| DELETE | `/api/jobs/{id}`                      | Delete job + result           |
| GET    | `/api/results`                        | List all results              |
| GET    | `/api/results/{id}`                   | Full result (text, KV, NER)   |
| GET    | `/api/results/{id}/export/json`       | Download as JSON              |
| GET    | `/api/results/{id}/export/csv`        | Download as CSV               |
| GET    | `/api/results/{id}/export/txt`        | Download extracted text       |
| GET    | `/api/search?q=...`                   | Full-text search              |
| GET    | `/api/analytics/summary`             | Counts + avg confidence       |
| GET    | `/api/analytics/volume`              | Daily volume (7 days)         |
| GET    | `/api/analytics/types`               | Document type breakdown       |
| GET    | `/api/analytics/confidence`          | Confidence band distribution  |
| GET    | `/api/system/health`                 | CPU, memory, disk (live)      |
| GET    | `/api/system/audit`                  | Audit log entries             |
| GET    | `/api/system/audit/export`           | Download audit log CSV        |
| GET    | `/health`                            | Simple health check           |
| GET    | `/docs`                              | Swagger UI                    |

### Upload Example (curl)

```bash
curl -X POST http://localhost:8000/api/upload \
  -F "files=@invoice.pdf" \
  -F "doc_type=Auto-Detect" \
  -F "ocr_engine=tesseract"
```

### Poll Job Status

```bash
curl http://localhost:8000/api/jobs/{job_id}
```

### Get Result

```bash
curl http://localhost:8000/api/results/{job_id}
```

---

## Pipeline Stages (Real Implementation)

| # | Stage                        | Implementation                                      |
|---|------------------------------|-----------------------------------------------------|
| 1 | Document Upload & Metadata   | File save, SHA256, MIME detection                   |
| 2 | File Validation & Security   | Magic bytes check, size limit, corruption, dedup    |
| 3 | Document Analysis & Routing  | pdfplumber page count, native text detection        |
| 4 | Image Preprocessing          | OpenCV: grayscale→denoise→deskew→CLAHE→binarize     |
| 5 | Layout Analysis              | Edge density, pdfplumber region detection           |
| 6 | Parallel Extraction          | Tesseract OCR + pdfplumber native + table extract   |
| 7 | Post-Processing & AI         | Text clean, regex NER, KV extraction, summarization |
| 8 | LLM Validation & Confidence  | Confidence scoring (text quality + NER + KV + tables)|
| 9 | Output Generation            | JSON result + DB persist + file export              |
|10 | Audit & Completion           | SQLite audit log, job status update                 |

---

## Database Schema

```sql
jobs        — id, filename, status, stage, progress, confidence, sha256, …
results     — job_id, full_text, tables_json, entities_json, kv_json, summary, …
audit_log   — job_id, user, action, detail, level, created_at
```

---

## Extracted Entity Types

| Type     | Examples                        |
|----------|---------------------------------|
| EMAIL    | user@domain.com                 |
| PHONE    | +91 9876543210                  |
| MONEY    | ₹2,18,300 / Rs. 5,000          |
| DATE     | 20/05/2025 / May 20, 2025       |
| PAN      | ABCDE1234F                      |
| GST      | 29ABCDE1234F1Z5                 |
| IFSC     | HDFC0001234                     |
| REF_NUM  | INV-2025-001, TXN123456         |
| ORG      | Reliance Industries Ltd.        |
| PERSON   | Mr. Arjun Kumar                 |
| URL      | https://example.com             |
| PINCODE  | 560034                          |

---

## Environment Variables (Optional)

```bash
export DOCINTEL_PORT=8000
export DOCINTEL_HOST=0.0.0.0
export TESSERACT_CMD=/usr/bin/tesseract   # if not on PATH
```

---

## Extending the Pipeline

To add a real LLM (e.g. OpenAI GPT-4o) for post-processing:

```python
# In backend/services/pipeline.py, Stage 7:
import openai
client = openai.OpenAI(api_key=os.environ["OPENAI_API_KEY"])
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": f"Summarize this document:\n{clean_text[:3000]}"}]
)
summary = response.choices[0].message.content
```

To add spaCy NER:
```bash
pip install spacy
python -m spacy download en_core_web_sm
```
Then in `pipeline.py`, replace `_extract_entities_regex` with spaCy NER.

---

## License

Enterprise · DocIntel v2.4.1
