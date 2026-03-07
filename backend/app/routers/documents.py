from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, or_
from sqlalchemy.orm import selectinload
from typing import Optional
import re

from ..database import get_db
from ..models import User, Document, File
from ..schemas import (
    DocumentCreate,
    DocumentUpdate,
    DocumentResponse,
    DocumentListResponse,
    DocumentTypeCount,
    RenameDocTypeRequest,
    RenameDocTypeResponse,
)
from ..deps import get_current_user

router = APIRouter()


def _sanitize_doc_type(raw: str, lowercase: bool = True) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "_", raw.strip()).strip("_")
    return cleaned.lower() if lowercase else cleaned


def _to_ilike_pattern(raw: str) -> str | None:
    normalized = raw.strip()
    if not normalized:
        return None
    escaped = normalized.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


@router.get("", response_model=list[DocumentListResponse])
async def list_documents(
    doc_type: Optional[str] = Query(None),
    q: Optional[str] = Query(None, description="Search in title, notes, extracted fields, and filenames"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Document).where(Document.user_id == current_user.id)
    if doc_type:
        query = query.where(Document.doc_type == doc_type)

    keyword = _to_ilike_pattern(q) if q else None
    if keyword:
        file_name_exists = (
            select(File.id)
            .where(File.document_id == Document.id, File.filename.ilike(keyword, escape="\\"))
            .exists()
        )
        query = query.where(
            or_(
                Document.title.ilike(keyword, escape="\\"),
                Document.notes.ilike(keyword, escape="\\"),
                Document.fields_json.ilike(keyword, escape="\\"),
                file_name_exists,
            )
        )

    query = query.order_by(Document.updated_at.desc())

    result = await db.execute(query.options(selectinload(Document.files)))
    docs = result.scalars().all()

    return [
        DocumentListResponse(
            id=d.id,
            user_id=d.user_id,
            title=d.title,
            doc_type=d.doc_type,
            notes=d.notes,
            created_at=d.created_at,
            updated_at=d.updated_at,
            file_count=len(d.files),
        )
        for d in docs
    ]


@router.get("/summary")
async def document_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document.doc_type, func.count(Document.id))
        .where(Document.user_id == current_user.id)
        .group_by(Document.doc_type)
    )
    counts = {row[0]: row[1] for row in result.all()}
    total = sum(counts.values())
    return {"total": total, "by_type": counts}


@router.get("/types", response_model=list[DocumentTypeCount])
async def list_document_types(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document.doc_type, func.count(Document.id))
        .where(Document.user_id == current_user.id)
        .group_by(Document.doc_type)
        .order_by(func.count(Document.id).desc(), Document.doc_type.asc())
    )
    return [
        DocumentTypeCount(doc_type=row[0], count=row[1])
        for row in result.all()
    ]


@router.post("/types/rename", response_model=RenameDocTypeResponse)
async def rename_document_type(
    data: RenameDocTypeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from_type = _sanitize_doc_type(data.from_type, lowercase=True)
    to_type_norm = _sanitize_doc_type(data.to_type, lowercase=True)
    to_type_stored = _sanitize_doc_type(data.to_type, lowercase=False)

    if not from_type:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="from_type is required")
    if not to_type_norm or not to_type_stored:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="to_type is required")
    # Allow case-only rename (e.g. lca -> LCA), but block true no-op.
    if from_type == to_type_norm and data.from_type.strip() == data.to_type.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="from_type and to_type are the same")

    count_result = await db.execute(
        select(func.count(Document.id)).where(
            Document.user_id == current_user.id,
            func.lower(Document.doc_type) == from_type,
        )
    )
    count = count_result.scalar_one()
    if count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source type not found")

    await db.execute(
        update(Document)
        .where(Document.user_id == current_user.id, func.lower(Document.doc_type) == from_type)
        .values(doc_type=to_type_stored)
    )
    await db.commit()

    return RenameDocTypeResponse(from_type=data.from_type.strip(), to_type=to_type_stored, updated_count=count)


@router.post("", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def create_document(
    data: DocumentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = Document(
        user_id=current_user.id,
        title=data.title,
        doc_type=data.doc_type,
        fields_json=data.fields_json or "{}",
        notes=data.notes or "",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc, attribute_names=["files"])
    return doc


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document)
        .where(Document.id == document_id, Document.user_id == current_user.id)
        .options(selectinload(Document.files))
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return doc


@router.put("/{document_id}", response_model=DocumentResponse)
async def update_document(
    document_id: int,
    data: DocumentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document)
        .where(Document.id == document_id, Document.user_id == current_user.id)
        .options(selectinload(Document.files))
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(doc, field, value)

    await db.commit()
    await db.refresh(doc, attribute_names=["files"])
    return doc


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document).where(Document.id == document_id, Document.user_id == current_user.id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    await db.delete(doc)
    await db.commit()
