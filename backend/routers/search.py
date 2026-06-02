"""
DocIntel — Search & AI Chat Router
GET  /api/search?q=...          — full-text search across extracted content
POST /api/chat                  — AI chatbot answering questions about documents
"""

import json, re
from datetime import datetime
import aiosqlite
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from backend.database import DB_PATH

router = APIRouter()


# ── Full-text search ───────────────────────────────────
@router.get("")
async def search(q: str = Query(..., min_length=1)):
    q_lower = f"%{q}%"
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("""
            SELECT r.job_id, r.filename, r.doc_type, r.confidence, r.page_count,
                   r.summary, r.kv_json, r.created_at,
                   SUBSTR(r.full_text, MAX(1, INSTR(UPPER(r.full_text), UPPER(?)) - 80), 200) as snippet
            FROM results r
            WHERE UPPER(r.full_text) LIKE UPPER(?)
               OR UPPER(r.kv_json)   LIKE UPPER(?)
               OR UPPER(r.summary)   LIKE UPPER(?)
               OR UPPER(r.filename)  LIKE UPPER(?)
            ORDER BY r.created_at DESC LIMIT 50
        """, (q, q_lower, q_lower, q_lower, q_lower)) as cur:
            rows = await cur.fetchall()

    results = []
    for row in rows:
        d = dict(row)
        try:    d["kv_json"] = json.loads(d["kv_json"] or "{}")
        except: d["kv_json"] = {}
        results.append(d)
    return {"query": q, "count": len(results), "results": results}


# ── AI Chat ────────────────────────────────────────────
class ChatMessage(BaseModel):
    message: str
    history: list = []   # [{role:"user"|"assistant", content:"..."}]

@router.post("/chat")
async def ai_chat(body: ChatMessage):
    """
    Rule-based AI chatbot that answers questions about processed documents.
    Searches the DB, extracts relevant facts, and returns a natural response.
    """
    q = body.message.strip()
    if not q:
        return {"answer": "Please ask me something about your documents.", "sources": []}

    q_lower = q.lower()

    # Load all results from DB
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("""
            SELECT r.job_id, r.filename, r.doc_type, r.confidence,
                   r.full_text, r.kv_json, r.tables_json, r.entities_json,
                   r.summary, r.page_count, r.created_at
            FROM results r
            ORDER BY r.created_at DESC
        """) as cur:
            all_results = [dict(row) for row in await cur.fetchall()]

    if not all_results:
        return {
            "answer": "No documents have been processed yet. Please upload and process some documents first, then I can answer questions about them.",
            "sources": []
        }

    # Parse JSON fields
    for r in all_results:
        for f in ("kv_json", "tables_json", "entities_json"):
            try:    r[f] = json.loads(r[f] or "{}" if f == "kv_json" else "[]")
            except: r[f] = {} if f == "kv_json" else []

    # ── Intent detection & answer generation ──────────
    answer, sources = _generate_answer(q, q_lower, all_results)

    return {"answer": answer, "sources": sources}


def _generate_answer(q: str, q_lower: str, docs: list) -> tuple:
    """Generate a natural language answer from document data."""

    sources = []

    # ── Count / summary questions ──────────────────────
    if any(w in q_lower for w in ["how many", "count", "total number of", "number of documents"]):
        types = {}
        for d in docs:
            t = d.get("doc_type") or "Document"
            types[t] = types.get(t, 0) + 1

        if "invoice" in q_lower:
            n = types.get("Invoice", 0)
            return f"There {'is' if n==1 else 'are'} **{n} invoice{'s' if n!=1 else ''}** in your document library.", []
        if "contract" in q_lower:
            n = types.get("Contract", 0)
            return f"There {'is' if n==1 else 'are'} **{n} contract{'s' if n!=1 else ''}** in your document library.", []
        if "resume" in q_lower or "cv" in q_lower:
            n = types.get("Resume", 0)
            return f"There {'is' if n==1 else 'are'} **{n} resume{'s' if n!=1 else ''}** in your document library.", []

        total = len(docs)
        breakdown = ", ".join(f"{v} {k.lower()}{'s' if v!=1 else ''}" for k, v in types.items())
        return f"Your document library contains **{total} document{'s' if total!=1 else ''}**: {breakdown}.", []

    # ── Total amount / money questions ─────────────────
    if any(w in q_lower for w in ["total amount", "total fee", "total paid", "how much", "total invoice", "grand total", "total cost", "amount paid", "fee paid"]):
        amounts = []
        for d in docs:
            kv = d.get("kv_json", {})
            for key in ["Total Amount", "Grand Total", "Total Due", "Amount Payable",
                      "Total", "Subtotal", "Net Amount", "Invoice Amount"]:
                if key in kv:
                    amounts.append((d["filename"], kv[key], d.get("doc_type")))
                    break
        # Also check tables for totals row
        for tbl in d.get("tables_json", []):
            if isinstance(tbl, dict):
                for row in tbl.get("rows", []):
                    if row and len(row) >= 2:
                        label = str(row[0]).lower()
                        if any(w in label for w in ["total", "grand", "payable", "due"]):
                            amounts.append((d["filename"], str(row[-1]), d.get("doc_type")))
                            break

        if not amounts:
            # Try entities
            for d in docs:
                for e in d.get("entities_json", []):
                    if e.get("type") == "MONEY":
                        amounts.append((d["filename"], e["text"], d.get("doc_type")))
                        break

        if amounts:
            sources = [{"filename": a[0], "doc_type": a[2]} for a in amounts[:5]]
            if len(amounts) == 1:
                return f"The total amount in **{amounts[0][0]}** is **{amounts[0][1]}**.", sources
            lines = "\n".join(f"• **{a[0]}**: {a[1]}" for a in amounts[:5])
            return f"Found amounts across {len(amounts)} document(s):\n\n{lines}", sources
        return "I couldn't find specific monetary amounts in your processed documents. The documents may not contain clearly labelled total amounts.", []

    # ── Date questions ─────────────────────────────────
    if any(w in q_lower for w in ["date", "when", "issued on", "invoice date"]):
        dates = []
        for d in docs:
            kv = d.get("kv_json", {})
            for key in ["Date", "Invoice Date", "Issue Date", "Created Date"]:
                if key in kv:
                    dates.append((d["filename"], kv[key], d.get("doc_type")))
                    break
        if dates:
            sources = [{"filename": a[0], "doc_type": a[2]} for a in dates[:5]]
            if len(dates) == 1:
                return f"**{dates[0][0]}** is dated **{dates[0][1]}**.", sources
            lines = "\n".join(f"• **{a[0]}**: {a[1]}" for a in dates[:5])
            return f"Document dates found:\n\n{lines}", sources

    # ── Invoice number questions ───────────────────────
    if any(w in q_lower for w in ["invoice number", "invoice no", "ref number", "reference"]):
        refs = []
        for d in docs:
            kv = d.get("kv_json", {})
            for key in ["Invoice Number", "Receipt Number", "Reference", "Transaction ID"]:
                if key in kv:
                    refs.append((d["filename"], key, kv[key]))
                    break
        if refs:
            sources = [{"filename": r[0]} for r in refs[:5]]
            lines = "\n".join(f"• **{r[0]}** — {r[1]}: **{r[2]}**" for r in refs[:5])
            return f"Reference numbers found:\n\n{lines}", sources

    # ── GST / tax questions ────────────────────────────
    if any(w in q_lower for w in ["gst", "gstin", "tax", "igst", "cgst"]):
        gst_data = []
        for d in docs:
            kv = d.get("kv_json", {})
            for key in ["GSTIN", "GST Amount", "GST"]:
                if key in kv:
                    gst_data.append((d["filename"], key, kv[key]))
        if gst_data:
            sources = [{"filename": g[0]} for g in gst_data[:5]]
            lines = "\n".join(f"• **{g[0]}** — {g[1]}: **{g[2]}**" for g in gst_data[:5])
            return f"GST information found:\n\n{lines}", sources
        return "No GST numbers or amounts found in your processed documents.", []

    # ── PAN questions ──────────────────────────────────
    if "pan" in q_lower:
        pan_data = []
        for d in docs:
            kv = d.get("kv_json", {})
            if "PAN" in kv:
                pan_data.append((d["filename"], kv["PAN"]))
        if pan_data:
            sources = [{"filename": p[0]} for p in pan_data]
            lines = "\n".join(f"• **{p[0]}**: {p[1]}" for p in pan_data)
            return f"PAN numbers found:\n\n{lines}", sources

    # ── Vendor / company / name questions ─────────────
    if any(w in q_lower for w in ["vendor", "company", "supplier", "from whom", "who issued", "client", "billed to"]):
        orgs = []
        for d in docs:
            for e in d.get("entities_json", []):
                if e.get("type") == "ORG":
                    orgs.append((d["filename"], e["text"]))
                    break
        if orgs:
            sources = [{"filename": o[0]} for o in orgs[:5]]
            lines = "\n".join(f"• **{o[0]}**: {o[1]}" for o in orgs[:5])
            return f"Organizations found in your documents:\n\n{lines}", sources

    # ── Email questions ────────────────────────────────
    if "email" in q_lower:
        emails = []
        for d in docs:
            for e in d.get("entities_json", []):
                if e.get("type") == "EMAIL":
                    emails.append((d["filename"], e["text"]))
        if emails:
            sources = [{"filename": em[0]} for em in emails[:5]]
            lines = "\n".join(f"• **{em[0]}**: {em[1]}" for em in emails[:5])
            return f"Email addresses found:\n\n{lines}", sources

    # ── Phone questions ────────────────────────────────
    if any(w in q_lower for w in ["phone", "mobile", "contact number"]):
        phones = []
        for d in docs:
            for e in d.get("entities_json", []):
                if e.get("type") == "PHONE":
                    phones.append((d["filename"], e["text"]))
        if phones:
            sources = [{"filename": p[0]} for p in phones[:5]]
            lines = "\n".join(f"• **{p[0]}**: {p[1]}" for p in phones[:5])
            return f"Phone numbers found:\n\n{lines}", sources

    # ── Summary / describe questions ───────────────────
    if any(w in q_lower for w in ["summarize", "summary", "describe", "what is this", "tell me about", "explain"]):
        if docs:
            # Find most relevant doc by searching for keywords in query
            scored = []
            for d in docs:
                text = (d.get("full_text") or "") + " " + (d.get("summary") or "")
                score = sum(1 for word in q_lower.split() if len(word) > 3 and word in text.lower())
                scored.append((score, d))
            scored.sort(key=lambda x: -x[0])
            best = scored[0][1]
            sources = [{"filename": best["filename"], "doc_type": best.get("doc_type")}]
            return f"**{best['filename']}** ({best.get('doc_type','Document')}, {best.get('confidence',0):.0f}% confidence):\n\n{best.get('summary','No summary available.')}", sources

    # ── "What documents" / list questions ──────────────
    if any(w in q_lower for w in ["what documents", "list documents", "show documents", "which documents", "what files"]):
        if docs:
            lines = "\n".join(f"• **{d['filename']}** — {d.get('doc_type','—')} ({d.get('confidence',0):.0f}% conf)" for d in docs[:10])
            return f"Here are your {len(docs)} processed document(s):\n\n{lines}", []
        return "No documents found. Upload and process documents first.", []

    # ── IFSC / bank questions ──────────────────────────
    if any(w in q_lower for w in ["bank", "ifsc", "account number", "account no"]):
        bank_data = []
        for d in docs:
            kv = d.get("kv_json", {})
            found = {k: kv[k] for k in ["Bank Name", "IFSC", "Account Number"] if k in kv}
            if found:
                bank_data.append((d["filename"], found))
        if bank_data:
            sources = [{"filename": b[0]} for b in bank_data[:5]]
            lines = "\n".join(f"• **{b[0]}**: " + ", ".join(f"{k}: {v}" for k, v in b[1].items()) for b in bank_data[:5])
            return f"Bank details found:\n\n{lines}", sources

    # ── Generic full-text search fallback ─────────────
    q_words = [w for w in q_lower.split() if len(w) > 3]
    scored = []
    for d in docs:
        text = ((d.get("full_text") or "") + " " + (d.get("summary") or "") + " " +
                json.dumps(d.get("kv_json", {}))).lower()
        score = sum(1 for w in q_words if w in text)
        if score > 0:
            scored.append((score, d))
    scored.sort(key=lambda x: -x[0])

    if scored:
        top = scored[:3]
        sources = [{"filename": d["filename"], "doc_type": d.get("doc_type")} for _, d in top]

        # Extract relevant snippet
        best_doc = top[0][1]
        text = best_doc.get("full_text") or ""
        snippet = ""
        for word in q_words:
            idx = text.lower().find(word)
            if idx >= 0:
                start = max(0, idx - 100)
                end   = min(len(text), idx + 200)
                snippet = "…" + text[start:end].strip() + "…"
                break

        kv = best_doc.get("kv_json", {})
        kv_str = ""
        if kv:
            kv_str = "\n\n**Key fields**: " + ", ".join(f"{k}: {v}" for k, v in list(kv.items())[:4])

        answer = f"I found relevant content in **{best_doc['filename']}** ({best_doc.get('doc_type','Document')}, {best_doc.get('confidence',0):.0f}% confidence)."
        if snippet:
            answer += f"\n\n> {snippet}"
        answer += kv_str
        if len(top) > 1:
            answer += f"\n\nAlso found matches in: " + ", ".join(f"**{d['filename']}**" for _, d in top[1:])
        return answer, sources

    # ── No match ───────────────────────────────────────
    doc_list = ", ".join(f"**{d['filename']}**" for d in docs[:3])
    return (f"I searched your {len(docs)} document(s) ({doc_list}{'...' if len(docs)>3 else ''}) "
            f"but couldn't find specific information about \"{q}\". "
            f"Try asking about invoice amounts, dates, GST numbers, vendor names, or document summaries."), []
