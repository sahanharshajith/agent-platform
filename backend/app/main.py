from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.audit import init_db

app = FastAPI(title="Agent Platform", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # dev only; tighten in Phase 2
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def _startup():
    init_db()

app.include_router(router)
