import os
import uuid
from fastapi import APIRouter, Depends, UploadFile, HTTPException, status, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_db
from ..models import User, Document, File as DocumentFile
from ..schemas import FileResponse, ScanResult
from ..deps import get_current_user
from ..services.ocr_service import recognize_documents

router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

SUPPORTED_SCAN_MIME_TYPES = {
    "application/pdf",
    "text/plain",
}


def _resolve_scan_content_type(content_type: str | None, filename: str | None) -> str:
    normalized_type = (content_type or "").lower()
    if normalized_type:
        return normalized_type

    normalized_name = (filename or "").lower()
    if normalized_name.endswith(".pdf"):
        return "application/pdf"
    if normalized_name.endswith(".txt"):
        return "text/plain"
    return "application/octet-stream"


def _is_supported_scan_type(content_type: str | None, filename: str | None) -> bool:
    normalized_type = _resolve_scan_content_type(content_type, filename)
    if normalized_type.startswith("image/") or normalized_type in SUPPORTED_SCAN_MIME_TYPES:
        return True

    normalized_name = (filename or "").lower()
    if normalized_name.endswith(".pdf") or normalized_name.endswith(".txt"):
        return True
    return False


@router.post("/{document_id}/files", response_model=FileResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    document_id: int,
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document).where(Document.id == document_id, Document.user_id == current_user.id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    ext = os.path.splitext(file.filename or "")[1]
    stored_name = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_DIR, stored_name)

    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    db_file = DocumentFile(
        document_id=document_id,
        filename=file.filename or "untitled",
        filepath=filepath,
        content_type=file.content_type or "application/octet-stream",
    )
    db.add(db_file)
    await db.commit()
    await db.refresh(db_file)
    return db_file


@router.post("/scan", response_model=ScanResult)
async def scan_document(
    file: UploadFile | None = File(default=None),
    files: list[UploadFile] | None = File(default=None),
    doc_type_hint: str | None = Form(default=None),
    current_user: User = Depends(get_current_user),
):
    upload_files: list[UploadFile] = []
    if files:
        upload_files.extend(files)
    if file:
        upload_files.append(file)

    if not upload_files:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one file is required")

    if len(upload_files) > 10:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Maximum 10 files are supported")

    scan_files: list[tuple[bytes, str, str | None]] = []
    for uploaded in upload_files:
        if not _is_supported_scan_type(uploaded.content_type, uploaded.filename):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only image, PDF, or plain text files are supported",
            )

        file_bytes = await uploaded.read()
        if not file_bytes:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file is not supported")
        resolved_content_type = _resolve_scan_content_type(uploaded.content_type, uploaded.filename)
        scan_files.append((file_bytes, resolved_content_type, uploaded.filename))

    result = await recognize_documents(scan_files, doc_type_hint=doc_type_hint)
    return result
