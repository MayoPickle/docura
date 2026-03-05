import os
import uuid
from fastapi import APIRouter, Depends, UploadFile, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_db
from ..models import User, Document, File
from ..schemas import FileResponse, ScanResult
from ..deps import get_current_user
from ..services.ocr_service import recognize_document

router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


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

    db_file = File(
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
    file: UploadFile,
    current_user: User = Depends(get_current_user),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only image files are supported")

    image_bytes = await file.read()
    result = await recognize_document(image_bytes, file.content_type)
    return result
