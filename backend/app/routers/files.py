import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse as FastAPIFileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_db
from ..models import User, Document, File
from ..schemas import FileResponse
from ..deps import get_current_user, get_current_user_flexible

router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.get("/{file_id}")
async def download_file(
    file_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_flexible),
):
    result = await db.execute(
        select(File).join(Document).where(File.id == file_id, Document.user_id == current_user.id)
    )
    file = result.scalar_one_or_none()
    if not file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    if not os.path.exists(file.filepath):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File missing from disk")

    return FastAPIFileResponse(
        path=file.filepath,
        filename=file.filename,
        media_type=file.content_type,
    )


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(
    file_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(File).join(Document).where(File.id == file_id, Document.user_id == current_user.id)
    )
    file = result.scalar_one_or_none()
    if not file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    if os.path.exists(file.filepath):
        os.remove(file.filepath)

    await db.delete(file)
    await db.commit()
