# Multi-Tenant AI Agent Platform

A production-inspired, multi-tenant AI agent platform where businesses deploy AI agents that can answer questions, retrieve context from a knowledge base, call external tools, and take multi-step actions — with **human-in-the-loop approval** for high-risk operations and a **complete audit trail** for every decision.

---

## Architecture Overview

```text
┌─────────────────────────────────────────────────────────────────────┐
│                            React Frontend                           │
│  ┌──────────────┐       ┌────────────────┐   ┌────────────────────┐ │
│  │ Chat Window  │       │ Approval Panel │   │ Audit Trail Viewer │ │
│  └──────┬───────┘       └───────┬────────┘   └─────────┬──────────┘ │
└─────────┼───────────────────────┼──────────────────────┼────────────┘
          │                       │                      │
          ▼                       ▼                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      FastAPI Backend (Python)                       │
│                                                                     │
│  /chat ──► Agent Loop:                                              │
│            1. Classify intent                                       │
│            2. Retrieve RAG context (FAISS + embeddings)             │
│            3. Plan (LLM)                                            │
│            4. Policy check ──► allow / require_approval / deny      │
│            5. Execute tool OR request human approval                │
│            6. Generate final response                               │
│                                                                     │
│  /approve ──► Resume execution after human decision                 │
│  /audit/{id} ──► Full event chain for an execution                  │
│  /health                                                            │
└────┬────────────────────────────┬───────────────────────────┬───────┘
     │                            │                           │
     ▼                            ▼                           ▼
┌─────────┐                ┌─────────────┐             ┌──────────────┐
│  FAISS  │                │     LLM     │             │    SQLite    │
│ Vector  │                │  Provider   │             │    Audit     │
│  Store  │                │  (Gemini/   │             │     Log      │
│         │                │  Bedrock)   │             │              │
└─────────┘                └─────────────┘             └──────────────┘
```

### Key Design Decisions

| Concern | Approach |
|---------|----------|
| **Safe tool execution** | All tool calls pass through a policy engine before execution |
| **Human-in-the-loop** | Refunds over $100 require explicit approval via `/approve` |
| **Complete auditability** | Every step (intent, RAG, plan, policy, approval, tool, response) logged |
| **Multi-tenant isolation** | `tenant_id` enforced at API, tool, RAG, and audit layers |
| **Provider abstraction** | Hot-swappable LLM + embeddings (Gemini → Bedrock) |
| **Cost-conscious** | Free-tier only: FAISS (not OpenSearch), SQLite (not RDS), local Gemini dev |

---

## Features

- ✅ **Agentic loop** — intent classification → RAG retrieval → LLM planning → policy check → tool execution or approval → response
- ✅ **RAG with FAISS** — 768-dim Gemini embeddings, tenant-filtered retrieval
- ✅ **Policy engine** — declarative rules (e.g., refunds > $100 need approval)
- ✅ **Human approval flow** — resume execution after approver decision
- ✅ **Immutable audit trail** — every decision recorded with payload and timestamp
- ✅ **Multi-tenant isolation** — enforced at API, tool, RAG, and audit boundaries
- ✅ **React UI** — chat, approval panel, audit viewer, tenant switcher
- ✅ **Provider abstraction** — swap Gemini ↔ Bedrock via env var
- ✅ **Re-index script** — survives embedding provider migration

---

## Tech Stack

| Layer | Local Dev | AWS           |
|-------|-----------|---------------|
| Frontend | React + Vite + Tailwind | AWS Amplify Hosting |
| Backend | FastAPI + Uvicorn | Lambda (container) + API Gateway |
| LLM | Google Gemini `gemini-3.1-flash-lite` | Amazon Bedrock (Claude 3 Haiku) |
| Embeddings | Gemini `gemini-embedding-001` (768-dim) | Bedrock Titan Embeddings V2 (1024-dim) |
| Vector Store | FAISS (local disk) | FAISS on Lambda `/tmp` + S3 |
| Audit Store | SQLite | DynamoDB + S3 archive |
| Auth | Header stub | Cognito JWT with `custom:tenant_id` claim |
| IaC | — | Terraform |

---

## Quick Start (Local)

### Prerequisites

- Python 3.11+
- Node.js 18+
- Google Gemini API key ([get one free](https://aistudio.google.com/apikey))

---

### 1. Clone & Set Up Backend

```bash
git clone https://github.com/YOUR_USERNAME/agent-platform.git
cd agent-platform/backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows (PowerShell):
.\venv\Scripts\Activate.ps1
# Windows (cmd):
venv\Scripts\activate.bat
# macOS/Linux:
# source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Edit .env and set GEMINI_API_KEY
```

### 2. Build / Rebuild FAISS Vector Index

Before running the agent, initialize or rebuild the FAISS vector index from documents in `knowledge_base/docs`:

```bash
python scripts/rebuild_index.py
```

### 3. Run Backend Server

```bash
uvicorn app.main:app --reload --port 8000
```

The backend API will be available at `http://localhost:8000`. You can inspect interactive API documentation at `http://localhost:8000/docs`.

---

### 4. Set Up & Run Frontend

Open a new terminal session and run:

```bash
cd agent-platform/frontend

# Install dependencies
npm install

# Start Vite development server
npm run dev
```

The frontend application will be accessible at `http://localhost:5173`.

---

## API Reference

### StreamSphere integration

This backend implements StreamSphere's existing JSON `/chat` and `/consent` contract,
including credential-based tenant authentication, persistent conversation history,
authoritative account lookups, and customer-approved cancellation/refund callbacks.
See [StreamSphere setup](backend/deploy/STREAMING_INTEGRATION.md) for the matching
environment variables in both applications and validation commands. No streaming
frontend changes or FAISS index are required for this integration.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check endpoint |
| `POST` | `/chat` | Send user message to agent loop, execute RAG + policy, or request approval |
| `POST` | `/approve` | Human-in-the-loop decision endpoint to approve or deny pending executions |
| `POST` | `/consent` | Resume or decline a customer confirmation using its bound token and session |
| `GET` | `/audit` | List audit execution history for authenticated tenant |
| `GET` | `/audit/{execution_id}` | Retrieve complete chronological event trace for a specific execution |

---

## Multi-Tenant Security & Isolation

- **Tenant Identification:** Each request resolves `tenant_id` via auth middleware / headers (`X-Tenant-ID` in local mode).
- **RAG Boundary:** Retrieval filters strictly restrict document embeddings matching the request's tenant partition.
- **Audit Logging:** Every step in the execution trace stores `tenant_id`, preventing cross-tenant information leakage.
- **Tool Policies:** Operations such as order lookups or refund actions are scoped and validated to the calling tenant.
