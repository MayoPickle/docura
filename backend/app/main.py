import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

if sys.version_info < (3, 12):
    raise RuntimeError("Docura backend requires Python 3.12 or newer.")

load_dotenv()

from .database import init_db
from .routers import auth, documents, files, scan
from .services.file_crypto import ensure_file_crypto_ready


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_file_crypto_ready()
    await init_db()
    yield


app = FastAPI(title="Docura", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(documents.router, prefix="/api/documents", tags=["Documents"])
app.include_router(files.router, prefix="/api/files", tags=["Files"])
app.include_router(scan.router, prefix="/api/documents", tags=["Scan"])


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "python": f"{sys.version_info.major}.{sys.version_info.minor}",
        "scan_supports": [
            "image/*",
            "application/pdf",
            "text/plain",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ],
    }
