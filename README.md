
<div align="center">

# ⬡ IDP Studio
### Intelligent Document Processing — Local, Fast, Fully Editable

[![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Tesseract](https://img.shields.io/badge/Tesseract-v5_LSTM-4A90D9?style=flat-square)](https://github.com/tesseract-ocr/tesseract)
[![FAISS](https://img.shields.io/badge/FAISS-Vector_Search-FF6F00?style=flat-square)](https://github.com/facebookresearch/faiss)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)
[![No Cloud](https://img.shields.io/badge/Cloud_Dependency-None-critical?style=flat-square&logo=cloudflare&logoColor=white)](.)

**End-to-end document intelligence pipeline — extract, search, and verify structured data from PDFs and images with zero cloud dependency and zero per-page cost.**

[Features](#-features) · [Demo](#-screenshots) · [Architecture](#-architecture) · [Setup](#-getting-started) · [API](#-api-reference) · [Roadmap](#-roadmap)

</div>

---

## 🎯 What It Does

IDP Studio is a production-grade document processing system that turns unstructured PDFs and scanned images into clean, structured, queryable data — entirely on local hardware. Built for analysts, developers, and enterprises that need document intelligence without sending sensitive data to third-party APIs.

**The core loop:**
1. Drop in any PDF or image (invoice, contract, form, receipt)
2. The pipeline extracts text, tables, and key-value pairs with per-component confidence scoring
3. Every result is editable in the UI before export
4. Corrections feed back into continuous model improvement
5. All documents become semantically searchable via natural language

---

## ✨ Features

| Feature | Description |
|---|---|
| 📄 **Multi-format Ingestion** | PDF (native text + tables via pdfplumber) and image files (PNG, JPG) via Tesseract v5 LSTM OCR |
| 🧠 **NER Engine** | Regex-based entity recognition for Email, Phone, GST, PAN, Money — zero model cold-start |
| ✏️ **Editable Extraction** | Every text block, table cell, and key-value pair is editable in the UI before export |
| 🔥 **Confidence Heatmap** | Per-component scoring across OCR, tables, handwriting, images, and key-values separately |
| 🔍 **Semantic Search** | FAISS vector DB + sentence-transformers — query across all documents in natural language |
| 👁️ **Human-in-the-Loop** | Low-confidence results auto-flagged and queued for human review |
| 🔄 **Continuous Learning** | User corrections stored and fed back into the model improvement pipeline |
| ⚡ **Local GPU Inference** | Full pipeline runs on RTX 3050 — no cloud dependency, no per-page cost |
| 📊 **Analytics Dashboard** | Canvas-based charts (zero npm) tracking throughput, confidence trends, and entity stats |
| 🚀 **REST API** | Full FastAPI + OpenAPI docs — integrate with any downstream system |

---

## 📸 Screenshots

### Document Extraction View
*Upload a PDF or image and watch the pipeline extract text, tables, and named entities in real time. Every field is editable.*

<img width="1909" height="914" alt="processing" src="https://github.com/user-attachments/assets/8aa0c592-f66e-475b-8e23-94501fec8032" />



---

### Analytics Dashboard
*Track processing volume, confidence breakdowns by component type, and document history. All rendered with vanilla Canvas — no external charting library.*

<img width="1909" height="911" alt="Screenshot_2-6-2026_185138_localhost" src="https://github.com/user-attachments/assets/9af137f9-ff84-45b1-8a14-5720e7f31fbe" />


---

### Semantic Search
*Ask questions in plain English across your entire document corpus. Powered by FAISS + sentence-transformers running entirely on-device.*


<img width="1909" height="909" alt="search and chat" src="https://github.com/user-attachments/assets/6d85491a-c986-422a-b481-73eddb769a17" />


---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                             │
│         Vanilla JS + Canvas Charts + Syne/DM Sans           │
└────────────────────────┬────────────────────────────────────┘
                         │  HTTP / REST
┌────────────────────────▼────────────────────────────────────┐
│                    FastAPI (Python 3.12)                     │
│              Uvicorn · Async · OpenAPI Docs                  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │   Routers   │  │   Services   │  │      Models        │  │
│  │  /upload    │  │ OCRService   │  │  Document          │  │
│  │  /extract   │  │ NERService   │  │  Entity            │  │
│  │  /search    │  │ SearchSvc    │  │  Correction        │  │
│  │  /analytics │  │ LearningPipe │  │                    │  │
│  └─────────────┘  └──────────────┘  └────────────────────┘  │
└───────────┬──────────────┬──────────────┬───────────────────┘
            │              │              │
    ┌───────▼──────┐ ┌─────▼──────┐ ┌────▼──────────┐
    │  pdfplumber  │ │  Tesseract │ │     FAISS      │
    │  (tables +  │ │  v5 LSTM   │ │  Vector Store  │
    │  native txt)│ │  + OpenCV  │ │  + MiniLM-L6   │
    └─────────────┘ └────────────┘ └───────────────┘
                         │
                  ┌──────▼──────┐
                  │   SQLite    │
                  │  (aiosqlite │
                  │   async)    │
                  └─────────────┘
```

**Image preprocessing pipeline (OpenCV):**
```
Raw Image → Grayscale → Deskew → Binarize (Otsu) → Tesseract LSTM → Text + Confidence
>>>>>>> 911b813536a4c2a0c615165a1f2f75ad99c9f6ba
```

---

<<<<<<< HEAD
## Quick Start

### 1. Install system dependencies (Ubuntu/Debian)
@@ -228,3 +346,190 @@ Then in `pipeline.py`, replace `_extract_entities_regex` with spaCy NER.
## License

Enterprise · DocIntel v2.4.1
=======
## 🛠️ Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Backend** | FastAPI + Uvicorn | Async, fast, auto OpenAPI docs |
| **Database** | SQLite + aiosqlite | Zero-setup, async, portable |
| **OCR** | Tesseract v5 LSTM | Best open-source accuracy, GPU-capable |
| **PDF** | pdfplumber | Native text + table extraction without OCR where possible |
| **Image Processing** | OpenCV | Deskew, grayscale, Otsu binarization before OCR |
| **NER** | Custom Regex Engine | Zero cold-start, deterministic, easily extensible |
| **Vector Search** | FAISS + sentence-transformers | Sub-50ms semantic search, fully local |
| **Frontend** | Vanilla JS + Canvas | Zero npm, zero build step, instant load |
| **Fonts** | Syne + DM Sans + JetBrains Mono | Designed for data-heavy interfaces |

---

## 🚀 Getting Started

### Prerequisites

- Python 3.12+
- Tesseract v5 (`apt install tesseract-ocr` / `brew install tesseract`)
- CUDA-capable GPU recommended (RTX 3050+ tested)

### Installation

```bash
git clone https://github.com/yourusername/IDP.git
cd IDP

# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Initialize database
python backend/utils/init_db.py
```

### Running

```bash
# Start the backend
uvicorn backend.main:app --reload --port 8000

# Open in browser
open http://localhost:8000
```

The FastAPI interactive docs are available at `http://localhost:8000/docs`.

---

## 📡 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/upload` | Upload PDF or image for processing |
| `GET` | `/api/documents` | List all processed documents |
| `GET` | `/api/documents/{id}` | Get extracted data for a document |
| `PATCH` | `/api/documents/{id}/entities` | Submit corrections (feeds learning pipeline) |
| `POST` | `/api/search` | Semantic search across document corpus |
| `GET` | `/api/analytics/summary` | Dashboard stats and confidence trends |
| `GET` | `/api/analytics/heatmap` | Per-component confidence breakdown |

Full interactive documentation at `/docs` (Swagger UI) and `/redoc`.

---

## 🔍 Entity Types Extracted

```python
ENTITIES = {
    "EMAIL":   r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}",
    "PHONE":   r"(\+91[\-\s]?)?[6-9]\d{9}",
    "GST":     r"\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}",
    "PAN":     r"[A-Z]{5}[0-9]{4}[A-Z]{1}",
    "MONEY":   r"(?:₹|Rs\.?|INR)\s?[\d,]+(?:\.\d{2})?",
}
```

Easily extensible — add any regex pattern to the NER engine config.

---

## 🔄 Continuous Learning Pipeline

The correction loop works like this:

```
User edits extraction result
        ↓
Correction saved to SQLite with original + corrected values
        ↓
Nightly batch job retrains regex patterns based on correction frequency
        ↓
High-confidence corrections promoted to ground-truth training data
        ↓
Model accuracy improves over document corpus
```

No annotation tooling required — the UI itself is the annotation interface.

---

## 📊 Benchmarks

Tested on a local RTX 3050 with a 100-document corpus (invoices, contracts, receipts):

| Metric | Value |
|---|---|
| Average OCR confidence | 94.2% |
| Table extraction accuracy | 88.7% |
| NER precision (GST/PAN) | 99.1% |
| NER precision (Money) | 96.8% |
| Semantic search latency | ~38ms |
| PDF processing (10-page doc) | ~1.4s |
| Scanned image (A4, 300dpi) | ~2.1s |

---

## 📁 Project Structure

```
IDP/
├── backend/
│   ├── main.py                # FastAPI app entry point
│   ├── models/                # SQLAlchemy/Pydantic models
│   ├── routers/               # API route handlers
│   ├── services/              # OCR, NER, Search, Learning pipeline
│   └── utils/                 # DB init, image preprocessing helpers
├── frontend/
│   ├── templates/             # Jinja2 HTML templates
│   └── static/
│       ├── css/               # Styles (Syne + DM Sans + JetBrains Mono)
│       └── js/                # Vanilla JS + Canvas chart logic
├── db/                        # SQLite database files
├── uploads/                   # Temporary upload staging
└── outputs/                   # Extracted output files
```

---

## 🗺️ Roadmap

- [ ] **LLM Integration** — plug in a local Ollama model for free-form Q&A over documents
- [ ] **Batch API** — async multi-file queue with webhook callbacks
- [ ] **Export Formats** — CSV, JSON, Excel, structured XML
- [ ] **Signature Detection** — OpenCV contour-based signature bounding box
- [ ] **Multilingual OCR** — Hindi, Tamil, Telugu via Tesseract language packs
- [ ] **Docker Compose** — one-command deployment with GPU passthrough
- [ ] **Annotation Mode** — highlight-and-tag interface for training data creation

---

## 🤝 Contributing

Contributions welcome. Please open an issue first for major changes.

```bash
# Run tests
pytest backend/tests/

# Lint
ruff check backend/
```

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">

Built with Python, FastAPI, Tesseract, FAISS, and OpenCV.  
No cloud. No subscriptions. No data leaves your machine.

**[⭐ Star this repo](https://github.com/yourusername/IDP)** if you find it useful.

</div>
